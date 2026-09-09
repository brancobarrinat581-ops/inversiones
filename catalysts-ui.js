(function() {
  "use strict";

  let analystsData = null;

  async function loadAnalystsData() {
    try {
      const res = await fetch('analysts.json?t=' + Date.now());
      if (res.ok) {
        analystsData = await res.json();
        console.log('✅ Catalistas cargados:', analystsData.ts);
        injectUI();
      }
    } catch(e) {
      console.warn('⚠️ analysts.json no disponible');
    }
  }

  function showNews(ticker) {
    if (!analystsData || !analystsData.news || !analystsData.news[ticker]) return;

    const items = analystsData.news[ticker] || [];
    const existing = document.getElementById("news-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "news-modal";
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10002;overflow-y:auto;padding:16px;">
        <div style="max-width:700px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="color:#fff;margin:0;font-size:22px;">📰 ${ticker} — Noticias</h2>
            <button onclick="document.getElementById('news-modal').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;">
            ${items.map((item, i) => `
              <a href="${item.url}" target="_blank" style="display:block;padding:12px;background:#0d1117;border-radius:8px;border-left:4px solid #64B5F6;text-decoration:none;cursor:pointer;">
                <div style="color:#64B5F6;font-size:12px;margin-bottom:4px;">${item.source}</div>
                <div style="color:#fff;font-weight:600;margin-bottom:4px;">${item.title}</div>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function showCatalysts(ticker) {
    if (!analystsData || !analystsData.catalysts) return;

    const events = analystsData.catalysts[ticker] || [];
    const existing = document.getElementById("catalysts-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "catalysts-modal";
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10002;overflow-y:auto;padding:16px;">
        <div style="max-width:600px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="color:#fff;margin:0;font-size:22px;">🎯 ${ticker} — Catalistas</h2>
            <button onclick="document.getElementById('catalysts-modal').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;">
            ${events.map(e => `
              <div style="padding:12px;background:#0d1117;border-radius:8px;border-left:4px solid ${e.importance === 'high' ? '#F44336' : '#FF9800'};">
                <div style="color:#fff;font-weight:600;">${e.event}</div>
                <div style="color:${e.importance === 'high' ? '#F44336' : '#FF9800'};font-weight:700;font-size:13px;margin-top:4px;">${new Date(e.date).toLocaleDateString('es-AR')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }


  // === BANNER: precios desactualizados + earnings proximos ===
  function banner() {
    var msgs = [];

    try {
      var pr = JSON.parse(localStorage.getItem('prices_data'));
      if (pr) {
        var viejos = Object.keys(pr.prices || {}).filter(function (k) { return pr.prices[k].stale; });
        var horas = pr.ts ? (Date.now() - new Date(pr.ts).getTime()) / 3600000 : 999;
        if (viejos.length) msgs.push({ t: 'warn', x: '\u26a0 Precio desactualizado en ' + viejos.length + ' activo' + (viejos.length > 1 ? 's' : '') + ': ' + viejos.slice(0, 6).join(', ') + (viejos.length > 6 ? '...' : '') });
        else if (horas > 24) msgs.push({ t: 'warn', x: '\u26a0 Precios sin actualizar hace ' + Math.round(horas) + ' horas' });
      }
    } catch (e) {}

    if (analystsData && analystsData.catalysts) {
      var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      Object.keys(analystsData.catalysts).forEach(function (tk) {
        (analystsData.catalysts[tk] || []).forEach(function (ev) {
          var dias = Math.round((new Date(ev.date + 'T00:00:00') - hoy) / 86400000);
          if (dias >= 0 && dias <= 3) {
            msgs.push({ t: 'info', x: '\ud83d\udcc5 ' + tk + ' reporta ' + (dias === 0 ? 'HOY' : dias === 1 ? 'ma\u00f1ana' : 'en ' + dias + ' d\u00edas') + ' (' + ev.event + ')' });
          }
        });
      });
    }

    var old = document.getElementById('inv-banner');
    if (old) old.remove();
    if (!msgs.length) return;

    var d = document.createElement('div');
    d.id = 'inv-banner';
    d.style.cssText = 'position:sticky;top:0;z-index:9998;display:flex;flex-direction:column;gap:4px;padding:8px 12px;font-size:13px;font-family:inherit';
    d.innerHTML = msgs.map(function (m) {
      var c = m.t === 'warn' ? '#FF9800' : '#64B5F6';
      return '<div style="background:' + c + '22;border-left:3px solid ' + c + ';color:' + c + ';padding:6px 10px;border-radius:4px">' + m.x + '</div>';
    }).join('');
    document.body.insertBefore(d, document.body.firstChild);
  }

  function injectUI() {
    if (!analystsData) return;
    let tickers = analystsData.tickers ? Object.keys(analystsData.tickers) : [];
    if (!tickers.length) {
      try { tickers = (JSON.parse(localStorage.getItem('portfolio_iol')).positions || []).map(p => p.ticker); } catch(e) { return; }
    }
    if (!tickers.length) return;

    const setTk = new Set(tickers);
    document.querySelectorAll('div,span,td,h1,h2,h3,h4,b,strong,p').forEach(el => {
      if (!el.dataset.catalystsInjected && el.children.length === 0) {
        const txt = (el.textContent || '').trim();
        if (txt.length > 8 || !setTk.has(txt)) return;
        [txt].forEach(ticker => {
          if (el.parentElement) {
            if (el.parentElement.querySelector('.catalyst-btn')) return;
            const hasNews = (analystsData.news?.[ticker] || []).length > 0;
            const hasCat  = (analystsData.catalysts?.[ticker] || []).length > 0;
            if (!hasNews && !hasCat) { el.dataset.catalystsInjected = '1'; return; }

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex;gap:6px;margin-left:8px;';

            const newsBtn = document.createElement('button');
            newsBtn.className = 'catalyst-btn';
            newsBtn.textContent = '📰';
            newsBtn.style.cssText = 'background:#64B5F6;color:#000;border:none;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:14px;font-weight:700;';
            newsBtn.onclick = (e) => { e.stopPropagation(); showNews(ticker); };

            const eventsBtn = document.createElement('button');
            eventsBtn.className = 'catalyst-btn';
            eventsBtn.textContent = '🎯';
            eventsBtn.style.cssText = 'background:#FF9800;color:#000;border:none;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:14px;font-weight:700;';
            eventsBtn.onclick = (e) => { e.stopPropagation(); showCatalysts(ticker); };

            if (hasNews) btnContainer.appendChild(newsBtn);
            if (hasCat) btnContainer.appendChild(eventsBtn);
            el.parentElement.appendChild(btnContainer);
            el.dataset.catalystsInjected = '1';
          }
        });
      }
    });
  }

  window._showNews = showNews;
  window._showCatalysts = showCatalysts;

  function init() {
    loadAnalystsData();
    setTimeout(banner, 2000);
    setInterval(banner, 60000);
    setInterval(injectUI, 3000);
    console.log('✅ Catalistas UI cargado');
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
