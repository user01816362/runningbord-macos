import { useEffect, useState } from "react";
import { Button, Header, Selection, TextInput } from "@/components";
import {
  deleteProviderProfile,
  getProviderProfiles,
  loadProviderProfile,
  renameProviderProfile,
  saveProviderProfile,
  type ProviderProfile,
} from "@/lib/storage";

/**
 * Saved provider profiles: name a setup (provider + key + model + extras),
 * switch between them in one click, update/rename/delete. Secrets stay in
 * the OS keychain per profile. Shared by AI and STT settings.
 */
export const ProviderProfiles = ({
  kind,
  title,
  currentProvider,
  currentVariables,
  onApply,
}: {
  kind: "ai" | "stt";
  title: string;
  currentProvider: string;
  currentVariables: Record<string, string>;
  onApply: (provider: string, variables: Record<string, string>) => void;
}) => {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => setProfiles(getProviderProfiles(kind));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const applyProfile = async (id: string) => {
    setSelectedId(id);
    if (!id) return;
    setBusy(true);
    try {
      const loaded = await loadProviderProfile(kind, id);
      if (loaded) onApply(loaded.provider, loaded.variables);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (update: boolean) => {
    if (!currentProvider) return;
    const profileName =
      name.trim() ||
      profiles.find((p) => p.id === selectedId)?.name ||
      `${currentProvider} profile`;
    setBusy(true);
    try {
      const saved = await saveProviderProfile(kind, {
        id: update ? selectedId || undefined : undefined,
        name: profileName,
        provider: currentProvider,
        variables: currentVariables || {},
      });
      refresh();
      setSelectedId(saved.id);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = () => {
    if (!selectedId || !name.trim()) return;
    renameProviderProfile(kind, selectedId, name);
    refresh();
    setName("");
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await deleteProviderProfile(kind, selectedId);
    setSelectedId("");
    refresh();
  };

  return (
    <div className="space-y-2">
      <Header
        title={title}
        description="Save this setup under a name and switch between providers without re-entering keys and models."
      />
      {profiles.length > 0 ? (
        <Selection
          selected={selectedId}
          options={profiles.map((p) => ({
            label: `${p.name} (${p.provider})`,
            value: p.id,
          }))}
          placeholder="Switch to a saved profile…"
          onChange={(value) => void applyProfile(value)}
        />
      ) : null}
      <div className="flex gap-2">
        <TextInput
          placeholder="Profile name (e.g. Work OpenAI)"
          value={name}
          onChange={(v: string) => setName(v)}
        />
        <Button
          className="shrink-0 h-11"
          disabled={busy || !currentProvider}
          onClick={() => void handleSave(false)}
          title="Save current setup as a new profile"
        >
          Save
        </Button>
      </div>
      {selectedId ? (
        <div className="flex gap-2">
          <Button
            className="shrink-0"
            size="sm"
            variant="outline"
            disabled={busy || !currentProvider}
            onClick={() => void handleSave(true)}
            title="Overwrite selected profile with current setup"
          >
            Update
          </Button>
          <Button
            className="shrink-0"
            size="sm"
            variant="outline"
            disabled={busy || !name.trim()}
            onClick={handleRename}
            title="Rename selected profile to the name above"
          >
            Rename
          </Button>
          <Button
            className="shrink-0"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void handleDelete()}
            title="Delete selected profile and its stored key"
          >
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
};
