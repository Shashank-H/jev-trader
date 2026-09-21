/**
 * RiskManager — deterministic guardrails. Jev decides DIRECTION; everything
 * about size and survival is computed here, never left to the model.
 *
 *   - Position sizing: floor(spendLimit * positionPct / ltp), min 1 share.
 *   - Pre-trade checks: spend limit, max trades/session.
 *   - Hard exits: stop-loss / target, evaluated locally BEFORE asking Jev.
 *   - Kill switch: session P&L (realized + unrealized) <= -maxLoss ->
 *     square off everything and halt the bot until manually restarted.
 *
 * Sides: "LONG" | "SHORT". Stops/targets mirror for shorts
 * (a short's stop sits ABOVE entry, its target BELOW).
 */
import { RISK_PRESETS } from "./config.js";

export class RiskManager {
  /**
   * @param {{spendLimit:number, maxLoss:number, riskLevel:"low"|"medium"|"high"}} opts
   */
  constructor({ spendLimit, maxLoss, riskLevel }) {
    this.spendLimit = spendLimit;
    this.maxLoss = maxLoss;
    this.preset = RISK_PRESETS[riskLevel] || RISK_PRESETS.medium;
    this.level = riskLevel;
  }

  maxPositionValue() {
    return this.spendLimit * this.preset.positionPct;
  }

  /** @returns number of shares for a fresh entry at `ltp` */
  sizeQuantity(ltp) {
    if (!(ltp > 0)) return 0;
    return Math.max(1, Math.floor(this.maxPositionValue() / ltp));
  }

  /** @param {"LONG"|"SHORT"} side */
  stopPrice(entryPrice, side) {
    return side === "SHORT" ? entryPrice * (1 + this.preset.stopPct) : entryPrice * (1 - this.preset.stopPct);
  }

  /** @param {"LONG"|"SHORT"} side */
  targetPrice(entryPrice, side) {
    return side === "SHORT" ? entryPrice * (1 - this.preset.targetPct) : entryPrice * (1 + this.preset.targetPct);
  }

  /**
   * @param {{trades:number, spendUsed:number, qty:number, ltp:number}} t
   * @returns {string|null} reason the trade is blocked, or null if allowed
   */
  checkPreTrade({ trades, spendUsed, qty, ltp }) {
    if (trades >= this.preset.maxTrades) return `Max trades per session reached (${this.preset.maxTrades})`;
    if (spendUsed + qty * ltp > this.spendLimit)
      return `Spend limit exceeded (${spendUsed + qty * ltp} > ${this.spendLimit})`;
    if (qty < 1) return "Position size computed as 0";
    return null;
  }

  /**
   * Deterministic exits, checked before Jev is consulted.
   * @param {{ltp:number, side:"LONG"|"SHORT", stopPrice:number|null, targetPrice:number|null}} t
   * @returns {"STOP_LOSS"|"TARGET"|null}
   */
  checkHardExit({ ltp, side, stopPrice, targetPrice }) {
    if (side === "SHORT") {
      if (stopPrice !== null && ltp >= stopPrice) return "STOP_LOSS";
      if (targetPrice !== null && ltp <= targetPrice) return "TARGET";
      return null;
    }
    if (stopPrice !== null && ltp <= stopPrice) return "STOP_LOSS";
    if (targetPrice !== null && ltp >= targetPrice) return "TARGET";
    return null;
  }

  /** @returns {boolean} true when the kill switch trips */
  checkKillSwitch({ realizedPnl, unrealizedPnl }) {
    return realizedPnl + unrealizedPnl <= -this.maxLoss;
  }

  describe() {
    return {
      level: this.level,
      maxPositionValue: this.maxPositionValue(),
      stopPct: this.preset.stopPct,
      targetPct: this.preset.targetPct,
      maxTrades: this.preset.maxTrades,
    };
  }
}
