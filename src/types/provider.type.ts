export interface TYPE_PROVIDER {
  id?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  protocol?: "openai" | "claude" | "gemini" | "ollama" | "custom";
  streaming?: boolean;
  responseContentPath?: string;
  isCustom?: boolean;
  curl: string;
}
