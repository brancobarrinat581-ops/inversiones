(function() {
  "use strict";

  var analystsData = null;
  var GROQ_KEY = "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";

  async function loadAnalystsData() {
    try {
      var res = await fetch("analysts.json?t=" + Date.now());
      if (res.ok) {
        analystsData = await res.json();
        console.log("Catalistas cargados:", analystsData.ts);
        injectUI();
      }
    } catch(e) { console.warn("analysts.json no disponible"); }
  }

  // === TRADUCIR con Groq ===
  async function translateText(text) {
    try {
      var r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_KEY },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "Traducí al español neutro latinoamericano. Solo devolvé la traducción, sin explicaciones." },
            { role: "user", content: text }
          ],
          max_tokens: 200, temperature: 0.1
        })
      });
      var j = await r.json();
      return j.choices?.[0]?.message?.content?.trim() || text;
    } catch(e) { return text; }
  }

  // === NOTICIAS ===
  function showNews(ticker) {
    if (!analystsData || !analystsData.news || !analystsData.news[ticker]) return;
    var items = analystsData.news[ticker] || [];
    var old = document.getElementById("news-modal");
    if (old) old.remove();

    var modal = document.createElement("div");
    modal.id = "news-modal";
    modal.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10002;overflow-y:auto;padding:16px">' +
        '<div style="max-width:700px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
            '<h2 style="color:#fff;margin:0;font-size:22px">\ud83d\udcf0 ' + ticker + ' \u2014 Noticias</h2>' +
            '<button onclick="document.getElementById(\'news-modal\').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button>' +
          '</div>' +
          '<div id="news-list" style="display:flex;flex-direction:column;gap:12px">' +
            items.map(function(item, i) {
              return '<a href="' + item.url + '" target="_blank" id="news-item-' + i + '" style="display:block;padding:12px;background:#0d1117;border-radius:8px;border-left:4px solid #64B5F6;text-decoration:none">' +
                '<div style="color:#64B5F6;font-size:12px;margin-bottom:4px">' + (item.source || "Yahoo Finance") + '</div>' +
                '<div style="color:#fff;font-weight:600;margin-bottom:4px" class="news-title">' + item.title + '</div>' +
                '<div style="color:#555;font-size:11px;font-style:italic" class="news-traduccion">Traduciendo...</div>' +
              '</a>';
            }).join("") +
            (items.length === 0 ? '<div style="color:#888;text-align:center;padding:20px">Sin noticias disponibles</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Traducir cada titulo
    items.forEach(function(item, i) {
      translateText(item.title).then(function(tr) {
        var el = document.getElementById("news-item-" + i);
        if (el) {
          var td = el.querySelector(".news-traduccion");
          if (td) td.textContent = tr;
        }
      });
    });
  }

  // === ANALISTAS POR BANCO ===
  function showAnalysts(ticker) {
    if (!analystsData) return;
    var fund = (analystsData.fundamentals || {})[ticker];
    var banks = (analystsData.bank_targets || {})[ticker] || [];
    var old = document.getElementById("analysts-modal");
    if (old) old.remove();

    var tLow = fund?.targetLow ?? null;
    var tMean = fund?.target ?? null;
    var tHigh = fund?.targetHigh ?? null;
    var price = fund?.price ?? null;

    var modal = document.createElement("div");
    modal.id = "analysts-modal";

    var profilesHTML = "";
    if (tLow != null || tMean != null || tHigh != null) {
      profilesHTML =
        '<h3 style="color:#fff;margin:16px 0 8px">\ud83c\udfaf Precios Objetivo por Perfil</h3>' +
        '<div style="display:flex;gap:8px;margin-bottom:16px">' +
          (tLow != null ? '<div style="flex:1;background:#0d1117;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #4CAF50"><div style="color:#888;font-size:11px">Conservador</div><div style="color:#4CAF50;font-size:20px;font-weight:900">$' + tLow.toFixed(0) + '</div>' + (price ? '<div style="color:#666;font-size:11px">' + ((tLow - price) / price * 100).toFixed(1) + '%</div>' : '') + '</div>' : '') +
          (tMean != null ? '<div style="flex:1;background:#0d1117;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #FFD700"><div style="color:#888;font-size:11px">Moderado</div><div style="color:#FFD700;font-size:20px;font-weight:900">$' + tMean.toFixed(0) + '</div>' + (price ? '<div style="color:#666;font-size:11px">' + ((tMean - price) / price * 100).toFixed(1) + '%</div>' : '') + '</div>' : '') +
          (tHigh != null ? '<div style="flex:1;background:#0d1117;border-radius:8px;padding:12px;text-align:center;border-top:3px solid #F44336"><div style="color:#888;font-size:11px">Agresivo</div><div style="color:#F44336;font-size:20px;font-weight:900">$' + tHigh.toFixed(0) + '</div>' + (price ? '<div style="color:#666;font-size:11px">' + ((tHigh - price) / price * 100).toFixed(1) + '%</div>' : '') + '</div>' : '') +
        '</div>';
    }

    var banksHTML = "";
    if (banks.length) {
      banksHTML =
        '<h3 style="color:#fff;margin:16px 0 8px">\ud83c\udfe6 Estimaciones por Banco de Inversión</h3>' +
        '<div style="display:flex;flex-direction:column;gap:6px">' +
        banks.map(function(b) {
          var upside = price ? ((b.target - price) / price * 100).toFixed(1) : "?";
          var color = b.rating === "Buy" || b.rating === "Overweight" ? "#4CAF50" : b.rating === "Hold" || b.rating === "Neutral" ? "#FFD700" : "#F44336";
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0d1117;border-radius:6px;border-left:3px solid ' + color + '">' +
            '<div><div style="color:#fff;font-weight:600;font-size:14px">' + b.bank + '</div>' +
            '<div style="color:#888;font-size:11px">' + (b.analyst || "") + ' \u2022 ' + b.rating + '</div></div>' +
            '<div style="text-align:right"><div style="color:#fff;font-weight:700;font-size:16px">$' + b.target + '</div>' +
            '<div style="color:' + (upside > 0 ? "#4CAF50" : "#F44336") + ';font-size:12px">' + (upside > 0 ? "+" : "") + upside + '%</div></div>' +
          '</div>';
        }).join("") +
        '</div>';
    }

    var consHTML = "";
    if (fund) {
      var conLabel = { strong_buy: "Compra Fuerte", buy: "Comprar", hold: "Mantener", underperform: "Bajo rendimiento", sell: "Vender" };
      consHTML =
        '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:12px">' +
        (fund.consensus ? '<div style="display:flex;justify-content:space-between"><span style="color:#888">Consenso</span><span style="color:#fff;font-weight:700">' + (conLabel[fund.consensus] || fund.consensus) + '</span></div>' : '') +
        (fund.analysts ? '<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:#888">Analistas</span><span style="color:#fff">' + fund.analysts + '</span></div>' : '') +
        (fund.pe ? '<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:#888">P/E</span><span style="color:#fff">' + fund.pe.toFixed(1) + 'x</span></div>' : '') +
        '<div style="color:#555;font-size:10px;margin-top:8px">Fuente: ' + (fund.source || "Yahoo Finance") + '</div>' +
        '</div>';
    }

    modal.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10002;overflow-y:auto;padding:16px">' +
        '<div style="max-width:600px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
            '<h2 style="color:#fff;margin:0;font-size:22px">\ud83d\udcca ' + ticker + ' \u2014 Analistas</h2>' +
            '<button onclick="document.getElementById(\'analysts-modal\').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button>' +
          '</div>' +
          consHTML + profilesHTML + banksHTML +
          (banks.length === 0 && !fund ? '<div style="color:#888;text-align:center;padding:20px">Sin datos de analistas para este ticker</div>' : '') +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  // === CATALISTAS ===
  function showCatalysts(ticker) {
    if (!analystsData || !analystsData.catalysts) return;
    var events = analystsData.catalysts[ticker] || [];
    var old = document.getElementById("catalysts-modal");
    if (old) old.remove();

    var modal = document.createElement("div");
    modal.id = "catalysts-modal";
    modal.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10002;overflow-y:auto;padding:16px">' +
        '<div style="max-width:600px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
            '<h2 style="color:#fff;margin:0;font-size:22px">\ud83c\udfaf ' + ticker + ' \u2014 Catalistas</h2>' +
            '<button onclick="document.getElementById(\'catalysts-modal\').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            events.map(function(e) {
              return '<div style="padding:12px;background:#0d1117;border-radius:8px;border-left:4px solid ' + (e.importance === "high" ? "#F44336" : "#FF9800") + '">' +
                '<div style="color:#fff;font-weight:600">' + e.event + '</div>' +
                '<div style="color:' + (e.importance === "high" ? "#F44336" : "#FF9800") + ';font-weight:700;font-size:13px;margin-top:4px">' + new Date(e.date).toLocaleDateString("es-AR") + '</div>' +
              '</div>';
            }).join("") +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  // === BANNER ===
  function banner() {
    var msgs = [];
    try {
      var pr = JSON.parse(localStorage.getItem("prices_data"));
      if (pr) {
        var viejos = Object.keys(pr.prices || {}).filter(function(k) { return pr.prices[k].stale; });
        var horas = pr.ts ? (Date.now() - new Date(pr.ts).getTime()) / 3600000 : 999;
        if (viejos.length) msgs.push({ t: "warn", x: "\u26a0 Precio desactualizado en " + viejos.length + " activo" + (viejos.length > 1 ? "s" : "") });
        else if (horas > 24) msgs.push({ t: "warn", x: "\u26a0 Precios sin actualizar hace " + Math.round(horas) + " horas" });
      }
    } catch(e) {}

    if (analystsData && analystsData.catalysts) {
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      Object.keys(analystsData.catalysts).forEach(function(tk) {
        (analystsData.catalysts[tk] || []).forEach(function(ev) {
          var dias = Math.round((new Date(ev.date + "T00:00:00") - hoy) / 86400000);
          if (dias >= 0 && dias <= 3) {
            msgs.push({ t: "info", x: "\ud83d\udcc5 " + tk + " reporta " + (dias === 0 ? "HOY" : dias === 1 ? "ma\u00f1ana" : "en " + dias + " d\u00edas") + " (" + ev.event + ")" });
          }
        });
      });
    }

    var old = document.getElementById("inv-banner");
    if (old) old.remove();
    if (!msgs.length) return;

    var d = document.createElement("div");
    d.id = "inv-banner";
    d.style.cssText = "position:sticky;top:0;z-index:9998;display:flex;flex-direction:column;gap:4px;padding:8px 12px;font-size:13px";
    d.innerHTML = msgs.map(function(m) {
      var c = m.t === "warn" ? "#FF9800" : "#64B5F6";
      return '<div style="background:' + c + '22;border-left:3px solid ' + c + ';color:' + c + ';padding:6px 10px;border-radius:4px">' + m.x + '</div>';
    }).join("");
    document.body.insertBefore(d, document.body.firstChild);
  }

  // === NO inyectar en listas compactas ===
  function isCompactList(el) {
    var p = el.parentElement;
    if (!p) return false;
    var s = p.style || {};
    if (s.display === "flex" && s.justifyContent === "space-between" && (s.borderBottom || s.padding === "6px 0" || s.padding === "4px 0")) return true;
    var txt = (p.textContent || "").replace(/\s/g, "");
    if (/^\w{2,6}[+\-]\d/.test(txt)) return true;
    return false;
  }

  // === INYECTAR UI ===
  function injectUI() {
    if (!analystsData) return;
    var tickers = analystsData.tickers ? Object.keys(analystsData.tickers) : [];
    if (!tickers.length) {
      try { tickers = (JSON.parse(localStorage.getItem("portfolio_iol")).positions || []).map(function(p) { return p.ticker; }); } catch(e) { return; }
    }
    if (!tickers.length) return;

    var setTk = new Set(tickers);
    document.querySelectorAll("div,span,td,h1,h2,h3,h4,b,strong,p").forEach(function(el) {
      if (!el.dataset.catalystsInjected && el.children.length === 0) {
        var txt = (el.textContent || "").trim();
        if (txt.length > 8 || !setTk.has(txt)) return;
        var ticker = txt;
        if (el.parentElement) {
          if (el.parentElement.querySelector(".catalyst-btn")) return;
          if (isCompactList(el)) { el.dataset.catalystsInjected = "1"; return; }

          var hasNews = (analystsData.news?.[ticker] || []).length > 0;
          var hasCat  = (analystsData.catalysts?.[ticker] || []).length > 0;
          var hasFund = !!(analystsData.fundamentals?.[ticker]) || !!((analystsData.bank_targets || {})[ticker] || []).length;
          if (!hasNews && !hasCat && !hasFund) { el.dataset.catalystsInjected = "1"; return; }

          var btnContainer = document.createElement("div");
          btnContainer.style.cssText = "display:inline-flex;gap:4px;margin-left:6px;vertical-align:middle";

          if (hasNews) {
            var newsBtn = document.createElement("button");
            newsBtn.className = "catalyst-btn";
            newsBtn.textContent = "\ud83d\udcf0";
            newsBtn.title = "Noticias de " + ticker;
            newsBtn.style.cssText = "background:#64B5F6;color:#000;border:none;border-radius:4px;width:26px;height:26px;cursor:pointer;font-size:13px";
            newsBtn.onclick = function(e) { e.stopPropagation(); showNews(ticker); };
            btnContainer.appendChild(newsBtn);
          }
          if (hasCat) {
            var eventsBtn = document.createElement("button");
            eventsBtn.className = "catalyst-btn";
            eventsBtn.textContent = "\ud83c\udfaf";
            eventsBtn.title = "Pr\u00f3ximos earnings";
            eventsBtn.style.cssText = "background:#FF9800;color:#000;border:none;border-radius:4px;width:26px;height:26px;cursor:pointer;font-size:13px";
            eventsBtn.onclick = function(e) { e.stopPropagation(); showCatalysts(ticker); };
            btnContainer.appendChild(eventsBtn);
          }
          if (hasFund) {
            var fundBtn = document.createElement("button");
            fundBtn.className = "catalyst-btn";
            fundBtn.textContent = "\ud83c\udfe6";
            fundBtn.title = "Analistas de " + ticker;
            fundBtn.style.cssText = "background:#9C27B0;color:#fff;border:none;border-radius:4px;width:26px;height:26px;cursor:pointer;font-size:13px";
            fundBtn.onclick = function(e) { e.stopPropagation(); showAnalysts(ticker); };
            btnContainer.appendChild(fundBtn);
          }

          el.parentElement.appendChild(btnContainer);
          el.dataset.catalystsInjected = "1";
        }
      }
    });
  }

  window._showNews = showNews;
  window._showCatalysts = showCatalysts;
  window._showAnalysts = showAnalysts;

  function init() {
    loadAnalystsData();
    setTimeout(banner, 2000);
    setInterval(banner, 60000);
    setInterval(injectUI, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
