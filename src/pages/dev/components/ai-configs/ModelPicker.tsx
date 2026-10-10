import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Header,
  TextInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components";
import { Check, ChevronsUpDown, Loader2, Pencil, RefreshCw } from "lucide-react";
import {
  canListProviderModels,
  hasPublicCatalog,
  isProviderListReady,
  listProviderModels,
} from "@/lib/functions/models.function";

/** Session cache: provider+credentials -> model IDs (refresh bypasses). */
const cache = new Map<string, string[]>();

function cacheKey(providerId: string, vars: Record<string, string>, curl: string): string {
  return [providerId, vars.api_key || "", vars.region || "", providerId === "ollama" ? curl : ""].join("|");
}

/**
 * Global model field: searchable dropdown fed by each provider's official
 * list-models API. Auto-fetches when credentials are present, refresh icon
 * re-fetches, current selection stays visible, last item opens manual entry.
 */
export const ModelPicker = ({
  providerId,
  providerLabel,
  apiKey,
  curl,
  variables,
  value,
  onSelect,
  title,
  description,
}: {
  providerId: string;
  providerLabel: string;
  apiKey: string;
  curl: string;
  variables: Record<string, string>;
  value: string;
  onSelect: (modelId: string) => void;
  title?: string;
  description?: string;
}) => {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetchingRef = useRef("");
  const requestIdRef = useRef(0);

  const supported = canListProviderModels(providerId);
  const keyReady = supported && isProviderListReady(providerId, variables || {});
  // Keyless path: public catalog (exact account list once the key is in).
  const canFetch = supported && (keyReady || hasPublicCatalog(providerId));

  const doFetch = useCallback(
    async (force: boolean) => {
      if (!supported || !isProviderListReady(providerId, variables || {})) return;
      const key = cacheKey(providerId, variables || {}, curl);
      if (!force && cache.has(key)) {
        setModels(cache.get(key) || []);
        return;
      }
      if (fetchingRef.current === key) return;
      fetchingRef.current = key;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const ids = await listProviderModels(providerId, {
          vars: variables || {},
          curl,
        });
        if (requestIdRef.current !== requestId) return; // stale: creds changed mid-flight
        cache.set(key, ids);
        setModels(ids);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (requestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "Failed to fetch models");
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
        fetchingRef.current = "";
      }
    },
    [providerId, variables, curl, supported]
  );

  // Auto-fetch when provider/credentials become ready; manual refresh via icon.
  useEffect(() => {
    if (canFetch) void doFetch(false);
    else {
      setModels([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, apiKey, (variables || {}).region, curl]);

  if (!supported) return null;

  const visible = value && !models.includes(value) ? [value, ...models] : models;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Fetch on open when we have nothing to show (cache makes repeats cheap).
    if (next && canFetch && !loading && models.length === 0) void doFetch(false);
  };

  return (
    <div className="space-y-1">
      <Header
        title={title || "Model *"}
        description={
          description ||
          `Required — models from your ${providerLabel} account, fetched automatically. Last item lets you type a custom ID.`
        }
      />
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between h-11 font-normal"
            >
              <span className="truncate">{value || "Choose a model..."}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandList>
                <CommandEmpty>No matching model.</CommandEmpty>
                <CommandGroup>
                  {visible.map((id) => (
                    <CommandItem
                      key={id}
                      value={id}
                      onSelect={() => {
                        onSelect(id);
                        setCustomMode(false);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={`h-4 w-4 shrink-0 ${value === id ? "opacity-100" : "opacity-0"}`}
                      />
                      <span className="font-medium text-sm break-all">{id}</span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="__custom_model__"
                    forceMount
                    onSelect={() => setCustomMode(true)}
                    className="cursor-pointer"
                  >
                    <Pencil className="h-4 w-4 shrink-0 opacity-60" />
                    <span className="text-sm text-muted-foreground">Custom model…</span>
                  </CommandItem>
                </CommandGroup>
                {updatedAt ? (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                    Updated{" "}
                    {new Date(updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          onClick={() => void doFetch(true)}
          disabled={!canFetch || loading}
          size="icon"
          variant="outline"
          className="shrink-0 h-11 w-11"
          title={keyReady ? "Refresh model list" : "Public list — add API key for your exact account models"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
      {customMode ? (
        <div className="flex gap-2">
          <TextInput
            placeholder="Type custom model ID"
            value={customValue}
            onChange={(v: string) => setCustomValue(v)}
          />
          <Button
            className="shrink-0 h-11"
            disabled={!customValue.trim()}
            onClick={() => {
              onSelect(customValue.trim());
              setCustomMode(false);
              setCustomValue("");
              setOpen(false);
            }}
          >
            Use
          </Button>
        </div>
      ) : null}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {canFetch && !loading && models.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">Fetching models…</p>
      ) : null}
    </div>
  );
};
