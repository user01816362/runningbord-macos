import { safeLocalStorage } from "./helper";

const KEY_PREFIX = "curl_custom_models_";

/** User-typed custom model IDs per provider slot, editable + deletable. */
export function getCustomModels(slot: string): string[] {
  try {
    const raw = safeLocalStorage.getItem(KEY_PREFIX + slot);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string" && v.length > 0)
      : [];
  } catch {
    return [];
  }
}

function setCustomModels(slot: string, ids: string[]) {
  safeLocalStorage.setItem(KEY_PREFIX + slot, JSON.stringify(ids));
}

export function addCustomModel(slot: string, id: string) {
  const clean = (id || "").trim();
  if (!clean) return;
  const ids = getCustomModels(slot).filter((v) => v !== clean);
  ids.unshift(clean);
  setCustomModels(slot, ids.slice(0, 50));
}

export function renameCustomModel(slot: string, from: string, to: string) {
  const clean = (to || "").trim();
  if (!clean) return;
  setCustomModels(
    slot,
    getCustomModels(slot).map((v) => (v === from ? clean : v))
  );
}

export function removeCustomModel(slot: string, id: string) {
  setCustomModels(
    slot,
    getCustomModels(slot).filter((v) => v !== id)
  );
}
