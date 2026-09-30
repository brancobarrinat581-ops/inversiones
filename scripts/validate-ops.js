#!/usr/bin/env node
// validate-ops.js — corre en cada push y frena el commit si los datos estan mal.
// Chequea operaciones.json, prices.json y precios-manuales.json.
"use strict";
const fs = require("fs");
const path = require("path");
const { normalize, build, computePortfolio } = require("./lib/portfolio.js");

const ROOT = path.join(__dirname, "..");
const errores = [];
const avisos = [];
const err = (m) => errores.push(m);
const warn = (m) => avisos.push(m);

function leer(archivo, obligatorio) {
  const p = path.join(ROOT, archivo);
  if (!fs.existsSync(p)) {
    if (obligatorio) err(`${archivo}: no existe`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    err(`${archivo}: JSON invalido — ${e.message}`);
    return null;
  }
}

// ---------- operaciones.json ----------
const oj = leer("operaciones.json", true);
let ops = null;
if (oj) {
  ops = Array.isArray(oj) ? oj : oj.operaciones;
  if (!Array.isArray(ops)) err("operaciones.json: falta el array 'operaciones'");
}

if (ops) {
  if (!Array.isArray(oj) && oj.total != null && oj.total !== ops.length)
    err(`operaciones.json: 'total' dice ${oj.total} pero hay ${ops.length} operaciones`);

  const ids = new Set();
  ops.forEach((o, i) => {
    const et = `operacion #${i + 1}${o && o.ticker ? " (" + o.ticker + " " + o.fecha + ")" : ""}`;
    if (!o || typeof o !== "object") return err(`${et}: no es un objeto`);

    if (o.id != null) {
      if (ids.has(o.id)) err(`${et}: id duplicado '${o.id}'`);
      ids.add(o.id);
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(o.fecha || "")))
      err(`${et}: fecha debe ser AAAA-MM-DD, llego '${o.fecha}'`);
    else if (isNaN(new Date(String(o.fecha).slice(0, 10) + "T00:00:00Z").getTime()))
      err(`${et}: fecha inexistente '${o.fecha}'`);
    else if (String(o.fecha).slice(0, 10) > new Date().toISOString().slice(0, 10))
      warn(`${et}: fecha futura '${o.fecha}'`);

    if (!o.ticker || typeof o.ticker !== "string") err(`${et}: falta ticker`);
    else if (o.ticker !== o.ticker.toUpperCase().trim())
      err(`${et}: ticker debe ir en MAYUSCULA y sin espacios, llego '${o.ticker}'`);

    // app.js compara con "COMPRA"; cualquier otra cosa la muestra como venta
    if (o.tipo !== "COMPRA" && o.tipo !== "VENTA")
      err(`${et}: tipo debe ser COMPRA o VENTA (en mayuscula), llego '${o.tipo}'`);

    const cant = Number(o.cantidad);
    if (!isFinite(cant) || cant <= 0) err(`${et}: cantidad debe ser un numero mayor a 0, llego '${o.cantidad}'`);

    // app.js lee op.ppc, no op.precio
    if (o.ppc == null || o.ppc === "") err(`${et}: falta el campo 'ppc' (app.js lee ppc, no precio)`);
    else {
      const ppc = Number(o.ppc);
      if (!isFinite(ppc) || ppc <= 0) err(`${et}: ppc debe ser un numero mayor a 0, llego '${o.ppc}'`);
    }

    if (o.comision != null && o.comision !== "") {
      const c = Number(o.comision);
      if (!isFinite(c) || c < 0) err(`${et}: comision invalida '${o.comision}'`);
    }
  });

  // Ventas que superan lo que habia en cartera a esa fecha
  const saldo = {};
  normalize(ops).forEach((o) => {
    saldo[o.ticker] = saldo[o.ticker] || 0;
    if (o.tipo === "COMPRA") saldo[o.ticker] += o.cantidad;
    else if (o.tipo === "VENTA") {
      if (o.cantidad - saldo[o.ticker] > 1e-6)
        err(`${o.fecha} ${o.ticker}: venta de ${o.cantidad} pero en cartera habia ${saldo[o.ticker].toFixed(4)}`);
      saldo[o.ticker] -= o.cantidad;
      if (saldo[o.ticker] < 0) saldo[o.ticker] = 0;
    }
  });
}

// ---------- prices.json ----------
const pj = leer("prices.json", true);
if (pj) {
  if (!pj.prices || typeof pj.prices !== "object") err("prices.json: falta el objeto 'prices'");
  const ccl = Number(pj.ccl);
  if (!isFinite(ccl) || ccl <= 0) err(`prices.json: ccl invalido '${pj.ccl}'`);
  else if (ccl < 200 || ccl > 100000) warn(`prices.json: ccl fuera de rango razonable (${ccl})`);

  if (pj.prices) {
    Object.keys(pj.prices).forEach((t) => {
      const p = pj.prices[t] || {};
      const ars = Number(p.ars);
      if (!isFinite(ars) || ars <= 0) err(`prices.json ${t}: 'ars' invalido '${p.ars}'`);
      if (p.usd != null && p.usd !== "" && !isFinite(Number(p.usd))) err(`prices.json ${t}: 'usd' invalido '${p.usd}'`);
    });
  }
}

// ---------- precios-manuales.json ----------
const pm = leer("precios-manuales.json", false);
if (pm) {
  Object.keys(pm).forEach((k) => {
    if (k.startsWith("_") || k === "fecha") return;
    const ars = Number((pm[k] || {}).ars);
    if (!isFinite(ars) || ars <= 0) err(`precios-manuales.json ${k}: 'ars' invalido '${(pm[k] || {}).ars}'`);
  });
}

// ---------- coherencia entre archivos ----------
if (ops && pj && pj.prices) {
  const b = build(ops);
  Object.keys(b.pos).forEach((t) => {
    if (b.pos[t].cantidad > 1e-9 && !pj.prices[t])
      err(`${t} esta en cartera pero no tiene precio en prices.json (el valor se calcularia como 0)`);
  });

  const r = computePortfolio(ops, pj.prices, pj.ccl);
  // Una posicion valuada a mas de 10x su costo casi siempre es un precio mal cargado,
  // como cuando IOLCAMA quedo en ars=12 en vez de 12280.
  r.posiciones.forEach((p) => {
    if (p.invertido > 0 && p.valor > p.invertido * 10)
      err(`${p.ticker}: valor ${Math.round(p.valor)} es mas de 10x lo invertido ${Math.round(p.invertido)} — revisa el precio (${p.precio})`);
    if (p.invertido > 0 && p.valor < p.invertido * 0.1)
      err(`${p.ticker}: valor ${Math.round(p.valor)} es menos del 10% de lo invertido ${Math.round(p.invertido)} — revisa el precio (${p.precio})`);
  });

  console.log(`\nCartera resultante:`);
  console.log(`  Operaciones : ${ops.length}`);
  console.log(`  Posiciones  : ${r.posiciones.length}`);
  console.log(`  Invertido   : $${Math.round(r.invertido).toLocaleString("es-AR")}`);
  console.log(`  Valor       : $${Math.round(r.valor).toLocaleString("es-AR")}`);
  console.log(`  Ganancia    : $${Math.round(r.ganancia).toLocaleString("es-AR")} (${r.gananciaPct.toFixed(1)}%)`);
  console.log(`  Realizado   : $${Math.round(r.realizado).toLocaleString("es-AR")}`);
  console.log(`  Valor USD   : US$${Math.round(r.valorUSD).toLocaleString("es-AR")} (CCL ${r.ccl})`);
}

// ---------- salida ----------
if (avisos.length) {
  console.log(`\n⚠️  ${avisos.length} aviso(s):`);
  avisos.forEach((a) => console.log("   - " + a));
}
if (errores.length) {
  console.error(`\n❌ ${errores.length} error(es):`);
  errores.forEach((e) => console.error("   - " + e));
  console.error("\nEl commit tiene datos que romperian el dashboard. Corregilos antes de subir.\n");
  process.exit(1);
}
console.log("\n✅ Datos validos.\n");
