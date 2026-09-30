#!/usr/bin/env node
// snapshot.js — guarda una foto diaria de la cartera en history.json.
// Sin esto no hay forma de dibujar la evolucion: prices.json se pisa en cada corrida.
// Una entrada por dia (la ultima del dia reemplaza a la anterior).
"use strict";
const fs = require("fs");
const path = require("path");
const { computePortfolio } = require("./lib/portfolio.js");

const ROOT = path.join(__dirname, "..");
const HIST = path.join(ROOT, "history.json");

function leer(f, def) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return def; }
}

const oj = leer("operaciones.json", null);
const pj = leer("prices.json", null);
if (!oj || !pj || !pj.prices) {
  console.error("❌ snapshot: falta operaciones.json o prices.json");
  process.exit(1);
}
const ops = Array.isArray(oj) ? oj : oj.operaciones;
const r = computePortfolio(ops, pj.prices, pj.ccl);

if (!(r.valor > 0) || !(r.ccl > 0)) {
  console.log("⏭️  snapshot: valor o CCL en cero, no guardo la foto (dato sospechoso)");
  process.exit(0);
}

// Fecha de mercado argentino (UTC-3), no UTC: una corrida a las 22:00 UTC sigue siendo el mismo dia.
const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const punto = {
  fecha: hoy,
  invertido: Math.round(r.invertido),
  valor: Math.round(r.valor),
  realizado: Math.round(r.realizado),
  ccl: r.ccl,
  // Solo el valor va en USD. "Invertido en USD" no se puede calcular hacia atras:
  // haria falta el CCL del dia de cada compra, que no tenemos.
  valorUSD: Math.round(r.valor / r.ccl),
  posiciones: r.posiciones.length,
  // Precio en USD de SPY: sirve de referencia para comparar contra el indice.
  spy: (pj.prices.SPY && Number(pj.prices.SPY.usd)) || null
};

let hist = leer("history.json", null);
if (!hist || !Array.isArray(hist.serie)) hist = { desde: hoy, serie: [] };

const i = hist.serie.findIndex((x) => x.fecha === hoy);
if (i >= 0) hist.serie[i] = punto; else hist.serie.push(punto);
hist.serie.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
hist.ts = new Date().toISOString();
hist.dias = hist.serie.length;

fs.writeFileSync(HIST, JSON.stringify(hist, null, 1));
console.log(
  `📅 snapshot ${hoy}: valor $${punto.valor.toLocaleString("es-AR")} · ` +
  `US$${punto.valorUSD.toLocaleString("es-AR")} · CCL ${punto.ccl} · ${hist.serie.length} dia(s) en la serie`
);
