#!/usr/bin/env node
// merge-supabase.js — incorpora a operaciones.json las operaciones que cargaste
// con "+ Agregar" en la app, usando Supabase como puente entre dispositivos.
//
// Por que hace falta tanto cuidado: la tabla de Supabase arrastra 63 registros
// viejos con problemas reales (tipo en minuscula, una NVDA duplicada con fecha
// corrida un dia, una ADBE con comision de 10.000 sobre una compra de 20.000).
// Fusionar sin filtrar romperia la cartera. Por eso una operacion entra solo si
// pasa TODOS los controles de abajo; cualquier duda, queda afuera y se avisa.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SALIDA = path.join(ROOT, "operaciones.json");

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return d; } };

const oj = leer("operaciones.json", null);
const sb = leer("backup/supabase-ops.json", null);
if (!oj || !sb) { console.log("Falta operaciones.json o el backup de Supabase. No toco nada."); process.exit(0); }

const actuales = Array.isArray(oj) ? oj : oj.operaciones || [];
const candidatas = (sb.operaciones || []).slice();
if (!candidatas.length) { console.log("El backup no tiene operaciones. No toco nada."); process.exit(0); }

const clave = (o) => [String(o.fecha).slice(0, 10), String(o.ticker).toUpperCase(),
  String(o.tipo).toUpperCase(), Math.abs(Number(o.cantidad)).toFixed(4)].join("|");
const yaEstan = new Set(actuales.map(clave));

// Corte por momento de creacion: la ultima importacion del Excel marca la frontera.
// Todo lo que Supabase creo ANTES ya esta contemplado en el Excel (o fue descartado
// a proposito); solo nos interesa lo que se cargo despues desde la app.
const corte = oj.ts ? new Date(oj.ts).getTime() : 0;
const precios = leer("prices.json", { prices: {} }).prices || {};
const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

const nuevas = [], rechazadas = [];

candidatas.forEach((o) => {
  const et = `${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`;
  const no = (motivo) => rechazadas.push(`${et}: ${motivo}`);

  const creada = o.created_at ? new Date(o.created_at).getTime() : 0;
  if (!creada) return no("sin fecha de creacion");
  if (creada <= corte) return; // anterior al Excel: silencio, es lo esperable

  if (yaEstan.has(clave(o))) return no("ya esta en operaciones.json");

  const fecha = String(o.fecha || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return no("fecha invalida");
  if (fecha > hoy) return no("fecha futura");

  const ticker = String(o.ticker || "").toUpperCase().trim();
  if (!ticker) return no("sin ticker");
  // Un ticker que no cotiza en ningun lado no se puede valuar: entraria como cero.
  if (!precios[ticker]) return no(`${ticker} no tiene precio, no se podria valuar`);

  const tipo = String(o.tipo || "").toUpperCase().trim();
  if (tipo !== "COMPRA" && tipo !== "VENTA") return no(`tipo "${o.tipo}" desconocido`);

  const cantidad = Math.abs(Number(o.cantidad));
  const precio = Number(o.precio != null ? o.precio : o.ppc);
  if (!isFinite(cantidad) || cantidad <= 0) return no("cantidad invalida");
  if (!isFinite(precio) || precio <= 0) return no("precio invalido");

  const comision = Math.abs(Number(o.comision_monto != null ? o.comision_monto : o.comision) || 0);
  // Una comision de IOL ronda el 0,7%. Arriba del 5% es un dato mal cargado:
  // asi estaba la ADBE con comision de 10.000 sobre una compra de 20.000.
  if (comision > cantidad * precio * 0.05)
    return no(`comision ${comision.toFixed(0)} sobre ${(cantidad * precio).toFixed(0)} invertidos, es demasiada`);

  nuevas.push({
    id: "sb" + o.id,
    user_id: o.user_id,
    fecha, ticker, tipo, cantidad,
    precio, ppc: precio,
    comision: Math.round(comision * 100) / 100,
    invertido_ars: Math.round((cantidad * precio + comision) * 100) / 100,
    origen: "app"   // para que la proxima importacion del Excel no las borre
  });
});

if (rechazadas.length) {
  console.log(`\n⚠️  ${rechazadas.length} operacion(es) de Supabase quedaron afuera:`);
  rechazadas.forEach((r) => console.log("   - " + r));
}

if (!nuevas.length) { console.log("\nNada nuevo para incorporar."); process.exit(0); }

const todas = actuales.concat(nuevas);
todas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

console.log(`\n${actuales.length} operaciones → ${todas.length}`);
nuevas.forEach((o) => console.log(`   + ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad} @ ${o.precio} (cargada en la app)`));

fs.writeFileSync(SALIDA, JSON.stringify({
  ts: new Date().toISOString(),
  fuente: (oj.fuente || "Excel") + " + app",
  total: todas.length,
  operaciones: todas
}, null, 1));
console.log("\n✅ operaciones.json actualizado.");
