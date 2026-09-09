// catalysts-ui.js v3 — Evaluación de cartera, noticias traducidas, analistas por banco
// Se inyecta en "Mi Cartera" como panel de evaluación, NO en Recomendaciones.
(function(){
  "use strict";
  var D = null; // analysts data

  async function load(){
    try{
      var r=await fetch("analysts.json?t="+Date.now());
      if(r.ok){D=await r.json();console.log("Análisis cargados:",D.ts);}
    }catch(e){}
  }

  // === UTILIDADES ===
  function fmt(n){return n==null?"—":"$"+Number(n).toLocaleString("es-AR",{maximumFractionDigits:0})}
  function pct(a,b){return b?((a-b)/b*100).toFixed(1):null}
  function CON(k){return{strong_buy:"Compra Fuerte",buy:"Comprar",hold:"Mantener",underperform:"Bajo Rendimiento",sell:"Vender"}[k]||k||"—"}

  // === MODAL: EVALUACIÓN COMPLETA DE UN ACTIVO ===
  function evalModal(tk){
    var old=document.getElementById("eval-modal"); if(old) old.remove();
    var fund=(D&&D.fundamentals||{})[tk]||{};
    var banks=(D&&D.bank_targets||{})[tk]||[];
    var cats=(D&&D.catalysts||{})[tk]||[];
    var news=(D&&D.news||{})[tk]||[];
    var info=(D&&D.tickers||{})[tk]||{};

    // Portfolio data
    var port; try{port=JSON.parse(localStorage.getItem("portfolio_iol"));}catch(e){}
    var pos=(port&&port.positions||[]).find(function(p){return p.ticker===tk});
    var prices; try{prices=JSON.parse(localStorage.getItem("prices_data"));}catch(e){}
    var px=(prices&&prices.prices||{})[tk];
    var arsNow=px?px.ars:0, usdNow=fund.price||px?.usd||0;

    // Evaluación
    var tgt=fund.target, tgtH=fund.targetHigh, tgtL=fund.targetLow;
    var upside=pct(tgt,usdNow);
    var zona="—", zonaColor="#888";
    if(usdNow>0&&tgt){
      if(usdNow<(tgtL||tgt*0.85)){zona="ZONA DE COMPRA";zonaColor="#4CAF50";}
      else if(usdNow<tgt){zona="SUBVALUADA";zonaColor="#8BC34A";}
      else if(usdNow<(tgtH||tgt*1.15)){zona="PRECIO JUSTO";zonaColor="#FFD700";}
      else{zona="SOBREVALUADA";zonaColor="#F44336";}
    }

    var ganPct=pos&&pos.ppc>0?pct(arsNow,pos.ppc):null;

    var m=document.createElement("div"); m.id="eval-modal";
    m.innerHTML=
    '<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10002;overflow-y:auto;padding:12px">'+
    '<div style="max-width:640px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">'+

    // Header
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
      '<div><h2 style="color:#fff;margin:0;font-size:20px">'+tk+' — '+(info.name||tk)+'</h2>'+
      '<div style="color:#888;font-size:12px">'+( info.sector||"")+'</div></div>'+
      '<button onclick="document.getElementById(\'eval-modal\').remove()" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">✕</button>'+
    '</div>'+

    // Zona
    '<div style="background:'+zonaColor+'22;border:2px solid '+zonaColor+';border-radius:12px;padding:14px;text-align:center;margin-bottom:14px">'+
      '<div style="font-size:22px;font-weight:900;color:'+zonaColor+'">'+zona+'</div>'+
      (upside?'<div style="color:#ccc;font-size:14px">Target promedio: $'+tgt?.toFixed(0)+' USD ('+(upside>0?"+":"")+upside+'%)</div>':'')+
    '</div>'+

    // Precios
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
      '<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center">'+
        '<div style="color:#888;font-size:11px">Precio Actual</div>'+
        '<div style="color:#fff;font-size:18px;font-weight:700">'+fmt(arsNow)+' ARS</div>'+
        (usdNow?'<div style="color:#666;font-size:12px">$'+usdNow.toFixed(1)+' USD</div>':'')+
      '</div>'+
      (pos?'<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center">'+
        '<div style="color:#888;font-size:11px">Mi PPC</div>'+
        '<div style="color:#fff;font-size:18px;font-weight:700">'+fmt(pos.ppc)+' ARS</div>'+
        (ganPct?'<div style="color:'+(ganPct>=0?"#4CAF50":"#F44336")+';font-size:12px;font-weight:700">'+(ganPct>=0?"+":"")+ganPct+'%</div>':'')+
      '</div>':'')+
    '</div>'+

    // 3 Perfiles
    (tgtL||tgt||tgtH?
    '<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">🎯 Precio Objetivo por Perfil</h3>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
      (tgtL?'<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #4CAF50"><div style="color:#888;font-size:11px">Conservador</div><div style="color:#4CAF50;font-size:18px;font-weight:900">$'+tgtL.toFixed(0)+'</div>'+(usdNow?'<div style="color:#666;font-size:11px">'+pct(tgtL,usdNow)+'%</div>':'')+'</div>':'')+
      (tgt?'<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #FFD700"><div style="color:#888;font-size:11px">Moderado</div><div style="color:#FFD700;font-size:18px;font-weight:900">$'+tgt.toFixed(0)+'</div>'+(usdNow?'<div style="color:#666;font-size:11px">'+pct(tgt,usdNow)+'%</div>':'')+'</div>':'')+
      (tgtH?'<div style="flex:1;background:#0d1117;border-radius:8px;padding:10px;text-align:center;border-top:3px solid #FF5722"><div style="color:#888;font-size:11px">Agresivo</div><div style="color:#FF5722;font-size:18px;font-weight:900">$'+tgtH.toFixed(0)+'</div>'+(usdNow?'<div style="color:#666;font-size:11px">'+pct(tgtH,usdNow)+'%</div>':'')+'</div>':'')+
    '</div>':'')+

    // Fundamentals
    (fund.pe||fund.consensus?
    '<div style="background:#0d1117;border-radius:8px;padding:10px;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap">'+
      (fund.consensus?'<div><span style="color:#888;font-size:11px">Consenso</span><div style="color:#fff;font-weight:700">'+CON(fund.consensus)+'</div></div>':'')+
      (fund.analysts?'<div><span style="color:#888;font-size:11px">Analistas</span><div style="color:#fff;font-weight:700">'+fund.analysts+'</div></div>':'')+
      (fund.pe?'<div><span style="color:#888;font-size:11px">P/E</span><div style="color:#fff;font-weight:700">'+fund.pe.toFixed(1)+'x</div></div>':'')+
      (fund.forwardPE?'<div><span style="color:#888;font-size:11px">P/E Fwd</span><div style="color:#fff;font-weight:700">'+fund.forwardPE.toFixed(1)+'x</div></div>':'')+
      '<div style="width:100%;color:#555;font-size:10px">Fuente: '+(fund.source||"Yahoo Finance")+'</div>'+
    '</div>':'')+

    // Bancos
    (banks.length?
    '<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">🏦 Bancos de Inversión</h3>'+
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">'+
    banks.map(function(b){
      var up=pct(b.target,usdNow);
      var c=b.rating==="Buy"||b.rating==="Overweight"||b.rating==="Outperform"?"#4CAF50":b.rating==="Hold"||b.rating==="Neutral"?"#FFD700":"#F44336";
      return'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#0d1117;border-radius:6px;border-left:3px solid '+c+'">'+
        '<div><div style="color:#fff;font-weight:600;font-size:13px">'+b.bank+'</div>'+
        '<div style="color:#888;font-size:11px">'+(b.analyst||"")+' · '+b.rating+' · '+b.date+'</div></div>'+
        '<div style="text-align:right"><div style="color:#fff;font-weight:700;font-size:15px">$'+b.target+'</div>'+
        (up?'<div style="color:'+(up>0?"#4CAF50":"#F44336")+';font-size:11px">'+(up>0?"+":"")+up+'%</div>':'')+
      '</div></div>';
    }).join("")+
    '</div>':'')+

    // Earnings
    (cats.length?
    '<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">📅 Próximos Eventos</h3>'+
    cats.map(function(e){
      var dias=Math.round((new Date(e.date+"T00:00:00")-new Date())/86400000);
      return'<div style="padding:8px 10px;background:#0d1117;border-radius:6px;border-left:3px solid '+(e.importance==="high"?"#F44336":"#FF9800")+';margin-bottom:6px;display:flex;justify-content:space-between">'+
        '<span style="color:#fff">'+e.event+'</span>'+
        '<span style="color:'+(dias<=3?"#F44336":"#FF9800")+';font-weight:700;font-size:13px">'+(dias===0?"HOY":dias===1?"Mañana":dias>0?"En "+dias+" días":"Pasado")+'</span></div>';
    }).join(""):'') +

    // Noticias
    (news.length?
    '<h3 style="color:#fff;margin:14px 0 8px;font-size:15px">📰 Últimas Noticias</h3>'+
    '<div style="display:flex;flex-direction:column;gap:6px">'+
    news.slice(0,4).map(function(n){
      return'<a href="'+n.url+'" target="_blank" style="display:block;padding:8px 10px;background:#0d1117;border-radius:6px;text-decoration:none;border-left:3px solid #64B5F6">'+
        '<div style="color:#fff;font-weight:600;font-size:13px">'+(n.titleEs||n.title)+'</div>'+
        (n.titleEs&&n.titleEs!==n.title?'<div style="color:#555;font-size:11px;font-style:italic">'+n.title+'</div>':'')+
        '<div style="color:#64B5F6;font-size:10px;margin-top:2px">'+(n.source||"Yahoo Finance")+'</div>'+
      '</a>';
    }).join("")+
    '</div>':'')+

    // Botón gráfico
    '<div style="margin-top:16px;display:flex;gap:8px">'+
      '<button onclick="document.getElementById(\'eval-modal\').remove();window._openChart&&window._openChart(\''+tk+'\')" style="flex:1;padding:10px;background:#1976D2;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">📈 Ver Gráfico</button>'+
      '<button onclick="document.getElementById(\'eval-modal\').remove()" style="flex:1;padding:10px;background:#333;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">Cerrar</button>'+
    '</div>'+

    '</div></div>';
    document.body.appendChild(m);
  }

  // === BANNER ===
  function banner(){
    var msgs=[];
    try{
      var pr=JSON.parse(localStorage.getItem("prices_data"));
      if(pr){
        var v=Object.keys(pr.prices||{}).filter(function(k){return pr.prices[k].stale;});
        var h=pr.ts?(Date.now()-new Date(pr.ts).getTime())/3600000:999;
        if(v.length) msgs.push({t:"warn",x:"⚠ Precio desactualizado en "+v.length+" activo"+(v.length>1?"s":"")});
        else if(h>24) msgs.push({t:"warn",x:"⚠ Precios sin actualizar hace "+Math.round(h)+" horas"});
      }
    }catch(e){}
    if(D&&D.catalysts){
      var hoy=new Date(); hoy.setHours(0,0,0,0);
      Object.keys(D.catalysts).forEach(function(tk){
        (D.catalysts[tk]||[]).forEach(function(ev){
          var dias=Math.round((new Date(ev.date+"T00:00:00")-hoy)/86400000);
          if(dias>=0&&dias<=3) msgs.push({t:"info",x:"📅 "+tk+" reporta "+(dias===0?"HOY":dias===1?"mañana":"en "+dias+" días")+" ("+ev.event+")"});
        });
      });
    }
    var old=document.getElementById("inv-banner"); if(old) old.remove();
    if(!msgs.length) return;
    var d=document.createElement("div"); d.id="inv-banner";
    d.style.cssText="position:sticky;top:0;z-index:9998;display:flex;flex-direction:column;gap:4px;padding:8px 12px;font-size:13px";
    d.innerHTML=msgs.map(function(m){
      var c=m.t==="warn"?"#FF9800":"#64B5F6";
      return'<div style="background:'+c+'22;border-left:3px solid '+c+';color:'+c+';padding:6px 10px;border-radius:4px">'+m.x+'</div>';
    }).join("");
    document.body.insertBefore(d,document.body.firstChild);
  }

  // === NO inyectar en listas compactas ===
  function isCompact(el){
    var p=el.parentElement; if(!p) return false;
    var s=p.style||{};
    if(s.display==="flex"&&s.justifyContent==="space-between") return true;
    return false;
  }

  // === INYECTAR BOTÓN DE EVALUACIÓN ===
  function inject(){
    if(!D) return;
    var tks=D.tickers?Object.keys(D.tickers):[];
    if(!tks.length) try{tks=(JSON.parse(localStorage.getItem("portfolio_iol")).positions||[]).map(function(p){return p.ticker});}catch(e){}
    if(!tks.length) return;
    var set=new Set(tks);

    document.querySelectorAll("div,span,td,h1,h2,h3,h4,b,strong,p").forEach(function(el){
      if(el.dataset.evalDone||el.children.length) return;
      var txt=(el.textContent||"").trim();
      if(txt.length>8||!set.has(txt)) return;
      if(!el.parentElement||el.parentElement.querySelector(".eval-btn")) return;
      if(isCompact(el)){el.dataset.evalDone="1";return;}

      var b=document.createElement("button");
      b.className="eval-btn";
      b.textContent="📊";
      b.title="Evaluación de "+txt;
      b.style.cssText="background:#9C27B0;color:#fff;border:none;border-radius:4px;width:26px;height:26px;margin-left:6px;cursor:pointer;font-size:13px;vertical-align:middle";
      b.onclick=function(e){e.stopPropagation();e.preventDefault();evalModal(txt);};
      el.parentElement.appendChild(b);
      el.dataset.evalDone="1";
    });
  }

  window._evalModal=evalModal;

  function init(){
    load().then(function(){
      setTimeout(banner,1000);
      setInterval(banner,60000);
      setInterval(inject,3000);
    });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();
