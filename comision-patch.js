// comision-patch.js — Inyecta campo comisión al formulario de operaciones
(function(){
  "use strict";

  // IOL cobra 0.5% + IVA = ~0.605% por defecto
  var DEFAULT_PCT = 0.6;

  // Observar cuando se abre el formulario de operaciones
  var obs = new MutationObserver(function(muts) {
    muts.forEach(function(mut) {
      mut.addedNodes.forEach(function(node) {
        if (node.nodeType !== 1) return;
        // Buscar el formulario: tiene h3 con "Operación" y inputs
        var h3s = node.querySelectorAll ? node.querySelectorAll("h3") : [];
        h3s.forEach(function(h3) {
          if (h3.textContent.indexOf("Operaci") === -1) return;
          var form = h3.closest("div");
          if (!form || form.dataset.comPatched) return;
          form.dataset.comPatched = "1";
          injectComision(form);
        });
        // También revisar el nodo mismo
        if (node.tagName === "H3" && node.textContent.indexOf("Operaci") >= 0) {
          var fm = node.closest("div");
          if (fm && !fm.dataset.comPatched) { fm.dataset.comPatched = "1"; injectComision(fm); }
        }
      });
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });

  function injectComision(form) {
    // Encontrar el grid con los inputs
    var grid = form.querySelector("div[style*='grid']");
    if (!grid) return;

    // Encontrar el input de precio para copiar el estilo
    var priceInput = grid.querySelector("input[placeholder='Precio ARS']") ||
                     grid.querySelector("input[type='number']:nth-child(4)");
    var style = priceInput ? priceInput.getAttribute("style") || "" : "";

    // Crear input de comisión
    var comInput = document.createElement("input");
    comInput.type = "number";
    comInput.placeholder = "Comisi\u00f3n %";
    comInput.value = DEFAULT_PCT;
    comInput.step = "0.1";
    comInput.min = "0";
    comInput.max = "10";
    comInput.id = "com-pct-input";
    if (style) comInput.setAttribute("style", style);
    else comInput.style.cssText = "padding:8px;border-radius:6px;border:1px solid #333;background:#0d1117;color:#fff;font-size:14px";

    // Crear input de monto fijo (alternativa)
    var comMonto = document.createElement("input");
    comMonto.type = "number";
    comMonto.placeholder = "o Comisi\u00f3n $";
    comMonto.value = "";
    comMonto.step = "1";
    comMonto.min = "0";
    comMonto.id = "com-monto-input";
    if (style) comMonto.setAttribute("style", style);
    else comMonto.style.cssText = "padding:8px;border-radius:6px;border:1px solid #333;background:#0d1117;color:#fff;font-size:14px";

    grid.appendChild(comInput);
    grid.appendChild(comMonto);

    // Mostrar preview de comisión calculada
    var preview = document.createElement("div");
    preview.id = "com-preview";
    preview.style.cssText = "grid-column:1/-1;color:#888;font-size:12px;padding:4px 0";
    grid.appendChild(preview);

    function updatePreview() {
      var cant = parseFloat(grid.querySelector("input[placeholder='Cantidad']")?.value || 0);
      var precio = parseFloat(grid.querySelector("input[placeholder='Precio ARS']")?.value || 0);
      var pct = parseFloat(comInput.value || 0);
      var monto = parseFloat(comMonto.value || 0);
      var total = cant * precio;
      var com = monto > 0 ? monto : (total * pct / 100);
      if (com > 0) {
        preview.textContent = "Comisi\u00f3n: $" + Math.round(com).toLocaleString("es-AR") + " (" + (total > 0 ? (com / total * 100).toFixed(2) : 0) + "%) — Costo total: $" + Math.round(total + com).toLocaleString("es-AR");
      } else {
        preview.textContent = "";
      }
    }

    comInput.addEventListener("input", updatePreview);
    comMonto.addEventListener("input", updatePreview);
    // También escuchar cambios en cantidad y precio
    grid.querySelectorAll("input").forEach(function(inp) {
      inp.addEventListener("input", updatePreview);
    });

    setTimeout(updatePreview, 100);
    console.log("\u2705 Campo comisi\u00f3n inyectado");
  }

  // Interceptar el POST a /operaciones para incluir comisión
  var _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === "string" && url.indexOf("/operaciones") >= 0 && opts && opts.method === "POST" && opts.body) {
      try {
        var body = JSON.parse(opts.body);
        var comPctInput = document.getElementById("com-pct-input");
        var comMontoInput = document.getElementById("com-monto-input");
        if (comPctInput || comMontoInput) {
          var pct = parseFloat((comPctInput && comPctInput.value) || 0);
          var monto = parseFloat((comMontoInput && comMontoInput.value) || 0);
          var total = (body.cantidad || 0) * (body.precio || 0);
          body.comision_pct = pct;
          body.comision_monto = monto > 0 ? monto : Math.round(total * pct / 100);
          opts.body = JSON.stringify(body);
          console.log("💰 Comisi\u00f3n:", body.comision_monto, "(" + body.comision_pct + "%)");
        }
      } catch(e) {}
    }
    return _origFetch.apply(this, arguments);
  };

  console.log("💰 Patch de comisiones activo (default " + DEFAULT_PCT + "%)");
})();
