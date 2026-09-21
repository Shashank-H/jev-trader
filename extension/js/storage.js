/** Tiny wrapper over chrome.storage.local for settings + cached data. */
import { STORE_KEYS } from "./config.js";

export const DEFAULT_SETTINGS = {
  jevApiKey: "",
  symbol: "RELIANCE",
  spendLimit: 50000, // ₹ total buy value allowed per session
  interval: "5m",
  riskLevel: "medium",
  maxLoss: 2000, // ₹ — kill switch
  paperMode: true, // ON by default; toggle for live trading
  shortEnabled: false, // OFF by default; user must explicitly allow short selling
};

export async function loadSettings() {
  const out = await chrome.storage.local.get(STORE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(out[STORE_KEYS.settings] || {}) };
}

export async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [STORE_KEYS.settings]: next });
  return next;
}

export async function loadInstrumentsCache() {
  const out = await chrome.storage.local.get(STORE_KEYS.instruments);
  return out[STORE_KEYS.instruments] || null;
}

export async function saveInstrumentsCache(payload) {
  await chrome.storage.local.set({ [STORE_KEYS.instruments]: payload });
}
