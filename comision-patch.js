// comision-patch.js v4 — Fix DEFINITIVO: uppercase tipo + ppc + autocomplete + comisiones + sync
(function(){
  "use strict";
  var DEFAULT_PCT = 0.6;
  var TICKERS = [
    'NVDA','META','MSFT','ADBE','MU','PANW','MELI','ACN','MCD',
    'NU','VIST','IBIT','ICLN','PAMP','GGAL','YPF','BMA','SPY',
    'IOLCAMA','IOLDOLD'
  ];

  // === MIGRACIÓN: arreglar datos existentes en localStorage ===
  (function migrate(){
    var raw = localStorage.getItem("operaciones_raw");
    if(!raw) return;
    try {
      var ops = JSON.parse(raw);
      if(!Array.isArray(ops) || ops.length === 0) return;
      var fixed = 0;
      ops.forEach(function(op){
        // Fix ppc
        if((!op.ppc || op.ppc === 0) && op.precio > 0){
          op.ppc = op.precio;
          fixed++;
        }
        // Fix tipo → MAYÚSCULA (app.js espera "COMPRA" / "VENTA")
        if(op.tipo && op.tipo !== op.tipo.toUpperCase()){
          op.tipo = op.tipo.toUpperCase();
          fixed++;
        }
        // Fix invertido_ars
        if(!op.invertido_ars && op.ppc > 0 && op.cantidad > 0){
          op.invertido_ars = op.cantidad * op.ppc;
        }
      });
      if(fixed > 0){
        localStorage.setItem("operaciones_raw", JSON.stringify(ops));
        console.log("🔧 Migración: " + fixed + " campos arreglados");
      }
    } catch(e){ console.warn("Migración falló:", e); }
  })();

  // === Referencias al formulario activo ===
  var activeForm = null;

  // === MUTATION OBSERVER ===
  new MutationObserver(function(muts){
    muts.forEach(function(mut){
      mut.addedNodes.forEach(function(node){
        if(node.nodeType!==1)return;
        var h3s = node.querySelectorAll ? node.querySelectorAll("h3") : [];
        h3s.forEach(function(h3){
          if(h3.textContent.indexOf("Operaci")===-1) return;
          var form = h3.closest("div");
          if(!form || form.dataset.comPatched) return;
          form.dataset.comPatched = "1";
          enhanceForm(form);
        });
      });
    });
  }).observe(document.body, {childList:true, subtree:true});

  // === ENHANCE FORM ===
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
    var ref = grid.querySelector("input[type='number']");
    var st = ref
      ? "padding:8px;border-radius:6px;border:1px solid #333;background:#0d1117;color:#fff;font-size:14px"
      : "";

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
      pv.textContent = com > 0
        ? "Comisión: $" + Math.round(com).toLocaleString("es-AR") +
          " (" + (total>0?(com/total*100).toFixed(2):0) + "%) — Costo total: $" +
          Math.round(total+com).toLocaleString("es-AR")
        : "";
    }
    [ci,cm].forEach(function(x){ x.addEventListener("input",upd); });
    grid.querySelectorAll("input").forEach(function(x){ x.addEventListener("input",upd); });
    setTimeout(upd, 100);
  }

  // === LEER DOM ===
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

  // === NORMALIZAR OPERACIÓN: asegurar ppc y tipo uppercase ===
  function normalizeOp(op){
    if((!op.ppc || op.ppc === 0) && op.precio > 0) op.ppc = op.precio;
    if(op.tipo) op.tipo = op.tipo.toUpperCase();
    if(!op.invertido_ars && op.ppc > 0 && op.cantidad > 0) op.invertido_ars = op.cantidad * op.ppc;
    return op;
  }

  // === LOCALSTORAGE ===
  function getOps(){
    try{ return JSON.parse(localStorage.getItem("operaciones_raw")||"[]"); }
    catch(e){ return []; }
  }

  // === INTERCEPTAR FETCH ===
  var _real = window.fetch;
  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("/operaciones") === -1)
      return _real.apply(this, arguments);

    var method = (opts && opts.method || "GET").toUpperCase();

    // ========== POST ==========
    if(method === "POST" && opts && opts.body){
      var body;
      try{ body = JSON.parse(opts.body); } catch(e){ return _real.apply(this, arguments); }

      // Leer DOM real
      var dom = readFormDOM();
      if(dom && dom.ticker){
        body.ticker = dom.ticker;
        body.tipo   = dom.tipo;       // Ya uppercase
        body.cantidad = dom.cantidad;
        body.precio = dom.precio;
        body.fecha  = dom.fecha;
      } else {
        // Fallback: uppercase el tipo del body
        body.tipo = (body.tipo || "compra").toUpperCase();
      }

      // Comisión
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

      // Guardar localmente
      var localId = Date.now() + Math.floor(Math.random()*1000);
      var localOp = normalizeOp(Object.assign({}, body, {
        id: localId,
        ppc: body.precio,
        invertido_ars: (body.cantidad||0) * (body.precio||0)
      }));

      var ops = getOps();
      ops.push(localOp);
      localStorage.setItem("operaciones_raw", JSON.stringify(ops));
      console.log("💾", localOp.tipo, localOp.ticker, "x"+localOp.cantidad, "$"+localOp.ppc);

      return _real.apply(this, [url, opts]).then(function(res){
        return res.json().then(function(data){
          if(Array.isArray(data) && data[0] && data[0].id){
            var ops2 = getOps();
            var ix = ops2.findIndex(function(o){ return o.id===localId; });
            if(ix>=0){
              ops2[ix] = normalizeOp(Object.assign({}, data[0]));
              localStorage.setItem("operaciones_raw", JSON.stringify(ops2));
            }
          }
          return new Response(JSON.stringify(data),
            { status:200, headers:{"Content-Type":"application/json"} });
        });
      }).catch(function(){
        console.warn("☁️ Supabase offline. Solo local.");
        return new Response(JSON.stringify([localOp]),
          { status:200, headers:{"Content-Type":"application/json"} });
      });
    }

    // ========== DELETE ==========
    if(method === "DELETE"){
      var m = url.match(/id=eq\.(\d+)/);
      if(m){
        var did = parseInt(m[1]);
        var ops = getOps().filter(function(o){ return o.id !== did; });
        localStorage.setItem("operaciones_raw", JSON.stringify(ops));
      }
      return _real.apply(this, arguments).catch(function(){
        return new Response("[]", { status:200, headers:{"Content-Type":"application/json"} });
      });
    }

    // ========== PATCH ==========
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
          localStorage.setItem("operaciones_raw", JSON.stringify(ops));
        }
      }
      return _real.apply(this, arguments).catch(function(){
        return new Response(JSON.stringify([chg]),
          { status:200, headers:{"Content-Type":"application/json"} });
      });
    }

    // ========== GET: normalizar antes de servir ==========
    if(method === "GET" && url.indexOf("order=fecha") >= 0){
      var ops = getOps();
      if(ops.length > 0){
        // Normalizar CADA operación antes de servir
        var changed = false;
        ops.forEach(function(op){
          var oldTipo = op.tipo, oldPpc = op.ppc;
          normalizeOp(op);
          if(op.tipo !== oldTipo || op.ppc !== oldPpc) changed = true;
        });
        if(changed) localStorage.setItem("operaciones_raw", JSON.stringify(ops));

        // Sync de fondo
        _real.apply(this, arguments).then(function(res){
          return res.json().then(function(data){
            if(Array.isArray(data) && data.length > 0){
              // Normalizar datos de Supabase también
              data.forEach(function(op){ normalizeOp(op); });
              // Reemplazar si Supabase tiene más datos
              var local = getOps();
              if(data.length >= local.length){
                localStorage.setItem("operaciones_raw", JSON.stringify(data));
              }
            }
          });
        }).catch(function(){});

        return Promise.resolve(new Response(JSON.stringify(ops),
          { status:200, headers:{"Content-Type":"application/json"} }));
      }
    }

    return _real.apply(this, arguments);
  };

  console.log("💰 comision-patch v4: uppercase tipo + ppc + autocomplete + sync");
})();
