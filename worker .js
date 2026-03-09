export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ★ 日経VI専用エンドポイント
    if (url.pathname === "/jniv") {
      const errors = [];

      // --- 方法1: stooq.com CSV ---
      try {
        const res = await fetch("https://stooq.com/q/d/l/?s=%5Ejniv&i=d", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://stooq.com/",
          }
        });
        const text = await res.text();
        const lines = text.trim().split("\n");
        if (lines.length >= 2) {
          const last = lines[lines.length - 1].split(",");
          const value = parseFloat(last[4]);
          if (value > 5 && value < 150) {
            return new Response(JSON.stringify({ value, source: "stooq" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        errors.push("stooq: invalid value");
      } catch(e) {
        errors.push("stooq: " + e.message);
      }

      // --- 方法2: minkabu 日経VI ---
      try {
        const res = await fetch("https://minkabu.jp/stock/0019/forecast", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ja",
            "Referer": "https://minkabu.jp/",
          }
        });
        const html = await res.text();
        const match = html.match(/(\d{1,3}\.\d{2})\s*<\/[^>]+>\s*(?:円|%|&nbsp;)/);
        if (match) {
          const value = parseFloat(match[1]);
          if (value > 5 && value < 150) {
            return new Response(JSON.stringify({ value, source: "minkabu" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        errors.push("minkabu: no match");
      } catch(e) {
        errors.push("minkabu: " + e.message);
      }

      // --- 方法3: JPX 日経VI ---
      try {
        const res = await fetch("https://www.jpx.co.jp/markets/derivatives/indices-futures-op/index-vol/index.html", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
            "Referer": "https://www.jpx.co.jp/",
          }
        });
        const html = await res.text();
        const match = html.match(/日経VI[\s\S]{0,200}?(\d{1,3}\.\d{2})/);
        if (match) {
          const value = parseFloat(match[1]);
          if (value > 5 && value < 150) {
            return new Response(JSON.stringify({ value, source: "jpx" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        errors.push("jpx: no match");
      } catch(e) {
        errors.push("jpx: " + e.message);
      }

      return new Response(JSON.stringify({ error: "all sources failed", errors }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ★ 既存のCORSプロキシ機能
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("missing url param", { status: 400, headers: corsHeaders });
    }
    try {
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/html, */*",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          "Referer": "https://finance.yahoo.com/",
          "Origin": "https://finance.yahoo.com",
        }
      });
      const body = await res.arrayBuffer();
      const headers = new Headers(corsHeaders);
      const ct = res.headers.get("content-type");
      if (ct) headers.set("content-type", ct);
      return new Response(body, { status: res.status, headers });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
