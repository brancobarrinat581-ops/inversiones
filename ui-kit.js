// ui-kit.js — unifica la interfaz de los paneles.
//
// Antes habia cuatro botones flotantes apilados en el borde izquierdo, cada uno
// con un emoji y sin nombre: habia que acordarse de memoria cual era cual, y en
// el celular tapaban contenido. Ahora hay un solo boton que abre un menu con los
// nombres escritos, y cada panel se arma con pestañas en vez de un scroll largo.
//
// Los botones viejos siguen existiendo pero ocultos: el menu los "clickea". Asi
// no hay que reescribir el codigo de cada panel para engancharlo aca.
(function () {
  "use strict";

  var PANELES = [];

  // Verde y rojo quedan reservados para ganancia y perdida. Todo lo demas usa
  // azul y grises, para que el color siga significando algo.
  var C = {
    fondo: "#1a1a2e", panel: "#0d1117", linea: "#1f2430",
    texto: "#ffffff", suave: "#8b93a7", tenue: "#5c6478",
    acento: "#64B5F6", alerta: "#FF9800", sube: "#4CAF50", baja: "#F44336"
  };

  function registrar(icono, nombre, abrir, detalle) {
    if (PANELES.some(function (p) { return p.nombre === nombre; })) return;
    PANELES.push({ icono: icono, nombre: nombre, abrir: abrir, detalle: detalle || "" });
    ordenar();
  }

  var ORDEN = ["Rendimiento", "Seguimiento", "Oportunidades", "Asistente", "Exportar"];
  function ordenar() {
    PANELES.sort(function (a, b) {
      var ia = ORDEN.indexOf(a.nombre), ib = ORDEN.indexOf(b.nombre);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  function cerrarMenu() { var n = document.getElementById("ui-menu"); if (n) n.remove(); }

  function abrirMenu() {
    if (document.getElementById("ui-menu")) { cerrarMenu(); return; }
    var m = document.createElement("div");
    m.id = "ui-menu";
    var items = PANELES.map(function (p, i) {
      return '<button data-i="' + i + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;' +
        "background:" + C.panel + ";color:" + C.texto + ";border:none;border-bottom:1px solid " + C.linea + ";" +
        'padding:14px 16px;font-size:15px;cursor:pointer">' +
        '<span style="font-size:20px;width:26px;text-align:center">' + p.icono + "</span>" +
        "<span><span>" + p.nombre + "</span>" +
        (p.detalle ? '<span style="display:block;color:' + C.suave + ';font-size:12px">' + p.detalle + "</span>" : "") +
        "</span></button>";
    }).join("");

    m.innerHTML = '<div id="ui-menu-fondo" style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10001;' +
      'display:flex;align-items:flex-end;justify-content:center;padding:0">' +
      '<div style="width:100%;max-width:460px;background:' + C.fondo + ';border-radius:16px 16px 0 0;overflow:hidden;' +
      'padding-bottom:env(safe-area-inset-bottom,0px)">' +
      '<div style="padding:14px 16px;color:' + C.suave + ';font-size:12px;border-bottom:1px solid ' + C.linea + '">Herramientas</div>' +
      items +
      '<button id="ui-menu-cerrar" style="width:100%;padding:14px;background:transparent;color:' + C.suave + ';' +
      'border:none;font-size:15px;cursor:pointer">Cerrar</button></div></div>';
    document.body.appendChild(m);

    m.querySelector("#ui-menu-cerrar").onclick = cerrarMenu;
    m.querySelector("#ui-menu-fondo").onclick = function (e) { if (e.target.id === "ui-menu-fondo") cerrarMenu(); };
    Array.prototype.forEach.call(m.querySelectorAll("button[data-i]"), function (b) {
      b.onclick = function () {
        var p = PANELES[Number(b.getAttribute("data-i"))];
        cerrarMenu();
        setTimeout(function () { try { p.abrir(); } catch (e) { console.warn("panel", p.nombre, e); } }, 60);
      };
    });
  }

  // Modal con pestañas. secciones: [{nombre, html, alArmar}]
  function modal(id, titulo, secciones, activaPorDefecto) {
    var previo = document.getElementById(id);
    if (previo) previo.remove();
    secciones = secciones.filter(function (s) { return s && s.html; });
    if (!secciones.length) return;

    var activa = Math.max(0, secciones.findIndex(function (s) { return s.nombre === activaPorDefecto; }));

    var cont = document.createElement("div");
    cont.id = id;
    cont.innerHTML = '<div class="ui-fondo" style="position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:10002;overflow-y:auto;' +
      'padding:12px;padding-top:calc(12px + env(safe-area-inset-top,0px))">' +
      '<div style="max-width:640px;margin:0 auto;background:' + C.fondo + ';border-radius:16px;padding:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<h2 style="color:' + C.texto + ';margin:0;font-size:19px">' + titulo + "</h2>" +
      '<button class="ui-cerrar" style="background:transparent;color:' + C.suave + ';border:1px solid ' + C.linea + ';' +
      'border-radius:50%;width:32px;height:32px;font-size:15px;cursor:pointer">\u2715</button></div>' +
      '<div class="ui-tabs" style="display:flex;gap:4px;overflow-x:auto;margin-bottom:14px;' +
      "border-bottom:1px solid " + C.linea + ';padding-bottom:2px"></div>' +
      '<div class="ui-cuerpo"></div>' +
      '<button class="ui-cerrar" style="width:100%;padding:11px;background:' + C.panel + ";color:" + C.suave + ";" +
      'border:1px solid ' + C.linea + ';border-radius:8px;font-size:14px;cursor:pointer;margin-top:14px">Cerrar</button>' +
      "</div></div>";
    document.body.appendChild(cont);

    var tabs = cont.querySelector(".ui-tabs");
    var cuerpo = cont.querySelector(".ui-cuerpo");

    function pintar() {
      tabs.innerHTML = secciones.map(function (s, i) {
        var on = i === activa;
        return '<button data-i="' + i + '" style="flex:0 0 auto;background:' + (on ? C.panel : "transparent") + ";" +
          "color:" + (on ? C.texto : C.suave) + ";border:none;border-bottom:2px solid " + (on ? C.acento : "transparent") + ";" +
          'padding:8px 12px;font-size:13px;cursor:pointer;white-space:nowrap;border-radius:6px 6px 0 0">' + s.nombre + "</button>";
      }).join("");
      Array.prototype.forEach.call(tabs.querySelectorAll("button"), function (b) {
        b.onclick = function () { activa = Number(b.getAttribute("data-i")); pintar(); };
      });
      cuerpo.innerHTML = secciones[activa].html;
      cuerpo.scrollIntoView({ block: "nearest" });
      if (typeof secciones[activa].alArmar === "function") {
        try { secciones[activa].alArmar(cuerpo); } catch (e) { console.warn(e); }
      }
    }
    pintar();

    Array.prototype.forEach.call(cont.querySelectorAll(".ui-cerrar"), function (b) {
      b.onclick = function () { cont.remove(); };
    });
    // Tocar fuera del panel tambien cierra: en el celular es lo que uno espera.
    var fondo = cont.querySelector(".ui-fondo");
    if (fondo) fondo.onclick = function (e) { if (e.target === fondo) cont.remove(); };
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { cont.remove(); document.removeEventListener("keydown", esc); }
    });
  }

  // Los botones que crean otros scripts: se ocultan y el menu los dispara.
  function adoptar() {
    [["exp-btn", "\uD83D\uDCBE", "Exportar", "Descargar tus operaciones"],
     ["disc-btn", "\uD83D\uDD0D", "Oportunidades", "Noticias y radar de mercado"]]
      .forEach(function (d) {
        var el = document.getElementById(d[0]);
        if (!el || el.dataset.adoptado) return;
        el.dataset.adoptado = "1";
        el.style.display = "none";
        registrar(d[1], d[2], function () { el.click(); }, d[3]);
      });
    // Los paneles propios se esconden igual; se abren desde el menu.
    ["met-btn", "wl-btn"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }

  function botonMenu() {
    if (document.getElementById("ui-fab")) return;
    var b = document.createElement("button");
    b.id = "ui-fab";
    b.setAttribute("aria-label", "Herramientas");
    b.innerHTML = "\u2630";
    b.style.cssText = "position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:16px;z-index:9999;" +
      "background:" + C.acento + ";color:#0d1117;border:none;border-radius:28px;height:52px;padding:0 20px;" +
      "font-size:20px;font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.5)";
    b.onclick = abrirMenu;
    document.body.appendChild(b);
  }

  window.__UI = { registrar: registrar, modal: modal, colores: C, abrirMenu: abrirMenu };

  // Los paneles que no se arman con este kit (el de Oportunidades, que trae su
  // propio modal) igual tienen que cerrarse con Escape: si uno responde y el otro
  // no, el que no responde parece colgado.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    ["disc-modal", "eval-modal"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.remove();
    });
    cerrarMenu();
  });

  function arrancar() { botonMenu(); adoptar(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
  // Los otros scripts crean sus botones con retardo, asi que revisamos un rato.
  var n = 0;
  var t = setInterval(function () { arrancar(); if (++n > 20) clearInterval(t); }, 500);

  console.log("\uD83C\uDFA8 ui-kit v1: menu unico y paneles con pestañas");
})();
