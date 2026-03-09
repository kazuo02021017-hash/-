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

      // --- 方法1: nikkei225jp.com チャートページ（静的HTML、JS不要） ---
      try {
        const res = await fetch("https://nikkei225jp.com/chart/", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
            "Referer": "https://nikkei225jp.com/",
          }
        });
        const html = await res.text();
        // 日経VIの値を抽出（HTMLソース内の埋め込みデータから）
        const patterns = [
          /["']VI["']\s*[,：:]\s*["']?([\d]+\.[\d]+)/,
          /nkvi['"]\s*:\s*["']?([\d]+\.[\d]+)/i,
          /日経VI[^\d]{0,30}([\d]{2,3}\.[\d]{1,2})/,
          /VI\s*=\s*([\d]{2,3}\.[\d]{1,2})/,
          /jniv[^\d]{0,20}([\d]{2,3}\.[\d]{1,2})/i,
        ];
        for (const pat of patterns) {
          const m = html.match(pat);
          if (m) {
            const value = parseFloat(m[1]);
            if (value > 5 && value < 150) {
              return new Response(JSON.stringify({ value, source: "nikkei225jp" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          }
        }
        errors.push("nikkei225jp: no match");
      } catch(e) {
        errors.push("nikkei225jp: " + e.message);
      }

      // --- 方法2: nikkei225jp.com SSI（リアルタイム指数APIエンドポイント） ---
      try {
        // VIはコード111付近にある可能性（日経平均=1, VI=別コード）
        const res = await fetch("https://225225.jp/_ssi/if/?c=111", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://nikkei225jp.com/chart/",
            "Accept": "*/*",
          }
        });
        const text = await res.text();
        const m = text.match(/([\d]{2,3}\.[\d]{1,2})/);
        if (m) {
          const value = parseFloat(m[1]);
          if (value > 5 && value < 150) {
            return new Response(JSON.stringify({ value, source: "225225jp-ssi" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        errors.push("225225jp-ssi: no match, text=" + text.substring(0, 100));
      } catch(e) {
        errors.push("225225jp-ssi: " + e.message);
      }

      // --- 方法3: minkabu 日経VI専用ページ ---
      try {
        const res = await fetch("https://minkabu.jp/stock/NVI/", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ja",
            "Referer": "https://minkabu.jp/",
          }
        });
        const html = await res.text();
        // 現在値を示す複数パターンを試す
        const patterns = [
          /current[_\-]?price['":\s]+([0-9]+\.[0-9]+)/i,
          /class="[^"]*price[^"]*"[^>]*>[\s\n]*([\d]+\.[\d]+)/,
          /"price"\s*:\s*([\d]+\.[\d]+)/,
          /<span[^>]*>\s*([\d]{2,3}\.\d{2})\s*<\/span>/,
        ];
        for (const pat of patterns) {
          const m = html.match(pat);
          if (m) {
            const value = parseFloat(m[1]);
            if (value > 5 && value < 150) {
              return new Response(JSON.stringify({ value, source: "minkabu-nvi" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
          }
        }
        errors.push("minkabu-nvi: no match");
      } catch(e) {
        errors.push("minkabu-nvi: " + e.message);
      }

      // --- 方法4: stooq.com CSV（元のロジック） ---
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
        errors.push("stooq: invalid value or blocked");
      } catch(e) {
        errors.push("stooq: " + e.message);
      }

      // --- 方法5: JPX 日経VI公式ページ ---
      try {
        const res = await fetch("https://www.jpx.co.jp/markets/derivatives/indices-futures-op/index-vol/index.html", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
            "Referer": "https://www.jpx.co.jp/",
          }
        });
        const html = await res.text();
        const m = html.match(/日経VI[\s\S]{0,200}?(\d{1,3}\.\d{2})/);
        if (m) {
          const value = parseFloat(m[1]);
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

    // ★ デバッグ用：/jniv-debug でHTML断片を確認できる
    if (url.pathname === "/jniv-debug") {
      const target = url.searchParams.get("src") || "nikkei225jp";
      let debugUrl = "https://nikkei225jp.com/chart/";
      if (target === "minkabu") debugUrl = "https://minkabu.jp/stock/NVI/";
      if (target === "ssi") debugUrl = "https://225225.jp/_ssi/if/?c=111";

      try {
        const res = await fetch(debugUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://nikkei225jp.com/",
          }
        });
        const html = await res.text();
        // VI関連の箇所だけ抜粋して返す
        const viIndex = html.search(/[Vv][Ii]|日経VI|jniv|JNIV/);
        const excerpt = viIndex >= 0 ? html.substring(Math.max(0, viIndex - 50), viIndex + 300) : html.substring(0, 500);
        return new Response(JSON.stringify({
          status: res.status,
          url: debugUrl,
          viExcerpt: excerpt,
          htmlLength: html.length,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ★ 既存のCORSプロキシ機能
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("url param required", { status: 400, headers: corsHeaders });
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
