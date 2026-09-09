// scripts/fetch-prices.js  v2
// Fuente 1: Yahoo Finance chart API  -> ARS reales de BYMA (tickers .BA) y USD (ticker plano)
// Fuente 2: Open BYMA Data           -> respaldo ARS
// CCL:      dolarapi.com
// REGLA: nunca se inventa un precio. Si una fuente falla se conserva el ULTIMO PRECIO REAL
//        conocido (de prices.json) marcado con stale:true y la fecha en que se obtuvo.
const fs = require('fs');

// ticker -> [simbolo BYMA en Yahoo (.BA), simbolo USD subyacente, ratio CEDEAR]
const MAP = {
  ADBE: ['ADBE.BA','ADBE', 44],
  MELI: ['MELI.BA','MELI',120],
  MSFT: ['MSFT.BA','MSFT', 30],
  MU:   ['MU.BA',  'MU',    5],
  NVDA: ['NVDA.BA','NVDA', 24],
  PANW: ['PANW.BA','PANW', 50],
  SPY:  ['SPY.BA', 'SPY',  60],
  ACN:  ['ACN.BA', 'ACN',  75],
  MCD:  ['MCD.BA', 'MCD',  24],
  META: ['META.BA','META', 24],
  NU:   ['NU.BA',  'NU',    2],
  IBIT: ['IBIT.BA','IBIT', 10],
  ICLN: ['ICLN.BA','ICLN',  5],
  PAMP: ['PAMP.BA','PAM',  25],
  GGAL: ['GGAL.BA','GGAL', 10],
  YPF:  ['YPFD.BA','YPF',   1],
  BMA:  ['BMA.BA', 'BMA',  10],
  VIST: ['VIST.BA','VIST',  3]
};
// FCIs de IOL: no cotizan, no hay fuente publica. Se conserva el ultimo valor cargado a mano.
const MANUALES = ['IOLCAMA','IOLDOLD'];

async function get(url, timeout = 10000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: {
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Accept':'application/json,text/plain,*/*'
    }});
    clearTimeout(id);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } catch (e) { clearTimeout(id); throw e; }
}

async function yahooQuote(symbol) {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
  const m = (await r.json())?.chart?.result?.[0]?.meta;
  const p = m?.regularMarketPrice;
  if (!(p > 0)) throw new Error('sin precio');
  const prev = m.chartPreviousClose || m.previousClose || 0;
  return { price: p, changePct: prev > 0 ? ((p - prev) / prev) * 100 : 0, currency: m.currency || '' };
}

async function fetchCCL() {
  try {
    const d = await (await get('https://dolarapi.com/v1/dolares/contadoconliqui', 6000)).json();
    if (d.venta > 0) { console.log('CCL: $' + d.venta + ' (dolarapi)'); return { ccl: d.venta, cclSrc: 'dolarapi' }; }
  } catch (e) { console.log('CCL dolarapi FALLO: ' + e.message); }
  return { ccl: null, cclSrc: null };
}

async function fetchBYMA() {
  const out = {};
  const urls = [
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears',
    'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/leading-equity'
  ];
  for (const url of urls) {
    try {
      const data = await (await get(url, 12000)).json();
      if (!Array.isArray(data)) continue;
      data.forEach(it => {
        const sym = String(it.symbol || it.simbolo || '').trim().replace(/\s+\d+$/, '');
        const px = it.trade || it.last || it.closingPrice || 0;
        if (sym && px > 0 && MAP[sym]) out[sym] = { ars: px, changePct: it.changePercent || 0 };
      });
      console.log('BYMA ' + url.split('/').pop() + ': ' + Object.keys(out).length + ' acumulados');
    } catch (e) { console.log('BYMA ' + url.split('/').pop() + ' FALLO: ' + e.message); }
  }
  return out;
}

async function main() {
  const now = new Date().toISOString();
  console.log('Actualizando precios:', now);

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('prices.json', 'utf8')); console.log('prices.json previo cargado'); }
  catch (e) { console.log('sin prices.json previo'); }
  const prevP = prev.prices || {};

  const { ccl, cclSrc } = await fetchCCL();
  const cclUsado = ccl || prev.ccl || null;
  if (!ccl && cclUsado) console.log('CCL: uso el anterior $' + cclUsado);

  const byma = await fetchBYMA();

  const prices = {};
  let real = 0, stale = 0;

  for (const [tk, [symBA, symUS, ratio]] of Object.entries(MAP)) {
    let ars = null, usd = null, chg = 0, src = null;

    try { const q = await yahooQuote(symBA); ars = q.price; chg = q.changePct; src = 'Yahoo .BA'; }
    catch (e) { console.log(`  ${tk} ${symBA}: ${e.message}`); }

    try { const q = await yahooQuote(symUS); usd = q.price; if (!src) { src = 'Yahoo USD'; chg = q.changePct; } }
    catch (e) { console.log(`  ${tk} ${symUS}: ${e.message}`); }

    if (ars == null && byma[tk]) { ars = byma[tk].ars; chg = byma[tk].changePct; src = 'BYMA'; }
    if (ars == null && usd != null && cclUsado) { ars = Math.round(usd / ratio * cclUsado); src = 'USD*CCL'; }
    if (usd == null && ars != null && cclUsado) usd = Math.round(ars * ratio / cclUsado * 100) / 100;

    if (ars != null) {
      prices[tk] = { usd: usd || 0, ars: Math.round(ars * 100) / 100, changePct: Math.round(chg * 100) / 100,
                     src, stale: false, asOf: now };
      real++;
      console.log(`  ${tk}: ARS ${prices[tk].ars} | USD ${prices[tk].usd} [${src}]`);
    } else if (prevP[tk] && prevP[tk].ars > 0) {
      prices[tk] = { ...prevP[tk], stale: true, asOf: prevP[tk].asOf || prev.ts || null };
      stale++;
      console.log(`  ${tk}: SIN FUENTE -> conservo ultimo real (${prices[tk].asOf})`);
    } else {
      console.log(`  ${tk}: SIN FUENTE y sin historico -> se omite`);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // FCIs: valor cargado a mano, se arrastra tal cual y siempre marcado como manual
  MANUALES.forEach(tk => {
    if (prevP[tk]) prices[tk] = { ...prevP[tk], src: 'Manual', stale: true };
  });

  if (real === 0) {
    console.log('\nNINGUNA fuente respondio. No escribo prices.json (se conserva el anterior).');
    process.exit(0);
  }

  fs.writeFileSync('prices.json', JSON.stringify({
    ts: now, ccl: cclUsado, cclSrc: cclSrc || (prev.cclSrc ? prev.cclSrc + ' (anterior)' : null),
    count: Object.keys(prices).length, real, stale, prices
  }, null, 2));

  console.log(`\nOK -> prices.json | ${real} en vivo, ${stale} desactualizados`);
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
