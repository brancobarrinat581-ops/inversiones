#!/usr/bin/env node
// tecnicos.js — calcula zonas de compra y venta a partir de un año de precios.
//
// El precio de referencia que teniamos salia solo del consenso de analistas, que
// como pronostico es flojo: se revisa hacia donde ya se movio el precio. Esto mira
// el precio mismo: donde esta parado respecto de su propio año, de sus medias y
// de su volatilidad. No predice nada, ubica.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Algunos tickers argentinos cotizan en Nueva York con otro simbolo. Sin esto,
// PAMP quedaba sin historico y por lo tanto fuera del calculo de correlaciones.
const YSYM = { PAMP: "PAM", BMA: "BMA", VIST: "VIST", GGAL: "GGAL", YPF: "YPF" };
const ysym = (tk) => YSYM[tk] || tk;

async function get(url, timeout = 12000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"
    }});
    clearTimeout(id);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  } catch (e) { clearTimeout(id); throw e; }
}

async function historico(symbol, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`);
      const res = (await r.json())?.chart?.result?.[0];
      const cierres = (res?.indicators?.quote?.[0]?.close || []).filter(x => x > 0);
      if (cierres.length < 60) throw new Error("serie corta");
      return cierres;
    } catch (e) {
      if (i === intentos - 1) throw e;
      await new Promise(r => setTimeout(r, 2500 * (i + 1)));
    }
  }
}

const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sma = (c, n) => (c.length < n ? null : media(c.slice(-n)));

// RSI de 14 ruedas por el metodo de Wilder.
function rsi(cierres, n = 14) {
  if (cierres.length < n + 1) return null;
  let subas = 0, bajas = 0;
  for (let i = 1; i <= n; i++) {
    const d = cierres[i] - cierres[i - 1];
    if (d > 0) subas += d; else bajas -= d;
  }
  let mSuba = subas / n, mBaja = bajas / n;
  for (let i = n + 1; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1];
    mSuba = (mSuba * (n - 1) + (d > 0 ? d : 0)) / n;
    mBaja = (mBaja * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (mBaja === 0) return 100;
  return 100 - 100 / (1 + mSuba / mBaja);
}

// Volatilidad anualizada: desvio de los retornos diarios por raiz de 252 ruedas.
function volatilidad(cierres) {
  const r = [];
  for (let i = 1; i < cierres.length; i++) r.push(cierres[i] / cierres[i - 1] - 1);
  if (r.length < 20) return null;
  const m = media(r);
  const v = media(r.map(x => (x - m) * (x - m)));
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

function calcular(cierres) {
  const px = cierres[cierres.length - 1];
  const max = Math.max(...cierres), min = Math.min(...cierres);
  const s50 = sma(cierres, 50), s200 = sma(cierres, 200);
  const pos = max > min ? (px - min) / (max - min) * 100 : 50;
  const r = rsi(cierres);
  const vol = volatilidad(cierres);

  // Lectura en castellano, para no obligar a interpretar numeros sueltos.
  const señales = [];
  if (r != null && r <= 30) señales.push({ texto: "RSI en " + r.toFixed(0) + ": sobrevendida", tono: "compra" });
  else if (r != null && r >= 70) señales.push({ texto: "RSI en " + r.toFixed(0) + ": sobrecomprada", tono: "venta" });
  if (pos <= 25) señales.push({ texto: "Cerca del piso de su año", tono: "compra" });
  else if (pos >= 85) señales.push({ texto: "Cerca del maximo de su año", tono: "venta" });
  if (s200 && px < s200) señales.push({ texto: "Por debajo de su media de 200 dias", tono: "compra" });
  if (s200 && s50 && s50 > s200) señales.push({ texto: "Tendencia de fondo al alza", tono: "neutro" });
  if (s200 && s50 && s50 < s200) señales.push({ texto: "Tendencia de fondo a la baja", tono: "venta" });
  if (vol != null && vol > 55) señales.push({ texto: "Volatilidad alta (" + vol.toFixed(0) + "% anual)", tono: "neutro" });

  const compra = señales.filter(x => x.tono === "compra").length;
  const venta = señales.filter(x => x.tono === "venta").length;

  return {
    precio: Math.round(px * 100) / 100,
    max52: Math.round(max * 100) / 100,
    min52: Math.round(min * 100) / 100,
    desdeMax: Math.round((px / max - 1) * 1000) / 10,
    desdeMin: Math.round((px / min - 1) * 1000) / 10,
    posicion52: Math.round(pos),
    sma50: s50 ? Math.round(s50 * 100) / 100 : null,
    sma200: s200 ? Math.round(s200 * 100) / 100 : null,
    rsi: r != null ? Math.round(r * 10) / 10 : null,
    volatilidad: vol != null ? Math.round(vol * 10) / 10 : null,
    señales,
    zona: compra > venta ? "compra" : venta > compra ? "venta" : "neutral",
    actualizado: new Date().toISOString()
  };
}

function retornos(cierres) {
  const r = [];
  for (let i = 1; i < cierres.length; i++) r.push(cierres[i] / cierres[i - 1] - 1);
  return r;
}

function correl(a, b) {
  const n = Math.min(a.length, b.length);
  const x = a.slice(-n), y = b.slice(-n);
  const mx = media(x), my = media(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx, ay = y[i] - my;
    num += ax * ay; dx += ax * ax; dy += ay * ay;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function correlaciones(tickers, series) {
  const r = {};
  tickers.forEach(t => { r[t] = retornos(series[t]); });
  const matriz = {}, pares = [];
  tickers.forEach(a => {
    matriz[a] = {};
    tickers.forEach(b => {
      if (a === b) { matriz[a][b] = 1; return; }
      const c = Math.round(correl(r[a], r[b]) * 100) / 100;
      matriz[a][b] = c;
      if (a < b) pares.push({ a, b, rho: c });
    });
  });
  // Posiciones independientes equivalentes: si todo se moviera igual seria 1;
  // si nada se moviera junto, seria el numero de posiciones.
  const n = tickers.length;
  let suma = 0;
  tickers.forEach(a => tickers.forEach(b => { suma += matriz[a][b]; }));
  const efectivas = suma > 0 ? (n * n) / suma : n;
  pares.sort((x, y) => y.rho - x.rho);
  return {
    matriz, efectivas: Math.round(efectivas * 10) / 10, posiciones: n,
    masAltas: pares.slice(0, 5), masBajas: pares.slice(-3).reverse(),
    actualizado: new Date().toISOString()
  };
}

async function main() {
  const an = JSON.parse(fs.readFileSync(path.join(ROOT, "analysts.json"), "utf8"));
  const simbolos = Object.keys(an.tickers || {});
  if (!simbolos.length) { console.log("Sin tickers en analysts.json"); return; }

  const tecnicos = an.tecnicos || {};
  const series = {};
  let ok = 0, fallos = [];

  for (let i = 0; i < simbolos.length; i++) {
    const tk = simbolos[i];
    try {
      const c = await historico(ysym(tk));
      series[tk] = c;
      tecnicos[tk] = calcular(c);
      ok++;
      const t = tecnicos[tk];
      console.log(`  ${tk}: ${t.zona} | ${t.desdeMax}% del maximo | RSI ${t.rsi} | pos ${t.posicion52}%`);
    } catch (e) {
      fallos.push(tk);
      console.log(`  ${tk}: ${e.message}` + (tecnicos[tk] ? " (conservo lo anterior)" : ""));
    }
    await new Promise(r => setTimeout(r, (i + 1) % 8 === 0 ? 3000 : 500));
  }

  // Correlaciones de lo que realmente tenes en cartera. La diversificacion por
  // etiquetas de sector engaña: NVDA, MSFT, META y AMD caen juntas aunque figuren
  // en casillas distintas.
  try {
    const oj = JSON.parse(fs.readFileSync(path.join(ROOT, "operaciones.json"), "utf8"));
    const ops = Array.isArray(oj) ? oj : oj.operaciones;
    const saldo = {};
    ops.forEach(o => {
      const t = String(o.ticker).toUpperCase();
      const q = Math.abs(Number(o.cantidad)) || 0;
      saldo[t] = (saldo[t] || 0) + (String(o.tipo).toUpperCase() === "COMPRA" ? q : -q);
    });
    const todas = Object.keys(saldo).filter(t => saldo[t] > 1e-9);
    const enCartera = todas.filter(t => series[t] && series[t].length > 120);
    const sinSerie = todas.filter(t => enCartera.indexOf(t) === -1);
    if (enCartera.length >= 2) {
      an.correlaciones = correlaciones(enCartera, series);
      // Los fondos IOL no cotizan en ningun mercado, asi que quedan afuera.
      // Hay que decirlo: si no, 13 de 16 parece un error y es un limite real.
      an.correlaciones.totalPosiciones = todas.length;
      an.correlaciones.sinSerie = sinSerie;
      console.log(`\nCorrelaciones sobre ${enCartera.length} de ${todas.length} posiciones` +
        (sinSerie.length ? ` (sin historico: ${sinSerie.join(", ")})` : "") + ".");
    }
  } catch (e) { console.log("Correlaciones: " + e.message); }

  an.tecnicos = tecnicos;
  an.tecnicos_ts = new Date().toISOString();
  fs.writeFileSync(path.join(ROOT, "analysts.json"), JSON.stringify(an, null, 1));
  console.log(`\n✅ Tecnicos: ${ok} de ${simbolos.length}` + (fallos.length ? ` | sin datos: ${fallos.join(", ")}` : ""));
}

main().catch(e => { console.error("ERROR", e); process.exit(1); });
