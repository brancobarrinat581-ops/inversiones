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
