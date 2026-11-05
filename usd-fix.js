// usd-fix.js — corrige los valores en dolares del tablero.
//
// app.js calcula el dolar de cada posicion como cantidad / ratio x precio en
// dolares, usando una tabla de ratios de CEDEAR que tiene adentro y que no se
// puede editar porque el archivo esta minificado. Esa tabla no conoce los
// tickers agregados despues: para NFLX y GOOGL divide por 1 en vez de por 48 y
// 58, y los infla. Netflix figuraba en US$8.166 cuando son US$171, y el total
// de la cartera daba US$20.956 en vez de US$6.142.
//
// La correccion no depende de ningun ratio: toma el valor en pesos que ya esta
// en pantalla y lo divide por el CCL. Es el mismo criterio que usa el panel de
// Rendimiento, asi que los dos numeros coinciden.
(function () {
  "use strict";

  function ls(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }

  function ccl() {
    var p = ls("prices_data", null);
    var c = p && Number(p.ccl);
    return isFinite(c) && c > 0 ? c : 0;
  }

  function cartera() {
    var PF = window.__PF, p = ls("prices_data", null), ops = ls("operaciones_raw", []);
    if (!PF || !p || !p.prices || !ops.length) return null;
    try { return PF.computePortfolio(ops, p.prices, p.ccl); } catch (e) { return null; }
  }

  var fUSD = function (n) { return "USD " + Math.round(n).toLocaleString("es-AR"); };
  // "$1.210.560" -> 1210560
  function pesos(txt) {
    var m = String(txt).match(/\$\s?([\d.]+)(?:,(\d+))?/);
    if (!m) return null;
    var n = Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : ""));
    return isFinite(n) && n > 0 ? n : null;
  }

  var corrigiendo = false;

  function corregir() {
    if (corrigiendo) return;
    var c = ccl();
    if (!c) return;
    corrigiendo = true;
    try {
      var r = cartera();

      document.querySelectorAll("div,span,p").forEach(function (el) {
        if (el.children.length) return;
        var t = (el.textContent || "").trim();

        // Total de la cartera y cantidad de posiciones
        var padre = el.parentElement ? (el.parentElement.textContent || "") : "";
        if (r && padre.indexOf("Valor en USD") !== -1) {
          if (/^USD\s[\d.,]+$/.test(t)) {
            var esperado = fUSD(r.valor / c);
            if (t !== esperado) el.textContent = esperado;
            return;
          }
          var mp = t.match(/^(\d+)\s+posiciones activas$/);
          if (mp && Number(mp[1]) !== r.posiciones.length) {
            el.textContent = r.posiciones.length + " posiciones activas";
            return;
          }
          return;
        }

        // Dolares de cada posicion: se derivan del peso que ya esta al lado
        if (!/^USD\s[\d.,]+$/.test(t)) return;
        var ars = pesos(padre);
        if (!ars) return;
        var bien = fUSD(ars / c);
        if (t !== bien) el.textContent = bien;
      });
    } catch (e) {
      console.warn("usd-fix", e);
    } finally {
      corrigiendo = false;
    }
  }

  var pendiente = null;
  function agendar() {
    if (pendiente) return;
    pendiente = setTimeout(function () { pendiente = null; corregir(); }, 250);
  }

  function arrancar() {
    corregir();
    // React vuelve a dibujar y pisa el texto, asi que hay que reaplicarlo.
    try {
      new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
    setInterval(corregir, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
  setTimeout(arrancar, 2500);

  console.log("\uD83D\uDCB5 usd-fix v1: dolares derivados del CCL, sin depender de los ratios de app.js");
})();
