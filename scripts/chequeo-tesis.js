#!/usr/bin/env node
// chequeo-tesis.js — mira si cada empresa sigue cumpliendo lo que te hizo comprarla.
//
// La idea: el precio no es una razon para vender. Si compraste porque el negocio
// crece y genera caja, la señal de salida es que deje de crecer o de generar caja,
// no que la accion caiga. NVDA cayo 39% con crecimiento de 103% y margen de 66%:
// por estos criterios no pasa nada, y eso es exactamente lo que tiene que decir.
//
// Los umbrales viven en tesis.json, por perfil. El perfil importa: en una empresa
// en expansion la caja negativa es la inversion que la hace crecer (MELI en
// logistica, GOOGL en centros de datos, VIST en Vaca Muerta). Solo molesta cuando
// el crecimiento ya no la justifica.
"use strict";
const fs = require("fs");
const path = require("path");
const { computePortfolio } = require("./lib/portfolio.js");

const ROOT = path.join(__dirname, "..");
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return d; } };

const oj = leer("operaciones.json", null);
const pj = leer("prices.json", null);
const an = leer("analysts.json", {});
const tj = leer("tesis.json", {});
if (!oj || !pj || !pj.prices) { console.log("Faltan datos, no chequeo nada."); process.exit(0); }

const PERFILES = tj.perfiles || {};
const TESIS = tj.tesis || {};
const FUND = an.fundamentals || {};
const SORP = an.sorpresas || {};

const ops = Array.isArray(oj) ? oj : oj.operaciones;
const r = computePortfolio(ops, pj.prices, pj.ccl);

// Un umbral puesto en la posicion pisa al del perfil.
function reglas(tk) {
  const t = TESIS[tk] || {};
  const base = PERFILES[t.perfil || "madura"] || {};
  const out = Object.assign({}, base, t);
  out._perfil = t.perfil || "madura";
  return out;
}

const pct = (v) => (v == null ? null : v * 100);

function evaluar(tk) {
  const R = reglas(tk);
  if (R.sin_chequeo) return { tk, perfil: R._perfil, sinChequeo: true, señales: [] };

  const f = FUND[tk];
  if (!f || f.margenOperativo == null) return { tk, perfil: R._perfil, sinDatos: true, señales: [] };

  const señales = [];
  const ok = [];

  const crec = pct(f.crecimientoVentas);
  if (crec != null) {
    if (crec < R.crecimiento_minimo)
      señales.push({ clave: "crecimiento", texto: `Ventas creciendo ${crec.toFixed(0)}%, por debajo del ${R.crecimiento_minimo}% que le pedis a una ${R._perfil}` });
    else ok.push(`crece ${crec.toFixed(0)}%`);
  }

  const mg = pct(f.margenOperativo);
  // Sin el margen del dia de la compra no se puede medir la caida: se guarda el de
  // hoy como referencia y a partir de la proxima corrida ya hay con que comparar.
  const ref = (TESIS[tk] || {}).margen_referencia;
  if (mg != null) {
    if (ref != null && ref - mg > R.caida_margen_maxima)
      señales.push({ clave: "margen", texto: `Margen operativo bajo de ${ref.toFixed(0)}% a ${mg.toFixed(0)}%, ${(ref - mg).toFixed(0)} puntos` });
    else ok.push(`margen ${mg.toFixed(0)}%`);
  }

  if (f.flujoLibre != null) {
    const fl = f.flujoLibre / 1e9;
    if (fl < 0) {
      if (R.flujo_libre_negativo_alerta)
        señales.push({ clave: "caja", texto: `Flujo de caja libre negativo (US$ ${fl.toFixed(1)}B) en un negocio maduro` });
      else if (crec != null && crec < R.crecimiento_minimo)
        señales.push({ clave: "caja", texto: `Flujo de caja libre negativo (US$ ${fl.toFixed(1)}B) y ya no crece lo suficiente para justificarlo` });
      else
        ok.push(`caja negativa pero creciendo: es inversion, no fuga`);
    } else ok.push(`genera US$ ${fl.toFixed(1)}B de caja libre`);
  }

  if (f.deudaPatrimonio != null) {
    if (f.deudaPatrimonio > R.deuda_patrimonio_maxima)
      señales.push({ clave: "deuda", texto: `Deuda sobre patrimonio en ${f.deudaPatrimonio.toFixed(0)}, arriba del limite de ${R.deuda_patrimonio_maxima}` });
    else ok.push(`deuda ${f.deudaPatrimonio.toFixed(0)}`);
  }

  const sp = SORP[tk];
  if (sp && sp.trimestres && sp.trimestres.length) {
    const ult = sp.trimestres.slice(-R.balances_fallados_seguidos);
    const fallados = ult.filter((q) => q.real < q.esperado).length;
    if (ult.length >= R.balances_fallados_seguidos && fallados === ult.length)
      señales.push({ clave: "balances", texto: `Fallo los ultimos ${fallados} balances seguidos` });
    else ok.push(`${sp.superados} de ${sp.total} balances superados`);
  }

  // Una señal sola puede ser un trimestre flojo; dos a la vez ya es un patron.
  const estado = señales.length >= 2 ? "rota" : señales.length === 1 ? "atencion" : "intacta";
  return { tk, perfil: R._perfil, estado, señales, ok, margenHoy: mg };
}

const posiciones = r.posiciones.map((p) => p.ticker);
const resultado = {};
posiciones.forEach((tk) => { resultado[tk] = evaluar(tk); });

// Guardar el margen de hoy como referencia para la proxima corrida, sin pisar uno
// que ya exista: la referencia tiene que ser la del dia que compraste, no la de ayer.
let cambios = 0;
posiciones.forEach((tk) => {
  const e = resultado[tk];
  if (e.sinChequeo || e.sinDatos || e.margenHoy == null) return;
  if (!TESIS[tk]) TESIS[tk] = { perfil: "madura", salida: null, nota: "" };
  if (TESIS[tk].margen_referencia == null) {
    TESIS[tk].margen_referencia = Math.round(e.margenHoy * 10) / 10;
    cambios++;
  }
});
if (cambios) {
  tj.tesis = TESIS;
  fs.writeFileSync(path.join(ROOT, "tesis.json"), JSON.stringify(tj, null, 2));
  console.log(`Guardo el margen de referencia de ${cambios} posicion(es) para poder medir la caida a partir de ahora.`);
}

const salida = { ts: new Date().toISOString(), fuente: "Yahoo Finance via analysts.json", posiciones: resultado };
fs.writeFileSync(path.join(ROOT, "chequeo-tesis.json"), JSON.stringify(salida, null, 1));

const rotas = posiciones.filter((t) => resultado[t].estado === "rota");
const atencion = posiciones.filter((t) => resultado[t].estado === "atencion");
const intactas = posiciones.filter((t) => resultado[t].estado === "intacta");

console.log(`\n✅ Tesis intacta (${intactas.length}): ${intactas.join(", ") || "-"}`);
if (atencion.length) {
  console.log(`\n⚠️  Para mirar (${atencion.length}):`);
  atencion.forEach((t) => resultado[t].señales.forEach((s) => console.log(`   ${t}: ${s.texto}`)));
}
if (rotas.length) {
  console.log(`\n❌ Tesis rota (${rotas.length}):`);
  rotas.forEach((t) => resultado[t].señales.forEach((s) => console.log(`   ${t}: ${s.texto}`)));
}
const sin = posiciones.filter((t) => resultado[t].sinDatos);
if (sin.length) console.log(`\nSin datos de balance: ${sin.join(", ")}`);
