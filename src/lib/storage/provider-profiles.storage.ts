import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "./helper";
import { isSecretVariable } from "./provider-secrets.storage";

export interface ProviderProfile {
  id: string;
  name: string;
  provider: string;
  /** Non-secret variables only; secrets live in the OS keychain. */
  variables: Record<string, string>;
  secretNames: string[];
  updatedAt: number;
}

const keyFor = (kind: "ai" | "stt") => `curl_provider_profiles_${kind}`;
const secretId = (kind: "ai" | "stt", profileId: string, variable: string) =>
  `${kind}:profile:${profileId}:${variable}`;

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function getProviderProfiles(kind: "ai" | "stt"): ProviderProfile[] {
  try {
    const raw = safeLocalStorage.getItem(keyFor(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => p && typeof p.id === "string" && typeof p.provider === "string"
    );
  } catch {
    return [];
  }
}

function setProviderProfiles(kind: "ai" | "stt", profiles: ProviderProfile[]) {
  safeLocalStorage.setItem(keyFor(kind), JSON.stringify(profiles));
}

/** Split current variables; secrets go to the keychain under this profile. */
async function writeProfileSecrets(
  kind: "ai" | "stt",
  profileId: string,
  variables: Record<string, string>
): Promise<string[]> {
  const names: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (!isSecretVariable(name)) continue;
    const key = secretId(kind, profileId, name);
    try {
      if (value) {
        await invoke("secret_set", { key, value });
        names.push(name);
      } else {
        await invoke("secret_delete", { key });
      }
    } catch (error) {
      console.warn(`Couldn't save ${name} to the system keychain:`, error);
    }
  }
  return names;
}

export async function saveProviderProfile(
  kind: "ai" | "stt",
  input: { name: string; provider: string; variables: Record<string, string>; id?: string }
): Promise<ProviderProfile> {
  const profiles = getProviderProfiles(kind);
  const cleanName = input.name.trim() || `${input.provider} profile`;
  const cleanVars = Object.fromEntries(
    Object.entries(input.variables || {}).filter(
      ([, v]) => typeof v === "string" && v.length > 0
    )
  );
  if (input.id) {
    const existing = profiles.find((p) => p.id === input.id);
    if (existing) {
      const secretNames = await writeProfileSecrets(kind, existing.id, input.variables || {});
      const updated: ProviderProfile = {
        ...existing,
        name: cleanName,
        provider: input.provider,
        variables: Object.fromEntries(
          Object.entries(cleanVars).filter(([n]) => !isSecretVariable(n))
        ),
        secretNames,
        updatedAt: Date.now(),
      };
      setProviderProfiles(kind, profiles.map((p) => (p.id === existing.id ? updated : p)));
      return updated;
    }
  }
  const id = newId();
  const secretNames = await writeProfileSecrets(kind, id, input.variables || {});
  const created: ProviderProfile = {
    id,
    name: cleanName,
    provider: input.provider,
    variables: Object.fromEntries(
      Object.entries(cleanVars).filter(([n]) => !isSecretVariable(n))
    ),
    secretNames,
    updatedAt: Date.now(),
  };
  profiles.unshift(created);
  setProviderProfiles(kind, profiles.slice(0, 50));
  return created;
}

/** Load a profile's variables with secrets filled from the keychain. */
export async function loadProviderProfile(
  kind: "ai" | "stt",
  id: string
): Promise<{ provider: string; variables: Record<string, string> } | null> {
  const profile = getProviderProfiles(kind).find((p) => p.id === id);
  if (!profile) return null;
  const variables: Record<string, string> = { ...(profile.variables || {}) };
  for (const name of profile.secretNames || []) {
    try {
      const value = await invoke<string | null>("secret_get", {
        key: secretId(kind, profile.id, name),
      });
      if (value) variables[name] = value;
    } catch (error) {
      console.warn(`Couldn't read ${name} from the system keychain:`, error);
    }
  }
  return { provider: profile.provider, variables };
}

export function renameProviderProfile(kind: "ai" | "stt", id: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  setProviderProfiles(
    kind,
    getProviderProfiles(kind).map((p) => (p.id === id ? { ...p, name: clean, updatedAt: Date.now() } : p))
  );
}

export async function deleteProviderProfile(kind: "ai" | "stt", id: string) {
  const profile = getProviderProfiles(kind).find((p) => p.id === id);
  setProviderProfiles(
    kind,
    getProviderProfiles(kind).filter((p) => p.id !== id)
  );
  if (profile) {
    for (const name of profile.secretNames || []) {
      try {
        await invoke("secret_delete", { key: secretId(kind, profile.id, name) });
      } catch {
        // best effort
      }
    }
  }
}
