const API_URL = "https://api.globalping.io/v1/limits";
const LIVE_REFRESH_MS = 1000;

function htmlPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Globalping Rate Limits</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        width: min(460px, 92vw);
        background: #111827;
        border: 1px solid #334155;
        border-radius: 14px;
        padding: 1.25rem;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 1rem;
        font-size: 1.3rem;
      }
      .status {
        color: #94a3b8;
        font-size: 0.95rem;
        margin-bottom: 1rem;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: 1fr auto;
        row-gap: 0.7rem;
        column-gap: 0.75rem;
      }
      dt { color: #94a3b8; }
      dd {
        margin: 0;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        min-width: 6rem;
        text-align: right;
      }
      .error {
        margin-top: 1rem;
        color: #fda4af;
        min-height: 1.3rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Globalping API Rate Limits</h1>
      <div class="status" id="liveStatus" role="status" aria-live="polite">Live updates enabled</div>
      <dl>
        <dt>Rate Limit</dt><dd id="limit">—</dd>
        <dt>Remaining</dt><dd id="remaining">—</dd>
        <dt>Time Left</dt><dd id="reset">—</dd>
      </dl>
      <div id="error" class="error" role="status" aria-live="polite"></div>
    </main>
    <script>
      const limitEl = document.getElementById("limit");
      const remainingEl = document.getElementById("remaining");
      const resetEl = document.getElementById("reset");
      const errorEl = document.getElementById("error");
      const liveStatusEl = document.getElementById("liveStatus");

      let liveTimer = null;
      let countdownTimer = null;
      let resetDeadlineMs = null;
      let isLoading = false;

      const fmtSeconds = (seconds) => {
        const total = Math.max(0, Number(seconds) || 0);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const parts = [];
        if (h) parts.push(h + "h");
        if (m || h) parts.push(m + "m");
        parts.push(s + "s");
        return parts.join(" ");
      };

      async function loadLimits() {
        if (isLoading) return;
        isLoading = true;

        try {
          const res = await fetch("/api/limits?t=" + Date.now(), { cache: "no-store" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const data = await res.json();
          limitEl.textContent = data.limit;
          remainingEl.textContent = data.remaining;
          resetDeadlineMs = Date.now() + Math.max(0, Number(data.reset) || 0) * 1000;
          renderResetCountdown();
          liveStatusEl.textContent = "Live updates enabled";
          errorEl.textContent = "";
        } catch (err) {
          liveStatusEl.textContent = "Live updates retrying…";
          errorEl.textContent = "Failed to load limits. " + err.message;
        } finally {
          isLoading = false;
        }
      }

      function renderResetCountdown() {
        if (resetDeadlineMs === null) {
          resetEl.textContent = "—";
          return;
        }

        const secondsLeft = Math.ceil((resetDeadlineMs - Date.now()) / 1000);
        resetEl.textContent = fmtSeconds(secondsLeft);
      }

      function startCountdown() {
        if (countdownTimer) {
          clearInterval(countdownTimer);
        }

        countdownTimer = setInterval(renderResetCountdown, 1000);
      }

      function startLiveUpdates() {
        if (liveTimer) {
          clearInterval(liveTimer);
        }

        loadLimits();
        liveTimer = setInterval(loadLimits, ${LIVE_REFRESH_MS});
      }

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          loadLimits();
        }
      });

      startLiveUpdates();
      startCountdown();
    </script>
  </body>
</html>`;
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(htmlPage(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === "/api/limits") {
      if (!env.apiKey) {
        return json({ error: "Missing apiKey secret" }, { status: 500 });
      }

      const upstream = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        return json(
          {
            error: "Globalping API request failed",
            status: upstream.status,
            details: text.slice(0, 300),
          },
          { status: 502 }
        );
      }

      const payload = await upstream.json();

      const m = payload?.rateLimit?.measurements?.create;
      if (!m) {
        return json(
          {
            error: "Unexpected Globalping API response shape",
            details: JSON.stringify(payload).slice(0, 300),
          },
          { status: 502 }
        );
      }

      return json({
        limit: m.limit,
        remaining: m.remaining,
        reset: m.reset,
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
