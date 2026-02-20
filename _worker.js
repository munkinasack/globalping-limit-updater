const API_URL = "https://api.globalping.io/v1/limits";
const DEFAULT_REFRESH_MS = 30000;

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
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      label {
        color: #94a3b8;
        font-size: 0.95rem;
      }
      select {
        background: #0b1220;
        color: #e2e8f0;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 0.25rem 0.5rem;
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
      <div class="toolbar">
        <label for="refreshInterval">Refresh:</label>
        <select id="refreshInterval" aria-label="Refresh interval">
          <option value="5000">Every 5 seconds</option>
          <option value="15000">Every 15 seconds</option>
          <option value="30000" selected>Every 30 seconds</option>
          <option value="60000">Every 1 minute</option>
          <option value="300000">Every 5 minutes</option>
        </select>
      </div>
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
      const refreshSelect = document.getElementById("refreshInterval");

      let refreshTimer = null;

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
        try {
          const res = await fetch("/api/limits", { cache: "no-store" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const data = await res.json();
          limitEl.textContent = data.limit;
          remainingEl.textContent = data.remaining;
          resetEl.textContent = fmtSeconds(data.reset);
          errorEl.textContent = "";
        } catch (err) {
          errorEl.textContent = "Failed to load limits. " + err.message;
        }
      }

      function startAutoRefresh() {
        if (refreshTimer) {
          clearInterval(refreshTimer);
        }

        const intervalMs = Number(refreshSelect.value) || ${DEFAULT_REFRESH_MS};
        refreshTimer = setInterval(loadLimits, intervalMs);
      }

      refreshSelect.addEventListener("change", () => {
        startAutoRefresh();
      });

      loadLimits();
      startAutoRefresh();
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

function readNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLimits(payload, headers) {
  const fromBody =
    payload?.rateLimit?.measurements?.create ||
    payload?.measurements ||
    payload?.limits?.measurements?.create ||
    null;

  const limit = readNumber(fromBody?.limit ?? headers.get("x-ratelimit-limit"));
  const remaining = readNumber(
    fromBody?.remaining ?? headers.get("x-ratelimit-remaining")
  );
  const reset = readNumber(fromBody?.reset ?? headers.get("x-ratelimit-reset"));

  if (limit === null || remaining === null || reset === null) {
    return null;
  }

  return { limit, remaining, reset };
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
      const limits = extractLimits(payload, upstream.headers);

      if (!limits) {
        return json(
          {
            error: "Globalping response did not include expected rate-limit fields",
            sample: JSON.stringify(payload).slice(0, 300),
          },
          { status: 502 }
        );
      }

      return json(limits);
    }

    return new Response("Not found", { status: 404 });
  },
};
