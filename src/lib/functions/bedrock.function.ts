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

/**
 * Accepts either a bare region ("us-east-1", optionally with a pasted path)
 * or a full endpoint/base URL, and returns a full /chat/completions URL.
 */
export function resolveBedrockEndpoint(raw: string): string {
  const v = (raw || "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    return /\/chat\/completions$/i.test(v) ? v : `${v}/chat/completions`;
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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
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
  const ids = ((json && json.data) || [])
    .map((m: any) => m && m.id)
    .filter((id: any) => typeof id === "string" && id.length > 0);
  return [...new Set(ids)].sort() as string[];
}
