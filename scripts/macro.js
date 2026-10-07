#!/usr/bin/env node
// macro.js — inflacion y tasas desde la API publica del BCRA.
//
// Segunda fuente, independiente de Yahoo y oficial. Sirve para la pregunta que de
// verdad importa en Argentina: si ganaste plata o solo le empataste a la inflacion.
// No pide registro ni clave: https://api.bcra.gob.ar
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SALIDA = path.join(ROOT, "macro.json");

async function get(url, timeout = 15000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      "Accept": "application/json"
    }});
    clearTimeout(id);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } catch (e) { clearTimeout(id); throw e; }
}

// El catalogo de variables cambia de ID cada tanto, asi que las buscamos por su
// descripcion en vez de hardcodear numeros que despues apuntan a otra cosa.
async function catalogo() {
  const bases = [
    "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias",
    "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias"
  ];
  for (const url of bases) {
    try {
      const d = await get(url);
      const lista = Array.isArray(d) ? d : d.results || d.Results || [];
      if (lista.length) { console.log(`Catalogo BCRA: ${lista.length} variables (${url.split("/").slice(-2)[0]})`); return lista; }
    } catch (e) { console.log("BCRA " + url + " FALLO: " + e.message); }
  }
  return [];
}

const norm = (s) => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function buscar(lista, frases) {
  for (const f of frases) {
    const hit = lista.find(v => norm(v.descripcion || v.Descripcion).includes(norm(f)));
    if (hit) return hit;
  }
  return null;
}

const valorDe = (v) => {
  const n = Number(v.valor != null ? v.valor : v.Valor);
  return isFinite(n) ? n : null;
};
const fechaDe = (v) => String(v.fecha || v.Fecha || "").slice(0, 10) || null;

async function main() {
  const lista = await catalogo();
  if (!lista.length) {
    console.log("⚠️  BCRA no respondio. Dejo macro.json como estaba.");
    process.exit(0);
  }

  const buscados = {
    inflacionMensual: ["inflacion mensual"],
    inflacionInteranual: ["inflacion interanual"],
    inflacionEsperada: ["inflacion esperada", "rem", "proximos 12 meses"],
    tasaPolitica: ["tasa de politica monetaria"],
    plazoFijo: ["badlar", "plazo fijo", "tasa de interes de depositos"]
  };

  const out = { ts: new Date().toISOString(), fuente: "BCRA (api.bcra.gob.ar)" };
  for (const [clave, frases] of Object.entries(buscados)) {
    const v = buscar(lista, frases);
    if (!v) { console.log(`  ${clave}: no encontrada en el catalogo`); continue; }
    const val = valorDe(v);
    if (val == null) { console.log(`  ${clave}: sin valor`); continue; }
    out[clave] = { valor: val, fecha: fechaDe(v), descripcion: v.descripcion || v.Descripcion, id: v.idVariable || v.IdVariable };
    console.log(`  ${clave}: ${val} (${out[clave].fecha})`);
  }

  // Inflacion acumulada de los ultimos 12 meses, para comparar con tu rendimiento.
  if (out.inflacionInteranual) out.inflacion12m = out.inflacionInteranual.valor;
  else if (out.inflacionMensual) out.inflacion12m = (Math.pow(1 + out.inflacionMensual.valor / 100, 12) - 1) * 100;

  if (Object.keys(out).length <= 2) {
    console.log("⚠️  No se pudo leer ninguna variable util. No escribo macro.json.");
    process.exit(0);
  }

  // Conservamos lo anterior para lo que hoy no vino.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(SALIDA, "utf8")); } catch (e) {}
  fs.writeFileSync(SALIDA, JSON.stringify({ ...prev, ...out }, null, 1));
  console.log("\n✅ macro.json actualizado.");
}

main().catch(e => { console.error("ERROR", e); process.exit(1); });
