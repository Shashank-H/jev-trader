/**
 * Shared constants for Jev Trader.
 *
 * Jev API shape mirrors the pi-jev-context-curator project:
 *   POST {baseUrl}/v1/systemone
 *   { state: string, model: string, questions: { [id]: { type: "noul", instructions, criteria } } }
 *   -> { answers: { [id]: { noul: number } }, usage: { input_tokens, output_tokens } }
 * `noul` is a 0..1 score; >= JEV_THRESHOLD counts as "yes".
 */

// --- Jev (TypeSafe AI) ---
export const JEV_BASE_URL = "https://api.typesafe.ai";
export const JEV_MODEL = "jev-latest";
export const JEV_THRESHOLD = 0.5;
export const JEV_TIMEOUT_MS = 20000;
// Jev is priced at $42/B input tokens — keep state compact.

// --- Zerodha Kite (active browser session, no API keys) ---
// Authenticated calls go to the /oms root with the browser session's
// `enctoken` cookie (the same endpoints the Kite web app itself uses).
// The public instruments dump lives on api.kite.trade (no auth).
export const OMS_ROOT = "https://kite.zerodha.com/oms";
export const INSTRUMENTS_URL = "https://api.kite.trade/instruments";
export const KITE_WEB_URL = "https://kite.zerodha.com/";
export const INSTRUMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// --- Trading universe (v1) ---
export const EXCHANGE = "NSE";
export const PRODUCT = "MIS"; // intraday; auto squared-off by Zerodha
export const ORDER_VARIETY = "regular";
export const INSTRUMENT_TYPE = "EQ";

// --- Decision cadence ---
export const INTERVALS = {
  "1m": { label: "1 minute", minutes: 1, kite: "minute" },
  "5m": { label: "5 minutes", minutes: 5, kite: "5minute" },
  "15m": { label: "15 minutes", minutes: 15, kite: "15minute" },
};
export const CANDLES_PER_DECISION = 20;

// --- Market hours (IST) ---
export const MARKET_OPEN_MINUTES = 9 * 60 + 15;
export const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

// --- Risk presets ---
// positionPct: fraction of the spend limit usable for one position.
// stopPct/targetPct: deterministic exits, checked locally before Jev is asked.
// maxTrades: cap on trades per session.
export const RISK_PRESETS = {
  low: { label: "Low", positionPct: 0.25, stopPct: 0.01, targetPct: 0.01, maxTrades: 3 },
  medium: { label: "Medium", positionPct: 0.5, stopPct: 0.015, targetPct: 0.02, maxTrades: 5 },
  high: { label: "High", positionPct: 1.0, stopPct: 0.02, targetPct: 0.03, maxTrades: 8 },
};

// --- Storage keys ---
export const STORE_KEYS = {
  settings: "jevtrader.settings",
  instruments: "jevtrader.instruments",
};
