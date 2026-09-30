// portfolio.js — calculo de cartera replicando exactamente la logica de app.js
// costoTotal = cantidad * ppc + comision ; costo promedio ponderado; ventas
// reducen el costo proporcionalmente y acumulan resultado realizado.
"use strict";

function num(v) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : 0; }

function normalize(ops) {
  return (ops || [])
    .filter(function (o) { return o && o.ticker && o.fecha; })
    .map(function (o) {
      return {
        fecha: String(o.fecha).slice(0, 10),
        ticker: String(o.ticker).toUpperCase().trim(),
        tipo: String(o.tipo || "").toUpperCase().trim(),
        cantidad: Math.abs(num(o.cantidad)),
        ppc: num(o.ppc != null && o.ppc !== "" ? o.ppc : o.precio),
        comision: num(o.comision != null ? o.comision : o.comision_monto)
      };
    })
    .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
}

// Recorre las operaciones y devuelve posiciones, realizado y flujos de caja.
function build(ops) {
  var pos = {}, realizado = 0, flujos = [];
  normalize(ops).forEach(function (o) {
    if (!pos[o.ticker]) pos[o.ticker] = { cantidad: 0, costo: 0 };
    var p = pos[o.ticker];
    if (o.tipo === "COMPRA") {
      var egreso = o.cantidad * o.ppc + o.comision;
      p.cantidad += o.cantidad;
      p.costo += egreso;
      flujos.push({ fecha: o.fecha, monto: -egreso });
    } else if (o.tipo === "VENTA") {
      var unitario = p.cantidad > 0 ? p.costo / p.cantidad : 0;
      var vendido = Math.min(o.cantidad, p.cantidad);
      var ingreso = o.cantidad * o.ppc - o.comision;
      realizado += ingreso - vendido * unitario;
      p.cantidad -= vendido;
      p.costo -= vendido * unitario;
      if (p.cantidad < 1e-9) { p.cantidad = 0; p.costo = 0; }
      flujos.push({ fecha: o.fecha, monto: ingreso });
    }
  });
  return { pos: pos, realizado: realizado, flujos: flujos };
}

// prices: objeto {TICKER:{ars,usd,...}} ; ccl: numero
function computePortfolio(ops, prices, ccl) {
  var b = build(ops);
  prices = prices || {};
  var posiciones = [], invertido = 0, valor = 0, sinPrecio = [];
  Object.keys(b.pos).forEach(function (t) {
    var p = b.pos[t];
    if (p.cantidad <= 1e-9) return;
    var px = prices[t] || {};
    var ars = num(px.ars);
    var val = ars > 0 ? p.cantidad * ars : 0;
    if (ars <= 0) sinPrecio.push(t);
    invertido += p.costo;
    valor += val;
    posiciones.push({
      ticker: t,
      cantidad: p.cantidad,
      ppc: p.costo / p.cantidad,
      invertido: p.costo,
      precio: ars,
      valor: val,
      ganancia: val - p.costo
    });
  });
  posiciones.sort(function (a, b2) { return b2.valor - a.valor; });
  var c = num(ccl);
  return {
    posiciones: posiciones,
    sinPrecio: sinPrecio,
    invertido: invertido,
    valor: valor,
    ganancia: valor - invertido,
    gananciaPct: invertido > 0 ? (valor - invertido) / invertido * 100 : 0,
    realizado: b.realizado,
    ccl: c,
    valorUSD: c > 0 ? valor / c : 0,
    flujos: b.flujos
  };
}

// TIR anualizada sobre flujos de caja con fechas irregulares (equivale a XIRR de Excel).
// flujos: [{fecha:'YYYY-MM-DD', monto}] ; el valor actual entra como ingreso final.
function xirr(flujos, valorFinal, fechaFinal) {
  var f = (flujos || []).slice();
  if (valorFinal) f.push({ fecha: fechaFinal, monto: valorFinal });
  if (f.length < 2) return null;
  var hayNeg = f.some(function (x) { return x.monto < 0; });
  var hayPos = f.some(function (x) { return x.monto > 0; });
  if (!hayNeg || !hayPos) return null;

  var t0 = new Date(f[0].fecha + "T00:00:00Z").getTime();
  var años = f.map(function (x) {
    return (new Date(x.fecha + "T00:00:00Z").getTime() - t0) / (365 * 24 * 3600 * 1000);
  });

  function van(r) {
    var s = 0;
    for (var i = 0; i < f.length; i++) s += f[i].monto / Math.pow(1 + r, años[i]);
    return s;
  }
  // Biseccion: robusta y sin riesgo de divergencia (Newton falla con flujos irregulares).
  var lo = -0.9999, hi = 100;
  if (van(lo) * van(hi) > 0) return null;
  for (var k = 0; k < 200; k++) {
    var mid = (lo + hi) / 2;
    if (van(lo) * van(mid) <= 0) hi = mid; else lo = mid;
  }
  var r = (lo + hi) / 2;
  return isFinite(r) ? r * 100 : null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computePortfolio: computePortfolio, xirr: xirr, normalize: normalize, build: build };
}
if (typeof window !== "undefined") {
  window.__PF = { computePortfolio: computePortfolio, xirr: xirr, normalize: normalize, build: build };
}
