(function(){
  "use strict";
  var D=null;
  var RATIO={ADBE:44,MELI:120,MSFT:30,MU:5,NVDA:24,PANW:50,SPY:60,ACN:75,MCD:24,META:24,NU:2,IBIT:10,ICLN:5,PAMP:25,GGAL:10,YPF:1,BMA:10,VIST:3,IOLCAMA:1,IOLDOLD:1,AL30D:1};
  var RE={"Buy":"Comprar","Strong Buy":"Compra Fuerte","Overweight":"Sobreponderar","Outperform":"Superar","Hold":"Mantener","Neutral":"Neutral","Underweight":"Infraponderar","Sell":"Vender","Reduce":"Reducir","strong_buy":"Compra Fuerte","buy":"Comprar","hold":"Mantener","underperform":"Bajo Rendimiento","sell":"Vender"};
  function trR(r){return RE[r]||r||"—"}
  async function load(){try{var r=await fetch("analysts.json?t="+Date.now());if(r.ok)D=await r.json();}catch(e){}}
  function fmt(n){return n==null||isNaN(n)?"—":"$"+Number(n).toLocaleString("es-AR",{maximumFractionDigits:0})}
  function fU(n){return n==null||isNaN(n)?"":"$"+Number(n).toFixed(1)}
  function pct(a,b){if(!b||!a||isNaN(a)||isNaN(b))return null;return((a-b)/b*100).toFixed(1)}
  function getCCL(){try{var p=JSON.parse(localStorage.getItem("prices_data"));return p&&p.ccl?p.ccl:1560;}catch(e){return 1560;}}
  function u2a(usd,tk){return Math.round(usd/(RATIO[tk]||1)*getCCL());}
  function realUSD(tk){var f=(D&&D.fundamentals||{})[tk];if(f&&f.price>0)return f.price;try{var p=JSON.parse(localStorage.getItem("prices_data"));var x=(p&&p.prices||{})[tk];if(x&&x.ars>0)return Math.round(x.ars*(RATIO[tk]||1)/(p.ccl||1560)*100)/100;}catch(e){}return 0;}

  function evalModal(tk){
    var old=document.getElementById("eval-modal");if(old)old.remove();
    var f=(D&&D.fundamentals||{})[tk]||{},bk=(D&&D.bank_targets||{})[tk]||[];
    var cats=(D&&D.catalysts||{})[tk]||[],nw=(D&&D.news||{})[tk]||[];
    var info=(D&&D.tickers||{})[tk]||{};
    var port;try{port=JSON.parse(localStorage.getItem("portfolio_iol"));}catch(e){}
    var pos=(port&&port.positions||[]).find(function(p){return p.ticker===tk});
    var prices;try{prices=JSON.parse(localStorage.getItem("prices_data"));}catch(e){}
    var px=(prices&&prices.prices||{})[tk],arsN=px?px.ars:0,uR=realUSD(tk);
    var tgt=f.target,tH=f.targetHigh,tL=f.targetLow;
    var tA=tgt?u2a(tgt,tk):null,tHA=tH?u2a(tH,tk):null,tLA=tL?u2a(tL,tk):null;
    var zona="SIN DATOS",zC="#888";
    if(uR>0&&tgt){if(uR<(tL||tgt*0.85)){zona="ZONA DE COMPRA";zC="#4CAF50";}else if(uR<tgt){zona="SUBVALUADA";zC="#8BC34A";}else if(uR<(tH||tgt*1.15)){zona="PRECIO JUSTO";zC="#FFD700";}else{zona="SOBREVALUADA";zC="#F44336";}}
    var gP=pos&&pos.ppc>0&&arsN>0?pct(arsN,pos.ppc):null;
    var uP=tgt&&uR>0?pct(tgt,uR):null;
    var h='<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10002;overflow-y:auto;padding:12px"><div style="max-width:640px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div><h2 style="color:#fff;margin:0;font-size:20px">'+tk+" — "+(info.name||tk)+'</h2><div style="color:#888;font-size:12px">'+(info.sector||"")+"</div></div>";
    h+='<button id="eval-close" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button></div>';
    h+='<div style="background:'+zC+'22;border:2px solid '+zC+';border-radius:12px;padding:14px;text-align:center;margin-bottom:14px"><div style="font-size:22px;font-weight:900;color:'+zC+'">'+zona+"</div>";
    if(tA&&uP)h+='<div style="color:#ccc;font-size:14px">Objetivo: '+fmt(tA)+" ARS ("+(uP>0?"+":"")+uP+'%)</div><div style="color:#666;font-size:12px">'+fU(tgt)+' USD</div>';
    else h+='<div style="color:#888;font-size:13px">El workflow Update Analysis Data carga datos de Yahoo</div>';
    h+="</div>";
    h+='<div style="display:flex;gap:8px;margin-bottom:14px"><div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center"><div style="color:#888;font-size:11px">Precio Actual</div><div style="color:#fff;font-size:18px;font-weight:700">'+fmt(arsN)+' ARS</div>'+(uR?'<div style="color:#666;font-size:12px">'+fU(uR)+' USD</div>':"")+"</div>";
    if(pos)h+='<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center"><div style="color:#888;font-size:11px">Mi PPC</div><div style="color:#fff;font-size:18px;font-weight:700">'+fmt(pos.ppc)+' ARS</div>'+(gP?'<div style="color:'+(gP>=0?"#4CAF50":"#F44336")+';font-size:12px;font-weight:700">'+(gP>=0?"+":"")+gP+"%</div>":"")+"</div>";
    h+="</div>";
    if(tLA||tA||tHA){h+='<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">\ud83c\udfaf Precio Objetivo por Perfil</h3><div style="display:flex;gap:8px;margin-bottom:14px">';
      if(tLA)h+='<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #4CAF50"><div style="color:#888;font-size:11px">Conservador</div><div style="color:#4CAF50;font-size:16px;font-weight:900">'+fmt(tLA)+'</div><div style="color:#666;font-size:11px">'+fU(tL)+' USD</div></div>';
      if(tA)h+='<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #FFD700"><div style="color:#888;font-size:11px">Moderado</div><div style="color:#FFD700;font-size:16px;font-weight:900">'+fmt(tA)+'</div><div style="color:#666;font-size:11px">'+fU(tgt)+' USD</div></div>';
      if(tHA)h+='<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #FF5722"><div style="color:#888;font-size:11px">Agresivo</div><div style="color:#FF5722;font-size:16px;font-weight:900">'+fmt(tHA)+'</div><div style="color:#666;font-size:11px">'+fU(tH)+' USD</div></div>';
      h+="</div>";}
    if(f.pe||f.consensus){h+='<div style="background:#0d1117;border-radius:8px;padding:10px;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap">';
      if(f.consensus)h+='<div><span style="color:#888;font-size:11px">Consenso</span><div style="color:#fff;font-weight:700">'+trR(f.consensus)+"</div></div>";
      if(f.analysts)h+='<div><span style="color:#888;font-size:11px">Analistas</span><div style="color:#fff;font-weight:700">'+f.analysts+"</div></div>";
      if(f.pe)h+='<div><span style="color:#888;font-size:11px">P/E</span><div style="color:#fff;font-weight:700">'+f.pe.toFixed(1)+"x</div></div>";
      if(f.forwardPE)h+='<div><span style="color:#888;font-size:11px">P/E Fwd</span><div style="color:#fff;font-weight:700">'+f.forwardPE.toFixed(1)+"x</div></div>";
      h+='<div style="width:100%;color:#555;font-size:10px">Fuente: '+(f.source||"Yahoo Finance")+"</div></div>";}
    if(bk.length){h+='<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">\ud83c\udfe6 Bancos de Inversi\u00f3n</h3><div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">';
      bk.forEach(function(b){var bA=u2a(b.target,tk);var up=uR>0?pct(b.target,uR):null;var c=/Buy|Overweight|Outperform/.test(b.rating)?"#4CAF50":/Hold|Neutral/.test(b.rating)?"#FFD700":"#F44336";
        h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#0d1117;border-radius:6px;border-left:3px solid '+c+'"><div><div style="color:#fff;font-weight:600;font-size:13px">'+b.bank+"</div>"+'<div style="color:#888;font-size:11px">'+(b.analyst?b.analyst+" \u00b7 ":"")+trR(b.rating)+" \u00b7 "+b.date+"</div></div>"+'<div style="text-align:right"><div style="color:#fff;font-weight:700;font-size:15px">'+fmt(bA)+"</div>"+'<div style="color:#666;font-size:11px">'+fU(b.target)+" USD</div>"+(up?'<div style="color:'+(up>0?"#4CAF50":"#F44336")+';font-size:11px">'+(up>0?"+":"")+up+"%</div>":"")+"</div></div>";});
      h+="</div>";}
    if(cats.length){h+='<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">\ud83d\udcc5 Pr\u00f3ximos Eventos</h3>';
      cats.forEach(function(e){var d=Math.round((new Date(e.date+"T00:00:00")-new Date())/86400000);h+='<div style="padding:8px 10px;background:#0d1117;border-radius:6px;border-left:3px solid '+(e.importance==="high"?"#F44336":"#FF9800")+';margin-bottom:6px;display:flex;justify-content:space-between"><span style="color:#fff">'+e.event+'</span><span style="color:'+(d<=3?"#F44336":"#FF9800")+';font-weight:700;font-size:13px">'+(d===0?"HOY":d===1?"Ma\u00f1ana":d>0?"En "+d+" d\u00edas":"Pasado")+"</span></div>";});}
    if(nw.length){h+='<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">\ud83d\udcf0 Noticias</h3><div style="display:flex;flex-direction:column;gap:6px">';
      nw.slice(0,4).forEach(function(n){h+='<a href="'+n.url+'" target="_blank" style="display:block;padding:8px 10px;background:#0d1117;border-radius:6px;text-decoration:none;border-left:3px solid #64B5F6"><div style="color:#fff;font-weight:600;font-size:13px">'+(n.titleEs||n.title)+"</div>"+(n.titleEs&&n.titleEs!==n.title?'<div style="color:#555;font-size:11px;font-style:italic">'+n.title+"</div>":"")+'<div style="color:#64B5F6;font-size:10px;margin-top:2px">'+(n.source||"Yahoo Finance")+"</div></a>";});
      h+="</div>";}
    h+='<div style="margin-top:16px;display:flex;gap:8px"><button id="eval-chart" style="flex:1;padding:10px;background:#1976D2;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">\ud83d\udcc8 Ver Gr\u00e1fico</button><button id="eval-close2" style="flex:1;padding:10px;background:#333;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">Cerrar</button></div>';
    h+="</div></div>";
    var m=document.createElement("div");m.id="eval-modal";m.innerHTML=h;
    document.body.appendChild(m);
    m.querySelector("#eval-close").onclick=function(){m.remove();};
    m.querySelector("#eval-close2").onclick=function(){m.remove();};
    m.querySelector("#eval-chart").onclick=function(){m.remove();if(window._openChart)window._openChart(tk);};
  }

  function showDiscovery(){
    var old=document.getElementById("disc-modal");if(old)old.remove();
    var disc=D&&D.discovery?D.discovery:{};var dnews=D&&D.discovery_news?D.discovery_news:{};
    var info=disc.info||{};var tks=disc.tickers||Object.keys(dnews);
    if(!tks.length&&!Object.keys(dnews).length){alert("Sin datos discovery. El workflow los carga automaticamente.");return;}
    var h='<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10002;overflow-y:auto;padding:12px"><div style="max-width:700px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2 style="color:#fff;margin:0;font-size:20px">\ud83d\udd0d Descubrimientos</h2><button id="disc-close" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button></div>';
    h+='<div style="color:#888;font-size:13px;margin-bottom:14px">Empresas destacadas fuera de tu cartera. Noticias reales de Yahoo Finance traducidas al espa\u00f1ol.</div>';
    tks.forEach(function(tk){var nws=dnews[tk]||[];var inf=info[tk]||{};if(!nws.length)return;
      h+='<div style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="color:#fff;font-weight:700;font-size:16px">'+tk+'</span><span style="color:#888;font-size:12px">'+(inf.name||"")+'</span><span style="color:#FF9800;font-size:11px;background:#FF980022;padding:2px 6px;border-radius:4px">'+(inf.sector||"")+"</span></div>";
      nws.slice(0,3).forEach(function(n){h+='<a href="'+n.url+'" target="_blank" style="display:block;padding:6px 10px;background:#0d1117;border-radius:6px;text-decoration:none;border-left:3px solid #FF9800;margin-bottom:4px"><div style="color:#fff;font-size:13px">'+(n.titleEs||n.title)+"</div>"+(n.titleEs&&n.titleEs!==n.title?'<div style="color:#555;font-size:10px;font-style:italic">'+n.title+"</div>":"")+'<div style="color:#FF9800;font-size:10px">'+(n.source||"Yahoo Finance")+"</div></a>";});
      h+="</div>";});
    h+='<button id="disc-close2" style="width:100%;padding:10px;background:#333;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-top:8px">Cerrar</button></div></div>';
    var m=document.createElement("div");m.id="disc-modal";m.innerHTML=h;document.body.appendChild(m);
    m.querySelector("#disc-close").onclick=function(){m.remove();};
    m.querySelector("#disc-close2").onclick=function(){m.remove();};
  }

  function banner(){var msgs=[];try{var pr=JSON.parse(localStorage.getItem("prices_data"));if(pr){var v=Object.keys(pr.prices||{}).filter(function(k){return pr.prices[k].stale;});var hr=pr.ts?(Date.now()-new Date(pr.ts).getTime())/3600000:999;if(v.length)msgs.push({t:"warn",x:"\u26a0 Precio desactualizado en "+v.length+" activo"+(v.length>1?"s":"")});else if(hr>24)msgs.push({t:"warn",x:"\u26a0 Precios sin actualizar hace "+Math.round(hr)+" horas"});}}catch(e){}
    if(D&&D.catalysts){var hoy=new Date();hoy.setHours(0,0,0,0);Object.keys(D.catalysts).forEach(function(tk){(D.catalysts[tk]||[]).forEach(function(ev){var dias=Math.round((new Date(ev.date+"T00:00:00")-hoy)/86400000);if(dias>=0&&dias<=3)msgs.push({t:"info",x:"\ud83d\udcc5 "+tk+" reporta "+(dias===0?"HOY":dias===1?"ma\u00f1ana":"en "+dias+" d\u00edas")+" ("+ev.event+")"});});});}
    var old=document.getElementById("inv-banner");if(old)old.remove();if(!msgs.length)return;
    var d=document.createElement("div");d.id="inv-banner";d.style.cssText="position:sticky;top:0;z-index:9998;display:flex;flex-direction:column;gap:4px;padding:8px 12px;font-size:13px";d.innerHTML=msgs.map(function(m){var c=m.t==="warn"?"#FF9800":"#64B5F6";return'<div style="background:'+c+'22;border-left:3px solid '+c+';color:'+c+';padding:6px 10px;border-radius:4px">'+m.x+"</div>";}).join("");document.body.insertBefore(d,document.body.firstChild);}

  function isCompact(el){var p=el.parentElement;if(!p)return false;var s=p.style||{};return s.display==="flex"&&s.justifyContent==="space-between";}

  function inject(){if(!D)return;var tks=D.tickers?Object.keys(D.tickers):[];if(!tks.length)try{tks=(JSON.parse(localStorage.getItem("portfolio_iol")).positions||[]).map(function(p){return p.ticker});}catch(e){}if(!tks.length)return;var set=new Set(tks);
    document.querySelectorAll("div,span,td,h1,h2,h3,h4,b,strong,p").forEach(function(el){if(el.dataset.evalDone||el.children.length)return;var txt=(el.textContent||"").trim();if(txt.length>8||!set.has(txt))return;if(!el.parentElement||el.parentElement.querySelector(".eval-btn"))return;if(isCompact(el)){el.dataset.evalDone="1";return;}
      var b=document.createElement("button");b.className="eval-btn";b.textContent="\ud83d\udcca";b.title="Evaluaci\u00f3n de "+txt;b.style.cssText="background:#9C27B0;color:#fff;border:none;border-radius:4px;width:26px;height:26px;margin-left:6px;cursor:pointer;font-size:13px;vertical-align:middle";b.onclick=function(e){e.stopPropagation();e.preventDefault();evalModal(txt);};el.parentElement.appendChild(b);el.dataset.evalDone="1";});}

  function addExportBtn(){if(document.getElementById("exp-btn"))return;var b=document.createElement("button");b.id="exp-btn";b.textContent="\ud83d\udcbe";b.title="Exportar operaciones";b.style.cssText="position:fixed;bottom:16px;right:16px;z-index:9999;background:#9C27B0;color:#fff;border:none;border-radius:50%;width:48px;height:48px;font-size:22px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)";b.onclick=function(){try{var ops=JSON.parse(localStorage.getItem("operaciones_raw")||"[]");var blob=new Blob([JSON.stringify({ts:new Date().toISOString(),total:ops.length,operaciones:ops},null,2)],{type:"application/json"});var u=URL.createObjectURL(blob);var a=document.createElement("a");a.href=u;a.download="operaciones_"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(u);}catch(e){alert(e.message);}};document.body.appendChild(b);}

  function addDiscBtn(){if(document.getElementById("disc-btn"))return;var b=document.createElement("button");b.id="disc-btn";b.textContent="\ud83d\udd0d";b.title="Descubrimientos";b.style.cssText="position:fixed;bottom:80px;right:16px;z-index:9999;background:#FF9800;color:#fff;border:none;border-radius:50%;width:48px;height:48px;font-size:22px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)";b.onclick=showDiscovery;document.body.appendChild(b);}

  window._evalModal=evalModal;
  function init(){load().then(function(){setTimeout(banner,1000);addExportBtn();addDiscBtn();setInterval(banner,60000);setInterval(inject,3000);});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
