#!/usr/bin/env node
// import-excel.js — regenera operaciones.json a partir del Excel de control.
// Dejas el .xlsx en la carpeta datos/ del repo y el workflow hace el resto.
//
// Reglas importantes:
//  - "Invertido $" del Excel YA incluye la comision. La columna PPC la vuelve a
//    sumar, asi que esta mal: la ignoramos y usamos "Precio Compra".
//  - app.js calcula cantidad*ppc + comision, o sea que guardando ppc=Precio Compra
//    y comision aparte da exactamente el "Invertido $" del Excel.
//  - Cantidad negativa o tipo raro (CEDEAR) se normaliza y se avisa.
"use strict";
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const DATOS = path.join(ROOT, "datos");
const SALIDA = path.join(ROOT, "operaciones.json");
const HOJAS = ["Operaciones", "Operaciones manuales"];
const USER = "dd9be8e9-14f1-4c27-bb96-4e6b6cb24f06";

const avisos = [];
const errores = [];

function buscarExcel() {
  const desdeArg = process.argv[2];
  if (desdeArg) return desdeArg;
  if (!fs.existsSync(DATOS)) return null;
  const f = fs.readdirSync(DATOS)
    .filter((x) => /\.xlsx$/i.test(x) && !x.startsWith("~$"))
    .map((x) => ({ x, t: fs.statSync(path.join(DATOS, x)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  return f ? path.join(DATOS, f.x) : null;
}

function fecha(v) {
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === "number") { // serial de Excel
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v || "").trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

// ---------- leer ----------
const archivo = buscarExcel();
if (!archivo || !fs.existsSync(archivo)) {
  console.error("❌ No encontre ningun .xlsx. Dejalo en la carpeta datos/ del repo.");
  process.exit(1);
}
console.log("📄 Leyendo " + path.relative(ROOT, archivo));

const wb = XLSX.readFile(archivo, { cellDates: true });
const previas = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    return Array.isArray(j) ? j : j.operaciones || [];
  } catch (e) { return []; }
})();
const clave = (o) => [String(o.fecha).slice(0, 10), String(o.ticker).toUpperCase(), String(o.tipo).toUpperCase(), Math.abs(Number(o.cantidad)).toFixed(4)].join("|");
const porClave = {};
previas.forEach((o) => { porClave[clave(o)] = o; });

// Tickers cuyo precio en el Excel esta en dolares: no se pueden convertir solos
// porque el tipo de cambio de la planilla no es el que usa la app.
const EN_USD = ["IOLDOLD"];
let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "importar-overrides.json"), "utf8")); } catch (e) {}

const salida = [];
const idsUsados = new Set();
let n = 0;
function nuevoId() { do { n++; } while (idsUsados.has("x" + String(n).padStart(3, "0"))); return "x" + String(n).padStart(3, "0"); }

HOJAS.forEach((hoja) => {
  if (!wb.Sheets[hoja]) { avisos.push(`la hoja "${hoja}" no existe en el Excel`); return; }
  XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null }).forEach((row, i) => {
    const f = fecha(row["Fecha"]);
    const ticker = String(row["Ticker"] || "").toUpperCase().trim();
    if (!f || !ticker) return; // fila vacia o de relleno

    const et = `${hoja} fila ${i + 2} (${ticker} ${f})`;
    let cant = num(row["Cantidad"]);
    let tipo = String(row["Tipo"] || "").toUpperCase().trim();
    let precio = num(row["Precio Compra"]);
    let comision = Math.abs(num(row["Comisión $"]) || 0);
    const invertido = num(row["Invertido $"]);

    if (!isFinite(cant) || cant === 0) { errores.push(`${et}: cantidad invalida`); return; }
    if (!isFinite(precio) || precio <= 0) { errores.push(`${et}: "Precio Compra" invalido`); return; }

    // Cantidad negativa = venta (asi estan cargadas las de la hoja manual)
    if (cant < 0) { if (tipo !== "VENTA") avisos.push(`${et}: cantidad negativa, la tomo como VENTA`); tipo = "VENTA"; cant = Math.abs(cant); }
    if (tipo !== "COMPRA" && tipo !== "VENTA") {
      avisos.push(`${et}: tipo "${row["Tipo"]}" no es COMPRA ni VENTA, la tomo como COMPRA`);
      tipo = "COMPRA";
    }

    // Precio en dolares: necesita el valor en pesos, no lo adivinamos
    if (EN_USD.indexOf(ticker) !== -1 || (precio < 100 && ticker.indexOf("IOL") === 0)) {
      const ov = overrides[ticker] && overrides[ticker][f];
      const prev = porClave[[f, ticker, tipo, cant.toFixed(4)].join("|")];
      if (isFinite(num(ov))) precio = num(ov);
      else if (prev && isFinite(num(prev.ppc))) precio = num(prev.ppc);
      else {
        errores.push(`${et}: el precio (${precio}) esta en dolares. Cargá el valor en pesos en importar-overrides.json como {"${ticker}":{"${f}": <precio ARS>}}`);
        return;
      }
      comision = 0; // la comision del Excel tambien viene en dolares
    } else if (isFinite(invertido)) {
      // La columna "Invertido $" del Excel es inconsistente: en las operaciones
      // viejas incluye la comision y en las nuevas no. Las dos formas son
      // esperables, asi que solo avisamos si no coincide con ninguna.
      const bruto = cant * precio;
      const inv = Math.abs(invertido);
      if (Math.abs(bruto - inv) > 1 && Math.abs(bruto + comision - inv) > 1)
        avisos.push(`${et}: cantidad*precio = ${bruto.toFixed(2)} (+${comision.toFixed(2)} de comision) no coincide con "Invertido $" = ${inv.toFixed(2)}`);
    }

    const k = [f, ticker, tipo, cant.toFixed(4)].join("|");
    const prev = porClave[k];
    const id = prev && prev.id && !idsUsados.has(prev.id) ? prev.id : nuevoId();
    idsUsados.add(id);
    salida.push({
      id: id,
      user_id: (prev && prev.user_id) || USER,
      fecha: f,
      ticker: ticker,
      tipo: tipo,
      cantidad: cant,
      precio: precio,
      ppc: precio,
      comision: Math.round(comision * 100) / 100,
      invertido_ars: Math.round((cant * precio + comision) * 100) / 100
    });
  });
});

salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

if (errores.length) {
  console.error(`\n❌ ${errores.length} error(es), no toco operaciones.json:`);
  errores.forEach((e) => console.error("   - " + e));
  process.exit(1);
}
if (!salida.length) { console.error("❌ El Excel no tiene operaciones legibles."); process.exit(1); }

// ---------- diff ----------
const antes = new Set(previas.map(clave));
const ahora = new Set(salida.map(clave));
const nuevas = salida.filter((o) => !antes.has(clave(o)));
const quitadas = previas.filter((o) => !ahora.has(clave(o)));

if (avisos.length) {
  console.log(`\n⚠️  ${avisos.length} aviso(s):`);
  avisos.forEach((a) => console.log("   - " + a));
}
console.log(`\n${previas.length} operaciones antes → ${salida.length} despues`);
nuevas.forEach((o) => console.log(`   + ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`));
quitadas.forEach((o) => console.log(`   - ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`));

fs.writeFileSync(SALIDA, JSON.stringify({
  ts: new Date().toISOString(),
  fuente: "Excel: " + path.basename(archivo),
  total: salida.length,
  operaciones: salida
}, null, 1));
console.log(`\n✅ operaciones.json actualizado (${salida.length} operaciones).`);
