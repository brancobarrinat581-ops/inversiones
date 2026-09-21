// comision-patch.js v2 — Comisiones + guardar operaciones en localStorage
(function(){
  "use strict";
  var DEFAULT_PCT = 0.6;

  // === INYECTAR CAMPO COMISIÓN ===
  new MutationObserver(function(muts){
    muts.forEach(function(mut){
      mut.addedNodes.forEach(function(node){
        if(node.nodeType!==1)return;
        var h3s=node.querySelectorAll?node.querySelectorAll("h3"):[];
        h3s.forEach(function(h3){
          if(h3.textContent.indexOf("Operaci")===-1)return;
          var form=h3.closest("div");
          if(!form||form.dataset.comPatched)return;
          form.dataset.comPatched="1";
          injectComision(form);
        });
      });
    });
  }).observe(document.body,{childList:true,subtree:true});

  function injectComision(form){
    var grid=form.querySelector("div[style*='grid']");
    if(!grid)return;
    var ref=grid.querySelector("input[type='number']");
    var st=ref?"padding:8px;border-radius:6px;border:1px solid #333;background:#0d1117;color:#fff;font-size:14px":"";

    var ci=document.createElement("input");
    ci.type="number";ci.placeholder="Comisi\u00f3n %";ci.value=DEFAULT_PCT;
    ci.step="0.1";ci.min="0";ci.max="10";ci.id="com-pct-input";ci.style.cssText=st;

    var cm=document.createElement("input");
    cm.type="number";cm.placeholder="o Comisi\u00f3n $";cm.value="";
    cm.step="1";cm.min="0";cm.id="com-monto-input";cm.style.cssText=st;

    var pv=document.createElement("div");pv.id="com-preview";
    pv.style.cssText="grid-column:1/-1;color:#888;font-size:12px;padding:4px 0";

    grid.appendChild(ci);grid.appendChild(cm);grid.appendChild(pv);

    function upd(){
      var cant=parseFloat((grid.querySelector("input[placeholder='Cantidad']")||{}).value||0);
      var precio=parseFloat((grid.querySelector("input[placeholder='Precio ARS']")||{}).value||0);
      var pct=parseFloat(ci.value||0);var monto=parseFloat(cm.value||0);
      var total=cant*precio;var com=monto>0?monto:(total*pct/100);
      pv.textContent=com>0?"Comisi\u00f3n: $"+Math.round(com).toLocaleString("es-AR")+" ("+
        (total>0?(com/total*100).toFixed(2):0)+"%) \u2014 Costo total: $"+Math.round(total+com).toLocaleString("es-AR"):"";
    }
    [ci,cm].forEach(function(x){x.addEventListener("input",upd);});
    grid.querySelectorAll("input").forEach(function(x){x.addEventListener("input",upd);});
    setTimeout(upd,100);
  }

  // === INTERCEPTAR FETCH: guardar operaciones en localStorage ===
  function getOps(){try{return JSON.parse(localStorage.getItem("operaciones_raw")||"[]");}catch(e){return[];}}

  var _real=window.fetch;
  window.fetch=function(url,opts){
    if(typeof url!=="string"||url.indexOf("/operaciones")===-1)
      return _real.apply(this,arguments);

    var method=(opts&&opts.method||"GET").toUpperCase();

    // POST: nueva operación
    if(method==="POST"&&opts&&opts.body){
      var body;try{body=JSON.parse(opts.body);}catch(e){return _real.apply(this,arguments);}

      // Agregar comisión desde los inputs
      var ci=document.getElementById("com-pct-input");
      var cm=document.getElementById("com-monto-input");
      if(ci||cm){
        var pct=parseFloat((ci&&ci.value)||0);
        var monto=parseFloat((cm&&cm.value)||0);
        var total=(body.cantidad||0)*(body.precio||0);
        body.comision_pct=pct;
        body.comision_monto=monto>0?monto:Math.round(total*pct/100);
        opts=Object.assign({},opts,{body:JSON.stringify(body)});
      }

      // Generar ID local
      var localId=Date.now()+Math.floor(Math.random()*1000);
      var localOp=Object.assign({},body,{id:localId,ppc:body.precio,invertido_ars:(body.cantidad||0)*(body.precio||0)});

      // Guardar en localStorage INMEDIATAMENTE
      var ops=getOps();ops.push(localOp);
      localStorage.setItem("operaciones_raw",JSON.stringify(ops));
      console.log("\ud83d\udcbe Operaci\u00f3n guardada localmente. Total:",ops.length);

      // Intentar Supabase, si falla devolver la operación local
      return _real.apply(this,arguments).then(function(res){
        return res.json().then(function(data){
          // Si Supabase respondió, actualizar ID real
          if(Array.isArray(data)&&data[0]&&data[0].id){
            var ops2=getOps();
            var ix=ops2.findIndex(function(o){return o.id===localId;});
            if(ix>=0){ops2[ix]=data[0];localStorage.setItem("operaciones_raw",JSON.stringify(ops2));}
          }
          return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
        });
      }).catch(function(){
        console.warn("\u2601\ufe0f Supabase offline. Operaci\u00f3n guardada solo localmente.");
        return new Response(JSON.stringify([localOp]),{status:200,headers:{"Content-Type":"application/json"}});
      });
    }

    // DELETE: borrar de localStorage también
    if(method==="DELETE"){
      var m=url.match(/id=eq\.(\d+)/);
      if(m){
        var did=parseInt(m[1]);
        var ops=getOps().filter(function(o){return o.id!==did;});
        localStorage.setItem("operaciones_raw",JSON.stringify(ops));
      }
      return _real.apply(this,arguments).catch(function(){
        return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
      });
    }

    // PATCH: editar en localStorage también
    if(method==="PATCH"&&opts&&opts.body){
      var chg;try{chg=JSON.parse(opts.body);}catch(e){return _real.apply(this,arguments);}
      var m2=url.match(/id=eq\.(\d+)/);
      if(m2){
        var eid=parseInt(m2[1]);var ops=getOps();
        var ix=ops.findIndex(function(o){return o.id===eid;});
        if(ix>=0){Object.assign(ops[ix],chg);localStorage.setItem("operaciones_raw",JSON.stringify(ops));}
      }
      return _real.apply(this,arguments).catch(function(){
        return new Response(JSON.stringify([chg]),{status:200,headers:{"Content-Type":"application/json"}});
      });
    }

    // GET: servir desde localStorage primero
    if(method==="GET"&&url.indexOf("order=fecha")>=0){
      var ops=getOps();
      if(ops.length>0){
        // Intentar sync de fondo
        _real.apply(this,arguments).then(function(res){
          return res.json().then(function(data){
            if(Array.isArray(data)&&data.length>ops.length){
              localStorage.setItem("operaciones_raw",JSON.stringify(data));
            }
          });
        }).catch(function(){});
        return Promise.resolve(new Response(JSON.stringify(ops),{status:200,headers:{"Content-Type":"application/json"}}));
      }
    }

    return _real.apply(this,arguments);
  };

  console.log("\ud83d\udcb0 Comisiones + sync local activo");
})();
