// avisos-ui.js — panel con todo lo que la app te quiere avisar.
//
// Antes los balances aparecian pegados arriba de la pantalla sin forma de
// sacarlos. Ahora esos carteles se pueden cerrar, y lo que se cierra no se
// pierde: queda aca, junto con el calendario completo y las alertas activas.
(function () {
  "use strict";

  var UI = window.__UI;
  if (!UI) return;

  var AN = null, ALERTAS = null;

  function getJSON(u, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open("GET", u + "?t=" + Date.now(), true);
      x.onload = function () { try { cb(x.status === 200 ? JSON.parse(x.responseText) : null); } catch (e) { cb(null); } };
      x.onerror = function () { cb(null); };
      x.send(null);
    } catch (e) { cb(null); }
  }
  function ls(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }

  function cuando(fecha) {
    var hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    var d = Math.round((new Date(fecha + "T00:00:00Z") - new Date(hoy + "T00:00:00Z")) / 86400000);
    if (d < 0) return null;
    return { dias: d, texto: d === 0 ? "hoy" : d === 1 ? "mañana" : "en " + d + " dias" };
  }

  function balances() {
    if (!AN || !AN.catalysts) return [];
    var ops = ls("operaciones_raw", []);
    var tengo = {};
    ops.forEach(function (o) { tengo[String(o.ticker).toUpperCase()] = true; });
    var out = [];
    Object.keys(AN.catalysts).forEach(function (tk) {
      (AN.catalysts[tk] || []).forEach(function (ev) {
        var c = cuando(ev.date);
        if (!c || c.dias > 45) return;
        out.push({ ticker: tk, fecha: ev.date, evento: ev.event, dias: c.dias, texto: c.texto, mio: !!tengo[tk] });
      });
    });
    return out.sort(function (a, b) { return a.dias - b.dias; });
  }

  function seccionBalances() {
    var l = balances();
    if (!l.length) return '<div style="color:#8b93a7;font-size:13px">No hay balances anunciados en los proximos 45 dias.</div>';
    var h = '<div style="color:#8b93a7;font-size:12px;margin-bottom:10px">Los de tu cartera van marcados. ' +
      "Comprar el dia antes de un balance es apostar a una sorpresa, no evaluar un negocio.</div>";
    l.forEach(function (b) {
      var c = b.dias === 0 ? "#FF9800" : b.dias <= 3 ? "#64B5F6" : "#5c6478";
      h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;' +
        'background:#0d1117;border-radius:6px;margin-bottom:6px;border-left:3px solid ' + c + '">' +
        '<div><span style="color:#fff;font-weight:700">' + b.ticker + "</span>" +
        (b.mio ? ' <span style="color:#4CAF50;font-size:11px">en cartera</span>' : "") +
        '<div style="color:#5c6478;font-size:11px">' + b.evento + " · " + b.fecha + "</div></div>" +
        '<span style="color:' + c + ';font-size:13px;font-weight:700">' + b.texto + "</span></div>";
    });
    return h;
  }

  function seccionAlertas() {
    var l = (ALERTAS && ALERTAS.alertas) || [];
    if (!l.length) return '<div style="color:#8b93a7;font-size:13px">Sin alertas activas.</div>';
    var color = { "precio-justo": "#4CAF50", entrada: "#4CAF50", movimiento: "#FF9800",
      balance: "#64B5F6", rebalanceo: "#FF9800", manual: "#FF9800" };
    var h = "";
    l.forEach(function (a) {
      var c = color[a.tipo] || "#8b93a7";
      h += '<div style="padding:10px;background:#0d1117;border-radius:6px;margin-bottom:6px;border-left:3px solid ' + c + '">' +
        '<div style="color:' + c + ';font-size:13px;font-weight:700">' + a.titulo + "</div>" +
        '<div style="color:#8b93a7;font-size:12px;margin-top:3px">' + (a.texto || "") + "</div></div>";
    });
    h += '<div style="color:#5c6478;font-size:11px;margin-top:8px">Estas mismas alertas te llegan por mail ' +
      "cuando aparecen.</div>";
    return h;
  }

  function seccionCerrados() {
    var cerrados = ls("avisos_cerrados", {});
    var k = Object.keys(cerrados);
    if (!k.length) return '<div style="color:#8b93a7;font-size:13px">No ocultaste ningun cartel hoy.</div>';
    var h = '<div style="color:#8b93a7;font-size:12px;margin-bottom:10px">Carteles que ocultaste. ' +
      "Vuelven a aparecer mañana.</div>";
    k.forEach(function (t) {
      h += '<div style="padding:8px 10px;background:#0d1117;border-radius:6px;margin-bottom:6px;color:#8b93a7;font-size:12px">' +
        t + "</div>";
    });
    h += '<button id="av-restaurar" style="width:100%;padding:9px;background:#0d1117;color:#64B5F6;' +
      'border:1px solid #1f2430;border-radius:8px;font-size:13px;cursor:pointer;margin-top:6px">Volver a mostrarlos</button>';
    return h;
  }

  function abrir() {
    UI.modal("av-modal", "\uD83D\uDD14 Avisos", [
      { nombre: "Balances", html: seccionBalances() },
      { nombre: "Alertas", html: seccionAlertas() },
      {
        nombre: "Ocultos", html: seccionCerrados(), alArmar: function (cuerpo) {
          var b = cuerpo.querySelector("#av-restaurar");
          if (b) b.onclick = function () {
            try { localStorage.removeItem("avisos_cerrados"); } catch (e) {}
            var n = document.getElementById("av-modal"); if (n) n.remove();
            location.reload();
          };
        }
      }
    ]);
  }

  getJSON("analysts.json", function (d) { AN = d; });
  getJSON("alertas.json", function (d) { ALERTAS = d; });

  function registrar() {
    var l = balances();
    var prox = l.filter(function (b) { return b.dias <= 3; }).length;
    UI.registrar("\uD83D\uDD14", "Avisos", abrir,
      prox ? prox + " balance" + (prox > 1 ? "s" : "") + " en los proximos dias" : "Balances y alertas");
  }
  setTimeout(registrar, 1200);

  console.log("\uD83D\uDD14 avisos-ui v1");
})();
