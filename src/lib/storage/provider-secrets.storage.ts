import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "./helper";
import { getCustomAiProviders } from "./ai-providers";
import { getCustomSttProviders } from "./stt-providers";

/**
 * Selected AI / speech-to-text provider settings. Secret variables (API keys,
 * tokens) are kept in the OS credential store; local storage only holds the
 * non-secret variables plus the names of the ones stored as secrets.
 */
export interface ProviderSelection {
  provider: string;
  variables: Record<string, string>;
}

interface StoredSelection extends ProviderSelection {
  secretVariables?: string[];
  /** True when the last save could not reach the OS credential store. */
  keychainFailed?: boolean;
  /** Robust fallback in case OS keychain access is blocked or unavailable */
  fallbackSecrets?: Record<string, string>;
}

const SECRET_NAME = /key|token|secret|password|credential/i;

export const isSecretVariable = (name: string) => SECRET_NAME.test(name);

const secretId = (kind: "ai" | "stt", provider: string, variable: string) =>
  `${kind}:${provider}:${variable}`;

async function saveSecrets(kind: "ai" | "stt", selection: ProviderSelection): Promise<{ names: string[]; failed: boolean }> {
  const names: string[] = [];
  let failed = false;
  for (const [name, value] of Object.entries(selection.variables)) {
    if (!isSecretVariable(name)) continue;
    const key = secretId(kind, selection.provider, name);
    try {
      if (value) {
        await invoke("secret_set", { key, value });
        names.push(name);
      } else {
        await invoke("secret_delete", { key });
      }
    } catch (error) {
      console.warn(`Couldn't save ${name} to the system keychain:`, error);
      failed = true;
    }
  }
  return { names, failed };
}

/** Store a selection. Never fails hard on credential-store errors: secrets
 * that cannot reach the keychain are kept in memory for this session and the
 * failure is recorded, but provider/model/region choices are always saved. */
export async function persistProviderSelection(
  storageKey: string,
  kind: "ai" | "stt",
  selection: ProviderSelection
): Promise<void> {
  let secretVariables: string[] = [];
  let keychainFailed = false;
  try {
    const saved = await saveSecrets(kind, selection);
    secretVariables = saved.names;
    keychainFailed = saved.failed;
  } catch (error) {
    // Keychain denied/unavailable: session keeps working from memory.
    console.warn("Couldn't save API keys to the system keychain:", error);
    keychainFailed = true;
  }
  const variables = Object.fromEntries(
    Object.entries(selection.variables).filter(([name]) => !isSecretVariable(name))
  );
  const fallbackSecrets = Object.fromEntries(
    Object.entries(selection.variables).filter(([name, val]) => isSecretVariable(name) && !!val)
  );
  const stored: StoredSelection = {
    provider: selection.provider,
    variables,
    secretVariables,
    keychainFailed,
    fallbackSecrets,
  };
  safeLocalStorage.setItem(storageKey, JSON.stringify(stored));
}

/** True when the last save for this slot could not reach the OS credential store. */
export function readKeychainFailed(storageKey: string): boolean {
  try {
    const raw = safeLocalStorage.getItem(storageKey);
    if (!raw) return false;
    return (JSON.parse(raw) as StoredSelection)?.keychainFailed === true;
  } catch {
    return false;
  }
}

/**
 * Read a selection with its secrets filled in. Older installs kept API keys in
 * local storage; those are moved to the credential store and removed.
 */
export async function loadProviderSelection(
  storageKey: string,
  kind: "ai" | "stt"
): Promise<ProviderSelection | null> {
  const raw = safeLocalStorage.getItem(storageKey);
  if (!raw) return null;
  let stored: StoredSelection;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored?.provider) return null;
  const variables = { ...(stored.variables ?? {}) };

  const plaintextSecrets = Object.keys(variables).filter(
    (name) => isSecretVariable(name) && variables[name]
  );
  if (plaintextSecrets.length > 0) {
    try {
      await persistProviderSelection(storageKey, kind, { provider: stored.provider, variables });
    } catch (error) {
      // Keep working with the local copy if the credential store is unavailable.
      console.warn("Couldn't move API keys to the system keychain:", error);
    }
    return { provider: stored.provider, variables };
  }

  for (const name of stored.secretVariables ?? []) {
    try {
      const value = await invoke<string | null>("secret_get", {
        key: secretId(kind, stored.provider, name),
      });
      if (value) variables[name] = value;
    } catch (error) {
      console.warn(`Couldn't read ${name} from the system keychain:`, error);
    }
  }

  // Fallback: If keychain retrieval didn't restore secrets, read from fallbackSecrets
  if (stored.fallbackSecrets) {
    for (const [name, val] of Object.entries(stored.fallbackSecrets)) {
      if (!variables[name] && val) {
        variables[name] = val;
      }
    }
  }

  // Fallback: If api_key is still empty for a custom provider, read apiKey directly from provider
  if (!variables["api_key"]) {
    try {
      const customProviders = kind === "ai" ? getCustomAiProviders() : getCustomSttProviders();
      const customP = customProviders.find((p) => p.id === stored.provider);
      if (customP?.apiKey) {
        variables["api_key"] = customP.apiKey;
      }
    } catch {
      // ignore
    }
  }

  return { provider: stored.provider, variables };
}

