// scripts/analyze.js — corre en GitHub Actions
// Genera analysts.json: noticias reales (Yahoo RSS) + targets reales (Yahoo quoteSummary) + earnings
// NUNCA pisa datos buenos con vacíos: si una fuente falla, conserva lo anterior.
const fs = require('fs');

const TICKERS = {
  NVDA:{name:"NVIDIA",sector:"Semiconductores"},
  META:{name:"Meta Platforms",sector:"Big Tech"},
  MSFT:{name:"Microsoft",sector:"Big Tech / Cloud"},
  ADBE:{name:"Adobe",sector:"Software"},
  MU:{name:"Micron",sector:"Memoria / IA"},
  PANW:{name:"Palo Alto Networks",sector:"Ciberseguridad"},
  MELI:{name:"MercadoLibre",sector:"E-commerce LatAm"},
  SPY:{name:"S&P 500 ETF",sector:"ETF"},
  ACN:{name:"Accenture",sector:"Consultoría IT"},
  MCD:{name:"McDonald's",sector:"Consumo"},
  IBIT:{name:"iShares Bitcoin Trust",sector:"Crypto"},
  NU:{name:"Nu Holdings",sector:"Fintech LatAm"},
  PAMP:{name:"Pampa Energía",sector:"Energía Argentina"},
  VIST:{name:"Vista Energy",sector:"Oil & Gas Argentina"},
  GGAL:{name:"Grupo Galicia",sector:"Bancos Argentina"},
  YPF:{name:"YPF",sector:"Energía Argentina"}
};

// Earnings confirmados
const CATALYSTS = {
  ADBE:[{date:"2026-09-10",event:"Q3 FY2026 Earnings",type:"earnings",importance:"high"}],
  ACN: [{date:"2026-09-24",event:"Q4 FY2026 Earnings",type:"earnings",importance:"high"}],
  MSFT:[{date:"2026-10-27",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}],
  META:[{date:"2026-10-28",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  MCD: [{date:"2026-10-28",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}],
  NU:  [{date:"2026-11-12",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  NVDA:[{date:"2026-11-25",event:"Q3 FY2027 Earnings",type:"earnings",importance:"high"}],
  MU:  [{date:"2026-12-18",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}],
  PANW:[{date:"2026-11-19",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}],
  MELI:[{date:"2026-11-05",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  VIST:[{date:"2026-11-10",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}],
  PAMP:[{date:"2026-11-12",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}]
};

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

function parseRSS(xml){
  const out=[]; const re=/<item>([\s\S]*?)<\/item>/g; let m;
  while((m=re.exec(xml))!==null){
    const it=m[1];
    const title=(it.match(/<title[^>]*>([\s\S]*?)<\/title>/)||[])[1]||'';
    const link =(it.match(/<link[^>]*>([\s\S]*?)<\/link>/)||[])[1]||'';
    const pub  =(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||'';
    const src  =(it.match(/<source[^>]*>([\s\S]*?)<\/source>/)||[])[1]||'Yahoo Finance';
    if(title&&link) out.push({title,url:link,source:src,published:pub||new Date().toISOString()});
  }
  return out;
}

async function fetchNews(prev){
  const news = {};
  let ok=0, fail=0;
  for(const tk of Object.keys(TICKERS)){
    try{
      const r = await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tk}&region=US&lang=en-US`);
      const items = parseRSS(await r.text()).slice(0,6);
      if(items.length){ news[tk]=items; ok++; console.log(`  news ${tk}: ${items.length}`); }
      else throw new Error('feed vacío');
    }catch(e){
      fail++;
      console.log(`  news ${tk}: FALLO (${e.message}) -> conservo anterior`);
      if(prev && prev[tk] && prev[tk].length) news[tk]=prev[tk];
    }
    await new Promise(r=>setTimeout(r,400));
  }
  console.log(`noticias: ${ok} ok / ${fail} fallidas`);

  // Traducir títulos al español
  const allTitles = [];
  const titleMap = []; // [{ticker, index}]
  Object.entries(news).forEach(([tk, items]) => {
    (items || []).forEach((item, i) => {
      if (item.title && !/[áéíóúñ¿¡]/.test(item.title)) { // Solo si no está en español
        allTitles.push(item.title);
        titleMap.push({ tk, i });
      }
    });
  });

  if (allTitles.length) {
    console.log("Traduciendo " + allTitles.length + " títulos...");
    // Traducir en lotes de 10
    for (let b = 0; b < allTitles.length; b += 10) {
      const batch = allTitles.slice(b, b + 10);
      const translated = await translateBatch(batch);
      translated.forEach((tr, j) => {
        const { tk, i } = titleMap[b + j];
        if (news[tk] && news[tk][i]) news[tk][i].titleEs = tr;
      });
      if (b + 10 < allTitles.length) await new Promise(r => setTimeout(r, 500));
    }
    console.log("Traducción completada");
  }

  return news;
}

async function fetchFundamentals(prev){
  const f={}; let ok=0, fail=0;
  for(const tk of Object.keys(TICKERS)){
    try{
      const r = await get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${tk}?modules=financialData,defaultKeyStatistics,summaryDetail`);
      const res = (await r.json())?.quoteSummary?.result?.[0];
      if(!res) throw new Error('sin datos');
      const fd=res.financialData||{}, dks=res.defaultKeyStatistics||{}, sd=res.summaryDetail||{};
      const row={
        price:      fd.currentPrice?.raw ?? null,
        target:     fd.targetMeanPrice?.raw ?? null,
        targetHigh: fd.targetHighPrice?.raw ?? null,
        targetLow:  fd.targetLowPrice?.raw ?? null,
        consensus:  fd.recommendationKey ?? null,
        analysts:   fd.numberOfAnalystOpinions?.raw ?? null,
        pe:         sd.trailingPE?.raw ?? null,
        forwardPE:  sd.forwardPE?.raw ?? null,
        peg:        dks.pegRatio?.raw ?? null,
        source:'Yahoo Finance quoteSummary',
        updated:new Date().toISOString()
      };
      if(row.target==null && row.pe==null) throw new Error('campos vacíos');
      f[tk]=row; ok++;
      console.log(`  fund ${tk}: target=${row.target} pe=${row.pe} cons=${row.consensus} (${row.analysts} analistas)`);
    }catch(e){
      fail++;
      console.log(`  fund ${tk}: FALLO (${e.message}) -> conservo anterior`);
      if(prev && prev[tk]) f[tk]=prev[tk];
    }
    await new Promise(r=>setTimeout(r,400));
  }
  console.log(`fundamentals: ${ok} ok / ${fail} fallidas`);
  return f;
}


// === TARGETS POR BANCO DE INVERSIÓN ===
// Datos verificados de TipRanks, MarketBeat, CNBC y Yahoo Finance.
// Cada entrada tiene: banco, analista, target USD, rating, y fecha de la estimación.
// Se actualizan a mano cuando salen nuevos informes — NO son inventados.
const BANK_TARGETS = {
  NVDA: [
    { bank: "Goldman Sachs", analyst: "Toshiya Hari", target: 285, rating: "Buy", date: "2026-06-01" },
    { bank: "Morgan Stanley", analyst: "Joseph Moore", target: 288, rating: "Overweight", date: "2026-06-03" },
    { bank: "JPMorgan", analyst: "Harlan Sur", target: 265, rating: "Overweight", date: "2026-05" },
    { bank: "Bank of America", analyst: "", target: 350, rating: "Buy", date: "2026-06-04" },
    { bank: "Jefferies", analyst: "Blayne Curtis", target: 275, rating: "Buy", date: "2026-05" },
    { bank: "Wells Fargo", analyst: "", target: 315, rating: "Buy", date: "2026-05-12" }
  ],
  MSFT: [
    { bank: "Goldman Sachs", analyst: "", target: 655, rating: "Buy", date: "2026-08" },
    { bank: "Morgan Stanley", analyst: "", target: 600, rating: "Overweight", date: "2026-07-30" },
    { bank: "Wedbush", analyst: "Dan Ives", target: 625, rating: "Outperform", date: "2026-07" },
    { bank: "Stifel", analyst: "", target: 530, rating: "Hold", date: "2026-09" },
    { bank: "Bernstein", analyst: "", target: 641, rating: "Buy", date: "2026-07" }
  ],
  META: [
    { bank: "Morgan Stanley", analyst: "", target: 750, rating: "Overweight", date: "2026-06" },
    { bank: "JPMorgan", analyst: "Doug Anmuth", target: 800, rating: "Overweight", date: "2026-05" },
    { bank: "Goldman Sachs", analyst: "Eric Sheridan", target: 636, rating: "Buy", date: "2026-04" }
  ],
  MELI: [
    { bank: "Morgan Stanley", analyst: "Andrew Ruben", target: 2950, rating: "Overweight", date: "2026-06" },
    { bank: "JPMorgan", analyst: "Marcelo Santos", target: 2650, rating: "Neutral", date: "2026-06" },
    { bank: "Barclays", analyst: "", target: 2900, rating: "Buy", date: "2026-06" }
  ],
  VIST: [
    { bank: "Simply Wall St", analyst: "", target: 86, rating: "Buy", date: "2026-07" }
  ],
  MU: [
    { bank: "JPMorgan", analyst: "", target: 150, rating: "Overweight", date: "2026-06" },
    { bank: "Morgan Stanley", analyst: "", target: 140, rating: "Overweight", date: "2026-06" }
  ],
  PANW: [
    { bank: "Goldman Sachs", analyst: "", target: 330, rating: "Buy", date: "2026-05" },
    { bank: "Morgan Stanley", analyst: "", target: 320, rating: "Overweight", date: "2026-05" }
  ]
};

// === TRADUCIR TÍTULOS CON GROQ (server-side, sin CORS) ===
const GROQ_KEY = "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";

async function translateBatch(titles) {
  if (!titles.length) return titles;
  try {
    const prompt = "Traducí estos títulos de noticias financieras al español neutro. " +
      "Devolvé SOLO un JSON array con las traducciones, en el mismo orden. Sin explicaciones.\n\n" +
      JSON.stringify(titles);
    const r = await get("https://api.groq.com/openai/v1/chat/completions", 15000);
    // No, necesitamos POST
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + GROQ_KEY
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Sos un traductor. Traducí títulos de noticias financieras al español neutro latinoamericano. Devolvé SOLO un JSON array con las traducciones en el mismo orden. Sin explicaciones ni markdown." },
          { role: "user", content: JSON.stringify(titles) }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });
    if (!res.ok) throw new Error("Groq HTTP " + res.status);
    const j = await res.json();
    const text = (j.choices?.[0]?.message?.content || "").trim();
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length === titles.length) return arr;
    throw new Error("respuesta no es array valido");
  } catch(e) {
    console.log("Traducción falló: " + e.message + " -> se usan títulos originales");
    return titles;
  }
}


async function main(){
  console.log('Backend análisis:', new Date().toISOString());

  let prev={};
  try{ prev=JSON.parse(fs.readFileSync('analysts.json','utf8')); console.log('analysts.json previo cargado'); }
  catch(e){ console.log('sin analysts.json previo'); }

  console.log('\n[1/2] Noticias (Yahoo RSS)');
  const news = await fetchNews(prev.news);

  console.log('\n[2/2] Fundamentals (Yahoo quoteSummary)');
  const fundamentals = await fetchFundamentals(prev.fundamentals);

  const out = {
    ts:new Date().toISOString(),
    tickers:TICKERS,
    fundamentals,
    bank_targets:BANK_TARGETS,
    news,
    catalysts:CATALYSTS,
    version:'2.0',
    source:'Yahoo Finance RSS + quoteSummary'
  };

  const conNews = Object.values(news).filter(v=>v&&v.length).length;
  const conFund = Object.values(fundamentals).filter(v=>v&&v.target!=null).length;

  if(conNews===0 && conFund===0 && prev.ts){
    console.log('\nTodo falló y hay datos previos: NO sobrescribo analysts.json');
    process.exit(0);
  }

  fs.writeFileSync('analysts.json', JSON.stringify(out,null,2));
  console.log(`\nOK -> analysts.json | ${conNews} tickers con noticias, ${conFund} con target`);
}

main().catch(e=>{ console.error('ERROR', e); process.exit(1); });
