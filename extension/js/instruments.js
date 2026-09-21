/**
 * Instrument search backed by Kite's public instruments dump.
 *
 * The dump (CSV, no auth) is downloaded once and cached for 24h in
 * chrome.storage.local. Only NSE equities are indexed — v1 trades
 * intraday equity (MIS).
 */
import { INSTRUMENTS_URL, INSTRUMENT_TYPE, EXCHANGE, INSTRUMENTS_CACHE_TTL_MS } from "./config.js";
import { loadInstrumentsCache, saveInstrumentsCache } from "./storage.js";

let index = null; // [{ token, symbol }]

function parseCsv(text) {
  // Columns: instrument_token,exchange_token,tradingsymbol,name,last_price,
  //          expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
  const lines = text.split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // tradingsymbol never contains a comma for EQ; simple split is fine
    const cols = line.split(",");
    if (cols.length < 12) continue;
    const [token, , symbol, , , , , , , itype, , exchange] = cols;
    if (exchange === EXCHANGE && itype === INSTRUMENT_TYPE) {
      out.push({ token: Number(token), symbol });
    }
  }
  return out;
}

export async function ensureInstruments(force = false) {
  if (index && !force) return index;
  if (!force) {
    const cached = await loadInstrumentsCache();
    if (cached && Date.now() - cached.fetchedAt < INSTRUMENTS_CACHE_TTL_MS) {
      index = cached.items;
      return index;
    }
  }
  const res = await fetch(INSTRUMENTS_URL);
  if (!res.ok) throw new Error(`Instruments dump failed: HTTP ${res.status}`);
  const items = parseCsv(await res.text());
  index = items;
  await saveInstrumentsCache({ fetchedAt: Date.now(), items });
  return index;
}

/** @returns top matches for a symbol query */
export function searchSymbols(query, limit = 12) {
  if (!index) return [];
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const starts = [],
    contains = [];
  for (const it of index) {
    if (it.symbol.startsWith(q)) starts.push(it);
    else if (it.symbol.includes(q)) contains.push(it);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Exact symbol -> instrument token (for the historical API). */
export function tokenForSymbol(symbol) {
  if (!index) return null;
  const hit = index.find((it) => it.symbol === symbol.toUpperCase());
  return hit ? hit.token : null;
}
