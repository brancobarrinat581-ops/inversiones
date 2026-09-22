// usd-patch.js — Agregar columnas USD al dashboard
(function(){
  "use strict";

  var CCL = 1598.1; // Se actualiza desde prices.json

  // Cargar CCL actualizado
  function updateCCL(){
    fetch("prices.json").then(r=>r.json()).then(function(data){
      if(data.ccl) CCL = data.ccl;
      console.log("💵 CCL actualizado:", CCL);
      injectUSD();
    }).catch(function(){});
  }

  // Inyectar columnas USD
  function injectUSD(){
    // Las operaciones se guardan con invertido_ars
    // Portfolio muestra Cantidad, PPC, Precio Actual, Valor Total ($), Invertido
    
    // Esperar a que React renderice las operaciones
    setTimeout(function(){
      var rows = document.querySelectorAll("div[style*='grid']");
      var count = 0;
      
      rows.forEach(function(row){
        // Buscar si tiene estructura de operación (fecha | ticker | tipo | cantidad | $precio | total)
        if(row.dataset.usdAdded) return;
        
        var cells = row.children;
        if(!cells || cells.length < 5) return;

        // Buscar si tiene $
        var hasDollar = false;
        for(var i=0; i<cells.length; i++){
          if(cells[i].textContent && cells[i].textContent.match(/^\$/)) {
            hasDollar = true; break;
          }
        }
        if(!hasDollar) return;

        // Esto es una fila de operación - agregar USD
        var precioText = (cells[4] && cells[4].textContent) || "";
        var precioARS = parseFloat(precioText.replace(/[$.,]/g, '').replace(',',''));
        
        if(precioARS > 0){
          var precioUSD = precioARS / CCL;
          var usdCell = document.createElement("span");
          usdCell.style.cssText = "color:#8b949e;font-size:13px;padding:0 8px;white-space:nowrap";
          usdCell.textContent = "USD " + precioUSD.toFixed(2);
          
          // Insertar después del precio ARS
          if(cells[4]) cells[4].parentNode.insertBefore(usdCell, cells[5]);
          row.dataset.usdAdded = "1";
          count++;
        }
      });
      
      if(count > 0) console.log("💵 " + count + " celdas USD agregadas");
    }, 500);
  }

  // Agregar totales USD al portfolio
  function injectPortfolioUSD(){
    setTimeout(function(){
      // Buscar el resumen del portfolio (donde muestra "Portafolio" con totales)
      var labels = document.querySelectorAll("label, h3, div");
      var portfolioSection = null;
      
      labels.forEach(function(label){
        if(label.textContent.indexOf("Invertido") >= 0){
          portfolioSection = label.closest("div") || label.parentNode;
        }
      });
      
      if(!portfolioSection) {
        // Try to find by looking for the value display
        var spans = document.querySelectorAll("span");
        spans.forEach(function(span){
          if(span.textContent.match(/^\$[\d.,]+$/)){
            var text = span.textContent;
            var value = parseFloat(text.replace(/[$.,]/g,'').replace(',',''));
            if(value > 100000){ // Likely a total
              var usdSpan = document.createElement("span");
              usdSpan.style.cssText = "color:#8b949e;font-size:13px;margin-left:8px";
              usdSpan.textContent = "(USD " + (value/CCL).toFixed(2) + ")";
              if(!span.dataset.usdAdded){
                span.parentNode.insertBefore(usdSpan, span.nextSibling);
                span.dataset.usdAdded = "1";
              }
            }
          }
        });
      }
    }, 1000);
  }

  // Llamar al cargar
  updateCCL();
  
  // Re-inyectar cada vez que DOM cambia
  new MutationObserver(function(){
    setTimeout(function(){
      injectUSD();
      injectPortfolioUSD();
    }, 300);
  }).observe(document.body, {childList:true, subtree:true});

  console.log("💵 usd-patch: conversión a USD agregada");
})();
