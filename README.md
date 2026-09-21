# Jev Trader

A Chrome extension (side panel) that auto-trades with **TypeSafe AI's Jev** as the decision maker.

Zerodha Kite is the only broker for now — via your **active browser session** (no Kite Connect API keys needed). The broker layer is a factory, so adding more brokers later is a new file + one `register()` call.

## Install

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Pin **Jev Trader** and click the toolbar icon to open the side panel.

## Setup

1. Log in to [kite.zerodha.com](https://kite.zerodha.com/) in a normal tab (the extension rides that session — no API keys).
2. In the panel, paste your **TypeSafe API key** and save it.
3. Search and pick an NSE stock, then set:
   - **Spend limit** (₹) — total buy value allowed per session
   - **Interval** — how often Jev is consulted (1m / 5m / 15m)
   - **Risk level** — Low / Medium / High (controls position size, stop/target, max trades)
   - **Max loss** (₹) — kill switch: squares off and halts the bot
4. **Paper trading is ON by default** (simulated fills at LTP). Uncheck for live orders.
5. Press **Start**. The bot runs while the panel stays open — closing it stops trading (deliberate fail-safe).

## How a tick works

Every interval, for the selected stock:

1. **Gather** — LTP + day OHLC/volume (quote), recent candles (historical), open positions.
2. **Indicators** — computed locally: SMA20, EMA9/21, RSI14, ATR14, session VWAP, LTP-vs-VWAP, position in day range.
3. **Hard exits first** — stop-loss / target are checked deterministically *before* Jev is asked; the max-loss kill switch squares off and halts.
4. **Ask Jev** — one `/v1/systemone` call with the full market state (see below). Jev decides **direction only**.
5. **Risk gate** — spend limit, max trades/session, position sizing from the risk preset.
6. **Execute** — paper ledger fill, or a live MIS market order on NSE.

Jev never decides size, and never sees an undecided question: any Jev failure degrades to HOLD, and any order/session error halts the bot with the reason in the log.

## What gets sent to Jev on every decision

The `state` text of each `/v1/systemone` request contains:

| Section | Contents |
|---|---|
| Instrument | symbol, exchange, instrument token |
| Time | IST clock, minutes to market close, market status |
| Price | LTP, day O/H/L, prev close, % change, volume |
| Indicators | SMA20, EMA9/21, RSI14, ATR14, VWAP, LTP-vs-VWAP %, day-range position % |
| Recent candles | last 10 candles of the chosen interval (`t o/h/l/c v`) |
| Position | side, qty, avg price, unrealized P&L %, stop-loss & target levels (or FLAT) |
| Session | trades taken, realized P&L, spend used vs limit, max-loss buffer left, PAPER/LIVE |
| Risk config | risk level, max position value, stop/target %, max trades per session |
| Memory | last 3 ticks' decisions and outcomes |

The `questions` are `noul` (scored 0–1, ≥ 0.5 = yes):

- **Flat → `enter_long`**: *"Should a LONG be opened right now at market price?"* — yes only on a clear bullish edge with favorable risk/reward.
- **Flat → `enter_short`** *(only asked when the user explicitly enables short selling — off by default)*: *"Should a SHORT be opened right now at market price?"* — yes only on a clear bearish edge. When both fire, the stronger conviction wins.
- **Long → `exit_long`**: *"Should the open LONG be closed right now at market price?"* — yes when the target is hit, momentum reversed, or risk demands it.
- **Short → `exit_short`**: *"Should the open SHORT be covered right now at market price?"* — yes when the target is hit, momentum reversed up, or risk demands it.

Intraday (MIS) on NSE equities. Shorting is strictly opt-in: an "Allow short selling" checkbox, off by default, and the bot ignores any SHORT signal while it's off.

## Architecture

```
extension/
├── manifest.json            # MV3: sidePanel, storage, cookies, alarms
├── sidepanel.html / .css    # the trading UI
├── icons/
└── js/
    ├── background.js        # opens the side panel
    ├── sidepanel.js         # UI wiring + trading loop (setInterval while open)
    ├── config.js            # Jev + Kite constants, risk presets, market hours
    ├── storage.js           # settings + instruments cache (chrome.storage.local)
    ├── instruments.js       # api.kite.trade CSV dump → NSE equity search
    ├── indicators.js        # SMA / EMA / RSI / ATR / VWAP
    ├── jev.js               # decision-state builder + /v1/systemone client
    ├── risk.js              # RiskManager: sizing, stops, kill switch
    ├── paper.js             # PaperLedger: simulated fills
    └── brokers/
        ├── broker.js        # Broker interface (JSDoc)
        ├── factory.js       # BrokerFactory — register/create
        └── kite-session.js  # KiteSessionBroker: kite.zerodha.com/oms + enctoken session
```

**Adding a broker:** implement the methods in `brokers/broker.js`, then `BrokerFactory.register("my-broker", MyBroker)` in your module. The loop only talks to the factory.

## Risk presets

| Level | Position size | Stop | Target | Max trades |
|---|---|---|---|---|
| Low | 25% of spend limit | 1.0% | 1.0% | 3 |
| Medium | 50% of spend limit | 1.5% | 2.0% | 5 |
| High | 100% of spend limit | 2.0% | 3.0% | 8 |

## Notes & limits

- Trades only 09:15–15:30 IST, Mon–Fri (NSE holidays are not in the calendar yet — the exchange will reject orders, and the bot surfaces the error).
- Uses Kite's web-session `/oms` endpoints (the same ones kite.zerodha.com uses). If Zerodha changes them, the broker module is the only file that needs updating.
- Jev calls cost input tokens at $42/B — state is kept compact (~2–4 KB per tick).

## Disclaimer

Educational project, not financial advice. Auto-trading can lose real money — start in paper mode, understand every setting, and never risk what you can't afford to lose.
