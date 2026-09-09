// scripts/analyze.js — Backend en GitHub Actions
// Genera analysts.json con: noticias traducidas, targets por banco, fundamentals de Yahoo
// REGLA: nunca pisa datos buenos. Si falla, conserva lo anterior.
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
  YPF:{name:"YPF",sector:"Energía Argentina"}
};

const CATALYSTS = {
  ADBE:[{date:"2026-09-10",event:"Q3 FY2026 Earnings",type:"earnings",importance:"high"}],
  ACN:[{date:"2026-09-24",event:"Q4 FY2026 Earnings",type:"earnings",importance:"high"}],
  MSFT:[{date:"2026-10-27",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}],
  META:[{date:"2026-10-28",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  MCD:[{date:"2026-10-28",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}],
  MELI:[{date:"2026-11-05",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  VIST:[{date:"2026-11-10",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}],
  NU:[{date:"2026-11-12",event:"Q3 2026 Earnings",type:"earnings",importance:"high"}],
  PAMP:[{date:"2026-11-12",event:"Q3 2026 Earnings",type:"earnings",importance:"medium"}],
  PANW:[{date:"2026-11-19",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}],
  NVDA:[{date:"2026-11-25",event:"Q3 FY2027 Earnings",type:"earnings",importance:"high"}],
  MU:[{date:"2026-12-18",event:"Q1 FY2027 Earnings",type:"earnings",importance:"high"}]
};

// TARGETS POR BANCO — Datos verificados de TipRanks, CNBC, Yahoo Finance, MarketBeat.
// Fecha de cada estimación incluida. Se actualizan cuando salen nuevos informes.
const BANK_TARGETS = {
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

// === HELPERS ===
async function get(url, timeout=10000) {
  const c=new AbortController(); const id=setTimeout(()=>c.abort(),timeout);
  try {
    const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; InvBot/2.0)','Accept':'*/*'}});
    clearTimeout(id);
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r;
  } catch(e){ clearTimeout(id); throw e; }
}

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

// === 1. NOTICIAS (Yahoo RSS) ===
async function fetchNews(prev){
  const news={}; let ok=0,fail=0;
  for(const tk of Object.keys(TICKERS)){
    try{
      const r=await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tk}&region=US&lang=en-US`);
      const items=parseRSS(await r.text()).slice(0,5);
      if(items.length){news[tk]=items;ok++;console.log(`  news ${tk}: ${items.length}`);}
      else throw new Error('feed vacío');
    }catch(e){
      fail++;
      if(prev&&prev[tk]&&prev[tk].length) news[tk]=prev[tk];
    }
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(`Noticias: ${ok} ok / ${fail} fallidas`);
  return news;
}

// === 2. TRADUCIR CON GROQ (server-side) ===
const GROQ_KEY="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";
async function translateBatch(titles){
  if(!titles.length) return titles;
  try{
    const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+GROQ_KEY},
      body:JSON.stringify({
        model:"llama-3.3-70b-versatile",
        messages:[
          {role:"system",content:"Traducí estos títulos de noticias financieras al español neutro. Devolvé SOLO un JSON array con las traducciones, en el mismo orden. Sin explicaciones ni markdown."},
          {role:"user",content:JSON.stringify(titles)}
        ],
        max_tokens:2000, temperature:0.1
      })
    });
    if(!r.ok) throw new Error("Groq HTTP "+r.status);
    const j=await r.json();
    const text=(j.choices?.[0]?.message?.content||"").trim();
    const arr=JSON.parse(text);
    if(Array.isArray(arr)&&arr.length===titles.length) return arr;
    throw new Error("respuesta inválida");
  }catch(e){
    console.log("  Traducción falló: "+e.message);
    return titles;
  }
}

async function translateNews(news){
  const allT=[],map=[];
  Object.entries(news).forEach(([tk,items])=>{
    (items||[]).forEach((item,i)=>{
      if(item.title&&!/[áéíóúñ¿¡]/.test(item.title)){
        allT.push(item.title); map.push({tk,i});
      }
    });
  });
  if(!allT.length) return;
  console.log(`Traduciendo ${allT.length} títulos...`);
  for(let b=0;b<allT.length;b+=10){
    const batch=allT.slice(b,b+10);
    const tr=await translateBatch(batch);
    tr.forEach((t,j)=>{
      const{tk,i}=map[b+j];
      if(news[tk]&&news[tk][i]) news[tk][i].titleEs=t;
    });
    if(b+10<allT.length) await new Promise(r=>setTimeout(r,500));
  }
  const ok=Object.values(news).flat().filter(n=>n.titleEs).length;
  console.log(`Traducidas: ${ok} de ${allT.length}`);
}

// === 3. FUNDAMENTALS (Yahoo quoteSummary) ===
async function fetchFundamentals(prev){
  const f={}; let ok=0,fail=0;
  for(const tk of Object.keys(TICKERS)){
    try{
      const r=await get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${tk}?modules=financialData,defaultKeyStatistics,summaryDetail`);
      const res=(await r.json())?.quoteSummary?.result?.[0];
      if(!res) throw new Error('sin datos');
      const fd=res.financialData||{},dks=res.defaultKeyStatistics||{},sd=res.summaryDetail||{};
      const row={
        price:fd.currentPrice?.raw??null,
        target:fd.targetMeanPrice?.raw??null,
        targetHigh:fd.targetHighPrice?.raw??null,
        targetLow:fd.targetLowPrice?.raw??null,
        consensus:fd.recommendationKey??null,
        analysts:fd.numberOfAnalystOpinions?.raw??null,
        pe:sd.trailingPE?.raw??null,
        forwardPE:sd.forwardPE?.raw??null,
        peg:dks.pegRatio?.raw??null,
        source:'Yahoo Finance',
        updated:new Date().toISOString()
      };
      if(row.target==null&&row.pe==null) throw new Error('campos vacíos');
      f[tk]=row; ok++;
      console.log(`  fund ${tk}: target=$${row.target} pe=${row.pe?.toFixed(1)} cons=${row.consensus}`);
    }catch(e){
      fail++;
      if(prev&&prev[tk]) f[tk]=prev[tk];
    }
    await new Promise(r=>setTimeout(r,400));
  }
  console.log(`Fundamentals: ${ok} ok / ${fail} fallidas`);
  return f;
}

// === MAIN ===
// === EMPRESAS DISCOVERY (fuera de cartera, para ampliar panorama) ===
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

async function fetchDiscoveryNews(prev){
  const news={};
  let ok=0;
  for(const tk of Object.keys(DISCOVERY)){
    try{
      const r=await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tk}&region=US&lang=en-US`);
      const items=parseRSS(await r.text()).slice(0,4);
      if(items.length){news[tk]=items;ok++;}
    }catch(e){
      if(prev&&prev[tk])news[tk]=prev[tk];
    }
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(`Discovery news: ${ok} tickers`);
  return news;
}


async function main(){
  console.log('=== Backend Análisis ===', new Date().toISOString());

  let prev={};
  try{prev=JSON.parse(fs.readFileSync('analysts.json','utf8'));console.log('Previo cargado');}
  catch(e){console.log('Sin previo');}

  console.log('\n[1/4] Noticias cartera (Yahoo RSS)');
  const news=await fetchNews(prev.news);

  console.log('\n[2/4] Noticias discovery');
  const discoveryNews=await fetchDiscoveryNews((prev.discovery_news||{}));

  console.log('\n[3/4] Traducción (Groq)');
  await translateNews(news);
  await translateNews(discoveryNews);

  console.log('\n[4/4] Fundamentals (Yahoo)');
  const fundamentals=await fetchFundamentals(prev.fundamentals);

  const out={
    ts:new Date().toISOString(),
    tickers:TICKERS,
    fundamentals,
    bank_targets:BANK_TARGETS,
    news,
    catalysts:CATALYSTS,
    version:'3.0',
    source:'Yahoo Finance + Groq + Bancos verificados'
  };

  const cn=Object.values(news).filter(v=>v&&v.length).length;
  const cf=Object.values(fundamentals).filter(v=>v&&v.target!=null).length;

  if(cn===0&&cf===0&&prev.ts){
    console.log('\nTodo falló. No sobrescribo.');
    process.exit(0);
  }

  fs.writeFileSync('analysts.json',JSON.stringify(out,null,2));
  console.log(`\nOK -> analysts.json | ${cn} noticias, ${cf} fundamentals, ${Object.keys(BANK_TARGETS).length} con bancos`);
}

main().catch(e=>{console.error('ERROR',e);process.exit(1);});
