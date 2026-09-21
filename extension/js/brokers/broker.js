/**
 * Broker interface.
 *
 * Every broker implements these methods. Add a new broker by creating a
 * class that follows this shape and registering it with BrokerFactory —
 * the trading loop never touches broker-specific code.
 *
 * @typedef {Object} Quote
 * @property {number} lastPrice
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} prevClose
 * @property {number} volume
 *
 * @typedef {Object} Candle
 * @property {string} time   ISO timestamp
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 *
 * @typedef {Object} Position
 * @property {string} symbol        e.g. "RELIANCE"
 * @property {string} exchange      e.g. "NSE"
 * @property {number} quantity      signed: +long / -short
 * @property {number} averagePrice
 * @property {number} unrealizedPnl
 *
 * @typedef {Object} OrderResult
 * @property {string} orderId
 * @property {string} status
 *
 * A Broker must provide:
 *   name() -> string                      broker id, e.g. "kite-session"
 *   label() -> string                     human label
 *   isAuthenticated() -> Promise<boolean>
 *   getProfile() -> Promise<{userId, userName}>
 *   getQuote(instrumentKey) -> Promise<Quote>        instrumentKey like "NSE:RELIANCE"
 *   getCandles(instrumentToken, kiteInterval, from, to) -> Promise<Candle[]>
 *   getPositions() -> Promise<Position[]>
 *   placeOrder({exchange, symbol, transactionType, quantity, product, orderType}) -> Promise<OrderResult>
 */
