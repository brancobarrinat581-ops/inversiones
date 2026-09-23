// usd-patch.js v2 — Agrega equivalente USD junto a "Invertido" y "Valor actual"
// NO usa MutationObserver masivo. Polling suave cada 2s.
(function(){
  "use strict";
  var CCL = 1578;

  // Leer CCL de prices.json (síncrono para tenerlo antes del primer render)
  try {
    var x = new XMLHttpRequest();
    x.open("GET","prices.json?t="+Date.now(), false);
    x.send(null);
    if(x.status===200){
      var d=JSON.parse(x.responseText);
      if(d.ccl>0) CCL=d.ccl;
    }
  } catch(e){}
  console.log("💵 CCL actualizado:", CCL);

  function addUsd(){
    var found=0;
    // Buscar divs que contengan EXACTAMENTE "Invertido" o "Valor actual"
    document.querySelectorAll("div").forEach(function(el){
      var t=el.textContent.trim();
      if(t!=="Invertido" && t!=="Valor actual") return;
      var p=el.parentElement;
      if(!p || p.querySelector(".usd-addon")) return;
      // Buscar el div hermano que tiene el valor $xxx.xxx
      var valEl=null;
      for(var i=0;i<p.children.length;i++){
        var ch=p.children[i];
        if(ch===el) continue;
        var txt=ch.textContent.trim();
        // Formato: $1.234.567 o $1,234,567
        if(/^\$[\d.,]+$/.test(txt)){
          valEl=ch; break;
        }
      }
      if(!valEl) return;
      var raw=valEl.textContent.replace("$","").replace(/\./g,"").replace(",",".");
      var ars=parseFloat(raw);
      if(!(ars>0)) return;
      var usd=ars/CCL;
      var span=document.createElement("div");
      span.className="usd-addon";
      span.style.cssText="color:#58a6ff;font-size:0.85rem;margin-top:2px;font-weight:normal;";
      span.textContent="≈ USD "+usd.toLocaleString("es-AR",{maximumFractionDigits:0});
      valEl.insertAdjacentElement("afterend", span);
      found++;
    });
    return found;
  }

  // Polling suave — re-chequea cada 2s si faltan etiquetas
  setInterval(function(){
    if(!document.querySelector(".usd-addon")) addUsd();
  }, 2000);

  // Primera inyección con delay para esperar React
  setTimeout(addUsd, 1500);
  setTimeout(addUsd, 3000);

  console.log("💵 usd-patch v2: conversión a USD activada");
})();
