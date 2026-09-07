// scripts/fetch-prices.js
// Corre en GitHub Actions (server-side) - sin problemas de CORS
const fs = require('fs');

const FMP_KEY = 'eLJtPLqeqnU6YBft89zRBpetoDfVnwvO';

// Tickers y ratios CEDEAR
const TICKERS = {
  ADBE: 44, MELI: 120, MSFT: 30, MU: 5, NVDA: 24, PANW: 50, SPY: 60,
  VIST: 3, ACN: 75, MCD: 24, META: 24, NU: 2, PAMP: 25, IBIT: 10,
  BMA: 10, GGAL: 10, YPF: 1, ICLN: 5
};

// Tickers que cotizan en IOL con nombre diferente
const IOL_MAP = { PAMP: 'PAM' };

// Fallback hardcoded (último recurso)
const FALLBACK_USD = {
  ADBE: 267, NVDA: 222, MSFT: 510, META: 608, MU: 880, PANW: 370, SPY: 775,
  MCD: 279, MELI: 1940, NU: 13.8, IBIT: 38, ACN: 178, VIST: 66, PAMP: 86,
  BMA: 92, GGAL: 82, YPF: 41, ICLN: 20.92
};

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// Fuente 1: FMP API
async function fetchFMP(symbols) {
  const prices = {};
  // Batch de 5
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5).join(',');
    try {
      const res = await fetchWithTimeout(
        `https://financialmodelingprep.com/stable/profile?symbol=${batch}&apikey=${FMP_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(d => {
            if (d.price > 0) {
              // Reverse IOL map
              const sym = Object.entries(IOL_MAP).find(([k, v]) => v === d.symbol)?.[0] || d.symbol;
              prices[sym] = {
                usd: d.price,
                change: d.changes || 0,
                changePct: d.changesPercentage || 0,
                pe: d.pe || 0,
                mcap: d.mktCap || 0,
                h52: d.range ? parseFloat(d.range.split('-')[1]) || 0 : 0,
                l52: d.range ? parseFloat(d.range.split('-')[0]) || 0 : 0,
                vol: d.volAvg || 0,
                src: 'FMP'
              };
            }
          });
        }
      } else if (res.status === 429 || res.status === 403) {
        console.log('⚠️ FMP rate limited');
        break;
      }
      // Delay entre batches
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log('FMP error:', e.message);
    }
  }
  return prices;
}

// Fuente 2: Yahoo Finance
async function fetchYahoo(symbol) {
  try {
    const iolSym = IOL_MAP[symbol] || symbol;
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${iolSym}?interval=1d&range=5d`
    );
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice > 0) {
        return {
          usd: meta.regularMarketPrice,
          change: meta.regularMarketPrice - (meta.chartPreviousClose || meta.regularMarketPrice),
          changePct: meta.chartPreviousClose
            ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100)
            : 0,
          h52: meta.fiftyTwoWeekHigh || 0,
          l52: meta.fiftyTwoWeekLow || 0,
          src: 'Yahoo'
        };
      }
    }
  } catch (e) {
    console.log(`Yahoo error for ${symbol}:`, e.message);
  }
  return null;
}

// CCL desde dolarapi.com
async function fetchCCL() {
  try {
    const res = await fetchWithTimeout('https://dolarapi.com/v1/dolares/contadoconliqui');
    if (res.ok) {
      const data = await res.json();
      if (data.venta > 0) {
        console.log(`✅ CCL: $${data.venta}`);
        return data.venta;
      }
    }
  } catch (e) {
    console.log('CCL fetch error:', e.message);
  }
  // Fallback
  return 1578;
}

async function main() {
  console.log('🚀 Buscando precios...', new Date().toISOString());

  // 1. CCL
  const ccl = await fetchCCL();

  // 2. FMP (fuente principal)
  const symbols = Object.keys(TICKERS).map(s => IOL_MAP[s] || s);
  const fmpPrices = await fetchFMP(symbols);
  console.log(`✅ FMP: ${Object.keys(fmpPrices).length} tickers`);

  // 3. Yahoo (para los que faltan)
  const prices = { ...fmpPrices };
  const missing = Object.keys(TICKERS).filter(s => !prices[s] || prices[s].usd <= 0);

  if (missing.length > 0) {
    console.log(`📡 Yahoo para ${missing.length} tickers...`);
    for (const sym of missing) {
      const yp = await fetchYahoo(sym);
      if (yp) prices[sym] = yp;
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 4. Fallback hardcoded para los que siguen sin precio
  Object.keys(TICKERS).forEach(sym => {
    if (!prices[sym] || prices[sym].usd <= 0) {
      prices[sym] = {
        usd: FALLBACK_USD[sym] || 0,
        change: 0, changePct: 0, src: 'Fallback'
      };
    }
  });

  // 5. Calcular precios ARS CEDEAR
  Object.keys(prices).forEach(sym => {
    const ratio = TICKERS[sym] || 1;
    if (prices[sym].usd > 0 && ratio > 1) {
      prices[sym].ars = Math.round(prices[sym].usd / ratio * ccl);
    }
  });

  // 6. Agregar tickers no-CEDEAR (FCIs, bonos) con precios ARS fijos
  prices.IOLCAMA = { usd: 0, ars: 11.91, src: 'Fixed' };
  prices.IOLDOLD = { usd: 0, ars: 1648, src: 'Fixed' };
  prices.AL30D = { usd: 63.96, ars: Math.round(63.96 * ccl), src: 'Calc' };

  // 7. Guardar
  const output = {
    ts: new Date().toISOString(),
    ccl: ccl,
    count: Object.keys(prices).length,
    prices: prices
  };

  fs.writeFileSync('prices.json', JSON.stringify(output, null, 2));

  // Resumen
  const sources = {};
  Object.values(prices).forEach(p => {
    sources[p.src || '?'] = (sources[p.src || '?'] || 0) + 1;
  });
  console.log('✅ prices.json guardado:', Object.entries(sources).map(([k,v]) => `${k}: ${v}`).join(', '));
  console.log(`📊 Total: ${output.count} tickers | CCL: $${ccl}`);
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
