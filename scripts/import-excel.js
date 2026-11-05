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

// Solo IOLDOLD viene en dolares en el Excel. IOLCAMA es un fondo en pesos.
const EN_USD = ["IOLDOLD"];
let overrides = {};
try { overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "importar-overrides.json"), "utf8")); } catch (e) {}

// Filas del Excel que hay que saltear porque estan mal cargadas en origen.
let ignorar = {};
try { ignorar = (JSON.parse(fs.readFileSync(path.join(ROOT, "importar-ignorar.json"), "utf8")) || {}).ignorar || {}; } catch (e) {}

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

    // IOLCAMA cambio de unidad a mitad de camino: las filas viejas estan por cada
    // 1000 cuotas (50,004 a $10.999) y las nuevas por cuota (37.004 a $12,49).
    // Llevamos todo a la unidad nueva para que el saldo cierre.
    if (ticker === "IOLCAMA" && precio > 1000) {
      cant = cant * 1000;
      precio = precio / 1000;
      comision = comision; // la comision ya esta en pesos, no se escala
    }

    // Precio en dolares: lo pasamos a pesos con el tipo de cambio de la misma fila.
    if (EN_USD.indexOf(ticker) !== -1) {
      const ov = overrides[ticker] && overrides[ticker][f];
      const mep = num(row["Dolar mep"]);
      const prev = porClave[[f, ticker, tipo, cant.toFixed(4)].join("|")];
      if (isFinite(num(ov))) precio = num(ov);
      else if (isFinite(mep) && mep > 100) {
        avisos.push(`${et}: precio en dolares (${precio}), lo paso a pesos con el MEP ${mep} de la misma fila`);
        precio = precio * mep;
        comision = comision * mep;
      } else if (prev && isFinite(num(prev.ppc))) precio = num(prev.ppc);
      else {
        errores.push(`${et}: el precio (${precio}) esta en dolares y la fila no trae "Dolar mep". Cargá el valor en pesos en importar-overrides.json como {"${ticker}":{"${f}": <precio ARS>}}`);
        return;
      }
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
    if (ignorar[k]) { avisos.push(`${et}: salteada — ${ignorar[k]}`); return; }
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

// Las operaciones cargadas en la app (y traidas desde Supabase) no estan en el
// Excel: si no las conservamos aca, cada importacion las borraria. Cuando las
// agregues al Excel, la clave coincide y dejan de duplicarse solas.
const delApp = previas.filter(o => o.origen === "app" && !salida.some(n => clave(n) === clave(o)));
if (delApp.length) {
  console.log(`\nConservo ${delApp.length} operacion(es) cargadas en la app que no estan en el Excel:`);
  delApp.forEach(o => console.log(`   · ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`));
  salida.push(...delApp);
}

// Liquidez: la fila "$" de la hoja Portafolio es la plata disponible para invertir.
// Es parte del patrimonio aunque no sea una posicion, y sin esto no se ve.
try {
  const hp = wb.Sheets["Portafolio"];
  if (hp) {
    const filas = XLSX.utils.sheet_to_json(hp, { header: 1, defval: null });
    let monto = null;
    filas.forEach((f) => {
      const et = String(f[1] || "").trim();
      if (et === "$" || /^efectivo$|^liquidez$|^disponible$/i.test(et)) {
        for (let i = 2; i < f.length; i++) {
          const n = num(f[i]);
          if (isFinite(n) && n > 0) { monto = n; break; }
        }
      }
    });
    if (monto != null) {
      fs.writeFileSync(path.join(ROOT, "liquidez.json"), JSON.stringify({
        ts: new Date().toISOString(),
        fuente: "Excel: " + path.basename(archivo),
        monto_ars: Math.round(monto * 100) / 100
      }, null, 1));
      console.log(`\n💵 Liquidez: $${Math.round(monto).toLocaleString("es-AR")}`);
    }
  }
} catch (e) { avisos.push("no pude leer la liquidez de la hoja Portafolio: " + e.message); }

// Los fondos devengan fracciones de cuota todos los dias, asi que al rescatar
// todo se vende un poco mas de lo que suman las compras. Ese sobrante dejaba una
// posicion residual negativa y la app la seguia contando como activa. Recortamos
// la venta a lo que habia, siempre que la diferencia sea minima.
(function recortarRescates() {
  const saldo = {};
  salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).forEach((o) => {
    saldo[o.ticker] = saldo[o.ticker] || 0;
    if (o.tipo === "COMPRA") { saldo[o.ticker] += o.cantidad; return; }
    const exceso = o.cantidad - saldo[o.ticker];
    if (exceso > 0 && exceso <= Math.max(1e-6, saldo[o.ticker] * 0.001)) {
      avisos.push(`${o.fecha} ${o.ticker}: rescate de ${o.cantidad}, habia ${saldo[o.ticker].toFixed(4)}. ` +
        `Ajusto la venta al saldo (${exceso.toFixed(4)} cuotas devengadas).`);
      o.cantidad = saldo[o.ticker];
      o.invertido_ars = Math.round((o.cantidad * o.ppc - o.comision) * 100) / 100;
    }
    saldo[o.ticker] -= o.cantidad;
    if (Math.abs(saldo[o.ticker]) < 1e-9) saldo[o.ticker] = 0;
  });
})();

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
const quitadas = previas.filter((o) => !ahora.has(clave(o)) && o.origen !== "app");

if (avisos.length) {
  console.log(`\n⚠️  ${avisos.length} aviso(s):`);
  avisos.forEach((a) => console.log("   - " + a));
}
console.log(`\n${previas.length} operaciones antes → ${salida.length} despues`);
nuevas.forEach((o) => console.log(`   + ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`));
quitadas.forEach((o) => console.log(`   - ${o.fecha} ${o.ticker} ${o.tipo} ${o.cantidad}`));

// Si las operaciones son identicas, no reescribimos el archivo solo para cambiar
// la fecha: cada corrida generaba un commit vacio y esos commits chocaban con los
// de precios, que escriben cada 10 minutos.
const igual = JSON.stringify(previas) === JSON.stringify(salida);
if (igual) {
  console.log(`\nSin cambios reales en las operaciones (${salida.length}). No reescribo el archivo.`);
} else {
  fs.writeFileSync(SALIDA, JSON.stringify({
    ts: new Date().toISOString(),
    fuente: "Excel: " + path.basename(archivo),
    total: salida.length,
    operaciones: salida
  }, null, 1));
  console.log(`\n✅ operaciones.json actualizado (${salida.length} operaciones).`);
}
