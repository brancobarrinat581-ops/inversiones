// scripts/fetch-prices.js
// Busca precios REALES de BYMA via Open BYMA Data + FMP para USD
const fs = require('fs');
const FMP_KEY = 'eLJtPLqeqnU6YBft89zRBpetoDfVnwvO';

const TICKERS = {
  ADBE:44, MELI:120, MSFT:30, MU:5, NVDA:24, PANW:50, SPY:60,
  VIST:3, ACN:75, MCD:24, META:24, NU:2, PAMP:25, IBIT:10,
  BMA:10, GGAL:10, YPF:1, ICLN:5, ALUA:1, EWZ:1
};

async function fetchJSON(url, timeout=10000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, {signal:c.signal});
    clearTimeout(id);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch(e) { clearTimeout(id); throw e; }
}

// FUENTE 1: Open BYMA Data (precios ARS reales de BYMA)
async function fetchBYMA() {
  const prices = {};
  const endpoints = [
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/general-equity'
  ];
  for (const url of endpoints) {
    try {
      const data = await fetchJSON(url);
      if (Array.isArray(data)) {
        data.forEach(item => {
          const sym = item.symbol || item.simbolo || '';
          const price = item.trade || item.last || item.ultimoPrecio || item.close || 0;
          if (sym && price > 0) {
            prices[sym] = {
              ars: price,
              open: item.open || item.apertura || 0,
              high: item.high || item.maximo || 0,
              low: item.low || item.minimo || 0,
              prevClose: item.previousClosingPrice || item.cierreAnterior || 0,
              changePct: item.changeRate || item.variacion || 0,
              vol: item.volume || item.volumen || 0,
              src: 'BYMA'
            };
          }
        });
      }
    } catch(e) {
      console.log('BYMA endpoint error:', url.split('/').pop(), e.message);
    }
  }
  return prices;
}

// FUENTE 2: FMP (precios USD)
async function fetchFMP() {
  const prices = {};
  const syms = Object.keys(TICKERS);
  for (let i = 0; i < syms.length; i += 5) {
    const batch = syms.slice(i, i+5).join(',');
    try {
      const data = await fetchJSON(
        `https://financialmodelingprep.com/stable/profile?symbol=${batch}&apikey=${FMP_KEY}`
      );
      if (Array.isArray(data)) {
        data.forEach(d => {
          if (d.price > 0) {
            prices[d.symbol] = {
              usd: d.price,
              changePct: d.changesPercentage || 0,
              pe: d.pe || 0,
              mcap: d.mktCap || 0
            };
          }
        });
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.log('FMP error:', e.message);
      break;
    }
  }
  return prices;
}

// CCL
async function fetchCCL() {
  try {
    const d = await fetchJSON('https://dolarapi.com/v1/dolares/contadoconliqui');
    if (d.venta > 0) return d.venta;
  } catch(e) { console.log('CCL error:', e.message); }
  return 1583;
}

async function main() {
  console.log('🚀 Buscando precios...', new Date().toISOString());

  const [bymaData, fmpData, ccl] = await Promise.all([
    fetchBYMA().catch(e => { console.log('BYMA failed:', e.message); return {}; }),
    fetchFMP().catch(e => { console.log('FMP failed:', e.message); return {}; }),
    fetchCCL()
  ]);

  console.log(`📊 BYMA: ${Object.keys(bymaData).length} tickers`);
  console.log(`📊 FMP: ${Object.keys(fmpData).length} tickers`);
  console.log(`📊 CCL: $${ccl}`);

  // Combinar: BYMA para ARS, FMP para USD
  const prices = {};
  Object.keys(TICKERS).forEach(sym => {
    const byma = bymaData[sym];
    const fmp = fmpData[sym];
    const ratio = TICKERS[sym];

    prices[sym] = {
      usd: fmp?.usd || (byma?.ars > 0 && ratio > 1 ? Math.round(byma.ars * ratio / ccl * 100) / 100 : 0),
      ars: byma?.ars || (fmp?.usd > 0 && ratio > 1 ? Math.round(fmp.usd / ratio * ccl) : 0),
      changePct: byma?.changePct || fmp?.changePct || 0,
      vol: byma?.vol || 0,
      pe: fmp?.pe || 0,
      mcap: fmp?.mcap || 0,
      src: byma?.ars > 0 ? 'BYMA' : (fmp?.usd > 0 ? 'FMP' : 'Fallback')
    };
  });

  // Tickers especiales
  prices.IOLCAMA = { usd:0, ars:11.91, src:'Fixed' };
  prices.IOLDOLD = { usd:0, ars:1648, src:'Fixed' };
  prices.AL30D = { usd:63.96, ars:Math.round(63.96*ccl), src:'Calc' };

  const output = { ts: new Date().toISOString(), ccl, count: Object.keys(prices).length, prices };
  fs.writeFileSync('prices.json', JSON.stringify(output, null, 2));

  // Resumen
  const src = {};
  Object.values(prices).forEach(p => { src[p.src] = (src[p.src]||0)+1; });
  console.log('✅ Guardado:', Object.entries(src).map(([k,v])=>`${k}: ${v}`).join(', '));
}

main().catch(e => { console.error('❌', e); process.exit(1); });
