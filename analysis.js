// analysis.js — Gráficos TradingView por activo.
// NO inyecta botones en listas compactas (Top Ganadoras / En Pérdida).
(function () {
  "use strict";

  var BCBA = { YPF: "BCBA:YPFD" };
  function tvSymbol(tk) { return BCBA[tk] || ("BCBA:" + tk); }

  var SIN_GRAFICO = ["IOLCAMA", "IOLDOLD", "AL30D"];

  function openChart(tk) {
    var old = document.getElementById("tv-modal");
    if (old) old.remove();

    var m = document.createElement("div");
    m.id = "tv-modal";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10000;display:flex;flex-direction:column;padding:10px";
    m.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1a1a2e;border-radius:8px 8px 0 0">' +
        '<span style="color:#fff;font-size:17px;font-weight:700">' + tk + '</span>' +
        '<button id="tv-x" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">&times;</button>' +
      '</div>' +
      '<iframe src="https://s.tradingview.com/widgetembed/?symbol=' + encodeURIComponent(tvSymbol(tk)) +
        '&interval=D&theme=dark&style=1&locale=es&timezone=America%2FArgentina%2FBuenos_Aires' +
        '&studies=%5B%22MAExp%40tv-basicstudies%22%2C%22RSI%40tv-basicstudies%22%2C%22MACD%40tv-basicstudies%22%5D' +
        '&hide_side_toolbar=0&allow_symbol_change=1" ' +
        'style="flex:1;border:none;border-radius:0 0 8px 8px" allowfullscreen></iframe>';

    document.body.appendChild(m);
    m.querySelector("#tv-x").onclick = function () { m.remove(); };
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { var n = document.getElementById("tv-modal"); if (n) n.remove(); document.removeEventListener("keydown", esc); }
    });
  }

  function tickers() {
    try { return (JSON.parse(localStorage.getItem("portfolio_iol")).positions || []).map(function (p) { return p.ticker; }); }
    catch (e) { return []; }
  }

  // NO inyectar en listas compactas (Top Ganadoras, En Pérdida, etc.)
  function isCompactList(el) {
    var p = el.parentElement;
    if (!p) return false;
    var s = p.style || {};
    // Listas compactas usan flex + space-between + borderBottom
    if (s.display === "flex" && s.justifyContent === "space-between" && (s.borderBottom || s.padding === "6px 0" || s.padding === "4px 0")) return true;
    // También: si el parent tiene hijos con ganPct ("+XX.X%")
    var txt = p.textContent || "";
    if (/^\w{2,6}\+?\-?\d/.test(txt.replace(/\s/g, ""))) return true;
    return false;
  }

  function inject() {
    var tks = tickers();
    if (!tks.length) return;
    var set = new Set(tks.filter(function (t) { return SIN_GRAFICO.indexOf(t) === -1; }));

    document.querySelectorAll("div,span,td,h1,h2,h3,h4,b,strong").forEach(function (el) {
      if (el.dataset.tvInjected || el.children.length) return;
      var txt = (el.textContent || "").trim();
      if (txt.length > 8 || !set.has(txt)) return;
      if (!el.parentElement || el.parentElement.querySelector(".tv-btn")) return;
      if (isCompactList(el)) { el.dataset.tvInjected = "1"; return; }

      var b = document.createElement("button");
      b.className = "tv-btn";
      b.textContent = "\ud83d\udcc8";
      b.title = "Ver gr\u00e1fico de " + txt;
      b.style.cssText = "background:#1976D2;color:#fff;border:none;border-radius:4px;width:28px;height:28px;margin-left:6px;cursor:pointer;font-size:13px;vertical-align:middle";
      b.onclick = function (e) { e.stopPropagation(); e.preventDefault(); openChart(txt); };
      el.parentElement.appendChild(b);
      el.dataset.tvInjected = "1";
    });
  }

  window._openChart = openChart;

  function init() { setTimeout(inject, 1500); setInterval(inject, 3000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
