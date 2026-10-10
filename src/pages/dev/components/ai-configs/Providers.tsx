import { Button, Header, Input, Selection, TextInput } from "@/components";
import { ModelPicker } from "./ModelPicker";
import { canListProviderModels } from "@/lib/functions/models.function";
import { readKeychainFailed } from "@/lib/storage";
import { STORAGE_KEYS } from "@/config";
import { UseSettingsReturn } from "@/types";
import curl2Json, { ResultJSON } from "@bany/curl-to-json";
import { KeyIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";

export const Providers = ({
  allAiProviders,
  selectedAIProvider,
  onSetSelectedAIProvider,
  variables,
}: UseSettingsReturn) => {
  const [localSelectedProvider, setLocalSelectedProvider] =
    useState<ResultJSON | null>(null);
  const [keychainBlocked, setKeychainBlocked] = useState(false);

  useEffect(() => {
    setKeychainBlocked(readKeychainFailed(STORAGE_KEYS.SELECTED_AI_PROVIDER));
  }, [selectedAIProvider?.provider]);

  useEffect(() => {
    if (selectedAIProvider?.provider) {
      const provider = allAiProviders?.find(
        (p) => p?.id === selectedAIProvider?.provider
      );
      if (provider) {
        const json = curl2Json(provider?.curl);
        setLocalSelectedProvider(json as ResultJSON);
      }
    }
  }, [selectedAIProvider?.provider]);

  const findKeyAndValue = (key: string) => {
    return variables?.find((v) => v?.key === key);
  };

  const getApiKeyValue = () => {
    const apiKeyVar = findKeyAndValue("api_key");
    if (!apiKeyVar || !selectedAIProvider?.variables) return "";
    return selectedAIProvider?.variables?.[apiKeyVar.key] || "";
  };

  const isApiKeyEmpty = () => {
    return !getApiKeyValue().trim();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Header
          title="Select AI Provider"
          description="Select your preferred AI service provider or custom providers to get started."
        />
        <Selection
          selected={selectedAIProvider?.provider}
          options={allAiProviders?.map((provider) => {
            const json = curl2Json(provider?.curl);
            return {
              label: provider?.isCustom
                ? json?.url || "Custom Provider"
                : provider?.id || "Custom Provider",
              value: provider?.id || "Custom Provider",
              isCustom: provider?.isCustom,
            };
          })}
          placeholder="Choose your AI provider"
          onChange={(value) => {
            onSetSelectedAIProvider({
              provider: value,
              variables: {},
            });
          }}
        />
      </div>

      {localSelectedProvider ? (
        <Header
          title={`Method: ${
            localSelectedProvider?.method || "Invalid"
          }, Endpoint: ${localSelectedProvider?.url || "Invalid"}`}
          description={`If you want to use different url or method, you can always create a custom provider.`}
        />
      ) : null}

      {keychainBlocked ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
          <p className="text-xs font-medium text-destructive">
            System keychain blocked — your API key works for this session only
            and must be re-entered after restart. Provider, model and region
            are still saved. Allow Keychain access to persist the key securely.
          </p>
        </div>
      ) : null}

      {findKeyAndValue("api_key") ? (
        <div className="space-y-2">
          <Header
            title="API Key"
            description={`Enter your ${
              allAiProviders?.find(
                (p) => p?.id === selectedAIProvider?.provider
              )?.isCustom
                ? "Custom Provider"
                : selectedAIProvider?.provider
            } API key to authenticate and access AI models. Your key is kept in the system keychain and only sent to this provider.`}
          />

          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="**********"
                value={getApiKeyValue()}
                onChange={(value) => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider) return;

                  onSetSelectedAIProvider({
                    ...selectedAIProvider,
                    variables: {
                      ...selectedAIProvider.variables,
                      [apiKeyVar.key]:
                        typeof value === "string" ? value : value.target.value,
                    },
                  });
                }}
                onKeyDown={(e) => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider) return;

                  onSetSelectedAIProvider({
                    ...selectedAIProvider,
                    variables: {
                      ...selectedAIProvider.variables,
                      [apiKeyVar.key]: (e.target as HTMLInputElement).value,
                    },
                  });
                }}
                disabled={false}
                className="flex-1 h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
              />
              {isApiKeyEmpty() ? (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar || !selectedAIProvider || isApiKeyEmpty())
                      return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [apiKeyVar.key]: getApiKeyValue(),
                      },
                    });
                  }}
                  disabled={isApiKeyEmpty()}
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  title="Submit API Key"
                >
                  <KeyIcon className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const apiKeyVar = findKeyAndValue("api_key");
                    if (!apiKeyVar || !selectedAIProvider) return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [apiKeyVar.key]: "",
                      },
                    });
                  }}
                  size="icon"
                  variant="destructive"
                  className="shrink-0 h-11 w-11"
                  title="Remove API Key"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 mt-2">
        {variables
          .filter(
            (variable) =>
              variable.key !== findKeyAndValue("api_key")?.key &&
              variable.key !== "model"
          )
          .map((variable) => {
            const getVariableValue = () => {
              if (!variable?.key || !selectedAIProvider?.variables) return "";
              return selectedAIProvider.variables[variable.key] || "";
            };

            return (
              <div className="space-y-1" key={variable?.key}>
                <Header
                  title={variable?.value || ""}
                  description={`add your preferred ${variable?.key?.replace(
                    /_/g,
                    " "
                  )} for ${
                    allAiProviders?.find(
                      (p) => p?.id === selectedAIProvider?.provider
                    )?.isCustom
                      ? "Custom Provider"
                      : selectedAIProvider?.provider
                  }`}
                />
                <TextInput
                  placeholder={`Enter ${
                    allAiProviders?.find(
                      (p) => p?.id === selectedAIProvider?.provider
                    )?.isCustom
                      ? "Custom Provider"
                      : selectedAIProvider?.provider
                  } ${variable?.key?.replace(/_/g, " ") || "value"}`}
                  value={getVariableValue()}
                  onChange={(value) => {
                    if (!variable?.key || !selectedAIProvider) return;

                    onSetSelectedAIProvider({
                      ...selectedAIProvider,
                      variables: {
                        ...selectedAIProvider.variables,
                        [variable.key]: value,
                      },
                    });
                  }}
                />
              </div>
            );
          })}

        {/* Fast Model / Slow Model fields (only when provider has a MODEL variable) */}
        {findKeyAndValue("model") ? (
          <>
            {(() => {
              const provider = allAiProviders?.find(
                (p) => p?.id === selectedAIProvider?.provider
              );
              const setModel = (id: string) => {
                if (!selectedAIProvider) return;
                onSetSelectedAIProvider({
                  ...selectedAIProvider,
                  variables: {
                    ...selectedAIProvider.variables,
                    model: id,
                  },
                });
              };
              if (provider && canListProviderModels(provider.id || "")) {
                const getApiKey = () => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider?.variables) return "";
                  return selectedAIProvider.variables[apiKeyVar.key] || "";
                };
                return (
                  <ModelPicker
                    providerId={provider.id || ""}
                    providerLabel={
                      provider.isCustom ? "Custom Provider" : provider.id || ""
                    }
                    apiKey={getApiKey()}
                    curl={provider.curl || ""}
                    variables={selectedAIProvider?.variables || {}}
                    value={selectedAIProvider?.variables?.model || ""}
                    onSelect={setModel}
                  />
                );
              }
              return (
            <div className="space-y-1">
              <Header
                title="Fast Model *"
                description={`Required — the default model used for quick, low-latency responses from ${
                  allAiProviders?.find(
                    (p) => p?.id === selectedAIProvider?.provider
                  )?.isCustom
                    ? "Custom Provider"
                    : selectedAIProvider?.provider
                }.`}
              />
              <TextInput
                placeholder={`Enter fast model name (e.g. gpt-4o-mini)`}
                value={selectedAIProvider?.variables?.model || ""}
                onChange={(value) => {
                  setModel(typeof value === "string" ? value : "");
                }}
              />
            </div>
              );
            })()}
            {(() => {
              const provider = allAiProviders?.find(
                (p) => p?.id === selectedAIProvider?.provider
              );
              if (provider && canListProviderModels(provider.id || "")) {
                const getSlowApiKey = () => {
                  const apiKeyVar = findKeyAndValue("api_key");
                  if (!apiKeyVar || !selectedAIProvider?.variables) return "";
                  return selectedAIProvider.variables[apiKeyVar.key] || "";
                };
                return (
                  <ModelPicker
                    providerId={provider.id || ""}
                    providerLabel={
                      provider.isCustom ? "Custom Provider" : provider.id || ""
                    }
                    apiKey={getSlowApiKey()}
                    curl={provider.curl || ""}
                    variables={selectedAIProvider?.variables || {}}
                    value={selectedAIProvider?.variables?.slow_model || ""}
                    title="Slow Model"
                    description="Optional — a higher-quality model for deeper responses. Same account list; pick or type custom."
                    onSelect={(id) => {
                      if (!selectedAIProvider) return;
                      onSetSelectedAIProvider({
                        ...selectedAIProvider,
                        variables: {
                          ...selectedAIProvider.variables,
                          slow_model: id,
                        },
                      });
                    }}
                  />
                );
              }
              return (
            <div className="space-y-1">
              <Header
                title="Slow Model"
                description={`Optional — a higher-quality model for deeper, more capable responses. When configured, a toggle appears in the chat UI to switch between fast and slow.`}
              />
              <TextInput
                placeholder={`Enter slow model name (optional)`}
                value={selectedAIProvider?.variables?.slow_model || ""}
                onChange={(value) => {
                  if (!selectedAIProvider) return;
                  onSetSelectedAIProvider({
                    ...selectedAIProvider,
                    variables: {
                      ...selectedAIProvider.variables,
                      slow_model: value,
                    },
                  });
                }}
              />
            </div>
              );
            })()}
          </>
        ) : null}
      </div>
    </div>
  );
};
