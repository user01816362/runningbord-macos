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
  try {
    const res = await tauriFetch(url, { headers, signal: controller.signal });
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
    // Agent-API catalog; no auth required for the catalog call itself.
    ready: () => true,
    fetch: async () => {
      const json = await getJson("https://api.perplexity.ai/v1/models", {});
      return uniqSorted((get(json, "data") || []).map((m: any) => m && m.id));
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
};

/** False for custom providers (no known list route) — UI stays manual entry. */
export function canListProviderModels(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SOURCES, providerId);
}

export function isProviderListReady(providerId: string, vars: Record<string, string>): boolean {
  const src = SOURCES[providerId];
  return !!src && src.ready(vars || {});
}

export async function listProviderModels(
  providerId: string,
  ctx: ModelListContext
): Promise<string[]> {
  const src = SOURCES[providerId];
  if (!src) throw new Error(`Model listing is not supported for '${providerId}'.`);
  const ids = await src.fetch(ctx);
  if (ids.length === 0) throw new Error("No models returned for this key/region.");
  return ids;
}

export { bedrockApiBase };
