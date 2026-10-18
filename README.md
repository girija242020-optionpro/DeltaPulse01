# Delta Pulse Dhan Backend v2

Shared Dhan market-data gateway for multiple frontends (Delta Pulse, terminal UI, chart UI, indicator scanners). The backend streams normalized ticks, builds OHLC candles for configured intervals, stores retained candle history to disk, exposes historical Dhan candle API access, broadcasts tick/depth/candle events over WebSocket, and offers optional Web Push using VAPID.

## Deploy to Render
1. Extract this ZIP; all project files are at the ZIP root (no nested project folder).
2. Create a GitHub repository and upload the extracted files. Never upload `.env` or real credentials.
3. Create a Render Web Service connected to the repo. Build: `npm install`; Start: `npm start`.
4. Set `DHAN_CLIENT_ID`, `DHAN_PIN`, `DHAN_TOTP_SECRET` in Render Environment.
5. Set `LIVE_INSTRUMENTS` in `SEGMENT:SECURITY_ID` format, e.g. `IDX_I:13`. Verify security IDs and segment mappings against Dhan's current instrument master. `DEPTH_INSTRUMENTS` must use a supported NSE EQ/FNO segment.
6. For durable history, attach a Render persistent disk mounted at `/var/data`; keep `DATA_DIR=/var/data`. Without persistent disk, data can be lost on redeploy/restart.
7. Optional push notifications: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in Render. Keep private key server-side only.

## API
- `GET /api/health`, `/api/status`, `/api/state`
- `GET /api/ticks?securityId=13&exchangeSegment=IDX_I`
- `GET /api/depth?securityId=...&exchangeSegment=NSE_FNO`
- `GET /api/candles?securityId=13&exchangeSegment=IDX_I&interval=1&limit=500`
- `GET /api/history?candles=true&securityId=13&exchangeSegment=IDX_I&interval=1&limit=5000`
- `GET /api/candles/historical?securityId=13&exchangeSegment=IDX_I&from=2026-10-01%2009:15:00&to=2026-10-01%2015:30:00&interval=1&instrument=INDEX`
- `GET /api/option-chain?index=NIFTY`
- `GET /api/analytics?securityId=13`
- `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `POST /api/push/test`, `POST /api/alerts/notify`
- WebSocket: `wss://YOUR-SERVICE.onrender.com/ws`; JSON envelopes have `event`, `data`, `ts`; events include `snapshot`, `status`, `tick`, `depth`, and `candle`.

## Candle / indicator notes
Live OHLC bars are aggregated from received tick prices. Candle intervals default to 1, 3, 5, and 15 minutes. The historical endpoint fetches Dhan historical candles for supported API intervals 1, 5, 15, 25, and 60 minutes. The 3-minute candle series is locally aggregated from live ticks; it is not fetched as an official historical 3-minute interval. Candle arrays are a generic OHLCV interface and can be consumed by RSI, EMA, VWAP, ATR, MACD, Bollinger Bands, custom conditions, chart libraries, and multiple independent frontends. Indicator calculations and beep/audio playback are normally client-side; browsers control sound permissions. Backend push notifications require the frontend to register a service worker and post a PushSubscription to `/api/push/subscribe`.

## Important limitations
- A new server starts with no live-built candles until ticks arrive; historical Dhan candles can be fetched via the historical endpoint.
- Candle retention only survives deploy/restart when a persistent disk is configured and `DATA_DIR` points to it.
- The Dhan packet decoder must be validated against the currently documented Dhan packet format and real instruments before trading use.
- This starter does not infer executed-trade aggressor side; L20 resting depth is not trade Delta/CVD.
- Verify index/F&O segment mappings, security IDs, option-chain parameters, historical API payload, and depth packet structure with current Dhan documentation/account entitlements.
- This is market-data infrastructure, not an order execution service or financial advice.
