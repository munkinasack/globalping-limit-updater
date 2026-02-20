# Globalping Limit Webpage (Cloudflare Workers/Pages)

This project serves a webpage showing:

- Current Rate Limit
- Remaining
- Time left until reset

It reads this information from `https://api.globalping.io/v1/limits` on the server side using the Cloudflare secret `apiKey`.

## Features

- Server-side authenticated Globalping request (API key never sent to browser)
- UI showing only `Rate Limit`, `Remaining`, and `Time Left`
- User-selectable auto-refresh interval (5s, 15s, 30s, 1m, 5m)

## Deploy

1. Set the secret:

   ```bash
   wrangler secret put apiKey
   ```

2. Deploy (Workers):

   ```bash
   wrangler deploy
   ```

For Pages, this repo is ready for [Pages Functions advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), because it uses `_worker.js`.
