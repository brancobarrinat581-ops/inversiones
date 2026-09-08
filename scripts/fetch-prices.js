// scripts/fetch-prices.js - VERSIÓN FINAL
// Trae precios reales de BYMA via Open BYMA Data + FMP
const fs = require('fs');

const TICKERS = {
  ADBE:44, MELI:120, MSFT:30, MU:5, NVDA:24, PANW:50, SPY:60,
  VIST:3, ACN:75, MCD:24, META:24, NU:2, PAMP:25, IBIT:10,
  BMA:10, GGAL:10, YPF:1, ICLN:5
};

// Precios fallback (último recurso)
const FALLBACK_ARS = {
  ADBE:9650, MELI:26120, MSFT:26300, MU:326700, NVDA:15390, PANW:10580, SPY:20480,
  VIST:39000, ACN:3940, MCD:17130, META:40920, NU:12200, PAMP:5410, IBIT:7275,
  BMA:12200, GGAL:7023, YPF:64698, ICLN:5627
};

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch(e) {
    clearTimeout(id);
    throw e;
  }
}

// Open BYMA Data (precios ARS reales)
async function fetchBYMA() {
  console.log('📡 Consultando Open BYMA Data...');
  const prices = {};
  const endpoints = [
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/general-equity'
  ];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      data.forEach(item => {
        const sym = item.symbol || item.simbolo || '';
        const price = item.trade || item.last || item.ultimoPrecio || item.close || 0;
        if (sym && price > 0 && TICKERS[sym]) {
          prices[sym] = {
            ars: Math.round(price),
            changePct: item.changeRate || item.variacion || 0,
            src: 'BYMA'
          };
        }
      });
    } catch(e) {
      console.log(`⚠️  BYMA endpoint error: ${e.message}`);
    }
  }
  console.log(`✅ BYMA: ${Object.keys(prices).length} tickers`);
  return prices;
}

// FMP para USD (fallback)
async function fetchFMP() {
  console.log('📡 Consultando FMP...');
  const prices = {};
  const FMP_KEY = 'eLJtPLqeqnU6YBft89zRBpetoDfVnwvO';
  const syms = Object.keys(TICKERS);

  for (let i = 0; i < syms.length; i += 5) {
    const batch = syms.slice(i, i+5).join(',');
    try {
      const res = await fetchWithTimeout(
        `https://financialmodelingprep.com/stable/profile?symbol=${batch}&apikey=${FMP_KEY}`,
        6000
      );
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      data.forEach(d => {
        if (d.price > 0 && TICKERS[d.symbol]) {
          prices[d.symbol] = {
            usd: d.price,
            changePct: d.changesPercentage || 0,
            src: 'FMP'
          };
        }
      });
      await new Promise(r => setTimeout(r, 250));
    } catch(e) {
      console.log(`⚠️  FMP error: ${e.message}`);
      break;
    }
  }
  console.log(`✅ FMP: ${Object.keys(prices).length} tickers`);
  return prices;
}

// CCL desde dolarapi
async function fetchCCL() {
  try {
    const res = await fetchWithTimeout('https://dolarapi.com/v1/dolares/contadoconliqui', 5000);
    if (res.ok) {
      const data = await res.json();
      if (data.venta > 0) {
        console.log(`✅ CCL: $${data.venta.toFixed(2)}`);
        return data.venta;
      }
    }
  } catch(e) {
    console.log(`⚠️  CCL error: ${e.message}`);
  }
  return 1560; // Fallback
}

async function main() {
  console.log('🚀 Actualizando precios...', new Date().toISOString());

  const [bymaData, fmpData, ccl] = await Promise.all([
    fetchBYMA().catch(() => ({})),
    fetchFMP().catch(() => ({})),
    fetchCCL()
  ]);

  // Combinar: BYMA tiene prioridad (son ARS reales)
  const prices = {};
  Object.keys(TICKERS).forEach(sym => {
    const byma = bymaData[sym];
    const fmp = fmpData[sym];

    if (byma && byma.ars > 0) {
      // BYMA tiene precio ARS real
      prices[sym] = {
        usd: 0,
        ars: byma.ars,
        changePct: byma.changePct || 0,
        src: 'BYMA'
      };
    } else if (fmp && fmp.usd > 0) {
      // FMP: calcular ARS
      const ars = Math.round(fmp.usd / TICKERS[sym] * ccl);
      prices[sym] = {
        usd: fmp.usd,
        ars: ars,
        changePct: fmp.changePct || 0,
        src: 'FMP'
      };
    } else {
      // Fallback hardcodeado
      prices[sym] = {
        usd: 0,
        ars: FALLBACK_ARS[sym] || 0,
        changePct: 0,
        src: 'Fallback'
      };
    }
  });

  // Especiales
  prices.IOLCAMA = { usd: 0, ars: 12077, changePct: 0, src: 'Fixed' };
  prices.IOLDOLD = { usd: 0, ars: 1670, changePct: 0, src: 'Fixed' };
  prices.AL30D = { usd: 63.96, ars: Math.round(63.96 * ccl), changePct: 0, src: 'Calc' };

  // Guardar
  const output = {
    ts: new Date().toISOString(),
    ccl: ccl,
    count: Object.keys(prices).length,
    prices: prices
  };

  fs.writeFileSync('prices.json', JSON.stringify(output, null, 2));

  // Resumen
  const src = {};
  Object.values(prices).forEach(p => { src[p.src] = (src[p.src]||0)+1; });
  console.log('✅ Guardado:', Object.entries(src).map(([k,v])=>`${k}: ${v}`).join(', '));
  console.log(`📊 Total: ${output.count} tickers | CCL: $${ccl.toFixed(2)}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
