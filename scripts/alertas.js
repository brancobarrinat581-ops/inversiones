#!/usr/bin/env node
// alertas.js — revisa la cartera y la watchlist y escribe las alertas en alertas.json.
// El workflow las convierte en issues de GitHub, que te llegan por mail sin
// necesidad de configurar ningun servidor de correo.
"use strict";
const fs = require("fs");
const path = require("path");
const { computePortfolio } = require("./lib/portfolio.js");

const ROOT = path.join(__dirname, "..");
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return d; } };

const oj = leer("operaciones.json", null);
const pj = leer("prices.json", null);
const wl = leer("watchlist.json", {});
const an = leer("analysts.json", {});
if (!oj || !pj || !pj.prices) { console.log("Sin datos, no evaluo alertas."); process.exit(0); }

const ops = Array.isArray(oj) ? oj : oj.operaciones;
const r = computePortfolio(ops, pj.prices, pj.ccl);
const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const alertas = [];

// 1) Una accion en seguimiento llego a tu precio de entrada
((wl && wl.watchlist) || []).forEach((it) => {
  const px = pj.prices[it.ticker];
  if (!px || !(px.usd > 0) || it.objetivo == null) return;
  if (px.usd <= Number(it.objetivo))
    alertas.push({
      tipo: "entrada", clave: `entrada-${it.ticker}-${it.objetivo}`,
      titulo: `${it.ticker} llego a tu precio de entrada`,
      texto: `Cotiza US$${px.usd} y tu precio era US$${it.objetivo}.` + (it.nota ? ` Tu nota: ${it.nota}` : "")
    });
});

// 2) Movimiento fuerte del dia en algo que tenes
r.posiciones.forEach((p) => {
  const px = pj.prices[p.ticker] || {};
  const ch = Number(px.changePct);
  if (isFinite(ch) && Math.abs(ch) >= 7)
    alertas.push({
      tipo: "movimiento", clave: `mov-${p.ticker}-${hoy}`,
      titulo: `${p.ticker} se movio ${ch > 0 ? "+" : ""}${ch.toFixed(1)}% hoy`,
      texto: `Tu posicion vale $${Math.round(p.valor).toLocaleString("es-AR")}, ${ch > 0 ? "arriba" : "abajo"} de lo habitual.`
    });
});

// 3) Balance de los proximos 3 dias
Object.keys(an.catalysts || {}).forEach((tk) => {
  (an.catalysts[tk] || []).forEach((c) => {
    const d = Math.round((new Date(c.date + "T00:00:00Z") - new Date(hoy + "T00:00:00Z")) / 86400000);
    if (d < 0 || d > 3) return;
    const tengo = r.posiciones.some((p) => p.ticker === tk);
    const sigo = ((wl && wl.watchlist) || []).some((w) => w.ticker === tk);
    if (!tengo && !sigo) return;
    alertas.push({
      tipo: "balance", clave: `bal-${tk}-${c.date}`,
      titulo: `${tk} presenta balance ${d === 0 ? "hoy" : d === 1 ? "mañana" : "en " + d + " dias"}`,
      texto: `${c.event} el ${c.date}.` + (tengo ? " Lo tenes en cartera." : " Lo tenes en seguimiento.")
    });
  });
});

// 4) Un grupo se corrio mucho del objetivo
const gr = leer("grupos.json", null);
if (gr && gr.grupos && r.valor > 0) {
  const deTicker = {};
  Object.keys(gr.grupos).forEach((g) => (gr.grupos[g].tickers || []).forEach((t) => { deTicker[t] = g; }));
  const peso = {};
  r.posiciones.forEach((p) => { const g = deTicker[p.ticker]; if (g) peso[g] = (peso[g] || 0) + p.valor; });
  Object.keys(gr.grupos).forEach((g) => {
    const obj = gr.grupos[g].objetivo;
    if (obj == null) return;
    const w = (peso[g] || 0) / r.valor * 100;
    if (Math.abs(w - obj) >= 10)
      alertas.push({
        tipo: "rebalanceo", clave: `reb-${g}-${hoy.slice(0, 7)}`,
        titulo: `${g} esta en ${w.toFixed(1)}% y tu objetivo es ${obj}%`,
        texto: `Son ${Math.abs(Math.round((obj / 100) * r.valor - (peso[g] || 0))).toLocaleString("es-AR")} pesos de diferencia.`
      });
  });
}

// Las ya avisadas no se repiten: se guarda la clave de cada una.
const previas = leer("alertas.json", { avisadas: [], alertas: [] });
const yaVistas = new Set(previas.avisadas || []);
const nuevas = alertas.filter((a) => !yaVistas.has(a.clave));

// La memoria se limita a las ultimas 200 para que el archivo no crezca sin fin.
const avisadas = (previas.avisadas || []).concat(nuevas.map((a) => a.clave)).slice(-200);
fs.writeFileSync(path.join(ROOT, "alertas.json"), JSON.stringify({ ts: new Date().toISOString(), avisadas, alertas }, null, 1));
fs.writeFileSync(path.join(ROOT, "alertas-nuevas.json"), JSON.stringify(nuevas, null, 1));

console.log(`${alertas.length} alerta(s) activas, ${nuevas.length} sin avisar.`);
nuevas.forEach((a) => console.log("   - " + a.titulo));
