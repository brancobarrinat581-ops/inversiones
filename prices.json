// scripts/fetch-prices.js - BASE SÓLIDA
// Fuente 1: Open BYMA Data (precios ARS reales)
// Fuente 2: FMP (precios USD, convertidos)
// Fuente 3: Fallback hardcoded
const fs = require('fs');

// Tickers y ratios
const CEDEAR_RATIOS = {
  ADBE:44, MELI:120, MSFT:30, MU:5, NVDA:24, PANW:50, SPY:60,
  ACN:75, MCD:24, META:24, NU:2, IBIT:10, ICLN:5
};
const ACCIONES_ARG = ['PAMP','GGAL','YPF','BMA','VIST'];
const ALL_TICKERS = [...Object.keys(CEDEAR_RATIOS), ...ACCIONES_ARG];

// Fallback (precios IOL del 08/09/2026)
const FALLBACK = {
  ADBE:9265, IBIT:7080, MELI:25640, META:40780, MSFT:26080, MU:323900,
  NU:12370, NVDA:15040, PAMP:5445, PANW:10460, SPY:20360, VIST:39900,
  ACN:3777, MCD:16960, BMA:12370, GGAL:7023, YPF:64698, ICLN:5627
};

async function fetchJSON(url, timeout = 8000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(id);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch(e) { clearTimeout(id); throw e; }
}

// === BYMA DATA ===
async function fetchBYMA() {
  const prices = {};
  const urls = [
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/general-equity'
  ];
  for (const url of urls) {
    try {
      const data = await fetchJSON(url, 10000);
      if (!Array.isArray(data)) continue;
      data.forEach(item => {
        // Probar distintos nombres de campo
        const sym = (item.symbol || item.simbolo || '').trim();
        const price = item.trade || item.last || item.ultimoPrecio || item.close || 0;
        const change = item.changeRate || item.variacionPorcentual || item.variacion || 0;
        const vol = item.volume || item.volumen || 0;
        if (sym && price > 0 && (ALL_TICKERS.includes(sym) || CEDEAR_RATIOS[sym])) {
          prices[sym] = { ars: Math.round(price * 100) / 100, changePct: change, vol, src: 'BYMA' };
        }
      });
    } catch(e) {
      console.log('⚠️ BYMA ' + url.split('/').pop() + ': ' + e.message);
    }
  }
  return prices;
}

// === FMP (USD) ===
async function fetchFMP() {
  const FMP_KEY = 'eLJtPLqeqnU6YBft89zRBpetoDfVnwvO';
  const prices = {};
  const syms = Object.keys(CEDEAR_RATIOS);
  for (let i = 0; i < syms.length; i += 5) {
    const batch = syms.slice(i, i + 5).join(',');
    try {
      const data = await fetchJSON(
        'https://financialmodelingprep.com/stable/profile?symbol=' + batch + '&apikey=' + FMP_KEY,
        6000
      );
      if (Array.isArray(data)) {
        data.forEach(d => {
          if (d.price > 0) prices[d.symbol] = { usd: d.price, changePct: d.changesPercentage || 0, src: 'FMP' };
        });
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.log('⚠️ FMP: ' + e.message);
      break;
    }
  }
  return prices;
}

// === CCL ===
async function fetchCCL() {
  try {
    const d = await fetchJSON('https://dolarapi.com/v1/dolares/contadoconliqui', 5000);
    if (d.venta > 0) return d.venta;
  } catch(e) { console.log('⚠️ CCL: ' + e.message); }
  return 1560;
}

async function main() {
  console.log('🚀 Actualizando precios...', new Date().toISOString());

  const [byma, fmp, ccl] = await Promise.all([
    fetchBYMA().catch(() => ({})),
    fetchFMP().catch(() => ({})),
    fetchCCL()
  ]);

  console.log('BYMA: ' + Object.keys(byma).length + ' | FMP: ' + Object.keys(fmp).length + ' | CCL: $' + ccl);

  // Combinar precios
  const prices = {};
  ALL_TICKERS.forEach(sym => {
    const b = byma[sym];
    const f = fmp[sym];
    const ratio = CEDEAR_RATIOS[sym] || 1;

    if (b && b.ars > 0) {
      // BYMA: precio ARS directo
      const usd = ratio > 1 ? Math.round(b.ars * ratio / ccl * 100) / 100 : 0;
      prices[sym] = { usd, ars: b.ars, changePct: b.changePct || 0, vol: b.vol || 0, src: 'BYMA' };
    } else if (f && f.usd > 0 && ratio > 1) {
      // FMP: convertir USD → ARS
      const ars = Math.round(f.usd / ratio * ccl);
      prices[sym] = { usd: f.usd, ars, changePct: f.changePct || 0, vol: 0, src: 'FMP' };
    } else {
      // Fallback
      prices[sym] = { usd: 0, ars: FALLBACK[sym] || 0, changePct: 0, vol: 0, src: 'Fallback' };
    }
  });

  // Especiales (FCIs IOL, bonos)
  prices.IOLCAMA = { usd: 0, ars: 12.08, changePct: 0, src: 'Fixed' };
  prices.IOLDOLD = { usd: 0, ars: 1667.49, changePct: 0, src: 'Fixed' };
  prices.AL30D = { usd: 63.96, ars: Math.round(63.96 * ccl), changePct: 0, src: 'Calc' };

  // Guardar
  const output = { ts: new Date().toISOString(), ccl, count: Object.keys(prices).length, prices };
  fs.writeFileSync('prices.json', JSON.stringify(output, null, 2));

  // Resumen
  const src = {};
  Object.values(prices).forEach(p => { src[p.src] = (src[p.src] || 0) + 1; });
  console.log('✅ ' + Object.entries(src).map(([k, v]) => k + ': ' + v).join(', '));
  console.log('📊 Total: ' + output.count + ' tickers | CCL: $' + ccl);

  // Mostrar precios para verificar
  ALL_TICKERS.forEach(sym => {
    const p = prices[sym];
    if (p) console.log('  ' + sym + ': ARS $' + p.ars + ' (' + p.src + ')');
  });
}

main().catch(e => { console.error('❌', e); process.exit(1); });
