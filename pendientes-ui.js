// pendientes-ui.js — avisa cuando hay operaciones cargadas con "+ Agregar" que
// todavia no estan en operaciones.json.
//
// El problema que resuelve: esas operaciones viven en el localStorage de UN
// navegador. Si las cargas en el celular no aparecen en la computadora, y si se
// limpia la cache se pierden sin que nada avise. Ya paso: siete compras del 08/10
// se cargaron en la app y no quedaron en ningun lado.
(function () {
  "use strict";

  var ID = "pend-barra";

  function ls(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }

  function clave(o) {
    return [String(o.fecha).slice(0, 10), String(o.ticker).toUpperCase(),
      String(o.tipo).toUpperCase(), Math.abs(Number(o.cantidad)).toFixed(4)].join("|");
  }

  function pendientes(cb) {
    var locales = ls("operaciones_raw", []).filter(function (o) { return o && o._local; });
    if (!locales.length) return cb([]);
    try {
      var x = new XMLHttpRequest();
      x.open("GET", "operaciones.json?t=" + Date.now(), true);
      x.onload = function () {
        var enRepo = {};
        try {
          var j = JSON.parse(x.responseText);
          (Array.isArray(j) ? j : j.operaciones || []).forEach(function (o) { enRepo[clave(o)] = 1; });
        } catch (e) { return cb([]); } // sin referencia no afirmamos nada
        cb(locales.filter(function (o) { return !enRepo[clave(o)]; }));
      };
      x.onerror = function () { cb([]); };
      x.send(null);
    } catch (e) { cb([]); }
  }

  function descargar(ops) {
    var blob = new Blob([JSON.stringify(ops, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "operaciones-sin-subir-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function mostrar(ops) {
    if (!ops.length || document.getElementById(ID)) return;
    var resumen = ops.slice(0, 4).map(function (o) {
      return o.tipo + " " + o.cantidad + " " + o.ticker;
    }).join(", ") + (ops.length > 4 ? " y " + (ops.length - 4) + " mas" : "");

    var d = document.createElement("div");
    d.id = ID;
    d.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:10005;background:#FF9800;color:#1a1a2e;" +
      "padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top,0px));font-size:13px;" +
      "display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.4)";
    d.innerHTML =
      '<div style="flex:1;min-width:200px"><b>' + ops.length + " operacion" + (ops.length > 1 ? "es" : "") +
      " solo en este navegador</b><div style=\"font-size:12px\">" + resumen +
      ". No estan en operaciones.json: si limpias la cache o abris desde otro dispositivo, no estan.</div></div>" +
      '<div style="display:flex;gap:6px">' +
      '<button id="pend-bajar" style="background:#1a1a2e;color:#fff;border:none;border-radius:6px;' +
      'padding:8px 12px;font-size:13px;cursor:pointer">Descargar</button>' +
      '<button id="pend-ok" style="background:transparent;color:#1a1a2e;border:1px solid #1a1a2e;' +
      'border-radius:6px;padding:8px 10px;font-size:13px;cursor:pointer">Ocultar</button></div>';
    document.body.appendChild(d);
    document.body.style.paddingTop = d.offsetHeight + "px";

    document.getElementById("pend-bajar").onclick = function () { descargar(ops); };
    document.getElementById("pend-ok").onclick = function () {
      d.remove();
      document.body.style.paddingTop = "";
    };
  }

  function revisar() { pendientes(mostrar); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", revisar);
  else revisar();
  // Tambien despues de agregar una operacion, que es cuando aparece el riesgo.
  setTimeout(revisar, 4000);
  setInterval(revisar, 60000);

  console.log("\uD83D\uDCCC pendientes-ui v1");
})();
