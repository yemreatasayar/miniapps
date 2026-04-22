import { createNewDraft, exampleHistory } from "./defaults";
import type { SavedQrDesign } from "./types";

const HISTORY_KEY = "qr-generator.history";
const DRAFT_KEY = "qr-generator.current";

export type StorageScope = {
  customerId: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function scopedKey(baseKey: string, scope: StorageScope): string {
  return `${baseKey}.${scope.customerId || "global"}`;
}

function isLegacyStarterDraft(draft: SavedQrDesign): boolean {
  return (
    draft.type === "url" &&
    draft.name === "Link QR" &&
    draft.fields.url.url === "https://www.mmo.org.tr" &&
    draft.fields.wifi.ssid === "MMO-Guest" &&
    draft.fields.vcard.firstName === "Yusuf Emre"
  );
}

function belongsToScope(record: SavedQrDesign, scope: StorageScope): boolean {
  return (record.customerId ?? "global") === scope.customerId;
}

export function loadHistory(scope: StorageScope): SavedQrDesign[] {
  if (!canUseStorage()) return scope.customerId === "global" ? exampleHistory : [];

  try {
    const raw = window.localStorage.getItem(scopedKey(HISTORY_KEY, scope));
    if (!raw) return scope.customerId === "global" ? exampleHistory : [];
    const parsed = JSON.parse(raw) as SavedQrDesign[];
    return Array.isArray(parsed) ? parsed.filter((record) => belongsToScope(record, scope)) : [];
  } catch {
    return scope.customerId === "global" ? exampleHistory : [];
  }
}

export function saveHistory(scope: StorageScope, history: SavedQrDesign[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(scopedKey(HISTORY_KEY, scope), JSON.stringify(history));
}

export function loadDraft(scope: StorageScope): SavedQrDesign {
  if (!canUseStorage()) return createNewDraft();

  try {
    const raw = window.localStorage.getItem(scopedKey(DRAFT_KEY, scope));
    if (!raw) return createNewDraft();

    const parsed = JSON.parse(raw) as SavedQrDesign;
    if (isLegacyStarterDraft(parsed)) return createNewDraft();
    if (!belongsToScope(parsed, scope)) return createNewDraft();
    return parsed;
  } catch {
    return createNewDraft();
  }
}

export function saveDraft(scope: StorageScope, draft: SavedQrDesign): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(scopedKey(DRAFT_KEY, scope), JSON.stringify(draft));
}

export function clearHistory(scope: StorageScope): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(scopedKey(HISTORY_KEY, scope));
}

export function clearDraft(scope: StorageScope): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(scopedKey(DRAFT_KEY, scope));
}
