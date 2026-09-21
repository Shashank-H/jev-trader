/** Plain-JS technical indicators computed locally from candles. */

/** @param {number[]} values */
export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** @param {number[]} values */
export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

/** @param {import("./brokers/broker.js").Candle[]} candles */
export function rsi(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let gain = 0,
    loss = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

/** @param {import("./brokers/broker.js").Candle[]} candles */
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i],
      p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/** Session VWAP from today's candles. @param {import("./brokers/broker.js").Candle[]} candles */
export function vwap(candles) {
  let pv = 0,
    v = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : null;
}

/** Where LTP sits in the day's range, 0..100. */
export function rangePosition(ltp, dayLow, dayHigh) {
  if (!(dayHigh > dayLow)) return null;
  return ((ltp - dayLow) / (dayHigh - dayLow)) * 100;
}
