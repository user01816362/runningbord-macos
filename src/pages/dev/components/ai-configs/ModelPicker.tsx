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
import { Check, ChevronsUpDown, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  addCustomModel,
  getCustomModels,
  removeCustomModel,
  renameCustomModel,
} from "@/lib/storage";
import {
  canListProviderModels,
  isProviderListReady,
  listProviderModels,
} from "@/lib/functions/models.function";

/** Session cache: provider+credentials -> model IDs (refresh bypasses). */
const cache = new Map<string, string[]>();

function cacheKey(providerId: string, vars: Record<string, string>, curl: string): string {
  return [providerId, vars.api_key || "", vars.region || "", curl].join("|");
}

/**
 * Global model field: searchable dropdown fed by each provider's official
 * list-models API. Auto-fetches once the key is in,
 * ready, refresh icon re-fetches, current selection stays visible, saved
 * custom IDs are editable + deletable, last item adds a new custom ID.
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
  slot,
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
  /** Custom-model storage slot (defaults to providerId; Slow uses its own). */
  slot?: string;
}) => {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customs, setCustoms] = useState<string[]>([]);
  const [editingCustom, setEditingCustom] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetchingRef = useRef("");
  const requestIdRef = useRef(0);

  const store = slot || providerId;
  const supported = canListProviderModels(providerId);
  const keyReady = supported && isProviderListReady(providerId, variables || {});
  // Key-gated: official account list only.
  const canFetch = supported && keyReady;

  const doFetch = useCallback(
    async (force: boolean) => {
      if (!supported || !keyReady) return;
      const key = cacheKey(providerId, variables || {}, curl);
      if (!force && cache.has(key)) {
        setModels(cache.get(key) || []);
        return;
      }
      if (fetchingRef.current === key && !force) return;
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

  // Auto-fetch when ready (settings open counts as mount); manual refresh via icon.
  useEffect(() => {
    if (canFetch) void doFetch(false);
    else {
      setModels([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, apiKey, (variables || {}).region, curl]);

  useEffect(() => {
    setCustoms(getCustomModels(store));
  }, [store, open]);

  if (!supported) return null;

  const visible = value && !models.includes(value) ? [value, ...models] : models;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Fetch on open when we have nothing to show (cache makes repeats cheap).
    if (next && canFetch && !loading && models.length === 0) void doFetch(false);
    if (next) setCustoms(getCustomModels(store));
  };

  const applyCustom = (id: string) => {
    const clean = id.trim();
    if (!clean) return;
    addCustomModel(store, clean);
    setCustoms(getCustomModels(store));
    onSelect(clean);
    setCustomMode(false);
    setCustomValue("");
    setEditingCustom(null);
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <Header
        title={title || "Model *"}
        description={
          description ||
          (keyReady
            ? `Required — models from your ${providerLabel} account, fetched automatically.`
            : "Required — enter the API key above to load your account models.")
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
                </CommandGroup>
                {customs.length > 0 ? (
                  <CommandGroup heading="Custom">
                    {customs.map((id) => (
                      <CommandItem
                        key={`custom:${id}`}
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
                        <span className="font-medium text-sm break-all flex-1">{id}</span>
                        <span
                          role="button"
                          title="Edit"
                          className="p-1 opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustom(id);
                            setEditValue(id);
                            setCustomMode(false);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          title="Delete"
                          className="p-1 opacity-60 hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomModel(store, id);
                            setCustoms(getCustomModels(store));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                <CommandGroup>
                  <CommandItem
                    value="__custom_model__"
                    forceMount
                    onSelect={() => {
                      setEditingCustom(null);
                      setCustomValue("");
                      setCustomMode(true);
                    }}
                    className="cursor-pointer"
                  >
                    <Pencil className="h-4 w-4 shrink-0 opacity-60" />
                    <span className="text-sm text-muted-foreground">Custom model…</span>
                  </CommandItem>
                </CommandGroup>
                {updatedAt ? (
                  <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">
                    Your account · Updated{" "}
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
          title="Refresh model list"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
      {customMode || editingCustom ? (
        <div className="flex gap-2">
          <TextInput
            placeholder="Type custom model ID"
            value={editingCustom ? editValue : customValue}
            onChange={(v: string) => {
              if (editingCustom) setEditValue(v);
              else setCustomValue(v);
            }}
          />
          <Button
            className="shrink-0 h-11"
            disabled={!(editingCustom ? editValue.trim() : customValue.trim())}
            onClick={() => {
              if (editingCustom) {
                renameCustomModel(store, editingCustom, editValue);
                setCustoms(getCustomModels(store));
                onSelect(editValue.trim());
                setEditingCustom(null);
                setEditValue("");
                setOpen(false);
              } else {
                applyCustom(customValue);
              }
            }}
          >
            {editingCustom ? "Save" : "Use"}
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
