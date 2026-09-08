// === MÓDULO DE ANÁLISIS Y TRADING VIEW ===
// Se carga después de app.js, inyecta UI en la app existente
(function() {
  "use strict";

  // === DATOS DE ANALISTAS (actualizados Sept 2026) ===
  const ANALYST_DATA = {
    NVDA: { target: 325, rating: "Strong Buy", buy: 29, hold: 0, sell: 0, pe: 55, pegRatio: 0.9, sma200: "above", sector: "Semiconductores", earnings: "25/11/2026", notes: "IA impulsa demanda. Vera Rubin en producción. HBM líder." },
    META: { target: 783, rating: "Strong Buy", buy: 58, hold: 6, sell: 0, pe: 24, pegRatio: 1.1, sma200: "above", sector: "Big Tech / IA", earnings: "28/10/2026", notes: "Inversión masiva en IA. Llama models. Instagram/WhatsApp monetización." },
    MSFT: { target: 590, rating: "Strong Buy", buy: 90, hold: 7, sell: 0, pe: 33, pegRatio: 1.8, sma200: "above", sector: "Big Tech / Cloud", earnings: "27/10/2026", notes: "Azure crece +30%. Copilot monetizándose. Valuación atractiva vs historia." },
    ADBE: { target: 274, rating: "Hold", buy: 9, hold: 11, sell: 4, pe: 29, pegRatio: 2.1, sma200: "below", sector: "Software", earnings: "10/09/2026", notes: "CEO se retira. Incertidumbre liderazgo. ARR creciendo pero analistas divididos." },
    MU: { target: 1296, rating: "Strong Buy", buy: 44, hold: 4, sell: 0, pe: 12, pegRatio: 0.3, sma200: "above", sector: "Memoria / IA", earnings: "18/12/2026", notes: "HBM domina. Demanda IA sin techo. Triplicó en 2026. P/E bajo para tech." },
    PANW: { target: 330, rating: "Buy", buy: 43, hold: 10, sell: 1, pe: 60, pegRatio: 1.5, sma200: "above", sector: "Ciberseguridad", earnings: "17/08/2026", notes: "Líder en cybersecurity. Platformización. Revenue +31% QoQ." },
    MELI: { target: 2275, rating: "Buy", buy: 25, hold: 3, sell: 2, pe: 45, pegRatio: 1.3, sma200: "above", sector: "E-commerce LatAm", earnings: "05/08/2026", notes: "Domina e-commerce y fintech LatAm. Argentina impulsa resultados." },
    SPY: { target: 0, rating: "N/A", buy: 0, hold: 0, sell: 0, pe: 22, pegRatio: 0, sma200: "above", sector: "ETF S&P 500", earnings: "N/A", notes: "ETF pasivo. Benchmark del mercado. Tendencia alcista 2026." },
    ACN: { target: 193, rating: "Hold", buy: 15, hold: 14, sell: 3, pe: 28, pegRatio: 2.0, sma200: "near", sector: "Consultoría IT", earnings: "24/09/2026", notes: "Revenue estimate revisado -2.69%. GenAI bookings crecen pero consultoría tradicional débil." },
    MCD: { target: 315, rating: "Buy", buy: 25, hold: 8, sell: 1, pe: 25, pegRatio: 2.5, sma200: "above", sector: "Consumo", earnings: "28/10/2026", notes: "Dividendo estable. Valor defensivo. Presión en márgenes por inflación." },
    IBIT: { target: 0, rating: "N/A", buy: 0, hold: 0, sell: 0, pe: 0, pegRatio: 0, sma200: "above", sector: "Bitcoin ETF", earnings: "N/A", notes: "ETF de Bitcoin. Sigue precio BTC. Flujos institucionales positivos." },
    NU: { target: 16.5, rating: "Buy", buy: 10, hold: 3, sell: 1, pe: 30, pegRatio: 1.0, sma200: "near", sector: "Fintech LatAm", earnings: "12/11/2026", notes: "Banco digital más grande del mundo. Crecimiento acelerado en Brasil y México." },
    PAMP: { target: 95, rating: "Buy", buy: 5, hold: 1, sell: 0, pe: 8, pegRatio: 0.5, sma200: "above", sector: "Energía Argentina", earnings: "Nov 2026", notes: "Vaca Muerta. Energía + gas. Valuación baja. Riesgo país Argentina." },
    VIST: { target: 80, rating: "Strong Buy", buy: 7, hold: 0, sell: 0, pe: 10, pegRatio: 0.4, sma200: "above", sector: "Oil & Gas Argentina", earnings: "Nov 2026", notes: "Vaca Muerta pura. Producción récord. Expansión de capacidad." },
    IOLCAMA: { target: 0, rating: "N/A", buy: 0, hold: 0, sell: 0, pe: 0, pegRatio: 0, sma200: "N/A", sector: "FCI Money Market", earnings: "N/A", notes: "Fondo money market IOL. Rinde tasa de referencia BCRA." },
    IOLDOLD: { target: 0, rating: "N/A", buy: 0, hold: 0, sell: 0, pe: 0, pegRatio: 0, sma200: "N/A", sector: "FCI Dólar", earnings: "N/A", notes: "Fondo dólar IOL. Protección cambiaria." }
  };

  // === MOTOR DE RECOMENDACIÓN ===
  function calcRecommendation(ticker, currentPriceUSD, ppc, arsPrice) {
    const data = ANALYST_DATA[ticker];
    if (!data || data.rating === "N/A") return { score: 50, label: "MANTENER", color: "#FFD700", risk: "N/A", reason: "ETF/FCI - no aplica análisis individual" };

    let score = 0; // 0-100: 0=vender, 50=mantener, 100=comprar fuerte

    // 1. VALUACIÓN FUNDAMENTAL (40%)
    let valScore = 50;
    if (data.pegRatio > 0 && data.pegRatio < 1) valScore = 90;
    else if (data.pegRatio >= 1 && data.pegRatio < 1.5) valScore = 70;
    else if (data.pegRatio >= 1.5 && data.pegRatio < 2) valScore = 50;
    else if (data.pegRatio >= 2) valScore = 30;
    score += valScore * 0.4;

    // 2. CONSENSO ANALISTAS (30%)
    let consScore = 50;
    if (data.target > 0 && currentPriceUSD > 0) {
      const upside = (data.target - currentPriceUSD) / currentPriceUSD;
      if (upside > 0.30) consScore = 95;
      else if (upside > 0.15) consScore = 80;
      else if (upside > 0.05) consScore = 60;
      else if (upside > -0.05) consScore = 40;
      else consScore = 20;
    }
    const totalAnalysts = data.buy + data.hold + data.sell;
    if (totalAnalysts > 0) {
      const buyPct = data.buy / totalAnalysts;
      if (buyPct > 0.8) consScore = Math.min(consScore + 10, 100);
      else if (buyPct < 0.4) consScore = Math.max(consScore - 15, 0);
    }
    score += consScore * 0.3;

    // 3. SENTIMIENTO/NOTICIAS (20%)
    let sentScore = 50;
    if (data.rating === "Strong Buy") sentScore = 85;
    else if (data.rating === "Buy") sentScore = 70;
    else if (data.rating === "Hold") sentScore = 45;
    else if (data.rating === "Sell") sentScore = 20;
    score += sentScore * 0.2;

    // 4. TÉCNICO (10%)
    let techScore = 50;
    if (data.sma200 === "above") techScore = 75;
    else if (data.sma200 === "near") techScore = 50;
    else if (data.sma200 === "below") techScore = 25;
    score += techScore * 0.1;

    // Determinar label
    let label, color, risk;
    if (score >= 80) { label = "FUERTE COMPRA"; color = "#00E676"; risk = "Bajo"; }
    else if (score >= 65) { label = "COMPRAR"; color = "#4CAF50"; risk = "Bajo-Medio"; }
    else if (score >= 50) { label = "MANTENER"; color = "#FFD700"; risk = "Medio"; }
    else if (score >= 35) { label = "TOMAR GANANCIAS"; color = "#FF9800"; risk = "Medio-Alto"; }
    else { label = "VENDER"; color = "#F44336"; risk = "Alto"; }

    // Ganancia no realizada ajusta
    const ganPct = ppc > 0 ? ((arsPrice - ppc) / ppc * 100) : 0;
    if (ganPct > 60 && score < 65) { label = "TOMAR GANANCIAS"; color = "#FF9800"; }

    // Generar razón
    let reason = "";
    if (data.target > 0 && currentPriceUSD > 0) {
      const upside = ((data.target - currentPriceUSD) / currentPriceUSD * 100).toFixed(1);
      reason = `Target: $${data.target} (${upside > 0 ? '+' : ''}${upside}%). `;
    }
    reason += data.notes;

    return { score: Math.round(score), label, color, risk, reason, upside: data.target > 0 && currentPriceUSD > 0 ? ((data.target - currentPriceUSD) / currentPriceUSD * 100) : null };
  }

  // === TRADINGVIEW CHART ===
  function getTVSymbol(ticker) {
    const map = {
      ADBE: "BCBA:ADBE", NVDA: "BCBA:NVDA", MSFT: "BCBA:MSFT", META: "BCBA:META",
      MU: "BCBA:MU", PANW: "BCBA:PANW", SPY: "BCBA:SPY", MELI: "BCBA:MELI",
      MCD: "BCBA:MCD", NU: "BCBA:NU", IBIT: "BCBA:IBIT", ACN: "BCBA:ACN",
      PAMP: "BCBA:PAMP", VIST: "BCBA:VIST", BMA: "BCBA:BMA",
      GGAL: "BCBA:GGAL", YPF: "BCBA:YPF"
    };
    return map[ticker] || "BCBA:" + ticker;
  }

  function openChart(ticker) {
    const sym = getTVSymbol(ticker);
    const existing = document.getElementById("tv-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "tv-modal";
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;flex-direction:column;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#1a1a2e;border-radius:8px 8px 0 0;">
          <span style="color:#fff;font-size:18px;font-weight:700;">${ticker} — Gráfico</span>
          <button onclick="document.getElementById('tv-modal').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <iframe src="https://www.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=${sym}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=1a1a2e&studies=MAExp%4020&studies=MAExp%4050&studies=RSI%40tv-basicstudies&studies=MACD%40tv-basicstudies&theme=dark&style=1&timezone=America%2FArgentina%2FBuenos_Aires&locale=es&utm_source=&utm_medium=widget&utm_campaign=chart" style="flex:1;border:none;border-radius:0 0 8px 8px;" allowfullscreen></iframe>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // === ANÁLISIS MODAL ===
  function openAnalysis(ticker) {
    const data = ANALYST_DATA[ticker];
    if (!data) return;

    // Buscar posición actual
    let portfolio;
    try { portfolio = JSON.parse(localStorage.getItem("portfolio_iol")); } catch(e) {}
    const pos = portfolio?.positions?.find(p => p.ticker === ticker);
    if (!pos) return;

    let prices;
    try { prices = JSON.parse(localStorage.getItem("prices_data")); } catch(e) {}
    const priceData = prices?.prices?.[ticker];
    const arsPrice = priceData?.ars || pos.ppc;
    const usdPrice = priceData?.usd || 0;

    const rec = calcRecommendation(ticker, usdPrice, pos.ppc, arsPrice);
    const ganancia = pos.cantidad * arsPrice - pos.invertido;
    const ganPct = pos.invertido > 0 ? (ganancia / pos.invertido * 100) : 0;

    const existing = document.getElementById("analysis-modal");
    if (existing) existing.remove();

    const totalAnalysts = data.buy + data.hold + data.sell;
    const buyPct = totalAnalysts > 0 ? Math.round(data.buy / totalAnalysts * 100) : 0;

    const modal = document.createElement("div");
    modal.id = "analysis-modal";
    modal.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10001;overflow-y:auto;padding:16px;">
        <div style="max-width:600px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="color:#fff;margin:0;font-size:22px;">📊 ${ticker} — ${pos.nombre || data.sector}</h2>
            <button onclick="document.getElementById('analysis-modal').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button>
          </div>

          <!-- Resumen -->
          <div style="background:#0d1117;border-radius:12px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#888;">Rendimiento en cartera</span>
              <span style="color:${ganPct >= 0 ? '#4CAF50' : '#F44336'};font-weight:700;">${ganPct >= 0 ? '+' : ''}${ganPct.toFixed(1)}%</span>
            </div>
            ${data.target > 0 && usdPrice > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#888;">Target Analistas</span>
              <span style="color:#fff;">$${data.target} USD (${rec.upside > 0 ? '+' : ''}${rec.upside?.toFixed(1)}%)</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#888;">Precio Actual</span>
              <span style="color:#fff;">ARS $${arsPrice.toLocaleString()}</span>
            </div>
          </div>

          <!-- Veredicto -->
          <div style="background:${rec.color}22;border:2px solid ${rec.color};border-radius:12px;padding:16px;margin-bottom:12px;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:${rec.color};margin-bottom:4px;">🎯 ${rec.label}</div>
            <div style="color:#888;font-size:14px;">Score: ${rec.score}/100 | Riesgo: ${rec.risk}</div>
          </div>

          <!-- Análisis Multivariable -->
          <h3 style="color:#fff;margin:16px 0 8px;">🧠 Análisis Multivariable</h3>

          <div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="color:#64B5F6;font-weight:700;margin-bottom:4px;">Valuación (40%)</div>
            <div style="color:#ccc;font-size:14px;">P/E: ${data.pe || 'N/A'}x | PEG: ${data.pegRatio || 'N/A'} ${data.pegRatio < 1 ? '🟢 Subvaluada' : data.pegRatio < 1.5 ? '🟡 Razonable' : data.pegRatio < 2 ? '🟠 Cara' : '🔴 Sobrevaluada'}</div>
          </div>

          <div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="color:#64B5F6;font-weight:700;margin-bottom:4px;">Consenso Analistas (30%)</div>
            <div style="color:#ccc;font-size:14px;">${data.rating} | ${totalAnalysts > 0 ? `${buyPct}% Comprar (${data.buy}/${totalAnalysts})` : 'Sin datos'}</div>
            ${totalAnalysts > 0 ? `<div style="background:#333;border-radius:4px;height:8px;margin-top:6px;overflow:hidden;">
              <div style="background:#4CAF50;height:100%;width:${buyPct}%;display:inline-block;"></div><div style="background:#FFD700;height:100%;width:${Math.round(data.hold/totalAnalysts*100)}%;display:inline-block;"></div><div style="background:#F44336;height:100%;width:${Math.round(data.sell/totalAnalysts*100)}%;display:inline-block;"></div>
            </div>` : ''}
          </div>

          <div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="color:#64B5F6;font-weight:700;margin-bottom:4px;">Momento Técnico (10%)</div>
            <div style="color:#ccc;font-size:14px;">SMA200: ${data.sma200 === 'above' ? '🟢 Por encima (alcista)' : data.sma200 === 'near' ? '🟡 Cerca (neutral)' : data.sma200 === 'below' ? '🔴 Por debajo (bajista)' : 'N/A'}</div>
          </div>

          <div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:16px;">
            <div style="color:#64B5F6;font-weight:700;margin-bottom:4px;">Contexto y Noticias (20%)</div>
            <div style="color:#ccc;font-size:14px;">${data.notes}</div>
            ${data.earnings && data.earnings !== 'N/A' ? `<div style="color:#FFD700;font-size:13px;margin-top:4px;">📅 Earnings: ${data.earnings}</div>` : ''}
          </div>

          <!-- Botones -->
          <div style="display:flex;gap:8px;">
            <button onclick="document.getElementById('analysis-modal').remove(); window._openChart && window._openChart('${ticker}')" style="flex:1;padding:12px;background:#1976D2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">📈 Ver Gráfico</button>
            <button onclick="document.getElementById('analysis-modal').remove()" style="flex:1;padding:12px;background:#333;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // === INYECTAR EN LA APP ===
  function injectBadges() {
    // Buscar cards de posición en la app
    const cards = document.querySelectorAll('[class*="card"], [class*="position"], [class*="ticker"]');
    if (cards.length === 0) return;

    let portfolio, prices;
    try { portfolio = JSON.parse(localStorage.getItem("portfolio_iol")); } catch(e) {}
    try { prices = JSON.parse(localStorage.getItem("prices_data")); } catch(e) {}
    if (!portfolio) return;

    // Buscar elementos con tickers
    document.querySelectorAll('*').forEach(el => {
      const text = el.textContent?.trim();
      if (!text) return;

      portfolio.positions.forEach(pos => {
        if (text === pos.ticker && !el.dataset.analysisInjected && el.parentElement) {
          const priceData = prices?.prices?.[pos.ticker];
          const arsPrice = priceData?.ars || pos.ppc;
          const usdPrice = priceData?.usd || 0;
          const rec = calcRecommendation(pos.ticker, usdPrice, pos.ppc, arsPrice);

          // No inyectar si ya existe badge
          if (el.parentElement.querySelector('.analysis-badge')) return;

          const badge = document.createElement('span');
          badge.className = 'analysis-badge';
          badge.style.cssText = `
            display:inline-block; margin-left:8px; padding:2px 8px; border-radius:4px;
            font-size:11px; font-weight:700; cursor:pointer;
            background:${rec.color}33; color:${rec.color}; border:1px solid ${rec.color};
          `;
          badge.textContent = rec.label;
          badge.onclick = (e) => { e.stopPropagation(); openAnalysis(pos.ticker); };
          el.parentElement.appendChild(badge);
          el.dataset.analysisInjected = "1";
        }
      });
    });
  }

  // === INICIALIZAR ===
  window._openChart = openChart;
  window._openAnalysis = openAnalysis;

  // Observar DOM para inyectar badges cuando la app renderiza
  let injectTimeout;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(injectBadges, 500);
  });

  function init() {
    const root = document.getElementById("root");
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
      // Inyectar después de que cargue
      setTimeout(injectBadges, 2000);
      setTimeout(injectBadges, 5000);
    }
    console.log("✅ Módulo Análisis cargado | Datos: " + Object.keys(ANALYST_DATA).length + " tickers");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
