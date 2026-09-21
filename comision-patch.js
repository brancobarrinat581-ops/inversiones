// comision-patch.js v4 — Portfolio desde operaciones + uppercase tipo + ppc + autocomplete + tabla mejorada
(function(){
  "use strict";
  var DEFAULT_PCT = 0.6;
  var TICKERS = [
    'NVDA','META','MSFT','ADBE','MU','PANW','MELI','ACN','MCD',
    'NU','VIST','IBIT','ICLN','PAMP','GGAL','YPF','BMA','SPY',
    'IOLCAMA','IOLDOLD'
  ];

  // =====================================================
  // FIX #1: Eliminar portfolio_iol para forzar que app.js
  // calcule la cartera DESDE las operaciones
  // =====================================================
  localStorage.removeItem("portfolio_iol");

  // Bloquear que se vuelva a setear
  var _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, val){
    if(key === "portfolio_iol") {
      console.log("🚫 Bloqueado portfolio_iol — cartera se calcula desde operaciones");
      return;
    }
    return _setItem(key, val);
  };

  // =====================================================
  // FIX #2: Migrar localStorage existente
  // =====================================================
  (function migrate(){
    var raw = localStorage.getItem("operaciones_raw");
    if(!raw) return;
    try {
      var ops = JSON.parse(raw);
      if(!Array.isArray(ops) || ops.length === 0) return;
      var fixed = 0;
      ops.forEach(function(op){
        if((!op.ppc || op.ppc === 0) && op.precio > 0){
          op.ppc = op.precio; fixed++;
        }
        if(op.tipo && op.tipo !== op.tipo.toUpperCase()){
          op.tipo = op.tipo.toUpperCase(); fixed++;
        }
        if(!op.invertido_ars && op.ppc > 0 && op.cantidad > 0){
          op.invertido_ars = op.cantidad * op.ppc;
        }
      });
      if(fixed > 0){
        _setItem("operaciones_raw", JSON.stringify(ops));
        console.log("🔧 Migración: " + fixed + " campos arreglados");
      }
    } catch(e){}
  })();

  // =====================================================
  // FIX #3: Mejorar tabla de operaciones (agregar Total)
  // =====================================================
  new MutationObserver(function(muts){
    muts.forEach(function(mut){
      mut.addedNodes.forEach(function(node){
        if(node.nodeType!==1) return;

        // --- Detectar formulario de operación ---
        var h3s = node.querySelectorAll ? node.querySelectorAll("h3") : [];
        h3s.forEach(function(h3){
          if(h3.textContent.indexOf("Operaci")===-1) return;
          var form = h3.closest("div");
          if(!form || form.dataset.comPatched) return;
          form.dataset.comPatched = "1";
          enhanceForm(form);
        });

        // --- Detectar tabla de operaciones y agregar columna Total ---
        var tables = node.querySelectorAll ? node.querySelectorAll("table, div[style*='grid']") : [];
        enhanceOpRows(node);
      });
    });
  }).observe(document.body, {childList:true, subtree:true});

  // Mejorar filas de operaciones: agregar precio total
  function enhanceOpRows(root){
    // Las operaciones se muestran en un contenedor con filas
    // Cada fila tiene: fecha, ticker, tipo, cantidad, precio, botones
    // Buscar por el patrón de texto "$" en la columna de precio
    var allRows = root.querySelectorAll ? root.querySelectorAll("div[style*='grid'], tr") : [];
    allRows.forEach(function(row){
      if(row.dataset.totalAdded) return;
      var cells = row.children;
      if(!cells || cells.length < 5) return;

      // Verificar que es una fila de operación (tiene ticker y precio)
      var texts = Array.from(cells).map(function(c){ return (c.textContent||"").trim(); });

      // Buscar patrón: fecha | ticker | tipo | cantidad | $precio
      var fechaMatch = texts[0] && texts[0].match(/^\d{4}-/);
      var precioMatch = texts[4] && texts[4].match(/^\$[\d.,]+$/);
      if(!fechaMatch) return;

      var cantidad = parseFloat(texts[3]) || 0;
      var precio = parseFloat((texts[4]||"").replace(/[$.,]/g, function(m){ return m==='.'?'':m===','?'':m==='$'?'':''; })) || 0;

      // Intentar parsear precio más robustamente
      var precioText = (texts[4]||"").replace('$','').replace(/\./g,'').replace(',','.');
      precio = parseFloat(precioText) || 0;

      if(cantidad > 0 && precio > 0){
        var total = Math.round(cantidad * precio);
        var totalCell = document.createElement("span");
        totalCell.style.cssText = "color:#8b949e;font-size:13px;white-space:nowrap;padding:0 8px";
        totalCell.textContent = "$" + total.toLocaleString("es-AR");
        totalCell.title = "Total: " + cantidad + " x $" + precio.toLocaleString("es-AR");

        // Insertar antes de los botones de acción
        var actionIdx = -1;
        for(var i = cells.length-1; i >= 0; i--){
          if(cells[i].querySelector && cells[i].querySelector("button, svg, [role='button']")){
            actionIdx = i; break;
          }
        }
        if(actionIdx > 0){
          row.insertBefore(totalCell, cells[actionIdx]);
        } else {
          row.appendChild(totalCell);
        }
        row.dataset.totalAdded = "1";
      }
    });
  }

  // Observar cambios en la lista de operaciones continuamente
  setInterval(function(){
    enhanceOpRows(document.body);
  }, 2000);

  // =====================================================
  // Formulario: autocomplete + comisiones
  // =====================================================
  var activeForm = null;

  function enhanceForm(form){
    activeForm = form;

    // Autocomplete tickers
    var tickerInput = form.querySelector("input[placeholder='Ticker']");
    if(tickerInput){
      if(!document.getElementById("dl-tickers")){
        var dl = document.createElement("datalist");
        dl.id = "dl-tickers";
        TICKERS.forEach(function(t){
          var opt = document.createElement("option");
          opt.value = t;
          dl.appendChild(opt);
        });
        document.body.appendChild(dl);
      }
      tickerInput.setAttribute("list", "dl-tickers");
      tickerInput.setAttribute("autocomplete", "off");
    }

    // Comisión
    var grid = form.querySelector("div[style*='grid']");
    if(!grid) return;
    var st = "padding:8px;border-radius:6px;border:1px solid #333;background:#0d1117;color:#fff;font-size:14px";

    var ci = document.createElement("input");
    ci.type="number"; ci.placeholder="Comisión %"; ci.value=DEFAULT_PCT;
    ci.step="0.1"; ci.min="0"; ci.max="10"; ci.id="com-pct-input"; ci.style.cssText=st;

    var cm = document.createElement("input");
    cm.type="number"; cm.placeholder="o Comisión $"; cm.value="";
    cm.step="1"; cm.min="0"; cm.id="com-monto-input"; cm.style.cssText=st;

    var pv = document.createElement("div");
    pv.id="com-preview";
    pv.style.cssText="grid-column:1/-1;color:#888;font-size:12px;padding:4px 0";

    grid.appendChild(ci);
    grid.appendChild(cm);
    grid.appendChild(pv);

    function upd(){
      var cant = parseFloat((grid.querySelector("input[placeholder='Cantidad']")||{}).value||0);
      var precio = parseFloat((grid.querySelector("input[placeholder='Precio ARS']")||{}).value||0);
      var pct = parseFloat(ci.value||0);
      var monto = parseFloat(cm.value||0);
      var total = cant * precio;
      var com = monto > 0 ? monto : (total * pct / 100);
      pv.textContent = total > 0
        ? "Total: $" + Math.round(total).toLocaleString("es-AR") +
          (com > 0 ? " | Comisión: $" + Math.round(com).toLocaleString("es-AR") +
          " (" + (com/total*100).toFixed(2) + "%) | Costo: $" +
          Math.round(total+com).toLocaleString("es-AR") : "")
        : "";
    }
    [ci,cm].forEach(function(x){ x.addEventListener("input",upd); });
    grid.querySelectorAll("input").forEach(function(x){ x.addEventListener("input",upd); });
    setTimeout(upd, 100);
  }

  // =====================================================
  // Leer DOM
  // =====================================================
  function readFormDOM(){
    if(!activeForm) return null;
    var ticker = (activeForm.querySelector("input[placeholder='Ticker']")||{}).value || "";
    var select = activeForm.querySelector("select");
    var tipo = select ? select.value : "compra";
    var cantidad = parseFloat((activeForm.querySelector("input[placeholder='Cantidad']")||{}).value) || 0;
    var precio = parseFloat((activeForm.querySelector("input[placeholder='Precio ARS']")||{}).value) || 0;
    var fechaInput = activeForm.querySelector("input[type='date']");
    var fecha = fechaInput ? fechaInput.value : new Date().toISOString().slice(0,10);
    return { ticker: ticker.toUpperCase(), tipo: tipo.toUpperCase(), cantidad: cantidad, precio: precio, fecha: fecha };
  }

  function normalizeOp(op){
    if((!op.ppc || op.ppc === 0) && op.precio > 0) op.ppc = op.precio;
    if(op.tipo) op.tipo = op.tipo.toUpperCase();
    if(!op.invertido_ars && op.ppc > 0 && op.cantidad > 0) op.invertido_ars = op.cantidad * op.ppc;
    return op;
  }

  function getOps(){
    try{ return JSON.parse(localStorage.getItem("operaciones_raw")||"[]"); }
    catch(e){ return []; }
  }

  // =====================================================
  // INTERCEPTAR FETCH
  // =====================================================
  var _real = window.fetch;
  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("/operaciones") === -1)
      return _real.apply(this, arguments);

    var method = (opts && opts.method || "GET").toUpperCase();

    // === POST ===
    if(method === "POST" && opts && opts.body){
      var body;
      try{ body = JSON.parse(opts.body); } catch(e){ return _real.apply(this, arguments); }

      var dom = readFormDOM();
      if(dom && dom.ticker){
        body.ticker = dom.ticker;
        body.tipo   = dom.tipo;
        body.cantidad = dom.cantidad;
        body.precio = dom.precio;
        body.fecha  = dom.fecha;
      } else {
        body.tipo = (body.tipo || "compra").toUpperCase();
      }

      var ci = document.getElementById("com-pct-input");
      var cm = document.getElementById("com-monto-input");
      if(ci || cm){
        var pct = parseFloat((ci && ci.value) || 0);
        var monto = parseFloat((cm && cm.value) || 0);
        var total = (body.cantidad||0) * (body.precio||0);
        body.comision_pct = pct;
        body.comision_monto = monto > 0 ? monto : Math.round(total * pct / 100);
      }

      opts = Object.assign({}, opts, { body: JSON.stringify(body) });

      var localId = Date.now() + Math.floor(Math.random()*1000);
      var localOp = normalizeOp(Object.assign({}, body, {
        id: localId, ppc: body.precio,
        invertido_ars: (body.cantidad||0) * (body.precio||0)
      }));

      var ops = getOps();
      ops.push(localOp);
      _setItem("operaciones_raw", JSON.stringify(ops));
      console.log("💾", localOp.tipo, localOp.ticker, "x"+localOp.cantidad, "$"+localOp.ppc);

      return _real.apply(this, [url, opts]).then(function(res){
        return res.json().then(function(data){
          if(Array.isArray(data) && data[0] && data[0].id){
            var ops2 = getOps();
            var ix = ops2.findIndex(function(o){ return o.id===localId; });
            if(ix>=0){
              ops2[ix] = normalizeOp(Object.assign({}, data[0]));
              _setItem("operaciones_raw", JSON.stringify(ops2));
            }
          }
          return new Response(JSON.stringify(data),
            {status:200, headers:{"Content-Type":"application/json"}});
        });
      }).catch(function(){
        return new Response(JSON.stringify([localOp]),
          {status:200, headers:{"Content-Type":"application/json"}});
      });
    }

    // === DELETE ===
    if(method === "DELETE"){
      var m = url.match(/id=eq\.(\d+)/);
      if(m){
        var did = parseInt(m[1]);
        var ops = getOps().filter(function(o){ return o.id !== did; });
        _setItem("operaciones_raw", JSON.stringify(ops));
      }
      return _real.apply(this, arguments).catch(function(){
        return new Response("[]", {status:200, headers:{"Content-Type":"application/json"}});
      });
    }

    // === PATCH ===
    if(method === "PATCH" && opts && opts.body){
      var chg;
      try{ chg = JSON.parse(opts.body); } catch(e){ return _real.apply(this, arguments); }
      var m2 = url.match(/id=eq\.(\d+)/);
      if(m2){
        var eid = parseInt(m2[1]);
        var ops = getOps();
        var ix = ops.findIndex(function(o){ return o.id === eid; });
        if(ix >= 0){
          Object.assign(ops[ix], chg);
          normalizeOp(ops[ix]);
          _setItem("operaciones_raw", JSON.stringify(ops));
        }
      }
      return _real.apply(this, arguments).catch(function(){
        return new Response(JSON.stringify([chg]),
          {status:200, headers:{"Content-Type":"application/json"}});
      });
    }

    // === GET ===
    if(method === "GET" && url.indexOf("order=fecha") >= 0){
      var ops = getOps();
      if(ops.length > 0){
        var changed = false;
        ops.forEach(function(op){
          var old = op.tipo + "|" + op.ppc;
          normalizeOp(op);
          if(op.tipo + "|" + op.ppc !== old) changed = true;
        });
        if(changed) _setItem("operaciones_raw", JSON.stringify(ops));

        _real.apply(this, arguments).then(function(res){
          return res.json().then(function(data){
            if(Array.isArray(data) && data.length > 0){
              data.forEach(function(op){ normalizeOp(op); });
              var local = getOps();
              if(data.length >= local.length){
                _setItem("operaciones_raw", JSON.stringify(data));
              }
            }
          });
        }).catch(function(){});

        return Promise.resolve(new Response(JSON.stringify(ops),
          {status:200, headers:{"Content-Type":"application/json"}}));
      }
    }

    return _real.apply(this, arguments);
  };

  console.log("💰 comision-patch v4: portfolio desde ops + uppercase + ppc + autocomplete");
})();
