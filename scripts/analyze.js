// scripts/analyze.js v4 — Backend en GitHub Actions
// Genera analysts.json con: fundamentals + consenso, targets por banco y fechas de balances (Yahoo con crumb),
// noticias (Yahoo RSS) traducidas al español.
// REGLAS: nunca pisa datos buenos con vacios; y NUNCA muestra datos que no cierran con el precio real
// (si un target/precio guardado difiere demasiado del precio en vivo de prices.json, se descarta).
const fs = require('fs');

const TICKERS = {
  NVDA:{name:"NVIDIA",sector:"Semiconductores"},
  META:{name:"Meta Platforms",sector:"Big Tech"},
  MSFT:{name:"Microsoft",sector:"Cloud / IA"},
  ADBE:{name:"Adobe",sector:"Software"},
  MU:{name:"Micron",sector:"Memoria / IA"},
  PANW:{name:"Palo Alto Networks",sector:"Ciberseguridad"},
  MELI:{name:"MercadoLibre",sector:"E-commerce LatAm"},
  SPY:{name:"S&P 500 ETF",sector:"ETF"},
  ACN:{name:"Accenture",sector:"Consultoría IT"},
  MCD:{name:"McDonald's",sector:"Consumo"},
  IBIT:{name:"iShares Bitcoin Trust",sector:"Crypto ETF"},
  NU:{name:"Nu Holdings",sector:"Fintech LatAm"},
  PAMP:{name:"Pampa Energía",sector:"Energía Argentina"},
  VIST:{name:"Vista Energy",sector:"Oil & Gas Argentina"},
  GGAL:{name:"Grupo Galicia",sector:"Bancos Argentina"},
  YPF:{name:"YPF",sector:"Energía Argentina"},
  NFLX:{name:"Netflix",sector:"Streaming"},
  UBER:{name:"Uber Technologies",sector:"Movilidad / Delivery"},
  VST:{name:"Vistra",sector:"Energía / Nuclear EEUU"}
};

// Simbolo en Yahoo cuando difiere del ticker local
const YSYM = { PAMP: 'PAM' };
const ysym = tk => YSYM[tk] || tk;

// Respaldo si Yahoo no responde. Se descartan solos cuando la fecha ya paso.
const CATALYSTS_FALLBACK = {
  MU:[{date:"2026-09-30",event:"Balance Q4 FY2026",type:"earnings",importance:"high"}],
  ACN:[{date:"2026-10-01",event:"Balance Q4 FY2026",type:"earnings",importance:"high"}],
  MSFT:[{date:"2026-10-27",event:"Balance Q1 FY2027 (estimado)",type:"earnings",importance:"high"}],
  META:[{date:"2026-10-28",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"high"}],
  MCD:[{date:"2026-10-28",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"medium"}],
  MELI:[{date:"2026-11-05",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"high"}],
  VIST:[{date:"2026-11-10",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"medium"}],
  NU:[{date:"2026-11-12",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"high"}],
  PAMP:[{date:"2026-11-12",event:"Balance Q3 2026 (estimado)",type:"earnings",importance:"medium"}],
  PANW:[{date:"2026-11-19",event:"Balance Q1 FY2027 (estimado)",type:"earnings",importance:"high"}],
  NVDA:[{date:"2026-11-25",event:"Balance Q3 FY2027 (estimado)",type:"earnings",importance:"high"}],
  ADBE:[{date:"2026-12-10",event:"Balance Q4 FY2026 (estimado)",type:"earnings",importance:"high"}]
};
const HIGH = new Set(['NVDA','META','MSFT','ADBE','MU','PANW','MELI','ACN','NU']);

// TARGETS POR BANCO — Datos verificados de TipRanks, CNBC, Yahoo Finance, MarketBeat.
// Fecha de cada estimación incluida. Se actualizan cuando salen nuevos informes.
const BANK_TARGETS_FALLBACK = {
  NVDA: [
    {bank:"Goldman Sachs",analyst:"Toshiya Hari",target:285,rating:"Buy",date:"2026-06"},
    {bank:"Morgan Stanley",analyst:"Joseph Moore",target:288,rating:"Overweight",date:"2026-06"},
    {bank:"JPMorgan",analyst:"Harlan Sur",target:265,rating:"Overweight",date:"2026-05"},
    {bank:"Bank of America",analyst:"",target:350,rating:"Buy",date:"2026-06"},
    {bank:"Jefferies",analyst:"Blayne Curtis",target:275,rating:"Buy",date:"2026-05"},
    {bank:"Wells Fargo",analyst:"",target:315,rating:"Buy",date:"2026-05"}
  ],
  MSFT: [
    {bank:"Goldman Sachs",analyst:"",target:655,rating:"Buy",date:"2026-08"},
    {bank:"Morgan Stanley",analyst:"",target:600,rating:"Overweight",date:"2026-07"},
    {bank:"Wedbush",analyst:"Dan Ives",target:625,rating:"Outperform",date:"2026-07"},
    {bank:"Stifel",analyst:"",target:530,rating:"Hold",date:"2026-09"},
    {bank:"Bernstein",analyst:"",target:641,rating:"Buy",date:"2026-07"}
  ],
  META: [
    {bank:"Morgan Stanley",analyst:"",target:750,rating:"Overweight",date:"2026-06"},
    {bank:"JPMorgan",analyst:"Doug Anmuth",target:800,rating:"Overweight",date:"2026-05"},
    {bank:"Goldman Sachs",analyst:"Eric Sheridan",target:636,rating:"Buy",date:"2026-04"}
  ],
  ADBE: [
    {bank:"RBC Capital",analyst:"Matthew Swanson",target:315,rating:"Buy",date:"2026-09"},
    {bank:"Morgan Stanley",analyst:"Adam Wood",target:240,rating:"Underweight",date:"2026-07"},
    {bank:"Citi",analyst:"",target:301,rating:"Neutral",date:"2026-09"},
    {bank:"CLSA",analyst:"",target:300,rating:"Outperform",date:"2026-09"},
    {bank:"Barclays",analyst:"",target:295,rating:"Buy",date:"2026-09"},
    {bank:"Goldman Sachs",analyst:"Gabriela Borges",target:220,rating:"Sell",date:"2026-07"}
  ],
  MU: [
    {bank:"JPMorgan",analyst:"",target:150,rating:"Overweight",date:"2026-06"},
    {bank:"Morgan Stanley",analyst:"",target:140,rating:"Overweight",date:"2026-06"}
  ],
  PANW: [
    {bank:"Goldman Sachs",analyst:"",target:330,rating:"Buy",date:"2026-05"},
    {bank:"Morgan Stanley",analyst:"",target:320,rating:"Overweight",date:"2026-05"}
  ],
  MELI: [
    {bank:"Morgan Stanley",analyst:"Andrew Ruben",target:2950,rating:"Overweight",date:"2026-06"},
    {bank:"JPMorgan",analyst:"Marcelo Santos",target:2650,rating:"Neutral",date:"2026-06"},
    {bank:"Barclays",analyst:"",target:2900,rating:"Buy",date:"2026-06"}
  ],
  ACN: [
    {bank:"Wolfe Research",analyst:"",target:285,rating:"Outperform",date:"2026-09"},
    {bank:"BMO Capital",analyst:"",target:325,rating:"Hold",date:"2026-06"},
    {bank:"HSBC",analyst:"",target:240,rating:"Reduce",date:"2026-07"}
  ],
  MCD: [
    {bank:"Consenso Wall St",analyst:"41 analistas",target:337,rating:"Buy",date:"2026-08"}
  ],
  NU: [
    {bank:"Consenso Wall St",analyst:"14 analistas",target:16.5,rating:"Buy",date:"2026-08"}
  ],
  VIST: [
    {bank:"Seeking Alpha",analyst:"",target:86,rating:"Buy",date:"2026-07"}
  ]
};


const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, timeout = 12000, headers = {}) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA, 'Accept': '*/*', ...headers } });
    clearTimeout(id);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } catch (e) { clearTimeout(id); throw e; }
}

// ---------- Precio en vivo (para validar) ----------
let LIVE = {};
try { const p = JSON.parse(fs.readFileSync('prices.json', 'utf8')); Object.entries(p.prices || {}).forEach(([k, v]) => { if (v.usd > 0 && v.src !== 'Manual') LIVE[k] = v.usd; }); } catch (e) {}
function sane(tk, value, lo = 0.3, hi = 3) {
  const px = LIVE[tk]; if (!px || !(value > 0)) return true;   // sin referencia no se puede validar
  return value >= px * lo && value <= px * hi;
}

// ---------- Yahoo: cookie + crumb (obligatorio para quoteSummary desde 2023) ----------
let YS = null;
async function yahooSession() {
  if (YS) return YS;
  let cookie = '';
  for (const u of ['https://fc.yahoo.com/', 'https://finance.yahoo.com/', 'https://login.yahoo.com/']) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'manual' });
      const sc = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
      const c = sc.map(x => x.split(';')[0]).filter(Boolean).join('; ');
      if (c) { cookie = c; break; }
    } catch (e) {}
  }
  for (const h of ['query2', 'query1']) {
    try {
      const r = await fetch(`https://${h}.finance.yahoo.com/v1/test/getcrumb`, { headers: { 'User-Agent': UA, 'Cookie': cookie } });
      const t = (await r.text()).trim();
      if (r.ok && t && t.length < 40 && !/[<{\s]/.test(t)) { YS = { cookie, crumb: t }; console.log('Yahoo crumb OK'); return YS; }
    } catch (e) {}
  }
  throw new Error('Yahoo no entrego crumb');
}

async function quoteSummary(sym, modules) {
  const s = await yahooSession(); let last;
  for (const h of ['query2', 'query1']) {
    try {
      const r = await get(`https://${h}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(s.crumb)}`,
        12000, { 'Cookie': s.cookie, 'Accept': 'application/json' });
      const res = (await r.json())?.quoteSummary?.result?.[0];
      if (res) return res;
      throw new Error('sin datos');
    } catch (e) { last = e; }
  }
  throw last;
}

const raw = x => (x && typeof x === 'object' && 'raw' in x) ? x.raw : (typeof x === 'number' ? x : null);
const ym = sec => { const d = new Date(sec * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

// ---------- 1. Fundamentals + bancos + fechas de balance ----------
async function fetchYahooData(prev) {
  const fundamentals = {}, banks = {}, cats = {};
  let ok = 0, fail = 0, yahooCaido = false;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);

  for (const tk of Object.keys(TICKERS)) {
    let res = null;
    if (!yahooCaido) {
      try { res = await quoteSummary(ysym(tk), 'financialData,summaryDetail,defaultKeyStatistics,upgradeDowngradeHistory,calendarEvents'); }
      catch (e) { console.log(`  ${tk}: Yahoo fallo (${e.message})`); if (/crumb/.test(e.message)) yahooCaido = true; }
    }
    if (res) {
      const fd = res.financialData || {}, sd = res.summaryDetail || {}, dks = res.defaultKeyStatistics || {};
      const row = {
        price: raw(fd.currentPrice), target: raw(fd.targetMeanPrice), targetHigh: raw(fd.targetHighPrice), targetLow: raw(fd.targetLowPrice),
        consensus: fd.recommendationKey && fd.recommendationKey !== 'none' ? fd.recommendationKey : null,
        analysts: raw(fd.numberOfAnalystOpinions), pe: raw(sd.trailingPE), forwardPE: raw(sd.forwardPE) ?? raw(dks.forwardPE),
        peg: raw(dks.pegRatio), source: 'Yahoo Finance', updated: new Date().toISOString(),
        // Salud del negocio. Viene en el mismo pedido, no cuesta una llamada extra.
        margenBruto: raw(fd.grossMargins), margenOperativo: raw(fd.operatingMargins), margenNeto: raw(fd.profitMargins),
        roe: raw(fd.returnOnEquity), deudaPatrimonio: raw(fd.debtToEquity),
        crecimientoVentas: raw(fd.revenueGrowth), crecimientoGanancias: raw(fd.earningsGrowth),
        flujoLibre: raw(fd.freeCashflow), caja: raw(fd.totalCash), deuda: raw(fd.totalDebt),
        liquidez: raw(fd.currentRatio)
      };
      if (row.target != null || row.pe != null || row.forwardPE != null) { fundamentals[tk] = row; ok++; }

      // Targets por banco: ultima nota de cada firma en los ultimos 6 meses, con precio objetivo
      const hist = (res.upgradeDowngradeHistory && res.upgradeDowngradeHistory.history) || [];
      const desde = Date.now() / 1000 - 183 * 86400, visto = new Set(), lista = [];
      hist.filter(h => h.epochGradeDate >= desde).sort((a, b) => b.epochGradeDate - a.epochGradeDate).forEach(h => {
        const tgt = raw(h.currentPriceTarget);
        if (visto.has(h.firm) || !(tgt > 0) || !sane(tk, tgt)) return;
        visto.add(h.firm);
        lista.push({ bank: h.firm, analyst: '', target: tgt, rating: h.toGrade || '', date: ym(h.epochGradeDate), action: h.priceTargetAction || h.action || '' });
      });
      if (lista.length) banks[tk] = lista.slice(0, 8);

      // Proxima fecha de balance
      const ed = ((res.calendarEvents && res.calendarEvents.earnings && res.calendarEvents.earnings.earningsDate) || [])
        .map(raw).filter(Boolean).map(s => new Date(s * 1000)).filter(d => d >= today).sort((a, b) => a - b)[0];
      if (ed) cats[tk] = [{ date: ed.toISOString().slice(0, 10), event: 'Presenta balance', type: 'earnings', importance: HIGH.has(tk) ? 'high' : 'medium' }];

      console.log(`  ${tk}: target=${row.target} cons=${row.consensus} bancos=${lista.length} balance=${ed ? ed.toISOString().slice(0, 10) : '-'}`);
    } else fail++;

    // Respaldo: dato anterior SOLO si sigue cerrando con el precio real
    if (!fundamentals[tk] && prev && prev[tk]) {
      const p = prev[tk];
      if (sane(tk, p.price, 0.8, 1.25) && sane(tk, p.target)) fundamentals[tk] = p;
      else console.log(`  ${tk}: descarto fundamentals viejos (precio ${p.price} vs vivo ${LIVE[tk]})`);
    }
    if (!banks[tk] && BANK_TARGETS_FALLBACK[tk]) {
      const l = BANK_TARGETS_FALLBACK[tk].filter(b => sane(tk, b.target));
      if (l.length) banks[tk] = l;
    }
    await sleep(350);
  }

  // Catalysts: Yahoo > respaldo; se eliminan eventos de hace mas de 2 dias
  const lim = new Date(today.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const catalysts = {};
  new Set([...Object.keys(CATALYSTS_FALLBACK), ...Object.keys(cats)]).forEach(tk => {
    const l = (cats[tk] || CATALYSTS_FALLBACK[tk] || []).filter(e => e.date >= lim);
    if (l.length) catalysts[tk] = l;
  });

  console.log(`Yahoo: ${ok} ok / ${fail} fallidos`);
  return { fundamentals, banks, catalysts, ok };
}

// ---------- 2. Noticias (Yahoo RSS) ----------
function parseRSS(xml){
  const out=[]; const re=/<item>([\s\S]*?)<\/item>/g; let m;
  while((m=re.exec(xml))!==null){
    const it=m[1];
    const t=(it.match(/<title[^>]*>([\s\S]*?)<\/title>/)||[])[1]||'';
    const l=(it.match(/<link[^>]*>([\s\S]*?)<\/link>/)||[])[1]||'';
    const d=(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||'';
    const s=(it.match(/<source[^>]*>([\s\S]*?)<\/source>/)||[])[1]||'Yahoo Finance';
    const title=t.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
    if(title&&l) out.push({title,url:l.trim(),source:s.replace(/<!\[CDATA\[|\]\]>/g,'').trim(),published:d||new Date().toISOString()});
  }
  return out;
}


async function fetchNewsFor(list, prev, n) {
  const news = {}; let ok = 0;
  for (const tk of list) {
    try {
      const r = await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ysym(tk)}&region=US&lang=en-US`);
      const items = parseRSS(await r.text()).slice(0, n);
      if (!items.length) throw new Error('vacio');
      news[tk] = items; ok++;
    } catch (e) { if (prev && prev[tk] && prev[tk].length) news[tk] = prev[tk]; }
    await sleep(300);
  }
  console.log(`  noticias: ${ok}/${list.length}`);
  return news;
}

// ---------- 3. Traduccion (Google gtx -> Google dict -> MyMemory), con cache ----------
async function tr1(t) {
  const q = encodeURIComponent(t);
  try {
    const d = await (await get('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=' + q, 8000)).json();
    const s = (d[0] || []).map(x => x[0]).join('').trim(); if (s && s !== t) return s;
  } catch (e) {}
  try {
    const d = await (await get('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=es&q=' + q, 8000)).json();
    const s = (Array.isArray(d) ? (Array.isArray(d[0]) ? d[0][0] : d[0]) : '') || ''; if (s && s !== t) return String(s).trim();
  } catch (e) {}
  try {
    const d = await (await get('https://api.mymemory.translated.net/get?langpair=en|es&q=' + q, 8000)).json();
    const s = d && d.responseData && d.responseData.translatedText;
    if (s && s !== t && !/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(s)) return s;
  } catch (e) {}
  return null;
}

async function translate(groups, prevGroups) {
  const cache = {};
  prevGroups.forEach(g => Object.values(g || {}).flat().forEach(n => { if (n && n.titleEs && n.titleEs !== n.title) cache[n.title] = n.titleEs; }));
  let hit = 0, ok = 0, fail = 0;
  for (const g of groups) for (const items of Object.values(g)) for (const n of items) {
    if (cache[n.title]) { n.titleEs = cache[n.title]; hit++; continue; }
    const s = await tr1(n.title);
    if (s) { n.titleEs = s; cache[n.title] = s; ok++; } else { delete n.titleEs; fail++; }
    await sleep(150);
  }
  console.log(`  traduccion: ${ok} nuevas, ${hit} de cache, ${fail} sin traducir`);
}

const DISCOVERY = {
  TSLA:{name:"Tesla",sector:"EV / IA / Robotaxi"},
  AMZN:{name:"Amazon",sector:"E-commerce / Cloud"},
  AAPL:{name:"Apple",sector:"Consumer Tech"},
  GOOGL:{name:"Alphabet (Google)",sector:"Ads / IA / Cloud"},
  AMD:{name:"AMD",sector:"Semiconductores"},
  AVGO:{name:"Broadcom",sector:"Semiconductores / Infra"},
  SNOW:{name:"Snowflake",sector:"Cloud Data"},
  PLTR:{name:"Palantir",sector:"IA / Defensa"},
  COIN:{name:"Coinbase",sector:"Crypto"},
  ARM:{name:"ARM Holdings",sector:"Chips / Licencias"}
};


async function main() {
  console.log('=== Backend Analisis v4 ===', new Date().toISOString());
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync('analysts.json', 'utf8')); } catch (e) {}

  console.log('\n[1/3] Yahoo: fundamentals, bancos, balances');
  const y = await fetchYahooData(prev.fundamentals);

  console.log('\n[2/3] Noticias');
  const news = await fetchNewsFor(Object.keys(TICKERS), prev.news, 5);
  const discoveryNews = await fetchNewsFor(Object.keys(DISCOVERY), prev.discovery_news, 4);

  console.log('\n[3/3] Traduccion');
  await translate([news, discoveryNews], [prev.news, prev.discovery_news]);

  const out = {
    ts: new Date().toISOString(),
    tickers: TICKERS,
    fundamentals: y.fundamentals,
    bank_targets: y.banks,
    catalysts: y.catalysts,
    news,
    discovery: { tickers: Object.keys(DISCOVERY), info: DISCOVERY },
    discovery_news: discoveryNews,
    yahoo_ok: y.ok,
    version: '4.0',
    source: y.ok ? 'Yahoo Finance (en vivo)' : 'Respaldo validado contra precio en vivo'
  };
  const cn = Object.values(news).filter(v => v && v.length).length;
  if (cn === 0 && y.ok === 0 && prev.ts) { console.log('Todo fallo. No sobrescribo.'); return; }
  fs.writeFileSync('analysts.json', JSON.stringify(out, null, 2));
  console.log(`\nOK -> analysts.json | yahoo ${y.ok} | ${Object.keys(y.fundamentals).length} fundamentals | ${Object.keys(y.banks).length} con bancos | ${cn} con noticias`);
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
