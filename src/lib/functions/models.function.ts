// Official list-models discovery per provider.
// Endpoint/auth/shape facts verified against first-party developer docs
// (research: LIST_MODELS_API_2026.md, as-of 2026-10-10). Bearer keys only —
// no SigV4 anywhere. Returns sorted unique chat-usable model IDs.
//
// Transport: Tauri HTTP plugin (Rust-side fetch, no browser CORS/preflight).
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { bedrockApiBase, fetchBedrockModels, resolveBedrockEndpoint } from "./bedrock.function";

export interface ModelListContext {
  /** Lowercased variable map, e.g. { api_key, region, model } */
  vars: Record<string, string>;
  /** Raw curl template of the provider (used to derive hosts, e.g. Ollama) */
  curl: string;
  /** Bypass caches (refresh icon). */
  force?: boolean;
}

export interface ModelListSource {
  /** True when a fetch should be attempted with the current variables */
  ready: (vars: Record<string, string>) => boolean;
  fetch: (ctx: ModelListContext) => Promise<string[]>;
}

function get(json: any, path: string): any {
  return path
    .replace(/\[/g, ".")
    .replace(/\]/g, "")
    .split(".")
    .reduce((o, k) => (o == null ? o : o[k]), json);
}

function uniqSorted(ids: any[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))].sort() as string[];
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const fetchFn =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      ? tauriFetch
      : fetch;
  try {
    const res = await fetchFn(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Models request failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`
      );
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Shape-agnostic ID extractor (OpenAI {data[]} + bare arrays + {models[]}). */
function extractIds(json: any): string[] {
  if (!json) return [];
  const list = Array.isArray(json)
    ? json
    : get(json, "data") || get(json, "models") || [];
  if (!Array.isArray(list)) return [];
  return uniqSorted(list.map((m: any) => (typeof m === "string" ? m : m && (m.id || m.name))));
}

const needsKey = (vars: Record<string, string>) => !!vars.api_key?.trim();

async function openAiShaped(url: string, key: string): Promise<string[]> {
  const json = await getJson(url, { Authorization: `Bearer ${key}` });
  // No capability flags in this response — drop obvious non-chat IDs by name.
  const NON_CHAT = /embedding|tts|whisper|dall-e|moderation|realtime|davinci|babbage|audio-/i;
  return extractIds(json).filter((id) => !NON_CHAT.test(id));
}

function originOf(curl: string, fallback: string): string {
  const m = (curl || "").match(/https?:\/\/[^\s'"\\]+/i);
  if (!m) return fallback;
  try {
    return new URL(m[0]).origin;
  } catch {
    return fallback;
  }
}

const SOURCES: Record<string, ModelListSource> = {
  openai: {
    ready: needsKey,
    fetch: ({ vars }) => openAiShaped("https://api.openai.com/v1/models", vars.api_key),
  },
  claude: {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const headers = {
        "x-api-key": vars.api_key,
        "anthropic-version": "2023-06-01",
      };
      const all: string[] = [];
      let after = "";
      for (let page = 0; page < 10; page++) {
        const url =
          `https://api.anthropic.com/v1/models?limit=100` +
          (after ? `&after_id=${encodeURIComponent(after)}` : "");
        const json = await getJson(url, headers);
        all.push(...((get(json, "data") || []).map((m: any) => m && m.id)));
        if (!get(json, "has_more")) break;
        after = get(json, "last_id") || "";
        if (!after) break;
      }
      return uniqSorted(all);
    },
  },
  grok: {
    ready: needsKey,
    fetch: async ({ vars }) => {
      // Chat + image-understanding list (full info). Falls back to minimal list.
      try {
        const json = await getJson("https://api.x.ai/v1/language-models", {
          Authorization: `Bearer ${vars.api_key}`,
        });
        return extractIds(json);
      } catch {
        return openAiShaped("https://api.x.ai/v1/models", vars.api_key);
      }
    },
  },
  gemini: {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const all: string[] = [];
      let pageToken = "";
      for (let page = 0; page < 10; page++) {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
          `&key=${encodeURIComponent(vars.api_key)}`;
        const json = await getJson(url, {});
        for (const m of get(json, "models") || []) {
          const methods = get(m, "supportedGenerationMethods") || [];
          if (Array.isArray(methods) && methods.includes("generateContent")) {
            // baseModelId is what generate calls take; name is models/{id}.
            const id =
              get(m, "baseModelId") ||
              String(get(m, "name") || "").replace(/^models\//, "");
            if (id && !/embedding|imagen|aqa|learnlm/i.test(id)) all.push(id);
          }
        }
        pageToken = get(json, "nextPageToken") || "";
        if (!pageToken) break;
      }
      return uniqSorted(all);
    },
  },
  mistral: {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.mistral.ai/v1/models", {
        Authorization: `Bearer ${vars.api_key}`,
      });
      // Schema says {data:[]} but live responses can be a bare array.
      const list = get(json, "data") || (Array.isArray(json) ? json : []);
      return uniqSorted(
        list
          .filter((m: any) => get(m, "capabilities.completion_chat") !== false)
          .map((m: any) => m && m.id)
      );
    },
  },
  cohere: {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.cohere.com/v1/models?endpoint=chat&page_size=100", {
        Authorization: `Bearer ${vars.api_key}`,
      });
      return uniqSorted((get(json, "models") || []).map((m: any) => m && m.name));
    },
  },
  groq: {
    ready: needsKey,
    fetch: ({ vars }) => openAiShaped("https://api.groq.com/openai/v1/models", vars.api_key),
  },
  perplexity: {
    // Agent-API catalog. Docs say no auth, but live API returns 401
    // without a key (verified 2026-10-10) — always send Bearer.
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.perplexity.ai/v1/models", {
        Authorization: `Bearer ${vars.api_key}`,
      });
      return extractIds(json);
    },
  },
  openrouter: {
    // Public catalog needs no key.
    ready: () => true,
    fetch: async ({ vars }) => {
      const headers: Record<string, string> = {};
      if (vars.api_key?.trim()) headers.Authorization = `Bearer ${vars.api_key}`;
      const json = await getJson("https://openrouter.ai/api/v1/models", headers);
      return uniqSorted((get(json, "data") || []).map((m: any) => m && m.id));
    },
  },
  ollama: {
    ready: () => true,
    fetch: async ({ curl }) => {
      const json = await getJson(`${originOf(curl, "http://localhost:11434")}/api/tags`, {});
      return uniqSorted((get(json, "models") || []).map((m: any) => m && m.name));
    },
  },
  bedrock: {
    ready: (vars) => needsKey(vars) && !!vars.region?.trim(),
    fetch: async ({ vars }) => {
      const endpoint = resolveBedrockEndpoint(vars.region || "");
      if (!endpoint) throw new Error("Enter a region (e.g. us-east-1) or Bedrock URL first.");
      return fetchBedrockModels(endpoint, vars.api_key);
    },
  },
  // Same catalog + chat filter as gemini (multimodal chat variant).
  "gemini-multimodal": {
    ready: needsKey,
    fetch: async (ctx) => SOURCES.gemini.fetch(ctx),
  },

  // ---- Speech-to-text providers (same picker, STT list routes) ----
  "stt:openai-whisper": {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.openai.com/v1/models", {
        Authorization: `Bearer ${vars.api_key}`,
      });
      const ids = extractIds(json).filter((id) => /whisper|transcribe/i.test(id));
      return ids.length > 0 ? ids : ["whisper-1"];
    },
  },
  "stt:groq": {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.groq.com/openai/v1/models", {
        Authorization: `Bearer ${vars.api_key}`,
      });
      const ids = extractIds(json).filter((id) => /whisper/i.test(id));
      if (ids.length === 0) throw new Error("No Whisper models on this Groq key.");
      return ids;
    },
  },
  "stt:elevenlabs-stt": {
    ready: needsKey,
    fetch: async ({ vars }) => {
      const json = await getJson("https://api.elevenlabs.io/v1/models", {
        "xi-api-key": vars.api_key,
      });
      const ids = extractIds(json);
      const stt = ids.filter((id) => /scribe|transcribe|speech-to-text/i.test(id));
      return stt.length > 0 ? stt : ids;
    },
  },
  "stt:deepgram-stt": {
    // Public route (verified live 200, no key). Prefer batch-capable entries:
    // the app posts pre-recorded REST audio.
    ready: () => true,
    fetch: async ({ vars }) => {
      const headers: Record<string, string> = {};
      if (vars.api_key?.trim()) headers.Authorization = `Token ${vars.api_key}`;
      const json = await getJson("https://api.deepgram.com/v1/models", headers);
      const stt = get(json, "stt") || [];
      const batch = stt.filter((m: any) => m && m.batch !== false);
      const pick = (batch.length > 0 ? batch : stt).map(
        (m: any) => m && (m.canonical_name || m.name)
      );
      const ids = uniqSorted(pick);
      if (ids.length === 0) throw new Error("No Deepgram STT models listed.");
      return ids;
    },
  },
  // Bedrock has no transcriptions-style endpoint; Voxtral speech-to-text
  // models transcribe via Converse audio blocks. List via mantle, filter.
  "stt:bedrock-stt": {
    ready: (vars) => needsKey(vars) && !!vars.region?.trim(),
    fetch: async ({ vars }) => {
      const endpoint = resolveBedrockEndpoint(vars.region || "");
      if (!endpoint) throw new Error("Enter a region (e.g. us-east-1) or Bedrock URL first.");
      const ids = await fetchBedrockModels(endpoint, vars.api_key);
      const voxtral = ids.filter((id) => /voxtral/i.test(id));
      return voxtral.length > 0 ? voxtral : ids;
    },
  },
};

/**
 * Probes a custom provider endpoint (e.g. EasyCLIProxyAPI, Ollama, LM Studio)
 * for its model catalog across standard OpenAI, Ollama, and local model routes.
 */
export async function fetchCustomProviderModels(
  baseUrlOrCurl: string,
  apiKey?: string
): Promise<string[]> {
  const m = (baseUrlOrCurl || "").match(/https?:\/\/[^\s'"\\]+/i);
  let cleanUrl = m ? m[0].replace(/\/+$/, "") : (baseUrlOrCurl || "").trim().replace(/\/+$/, "");
  if (!cleanUrl) return [];
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `http://${cleanUrl}`;
  }

  // Resolve API key from argument or from curl Authorization header if present
  let resolvedKey = apiKey?.trim();
  if (!resolvedKey) {
    const authMatch =
      baseUrlOrCurl.match(/-H\s+['"]Authorization:\s*Bearer\s+([^'"]+)['"]/i) ||
      baseUrlOrCurl.match(/Authorization:\s*Bearer\s+([^\s'"\\]+)/i);
    if (authMatch && authMatch[1] && !authMatch[1].includes("{{")) {
      resolvedKey = authMatch[1].trim();
    }
  }

  const headers: Record<string, string> = { Accept: "application/json, text/plain, */*" };
  if (resolvedKey) {
    headers["Authorization"] = `Bearer ${resolvedKey}`;
  }

  const stripped = cleanUrl
    .replace(/\/chat\/completions.*$/, "")
    .replace(/\/audio\/transcriptions.*$/, "")
    .replace(/\/v1$/, "");

  const probeUrls = [
    `${stripped}/v1/models`,
    `${cleanUrl.replace(/\/chat\/completions.*$/, "").replace(/\/audio\/transcriptions.*$/, "")}/models`,
    `${stripped}/models`,
    `${stripped}/api/tags`,
    `${stripped}/api/v1/models`,
  ];

  if (stripped.includes("127.0.0.1")) {
    probeUrls.push(`${stripped.replace("127.0.0.1", "localhost")}/v1/models`);
    probeUrls.push(`${stripped.replace("127.0.0.1", "localhost")}/api/tags`);
  } else if (stripped.includes("localhost")) {
    probeUrls.push(`${stripped.replace("localhost", "127.0.0.1")}/v1/models`);
    probeUrls.push(`${stripped.replace("localhost", "127.0.0.1")}/api/tags`);
  }

  const uniqueProbes = [...new Set(probeUrls)];
  for (const pUrl of uniqueProbes) {
    try {
      const json = await getJson(pUrl, headers);
      const ids = extractIds(json);
      if (ids.length > 0) {
        return ids;
      }
    } catch {
      // Continue probing other candidate paths
    }
  }

  return [];
}

/** True for built-in or custom providers that support model discovery */
export function canListProviderModels(providerId: string): boolean {
  if (Object.prototype.hasOwnProperty.call(SOURCES, providerId)) return true;
  if (providerId.startsWith("custom-") || providerId.startsWith("stt:custom-")) return true;
  return false;
}

/**
 * Keyless discovery: full public catalogs, zero static owner lists.
 * - OpenRouter's catalog (complete, verified live) backs every provider
 *   except Perplexity; native IDs = catalog ID minus the first `owner/`
 *   segment (generic rule — new owners work with no code change).
 * - Perplexity's Agent catalog is already its full allowlist — used as-is.
 * Second choice after the official account list — never the source of truth.
 */
const PUBLIC_CATALOG_URL = "https://openrouter.ai/api/v1/models";
const PERPLEXITY_CATALOG_URL = "https://api.perplexity.ai/v1/models";

// Providers whose keyless list is the provider's own full catalog.
const NATIVE_CATALOG: Record<string, string> = {
  perplexity: PERPLEXITY_CATALOG_URL,
};

const KEYLESS_PROVIDERS = new Set([
  "openai",
  "claude",
  "grok",
  "gemini",
  "gemini-multimodal",
  "mistral",
  "cohere",
  "groq",
  "perplexity",
  "openrouter",
  "ollama",
]);

let publicCatalog: Promise<string[]> | null = null;

function fetchPublicCatalog(): Promise<string[]> {
  if (!publicCatalog) {
    publicCatalog = (async () => {
      const json = await getJson(PUBLIC_CATALOG_URL, {});
      return uniqSorted((get(json, "data") || []).map((m: any) => m && m.id));
    })().catch((e) => {
      publicCatalog = null;
      throw e;
    });
  }
  return publicCatalog;
}

export function resetPublicCatalog() {
  publicCatalog = null;
}

export function hasPublicCatalog(providerId: string): boolean {
  return KEYLESS_PROVIDERS.has(providerId);
}

async function listFromPublicCatalog(providerId: string): Promise<string[]> {
  if (!KEYLESS_PROVIDERS.has(providerId)) {
    throw new Error("Enter the API key to list models.");
  }
  // Provider-native full catalog (Perplexity) is used verbatim.
  if (NATIVE_CATALOG[providerId]) {
    const json = await getJson(NATIVE_CATALOG[providerId], {});
    const unique = extractIds(json);
    if (unique.length === 0) throw new Error("Public catalog has no models for this provider yet.");
    return unique;
  }
  // Generic rule: native ID = catalog ID minus the first `owner/` segment.
  const ids = await fetchPublicCatalog();
  const unique = uniqSorted(
    ids.map((id) => {
      const slash = id.indexOf("/");
      return slash >= 0 ? id.slice(slash + 1) : id;
    })
  );
  if (unique.length === 0) throw new Error("Public catalog has no models for this provider yet.");
  return unique;
}

export function isProviderListReady(providerId: string, vars: Record<string, string>): boolean {
  if (providerId.startsWith("custom-") || providerId.startsWith("stt:custom-")) return true;
  const src = SOURCES[providerId];
  return !!src && src.ready(vars || {});
}

/**
 * Official account-scoped model list. Key (and region/base where needed)
 * required — no keyless fallback by design: only the account list has exact,
 * invokable IDs including fine-tunes.
 */
export async function listProviderModels(
  providerId: string,
  ctx: ModelListContext
): Promise<{ ids: string[]; official: boolean }> {
  if (providerId.startsWith("custom-") || providerId.startsWith("stt:custom-")) {
    const key =
      ctx.vars?.api_key ||
      ctx.vars?.API_KEY ||
      ctx.vars?.apiKey ||
      Object.entries(ctx.vars || {}).find(([k]) => /key|token|secret/i.test(k))?.[1];
    const ids = await fetchCustomProviderModels(ctx.curl, key);
    if (providerId.startsWith("stt:")) {
      const sttMatches = ids.filter((id) => /whisper|transcri|audio|stt|speech|scribe/i.test(id));
      if (sttMatches.length > 0) {
        const others = ids.filter((id) => !/whisper|transcri|audio|stt|speech|scribe/i.test(id));
        return { ids: [...sttMatches, ...others], official: true };
      }
    }
    return { ids, official: ids.length > 0 };
  }
  const src = SOURCES[providerId];
  if (!src) throw new Error(`Model listing is not supported for '${providerId}'.`);
  // Official account-scoped list first; public catalog fallback (no key).
  if (src.ready(ctx.vars || {})) {
    try {
      const ids = await src.fetch(ctx);
      if (ids.length > 0) return { ids, official: true };
    } catch (e) {
      if (!hasPublicCatalog(providerId)) throw e;
    }
  }
  if (ctx.force) resetPublicCatalog();
  return { ids: await listFromPublicCatalog(providerId), official: false };
}

export { bedrockApiBase };
