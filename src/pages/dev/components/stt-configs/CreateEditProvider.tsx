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
import { useCustomSttProviders } from "@/hooks";
import { useApp } from "@/contexts";
import { cn } from "@/lib/utils";
import {
  validateBaseUrl,
  generateOpenAISTTCurl,
} from "@/lib";
import { fetchCustomProviderModels } from "@/lib/functions/models.function";

interface CreateEditProviderProps {
  customProviderHook?: ReturnType<typeof useCustomSttProviders>;
}

const LOCAL_STT_PRESETS = [
  {
    label: "EasyCLIProxyAPI (Port 8317)",
    name: "EasyCLIProxyAPI STT",
    url: "http://127.0.0.1:8317/v1",
  },
  {
    label: "Local Whisper / Whisper.cpp (Port 8000)",
    name: "Local Whisper",
    url: "http://127.0.0.1:8000/v1",
  },
  {
    label: "Local Whisper (Port 8080)",
    name: "Whisper Server",
    url: "http://127.0.0.1:8080/v1",
  },
  {
    label: "Custom Local Endpoint",
    name: "Local STT",
    url: "http://127.0.0.1:8317",
  },
  {
    label: "Groq Whisper (Cloud Fast)",
    name: "Groq Whisper",
    url: "https://api.groq.com/openai/v1",
  },
  {
    label: "OpenAI Whisper (Cloud)",
    name: "OpenAI Whisper",
    url: "https://api.openai.com/v1",
  },
];

export const CreateEditProvider = ({
  customProviderHook,
}: CreateEditProviderProps) => {
  const { allSttProviders } = useApp();
  const hookInstance = customProviderHook || useCustomSttProviders();

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
      setTestResult({ status: "idle", message: "" });
    }
  }, [editingProvider, showForm]);

  const handlePresetSelect = (presetLabel: string) => {
    const preset = LOCAL_STT_PRESETS.find((p) => p.label === presetLabel);
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
        const whisperModels = models.filter((m) =>
          /whisper|transcri|audio|stt|speech|scribe/i.test(m)
        );
        const displayModels = whisperModels.length > 0 ? whisperModels : models;
        setTestResult({
          status: "success",
          message: `Connected successfully in ${latencyMs}ms! Discovered ${models.length} model(s) (${displayModels.slice(0, 3).join(", ")}${displayModels.length > 3 ? "..." : ""})`,
          models,
        });
      } else {
        setTestResult({
          status: "success",
          message: `Connected successfully in ${latencyMs}ms! (Server reachable, OpenAI-compatible STT /audio/transcriptions ready)`,
          models: [],
        });
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Cannot reach local server. Ensure EasyCLIProxyAPI or your STT server is running.",
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
      const effectiveName = providerName.trim() || `Local STT (${cleanUrl})`;
      const generatedCurl = generateOpenAISTTCurl(cleanUrl);

      handleSave({
        name: effectiveName,
        baseUrl: cleanUrl,
        apiKey: apiKeyInput.trim(),
        protocol: "openai",
        curl: generatedCurl,
        streaming: false,
        responseContentPath: "text",
      });
    } else {
      handleSave();
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
          Add Custom / Local STT Provider
        </Button>
      ) : (
        <Card className="p-4 border !bg-transparent border-input/50 space-y-4">
          <div className="flex justify-between items-center">
            <Header
              title={
                editingProvider
                  ? `Edit STT Provider`
                  : "Add STT Provider"
              }
              description="Configure a local AI proxy (EasyCLIProxyAPI, Local Whisper) or custom STT endpoint."
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
                  description="Quick-fill standard settings for popular local proxies & STT engines."
                />
                <Selection
                  options={LOCAL_STT_PRESETS.map((p) => ({
                    label: p.label,
                    value: p.label,
                  }))}
                  placeholder="Select a local STT preset (e.g. EasyCLIProxyAPI)"
                  onChange={(val) => handlePresetSelect(val)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Header
                    title="Provider Name"
                    description="A friendly label (e.g. EasyCLIProxyAPI STT)."
                  />
                  <TextInput
                    placeholder="EasyCLIProxyAPI STT"
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
                    placeholder="http://127.0.0.1:8317/v1"
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
                  placeholder="Optional API key (leave blank for keyless local STT)"
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
                    options={allSttProviders
                      ?.filter((provider) => !provider?.isCustom)
                      .map((provider) => ({
                        label: provider?.id || "STT Provider",
                        value: provider?.id || "STT Provider",
                      }))}
                    placeholder="Auto-fill"
                    onChange={(value) => handleAutoFill(value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Header
                  title="Curl Command *"
                  description="The curl command template to use with the STT provider."
                />
                <Textarea
                  className={cn(
                    "h-64 font-mono text-xs",
                    errors.curl && "border-red-500"
                  )}
                  placeholder={`curl -X POST "http://127.0.0.1:8317/v1/audio/transcriptions" \\
  -H "Authorization: Bearer {{API_KEY}}" \\
  -F "file={{AUDIO}}" \\
  -F "model={{MODEL}}"`}
                  value={formData.curl}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, curl: e.target.value }))
                  }
                />
                {errors.curl && (
                  <p className="text-xs text-red-500 mt-1">{errors.curl}</p>
                )}
              </div>

              <div className="bg-muted/50 p-3 rounded-lg space-y-2 text-xs">
                <p className="font-semibold text-foreground">
                  Variables for STT Providers:
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                    {"{{AUDIO}}"}
                  </code>
                  <span className="text-muted-foreground">
                    Required audio binary file (-F &quot;file=@...&quot;) or base64 data.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                    {"{{MODEL}}"}
                  </code>
                  <span className="text-muted-foreground">
                    Optional/required transcription model name (e.g. whisper-1).
                  </span>
                </div>
              </div>

              <div className="space-y-0">
                <div className="flex justify-between items-center space-x-2">
                  <Header
                    title="Streaming"
                    description="Streaming transcription response."
                  />
                  <Switch
                    checked={formData.streaming}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        streaming: checked,
                      }))
                    }
                    disabled={true}
                  />
                </div>
                <span className="text-xs italic text-muted-foreground">
                  Streaming is not supported for STT providers.
                </span>
              </div>

              <div className="space-y-1">
                <Header
                  title="Response Content Path *"
                  description="JSON path to extract transcription text."
                />
                <TextInput
                  placeholder="text"
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
