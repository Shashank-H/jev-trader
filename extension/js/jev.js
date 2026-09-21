/**
 * Jev decision engine.
 *
 * Every decision tick sends ONE /v1/systemone request containing:
 *
 *   STATE (what Jev sees each time):
 *     - instrument: symbol, exchange, instrument token
 *     - time: IST clock, minutes to market close, market status
 *     - price: LTP, day O/H/L, prev close, % change, volume
 *     - indicators: SMA20, EMA9/21, RSI14, ATR14, VWAP, LTP-vs-VWAP,
 *       position inside the day's range
 *     - recent candles: last N candles of the chosen interval (t o/h/l/c v)
 *     - position: side/qty/avg price/unrealized P&L, deterministic
 *       stop-loss and target levels
 *     - session: trades taken, realized P&L, spend used vs spend limit,
 *       loss vs max-loss kill switch, paper/live mode
 *     - risk config: risk level, max position value, stop/target %,
 *       max trades per session
 *     - memory: the last few ticks' decisions and what happened after
 *
 *   QUESTIONS (noul — scored 0..1, >= 0.5 counts as "yes"):
 *     - flat  -> "enter_long"  / "enter_short"  (whichever scores higher wins)
 *     - long  -> "exit_long"
 *     - short -> "exit_short"
 *
 * Direction comes from Jev; position SIZE and hard exits (stop/target/
 * max-loss) are computed deterministically from the risk config — never
 * left to the model. Any Jev failure returns null and the tick becomes a
 * HOLD (fail-safe: never trade on an undecided question).
 */
import { JEV_BASE_URL, JEV_MODEL, JEV_THRESHOLD, JEV_TIMEOUT_MS } from "./config.js";

const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "n/a" : Number(n).toFixed(d);
const rs = (n) => (n === null || n === undefined || Number.isNaN(n) ? "n/a" : `₹${Number(n).toFixed(2)}`);

/**
 * @param {object} ctx
 * @param {string} ctx.symbol
 * @param {string} ctx.exchange
 * @param {number|null} ctx.instrumentToken
 * @param {string} ctx.intervalLabel
 * @param {string} ctx.istTime          "HH:MM:SS"
 * @param {number} ctx.minutesToClose
 * @param {import("./brokers/broker.js").Quote} ctx.quote
 * @param {import("./brokers/broker.js").Candle[]} ctx.candles  oldest -> newest
 * @param {{sma20:number|null,ema9:number|null,ema21:number|null,rsi:number|null,atr:number|null,vwap:number|null,rangePos:number|null}} ctx.ind
 * @param {{side:"FLAT"|"LONG"|"SHORT",qty:number,avgPrice:number,unrealizedPnl:number,stopPrice:number|null,targetPrice:number|null}} ctx.position
 * @param {{trades:number,realizedPnl:number,spendUsed:number,spendLimit:number,maxLoss:number}} ctx.session
 * @param {{level:string,maxPositionValue:number,stopPct:number,targetPct:number,maxTrades:number}} ctx.risk
 * @param {string} ctx.mode              "PAPER" | "LIVE"
 * @param {string[]} ctx.recentDecisions  e.g. ["10:30 HOLD (long, conf 0.82)"]
 * @param {boolean} ctx.shortEnabled   user opted into short selling
 */
export function buildDecisionState(ctx) {
  const q = ctx.quote;
  const changePct = q.prevClose ? ((q.lastPrice - q.prevClose) / q.prevClose) * 100 : null;
  const vwapDist =
    ctx.ind.vwap && q.lastPrice ? ((q.lastPrice - ctx.ind.vwap) / ctx.ind.vwap) * 100 : null;

  const lines = [];
  lines.push(`INSTRUMENT: ${ctx.symbol} (${ctx.exchange}, token ${ctx.instrumentToken ?? "n/a"}) — intraday MIS`);
  lines.push(`TIME: ${ctx.istTime} IST — ${ctx.minutesToClose} min to market close (15:30). Market OPEN.`);
  lines.push(
    `PRICE: LTP ${rs(q.lastPrice)} | Day O/H/L ${rs(q.open)}/${rs(q.high)}/${rs(q.low)} | ` +
      `Prev close ${rs(q.prevClose)} (${fmt(changePct)}%) | Volume ${q.volume.toLocaleString("en-IN")}`
  );
  lines.push(
    `INDICATORS (${ctx.intervalLabel}): SMA20 ${rs(ctx.ind.sma20)} | EMA9 ${rs(ctx.ind.ema9)} | ` +
      `EMA21 ${rs(ctx.ind.ema21)} | RSI14 ${fmt(ctx.ind.rsi, 1)} | ATR14 ${rs(ctx.ind.atr)} | ` +
      `VWAP ${rs(ctx.ind.vwap)} (LTP ${fmt(vwapDist)}% vs VWAP) | Day-range position ${fmt(ctx.ind.rangePos, 0)}%`
  );

  const tail = ctx.candles.slice(-10);
  lines.push(`RECENT CANDLES (${ctx.intervalLabel}, oldest -> newest, t o/h/l/c v):`);
  for (const c of tail) {
    const t = c.time.slice(11, 16);
    lines.push(`  ${t} ${fmt(c.open)}/${fmt(c.high)}/${fmt(c.low)}/${fmt(c.close)} ${c.volume}`);
  }

  if (ctx.position.side === "FLAT") {
    lines.push(
      `POSITION: FLAT (no open position — LONG entries allowed${ctx.shortEnabled ? "; SHORT entries allowed" : "; SHORT entries NOT allowed (shorting is turned off)"})`
    );
  } else {
    const p = ctx.position;
    const pnlPct = p.avgPrice ? (p.unrealizedPnl / (p.avgPrice * p.qty)) * 100 : null;
    lines.push(
      `POSITION: ${p.side} ${p.qty} @ ${rs(p.avgPrice)} | Unrealized P&L ${rs(p.unrealizedPnl)} (${fmt(pnlPct)}%) | ` +
        `Stop-loss ${rs(p.stopPrice)} | Target ${rs(p.targetPrice)}`
    );
  }

  const lossRemaining = ctx.session.maxLoss + Math.min(0, ctx.session.realizedPnl);
  lines.push(
    `SESSION: Trades ${ctx.session.trades} | Realized P&L ${rs(ctx.session.realizedPnl)} | ` +
      `Spend used ${rs(ctx.session.spendUsed)} / ${rs(ctx.session.spendLimit)} limit | ` +
      `Max-loss kill switch ${rs(ctx.session.maxLoss)} (buffer left ${rs(Math.max(0, lossRemaining))}) | Mode ${ctx.mode}`
  );
  lines.push(
    `RISK: level ${ctx.risk.level} | Max position value ${rs(ctx.risk.maxPositionValue)} | ` +
      `Stop ${fmt(ctx.risk.stopPct * 100, 1)}% / Target ${fmt(ctx.risk.targetPct * 100, 1)}% | Max ${ctx.risk.maxTrades} trades/session`
  );
  if (ctx.recentDecisions.length > 0) {
    lines.push(`LAST DECISIONS: ${ctx.recentDecisions.slice(-3).join(" | ")}`);
  }
  return lines.join("\n");
}

/**
 * @param {"FLAT"|"LONG"|"SHORT"} positionSide
 * @param {boolean} shortEnabled   user explicitly opted into short selling
 */
function questionsFor(positionSide, shortEnabled) {
  if (positionSide === "LONG") {
    return {
      exit_long: {
        type: "noul",
        instructions:
          "Given the market state above, should the OPEN LONG position be closed RIGHT NOW at market price? " +
          "Consider whether the target is reached, momentum has reversed, indicators turned bearish, " +
          "the position is decaying into the close, or risk demands an exit. " +
          "Only say yes when holding no longer has a clear edge.",
        criteria: {
          true: "Exit warranted: target hit, momentum reversed, or risk demands it",
          false: "Setup still valid — hold the position",
        },
      },
    };
  }
  if (positionSide === "SHORT") {
    return {
      exit_short: {
        type: "noul",
        instructions:
          "Given the market state above, should the OPEN SHORT position be covered RIGHT NOW at market price? " +
          "Consider whether the target is reached, momentum has reversed upward, indicators turned bullish, " +
          "the position is decaying into the close, or risk demands an exit. " +
          "Only say yes when holding the short no longer has a clear edge.",
        criteria: {
          true: "Cover warranted: target hit, momentum reversed up, or risk demands it",
          false: "Setup still valid — hold the short",
        },
      },
    };
  }
  const qs = {
    enter_long: {
      type: "noul",
      instructions:
        "Given the market state above, should a LONG position be opened RIGHT NOW at market price " +
        "in this symbol for intraday (MIS)? Consider momentum, volume, indicator alignment (RSI, EMA, VWAP), " +
        "distance to day high/low, time left in the session, and the risk config. " +
        "Only say yes when there is a clear bullish edge with favorable risk/reward — chop and " +
        "late-session entries should be a no.",
      criteria: {
        true: "Clear bullish edge: momentum, volume and structure favor an immediate long entry",
        false: "No clear edge, unfavorable risk/reward, or better to wait — stay flat",
      },
    },
  };
  if (shortEnabled) {
    qs.enter_short = {
      type: "noul",
      instructions:
        "Given the market state above, should a SHORT position be opened RIGHT NOW at market price " +
        "in this symbol for intraday (MIS)? Consider downward momentum, volume, indicator alignment " +
        "(RSI, EMA, VWAP), distance to day high/low, time left in the session, and the risk config. " +
        "Only say yes when there is a clear bearish edge with favorable risk/reward — chop and " +
        "late-session entries should be a no.",
      criteria: {
        true: "Clear bearish edge: momentum, volume and structure favor an immediate short entry",
        false: "No clear edge, unfavorable risk/reward, or better to wait — stay flat",
      },
    };
  }
  return qs;
}

/**
 * Ask Jev for a decision. Returns { action, confidence } or null when Jev
 * is unreachable/indecisive (caller must treat as HOLD).
 *
 * actions: "BUY" (open long) | "SHORT" (open short) | "SELL" (close long) |
 *          "COVER" (close short) | "HOLD"
 * SHORT/COVER can only occur when shortEnabled is true.
 */
export async function askJev({ apiKey, state, positionSide, shortEnabled = false }) {
  if (!apiKey) throw new Error("Jev API key not set");
  const questions = questionsFor(positionSide, shortEnabled);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Jev request timed out")), JEV_TIMEOUT_MS);
  try {
    const res = await fetch(`${JEV_BASE_URL}/v1/systemone`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ state, model: JEV_MODEL, questions }),
    });
    if (!res.ok) {
      if (res.status === 429 || res.status === 529) return null; // rate-limited: hold
      throw new Error(`Jev API returned HTTP ${res.status}`);
    }
    const data = await res.json();
    const answers = data?.answers ?? {};
    const tokens = data?.usage?.input_tokens ?? 0;

    if (positionSide === "FLAT") {
      const longP = answers.enter_long?.noul;
      const shortP = answers.enter_short?.noul;
      const longYes = typeof longP === "number" && longP >= JEV_THRESHOLD;
      const shortYes = typeof shortP === "number" && shortP >= JEV_THRESHOLD;
      if (longYes && shortYes) {
        // contradictory — take the stronger conviction
        return longP >= shortP
          ? { action: "BUY", confidence: longP, inputTokens: tokens }
          : { action: "SHORT", confidence: shortP, inputTokens: tokens };
      }
      if (longYes) return { action: "BUY", confidence: longP, inputTokens: tokens };
      if (shortYes) return { action: "SHORT", confidence: shortP, inputTokens: tokens };
      return { action: "HOLD", confidence: Math.max(longP ?? 0, shortP ?? 0), inputTokens: tokens };
    }

    const id = positionSide === "LONG" ? "exit_long" : "exit_short";
    const p = answers[id]?.noul;
    if (typeof p !== "number") return null; // undecided: never trade on it
    const yes = p >= JEV_THRESHOLD;
    return {
      action: yes ? (positionSide === "LONG" ? "SELL" : "COVER") : "HOLD",
      confidence: p,
      inputTokens: tokens,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
