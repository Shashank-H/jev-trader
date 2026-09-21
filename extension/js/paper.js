/**
 * PaperLedger — simulated trading used when paperMode is ON (the default).
 *
 * Fills instantly at the requested LTP. One net position per symbol with a
 * SIGNED quantity (positive = LONG, negative = SHORT). Realized P&L is
 * booked on every closing fill — including partial closes and flips —
 * so session P&L accounts for everything that happens during the run.
 *
 * Mirrors the broker's Position shape so the trading loop treats paper
 * and live identically.
 */
export class PaperLedger {
  constructor() {
    this.reset();
  }

  reset() {
    /** @type {Map<string, {symbol:string, qty:number, avgPrice:number, stopPrice:number|null, targetPrice:number|null}>} */
    this.positions = new Map();
    this.trades = []; // {time, symbol, side, qty, price}
    this.realizedPnl = 0;
    this.spendUsed = 0;
  }

  /** @returns {import("./brokers/broker.js").Position[]} */
  getPositions(ltpBySymbol = {}) {
    return [...this.positions.values()].map((p) => ({
      symbol: p.symbol,
      exchange: "NSE",
      quantity: p.qty, // signed
      averagePrice: p.avgPrice,
      unrealizedPnl: (ltpBySymbol[p.symbol] ?? p.avgPrice) * p.qty - p.avgPrice * p.qty,
    }));
  }

  getPosition(symbol) {
    return this.positions.get(symbol) || null;
  }

  /**
   * @param {{symbol:string, side:"BUY"|"SELL", qty:number, price:number, stopPrice?:number|null, targetPrice?:number|null}} fill
   */
  execute({ symbol, side, qty, price, stopPrice = null, targetPrice = null }) {
    if (!(qty > 0)) throw new Error("Paper ledger: qty must be positive");
    const time = new Date().toISOString();
    const cur = this.positions.get(symbol);
    const oldQty = cur?.qty ?? 0;
    const delta = side === "BUY" ? qty : -qty;

    // Book realized P&L on the portion that CLOSES an existing position.
    if (oldQty !== 0 && Math.sign(oldQty) !== Math.sign(delta)) {
      const closedQty = Math.min(Math.abs(oldQty), qty);
      const dir = Math.sign(oldQty); // +1 long, -1 short
      this.realizedPnl += (price - cur.avgPrice) * closedQty * dir;
    }

    const newQty = oldQty + delta;
    if (newQty === 0) {
      this.positions.delete(symbol);
    } else if (Math.sign(newQty) === Math.sign(oldQty) && oldQty !== 0) {
      // adding to the same side: average in
      const newAvg = (cur.avgPrice * Math.abs(oldQty) + price * qty) / Math.abs(newQty);
      this.positions.set(symbol, {
        symbol,
        qty: newQty,
        avgPrice: newAvg,
        stopPrice: stopPrice ?? cur.stopPrice,
        targetPrice: targetPrice ?? cur.targetPrice,
      });
    } else {
      // fresh entry or flip: remainder opens at this price
      this.positions.set(symbol, { symbol, qty: newQty, avgPrice: price, stopPrice, targetPrice });
    }

    this.spendUsed += price * qty; // absolute notional on every fill
    const trade = { time, symbol, side, qty, price };
    this.trades.push(trade);
    return { orderId: `PAPER-${Date.now()}`, status: "filled", trade };
  }

  summary() {
    return {
      trades: this.trades.length,
      realizedPnl: this.realizedPnl,
      spendUsed: this.spendUsed,
      openPositions: this.positions.size,
    };
  }
}
