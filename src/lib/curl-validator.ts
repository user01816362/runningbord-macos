import curl2Json from "@bany/curl-to-json";

export interface CurlValidationResult {
  isValid: boolean;
  message?: string;
}

export const validateCurl = (
  curl: string,
  requiredVariables: string[]
): CurlValidationResult => {
  if (!curl.trim().startsWith("curl")) {
    return {
      isValid: false,
      message: "The command must start with 'curl'.",
    };
  }

  try {
    curl2Json(curl);
  } catch (error) {
    return {
      isValid: false,
      message:
        "Invalid cURL command syntax. Please check for typos or try validating it on an online tool like reqbin.com/curl-online.",
    };
  }

  const missingVariables = requiredVariables.filter(
    (variable) => !curl.includes(`{{${variable}}}`)
  );

  if (missingVariables.length > 0) {
    const missingVarsString = missingVariables
      .map((v) => `{{${v}}}`)
      .join(", ");
    return {
      isValid: false,
      message: `The following required variables are missing: ${missingVarsString}.`,
    };
  }

  return { isValid: true };
};

export interface BaseUrlValidationResult {
  isValid: boolean;
  message?: string;
  normalizedUrl?: string;
}

export function validateBaseUrl(urlStr: string): BaseUrlValidationResult {
  if (!urlStr || !urlStr.trim()) {
    return { isValid: false, message: "Base URL is required." };
  }

  let trimmed = urlStr.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    trimmed = `http://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      return { isValid: false, message: "Invalid host in Base URL." };
    }
    return { isValid: true, normalizedUrl: trimmed.replace(/\/+$/, "") };
  } catch {
    return { isValid: false, message: "Invalid URL format." };
  }
}

export function normalizeChatEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/chat/completions")) {
    return clean;
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

export function generateOpenAICurl(baseUrl: string, hasApiKey = false): string {
  const endpoint = normalizeChatEndpoint(baseUrl);
  const authHeader = hasApiKey
    ? `  -H "Authorization: Bearer {{API_KEY}}" \\\n`
    : `  -H "Authorization: Bearer {{API_KEY}}" \\\n`; // Keep {{API_KEY}} placeholder so key can be passed or left blank

  return `curl "${endpoint}" \\
  -H "Content-Type: application/json" \\
${authHeader}  -d '{
    "model": "{{MODEL}}",
    "messages": [
      {"role": "system", "content": "{{SYSTEM_PROMPT}}"},
      {"role": "user", "content": [
        {"type": "text", "text": "{{TEXT}}"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}
      ]}
    ],
    "stream": true
  }'`;
}

export function normalizeSttEndpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/audio/transcriptions")) {
    return clean;
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/audio/transcriptions`;
  }
  return `${clean}/v1/audio/transcriptions`;
}

export function generateOpenAISTTCurl(baseUrl: string): string {
  const endpoint = normalizeSttEndpoint(baseUrl);
  return `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer {{API_KEY}}" \\
  -F "file={{AUDIO}}" \\
  -F "model={{MODEL}}"`;
}

