// AWS Bedrock endpoint helper — official OpenAI-compatible endpoints, no SigV4
// needed, just a Bedrock API key as a Bearer token.
// First-party docs:
//   https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html
//   https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
//
//   mantle (compatibility):  https://bedrock-mantle.{region}.api.aws/v1/chat/completions
//   runtime (recommended):   https://bedrock-runtime.{region}.amazonaws.com/openai/v1/chat/completions
//
// Note: a long-term API key works ONLY in the region it was generated in.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Accepts either a bare region ("us-east-1") or a full endpoint/base URL.
 * A pasted URL is used as-is (only the missing tail is completed) — no
 * region detection, no host rewriting.
 */
export function resolveBedrockEndpoint(raw: string): string {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    if (/\/chat\/completions$/i.test(v)) return v;
    let base = v;
    try {
      const u = new URL(v);
      if (u.pathname === "/" || u.pathname === "") {
        // Root base: complete with the versioned path per host family.
        base = /bedrock-runtime\./i.test(u.hostname)
          ? `${v}/openai/v1`
          : `${v}/v1`;
      }
    } catch {
      // Not parseable: fall through and append below.
    }
    return `${base}/chat/completions`;
  }
  const region = v.split("/")[0].trim();
  if (!region) return "";
  return `https://bedrock-mantle.${region}.api.aws/v1/chat/completions`;
}

/** Strip a /chat/completions suffix to get the API base (for /models). */
export function bedrockApiBase(endpoint: string): string {
  return endpoint
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/+$/, "");
}

/**
 * Official model discovery: GET {base}/models with the Bedrock API key.
 * Returns sorted unique model IDs.
 */
export async function fetchBedrockModels(
  endpoint: string,
  apiKey: string
): Promise<string[]> {
  const url = `${bedrockApiBase(endpoint)}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await tauriFetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Bedrock models request failed (${res.status})${
          text ? `: ${text.slice(0, 200)}` : ""
        }`
      );
    }
    const json = await res.json();
    const list = (json && (json.data || json.models)) || [];
    const ids = (Array.isArray(list) ? list : [])
      .map((m: any) => (typeof m === "string" ? m : m && (m.id || m.name)))
      .filter((id: any) => typeof id === "string" && id.length > 0);
    return [...new Set(ids)].sort() as string[];
  } finally {
    clearTimeout(timeout);
  }
}
