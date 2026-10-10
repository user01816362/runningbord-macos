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
