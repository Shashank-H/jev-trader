/**
 * BrokerFactory — the extension point for new brokers.
 *
 *   import { BrokerFactory } from "./brokers/factory.js";
 *   import "./brokers/kite-session.js";   // self-registers
 *   // import "./brokers/upstox.js";      // future: self-registers
 *
 *   const broker = BrokerFactory.create("kite-session");
 *
 * Broker modules self-register on import so the trading loop only ever
 * talks to the factory, never to a concrete broker.
 */
import "./broker.js"; // type docs only

const registry = new Map();

export const BrokerFactory = {
  /** @param {string} name @param {new () => object} cls */
  register(name, cls) {
    registry.set(name, cls);
  },
  /** @param {string} name */
  create(name) {
    const cls = registry.get(name);
    if (!cls) throw new Error(`Unknown broker: ${name}. Registered: ${[...registry.keys()].join(", ")}`);
    return new cls();
  },
  names() {
    return [...registry.keys()];
  },
};
