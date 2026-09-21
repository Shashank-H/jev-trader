/**
 * KiteSessionBroker — Zerodha Kite via the user's ACTIVE BROWSER SESSION.
 *
 * No Kite Connect API key/secret needed. The user logs in to
 * kite.zerodha.com normally; this broker calls the same /oms endpoints the
 * Kite web app itself uses, riding the session's `enctoken` cookie.
 *
 * Endpoints (mirror Kite Connect paths on the /oms root):
 *   GET  /oms/user/profile
 *   GET  /oms/user/margins
 *   GET  /oms/portfolio/positions
 *   GET  /oms/quote?i=NSE:SYMBOL
 *   GET  /oms/instruments/historical/{token}/{interval}?from=&to=&oi=
 *   POST /oms/orders/regular            (form-encoded)
 *
 * Auth: the enctoken cookie is attached automatically (credentials:include).
 * We additionally read it via chrome.cookies and send
 * `Authorization: enctoken <token>`, the same header community session
 * clients use. If the session expires the API returns an auth error and
 * isAuthenticated() reports false so the UI can prompt a re-login.
 */
import { OMS_ROOT } from "../config.js";
import { BrokerFactory } from "./factory.js";

const LOGIN_MARKERS = ["login", "twofa", "session expired", "token"];

export class KiteSessionBroker {
  name() {
    return "kite-session";
  }

  label() {
    return "Zerodha Kite (browser session)";
  }

  async _authHeaders() {
    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    };
    try {
      const cookie = await chrome.cookies.get({ url: "https://kite.zerodha.com", name: "enctoken" });
      if (cookie?.value) headers["Authorization"] = `enctoken ${cookie.value}`;
    } catch {
      // cookies permission unavailable — rely on automatic cookie attach
    }
    return headers;
  }

  async _request(method, path, params = null) {
    const headers = await this._authHeaders();
    const opts = { method, headers, credentials: "include" };
    let url = `${OMS_ROOT}${path}`;
    if (method === "GET" && params) {
      url += `?${new URLSearchParams(params).toString()}`;
    } else if (params) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(params).toString();
    }
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
      const err = new Error("Kite session expired or not logged in");
      err.code = "NOT_AUTHENTICATED";
      throw err;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Kite returned non-JSON (${res.status})`);
    }
    if (data.status === "error" || data.error_type) {
      const msg = data.message || data.error_type || "Kite API error";
      const err = new Error(Array.isArray(msg) ? msg.join("; ") : String(msg));
      if (LOGIN_MARKERS.some((m) => err.message.toLowerCase().includes(m))) err.code = "NOT_AUTHENTICATED";
      throw err;
    }
    return data.data;
  }

  _get(path, params) {
    return this._request("GET", path, params);
  }

  _post(path, params) {
    return this._request("POST", path, params);
  }

  async isAuthenticated() {
    try {
      await this.getProfile();
      return true;
    } catch (err) {
      if (err.code === "NOT_AUTHENTICATED") return false;
      throw err; // network-level failure: let the caller surface it
    }
  }

  async getProfile() {
    const d = await this._get("/user/profile");
    return { userId: d.user_id, userName: d.user_name, email: d.email };
  }

  async getMargins() {
    const d = await this._get("/user/margins");
    // shape: { equity: { available, net, ... }, commodity: {...} }
    return d?.equity ?? d;
  }

  /** @returns {Promise<import("./broker.js").Position[]>} */
  async getPositions() {
    const d = await this._get("/portfolio/positions");
    const nets = d?.net ?? [];
    return nets
      .filter((p) => Number(p.quantity) !== 0)
      .map((p) => ({
        symbol: p.tradingsymbol,
        exchange: p.exchange,
        quantity: Number(p.quantity),
        averagePrice: Number(p.average_price),
        unrealizedPnl: Number(p.unrealised ?? p.unrealized ?? 0),
      }));
  }

  /** @param {string} instrumentKey e.g. "NSE:RELIANCE" */
  async getQuote(instrumentKey) {
    const d = await this._get("/quote", { i: instrumentKey });
    const q = d?.[instrumentKey];
    if (!q) throw new Error(`No quote for ${instrumentKey}`);
    return {
      lastPrice: Number(q.last_price),
      open: Number(q.ohlc?.open ?? 0),
      high: Number(q.ohlc?.high ?? 0),
      low: Number(q.ohlc?.low ?? 0),
      prevClose: Number(q.ohlc?.close ?? 0),
      volume: Number(q.volume ?? 0),
    };
  }

  /**
   * @param {number|string} instrumentToken
   * @param {string} kiteInterval  "minute" | "5minute" | "15minute" | ...
   */
  async getCandles(instrumentToken, kiteInterval, from, to) {
    const d = await this._get(`/instruments/historical/${instrumentToken}/${kiteInterval}`, {
      from,
      to,
      oi: "0",
    });
    const candles = d?.candles ?? [];
    return candles.map((c) => ({
      time: new Date(c[0]).toISOString(),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5] ?? 0),
    }));
  }

  /**
   * @param {{exchange: string, symbol: string, transactionType: "BUY"|"SELL", quantity: number, product?: string, orderType?: string}} o
   */
  async placeOrder(o) {
    const d = await this._post("/orders/regular", {
      exchange: o.exchange,
      tradingsymbol: o.symbol,
      transaction_type: o.transactionType,
      quantity: String(o.quantity),
      product: o.product || "MIS",
      order_type: o.orderType || "MARKET",
      validity: "DAY",
      tag: "jev-trader",
    });
    return { orderId: d?.order_id, status: d?.status || "placed" };
  }

  async getOrders() {
    return this._get("/orders");
  }
}

BrokerFactory.register("kite-session", KiteSessionBroker);
