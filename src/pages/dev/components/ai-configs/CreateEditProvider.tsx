import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Header,
  TextInput,
  Switch,
  Textarea,
  Selection,
} from "@/components";
import {
  PlusIcon,
  SaveIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Server,
  Terminal,
} from "lucide-react";
import { useCustomAiProviders } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";
import {
  validateBaseUrl,
  generateOpenAICurl,
  generateGeminiCurl,
} from "@/lib";
import { fetchCustomProviderModels } from "@/lib/functions/models.function";

interface CreateEditProviderProps {
  customProviderHook?: ReturnType<typeof useCustomAiProviders>;
}

const LOCAL_PRESETS = [
  {
    label: "EasyCLIProxyAPI (Port 8317)",
    name: "EasyCLIProxyAPI",
    url: "http://127.0.0.1:8317",
  },
  {
    label: "Ollama (Port 11434)",
    name: "Ollama",
    url: "http://127.0.0.1:11434",
  },
  {
    label: "LM Studio (Port 1234)",
    name: "LM Studio",
    url: "http://127.0.0.1:1234",
  },
  {
    label: "vLLM / LocalAI (Port 8000)",
    name: "LocalAI / vLLM",
    url: "http://127.0.0.1:8000",
  },
  {
    label: "Custom Local Endpoint",
    name: "Local AI",
    url: "http://127.0.0.1:8317",
  },
];

export const CreateEditProvider = ({
  customProviderHook,
}: CreateEditProviderProps) => {
  const { allAiProviders } = useApp();
  const hookInstance = customProviderHook || useCustomAiProviders();

  const {
    showForm,
    setShowForm,
    editingProvider,
    formData,
    setFormData,
    errors,
    handleSave,
    setErrors,
    handleAutoFill,
  } = hookInstance;

  const [setupMode, setSetupMode] = useState<"baseUrl" | "curl">("baseUrl");
  const [providerName, setProviderName] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [protocol, setProtocol] = useState<"openai" | "gemini">("openai");

  // Probe testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
    models?: string[];
  }>({ status: "idle", message: "" });

  // Sync state when editing a provider
  useEffect(() => {
    if (editingProvider && formData) {
      const isGemini =
        formData.protocol === "gemini" ||
        formData.curl?.includes("v1beta") ||
        formData.curl?.includes("streamGenerateContent");
      setProtocol(isGemini ? "gemini" : "openai");

      if (formData.baseUrl || !formData.curl?.trim().startsWith("curl")) {
        setSetupMode("baseUrl");
        setProviderName(formData.name || "");
        setBaseUrlInput(formData.baseUrl || "");
        setApiKeyInput(formData.apiKey || "");
      } else {
        // If editing a raw curl command, default to cURL mode
        setSetupMode("curl");
        setProviderName(formData.name || "");
        const match = formData.curl?.match(/https?:\/\/[^\s'"\\]+/i);
        setBaseUrlInput(match ? match[0] : "");
        setApiKeyInput(formData.apiKey || "");
      }
    } else {
      setSetupMode("baseUrl");
      setProviderName("");
      setBaseUrlInput("");
      setApiKeyInput("");
      setProtocol("openai");
      setTestResult({ status: "idle", message: "" });
    }
  }, [editingProvider, showForm]);

  const handlePresetSelect = (presetLabel: string) => {
    const preset = LOCAL_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setProviderName(preset.name);
    setBaseUrlInput(preset.url);
    setTestResult({ status: "idle", message: "" });
    setErrors({});
  };

  const handleTestConnection = async () => {
    const validation = validateBaseUrl(baseUrlInput);
    if (!validation.isValid || !validation.normalizedUrl) {
      setTestResult({
        status: "error",
        message: validation.message || "Invalid Base URL",
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: "idle", message: "Connecting to server..." });

    try {
      const startTime = performance.now();
      const models = await fetchCustomProviderModels(
        validation.normalizedUrl,
        apiKeyInput
      );
      const latencyMs = Math.round(performance.now() - startTime);

      if (models.length > 0) {
        setTestResult({
          status: "success",
          message: `Connected successfully in ${latencyMs}ms! Discovered ${models.length} model(s): ${models.slice(0, 3).join(", ")}${models.length > 3 ? "..." : ""}`,
          models,
        });
      } else {
        setTestResult({
          status: "success",
          message: `Connected successfully in ${latencyMs}ms! (Server reachable, standard completions ready)`,
          models: [],
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Cannot reach local server. Ensure EasyCLIProxyAPI or your AI server is running.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSave = () => {
    if (setupMode === "baseUrl") {
      const urlValidation = validateBaseUrl(baseUrlInput);
      if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
        setErrors({ baseUrl: urlValidation.message || "Invalid Base URL" });
        return;
      }

      const cleanUrl = urlValidation.normalizedUrl;
      const effectiveName = providerName.trim() || `Local AI (${cleanUrl})`;
      const generatedCurl =
        protocol === "gemini"
          ? generateGeminiCurl(cleanUrl)
          : generateOpenAICurl(cleanUrl, !!apiKeyInput.trim());

      handleSave({
        name: effectiveName,
        baseUrl: cleanUrl,
        apiKey: apiKeyInput.trim(),
        protocol,
        curl: generatedCurl,
        streaming: true,
        responseContentPath:
          protocol === "gemini"
            ? "candidates[0].content.parts[0].text"
            : "choices[0].delta.content",
      });
    } else {
      handleSave({
        name: providerName.trim() || formData.name,
        baseUrl: baseUrlInput.trim() || formData.baseUrl,
        apiKey: apiKeyInput.trim(),
        protocol: protocol || formData.protocol || "openai",
        curl: formData.curl,
        streaming: formData.streaming,
        responseContentPath: formData.responseContentPath,
      });
    }
  };

  return (
    <>
      {!showForm ? (
        <Button
          onClick={() => {
            setShowForm(true);
            setErrors({});
            setTestResult({ status: "idle", message: "" });
          }}
          variant="outline"
          className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Custom / Local AI Provider
        </Button>
      ) : (
        <Card className="p-4 border !bg-transparent border-input/50 space-y-4">
          <div className="flex justify-between items-center">
            <Header
              title={editingProvider ? `Edit AI Provider` : "Add AI Provider"}
              description="Configure a local AI proxy (EasyCLIProxyAPI, Ollama, LM Studio) or custom AI endpoint."
            />

            {/* Mode Switcher */}
            <div className="flex bg-muted/60 p-1 rounded-lg border border-input/30">
              <button
                type="button"
                onClick={() => setSetupMode("baseUrl")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all",
                  setupMode === "baseUrl"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Server className="h-3.5 w-3.5" />
                Quick (Base URL)
              </button>
              <button
                type="button"
                onClick={() => setSetupMode("curl")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all",
                  setupMode === "curl"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Terminal className="h-3.5 w-3.5" />
                Advanced (cURL)
              </button>
            </div>
          </div>

          {setupMode === "baseUrl" ? (
            /* =================== QUICK SETUP (BASE URL) MODE =================== */
            <div className="space-y-4">
              <div className="space-y-1">
                <Header
                  title="Preset"
                  description="Quick-fill standard settings for popular local proxies & engines."
                />
                <Selection
                  options={LOCAL_PRESETS.map((p) => ({
                    label: p.label,
                    value: p.label,
                  }))}
                  placeholder="Select a local AI preset (e.g. EasyCLIProxyAPI)"
                  onChange={(val) => handlePresetSelect(val)}
                />
              </div>

              <div className="space-y-1">
                <Header
                  title="Protocol"
                  description="Choose standard OpenAI (/v1/chat/completions) or Google Gemini / Antigravity (/v1beta)."
                />
                <Selection
                  options={[
                    { label: "OpenAI Compatible (/v1)", value: "openai" },
                    { label: "Google Gemini / Antigravity (/v1beta)", value: "gemini" },
                  ]}
                  selected={protocol}
                  placeholder="Select Protocol"
                  onChange={(val) => setProtocol(val as "openai" | "gemini")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Header
                    title="Provider Name"
                    description="A friendly label (e.g. EasyCLIProxyAPI)."
                  />
                  <TextInput
                    placeholder="EasyCLIProxyAPI"
                    value={providerName}
                    onChange={(val) =>
                      setProviderName(typeof val === "string" ? val : "")
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Header
                    title="Base URL *"
                    description="Host and port (e.g. http://127.0.0.1:8317)."
                  />
                  <TextInput
                    placeholder="http://127.0.0.1:8317"
                    value={baseUrlInput}
                    onChange={(val) => {
                      setBaseUrlInput(typeof val === "string" ? val : "");
                      setTestResult({ status: "idle", message: "" });
                    }}
                    error={errors.baseUrl}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Header
                  title="API Key (Optional)"
                  description="Leave empty if your local server does not require authentication."
                />
                <TextInput
                  type="password"
                  placeholder="Optional API key (leave blank for keyless local AI)"
                  value={apiKeyInput}
                  onChange={(val) =>
                    setApiKeyInput(typeof val === "string" ? val : "")
                  }
                />
              </div>

              {/* Test Connection Button & Result */}
              <div className="p-3 bg-muted/40 rounded-lg border border-input/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Verify Connectivity & Discover Models
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tests the connection via Tauri's native Rust HTTP transport (bypassing browser CORS/ATS).
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || !baseUrlInput.trim()}
                    className="h-8 text-xs font-medium"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      "Test Connection"
                    )}
                  </Button>
                </div>

                {testResult.status === "success" && (
                  <div className="flex items-start gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{testResult.message}</span>
                  </div>
                )}

                {testResult.status === "error" && (
                  <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* =================== ADVANCED (RAW CURL) MODE =================== */
            <div className="space-y-4">
              <div className="flex justify-end">
                <div className="w-[140px]">
                  <Selection
                    options={allAiProviders
                      ?.filter((provider) => !provider?.isCustom)
                      .map((provider) => ({
                        label: provider?.id || "AI Provider",
                        value: provider?.id || "AI Provider",
                      }))}
                    placeholder="Auto-fill"
                    onChange={(value) => handleAutoFill(value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Header
                    title="Provider Name"
                    description="A friendly label."
                  />
                  <TextInput
                    placeholder="Custom AI Provider"
                    value={providerName}
                    onChange={(val) =>
                      setProviderName(typeof val === "string" ? val : "")
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Header
                    title="Base URL / Host"
                    description="Host and port (e.g. http://127.0.0.1:8317)."
                  />
                  <TextInput
                    placeholder="http://127.0.0.1:8317"
                    value={baseUrlInput}
                    onChange={(val) =>
                      setBaseUrlInput(typeof val === "string" ? val : "")
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Header
                  title="API Key"
                  description="Saved directly into your custom provider definition."
                />
                <TextInput
                  type="password"
                  placeholder="API Key / Token"
                  value={apiKeyInput}
                  onChange={(val) =>
                    setApiKeyInput(typeof val === "string" ? val : "")
                  }
                />
              </div>

              <div className="space-y-1">
                <Header
                  title="Curl Command *"
                  description="The curl command template to use with the AI provider."
                />
                <Textarea
                  className={cn(
                    "h-64 font-mono text-xs",
                    errors.curl && "border-red-500"
                  )}
                  placeholder={`curl --location 'http://127.0.0.1:8317/v1/chat/completions' \\
--header 'Content-Type: application/json' \\
--data '{
    "model": "{{MODEL}}",
    "messages": [
        {"role": "system", "content": "{{SYSTEM_PROMPT}}"},
        {"role": "user", "content": "{{TEXT}}"}
    ],
    "stream": true
}'`}
                  value={formData.curl}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, curl: e.target.value }))
                  }
                />
                {errors.curl && (
                  <p className="text-xs text-red-500 mt-1">{errors.curl}</p>
                )}
              </div>

              <div className="flex justify-between items-center space-x-2">
                <Header
                  title="Streaming"
                  description="Stream response tokens in real-time."
                />
                <Switch
                  checked={formData.streaming}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, streaming: checked }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Header
                  title="Response Content Path *"
                  description="JSON path to extract answer text."
                />
                <TextInput
                  placeholder="choices[0].delta.content"
                  value={formData.responseContentPath || ""}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      responseContentPath: value,
                    }))
                  }
                  error={errors.responseContentPath}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-input/30">
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              className="h-10 border-1 border-input/50"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              <SaveIcon className="h-4 w-4 mr-2" />
              {editingProvider ? "Update" : "Save"} Provider
            </Button>
          </div>
        </Card>
      )}
    </>
  );
};
