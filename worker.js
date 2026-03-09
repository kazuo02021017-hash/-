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
      try {
        // kabutan の日経VI候補コード一覧（0019=日経VI先物関連ニュースのコード、0020なども試す）
        const codes = ["0019", "0020", "0021", "0022", "0161", "0162"];
        for (const code of codes) {
          const res = await fetch(`https://kabutan.jp/stock/?code=${code}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml",
              "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
              "Referer": "https://kabutan.jp/",
            }
          });
          const html = await res.text();

          // 日経VIのページかどうか確認
          if (html.includes("ボラティリティ") && html.includes("日経") &&
              !html.includes("225種") && !html.includes("ＮＹダウ")) {
            // 現在値を抽出: "現在値 | 25.50" というテーブルパターン
            const match = html.match(/現在値[\s\S]{0,50}?([\d]{2,3}\.\d{1,2})/) ||
                          html.match(/(\d{2,3}\.\d{2})\s*\(\d+:\d+\)/);
            if (match) {
              const value = parseFloat(match[1]);
              if (value > 5 && value < 150) { // VIの妥当な範囲チェック
                return new Response(JSON.stringify({ value, code, source: "kabutan" }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
              }
            }
            // デバッグ用に先頭を返す
            return new Response(JSON.stringify({ debug: html.substring(0, 3000), code }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }

        // コードが見つからない場合、日経平均ページのVI関連テキストから拾う
        const res = await fetch("https://kabutan.jp/stock/?code=0000", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html",
            "Referer": "https://kabutan.jp/",
          }
        });
        const html = await res.text();
        // 日経VIリンクを探す
        const viLinkMatch = html.match(/href="\/stock\/\?code=(\d{4})"[^>]*>日経VI/);
        if (viLinkMatch) {
          return new Response(JSON.stringify({ viCode: viLinkMatch[1] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ error: "VI code not found", htmlSnippet: html.substring(0, 1000) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 既存のCORSプロキシ機能
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
