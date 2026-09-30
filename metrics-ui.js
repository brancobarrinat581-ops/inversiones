// metrics-ui.js — panel de rendimiento real: USD, TIR anualizada, evolucion y comparacion con SPY.
// Boton 📊 abajo a la izquierda. No toca nada de app.js: lee localStorage y los JSON del repo.
(function () {
  "use strict";

  var PF = window.__PF;
  if (!PF) { console.warn("metrics-ui: falta scripts/lib/portfolio.js"); return; }

  var HIST = null, DIV = [], GRUPOS = null;

  function getJSON(u, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open("GET", u + "?t=" + Date.now(), true);
      x.onload = function () { try { cb(x.status === 200 ? JSON.parse(x.responseText) : null); } catch (e) { cb(null); } };
      x.onerror = function () { cb(null); };
      x.send(null);
    } catch (e) { cb(null); }
  }

  function ls(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }

  var f0 = function (n) { var v = Math.round(n); return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-AR"); };
  var fUSD = function (n) { var v = Math.round(n); return (v < 0 ? "-US$" : "US$") + Math.abs(v).toLocaleString("es-AR"); };
  var fPct = function (n, d) { return (n >= 0 ? "+" : "") + n.toFixed(d == null ? 1 : d) + "%"; };
  var col = function (n) { return n >= 0 ? "#4CAF50" : "#F44336"; };

  // ---------- calculos ----------

  function datos() {
    var ops = ls("operaciones_raw", []);
    var pr = ls("prices_data", null);
    if (!ops.length || !pr || !pr.prices) return null;
    var r = PF.computePortfolio(ops, pr.prices, pr.ccl);

    // Dividendos cobrados: entran como resultado realizado y como ingreso en la TIR.
    var div = 0;
    var flujos = r.flujos.slice();
    DIV.forEach(function (d) {
      var m = Number(d.monto_ars || d.monto || 0);
      if (!isFinite(m) || m <= 0) return;
      div += m;
      flujos.push({ fecha: String(d.fecha).slice(0, 10), monto: m });
    });

    var hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    r.dividendos = div;
    r.totalResultado = r.ganancia + r.realizado + div;
    r.tir = PF.xirr(flujos, r.valor, hoy);
    return r;
  }

  // Rendimiento time-weighted: descuenta el efecto de los aportes, que es lo unico
  // que permite compararse contra un indice de forma honesta.
  function twr(serie, ops) {
    if (!serie || serie.length < 2) return null;
    var flujoPorDia = {};
    PF.normalize(ops).forEach(function (o) {
      var m = o.tipo === "COMPRA" ? o.cantidad * o.ppc + o.comision : -(o.cantidad * o.ppc - o.comision);
      flujoPorDia[o.fecha] = (flujoPorDia[o.fecha] || 0) + m;
    });
    var acum = 1, dias = 0;
    for (var i = 1; i < serie.length; i++) {
      var vAnt = serie[i - 1].valor, vHoy = serie[i].valor;
      if (!(vAnt > 0)) continue;
      // Sumamos los flujos ocurridos entre las dos fotos.
      var f = 0;
      Object.keys(flujoPorDia).forEach(function (d) {
        if (d > serie[i - 1].fecha && d <= serie[i].fecha) f += flujoPorDia[d];
      });
      var rel = (vHoy - f) / vAnt;
      if (rel > 0 && isFinite(rel)) { acum *= rel; dias++; }
    }
    if (!dias) return null;
    return { pct: (acum - 1) * 100, desde: serie[0].fecha, hasta: serie[serie.length - 1].fecha };
  }

  function benchmark(serie) {
    if (!serie || serie.length < 2) return null;
    var a = null, b = null;
    for (var i = 0; i < serie.length; i++) if (serie[i].spy > 0) { a = serie[i]; break; }
    for (var j = serie.length - 1; j >= 0; j--) if (serie[j].spy > 0) { b = serie[j]; break; }
    if (!a || !b || a === b) return null;
    return { pct: (b.spy / a.spy - 1) * 100, desde: a.fecha, hasta: b.fecha };
  }

  // ---------- grafico ----------

  function sparkline(serie, campo, color) {
    var vals = serie.map(function (p) { return p[campo]; }).filter(function (v) { return v > 0; });
    if (vals.length < 2) return "";
    var W = 560, H = 120, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var rango = max - min || 1;
    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * W;
      var y = H - ((v - min) / rango) * (H - 10) - 5;
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    return '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:120px;display:block">' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  // ---------- render ----------

  function bloque(titulo, valor, sub, color) {
    return '<div style="flex:1;min-width:130px;background:#0d1117;border-radius:8px;padding:10px">' +
      '<div style="color:#888;font-size:11px">' + titulo + "</div>" +
      '<div style="color:' + (color || "#fff") + ';font-size:18px;font-weight:700">' + valor + "</div>" +
      (sub ? '<div style="color:#666;font-size:11px;margin-top:2px">' + sub + "</div>" : "") + "</div>";
  }

  function abrir() {
    var r = datos();
    if (!r) { alert("Todavia no hay operaciones o precios cargados."); return; }
    var serie = (HIST && HIST.serie) || [];
    var t = twr(serie, ls("operaciones_raw", []));
    var bm = benchmark(serie);

    var h = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10002;overflow-y:auto;padding:12px">' +
      '<div style="max-width:640px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
      '<h2 style="color:#fff;margin:0;font-size:20px">\uD83D\uDCCA Rendimiento</h2>' +
      '<button id="met-close" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button></div>';

    // Resultado total
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
    h += bloque("Invertido", f0(r.invertido), r.posiciones.length + " posiciones");
    h += bloque("Valor actual", f0(r.valor), fUSD(r.valorUSD) + " al CCL " + Math.round(r.ccl));
    h += "</div>";

    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
    h += bloque("No realizada", f0(r.ganancia), fPct(r.gananciaPct), col(r.ganancia));
    h += bloque("Realizada", f0(r.realizado), "operaciones cerradas", col(r.realizado));
    if (r.dividendos > 0) h += bloque("Dividendos", f0(r.dividendos), DIV.length + " cobros", "#4CAF50");
    h += bloque("Resultado total", f0(r.totalResultado), "todo sumado", col(r.totalResultado));
    h += "</div>";

    // TIR
    if (r.tir != null) {
      h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<span style="color:#fff;font-size:15px;font-weight:700">TIR anualizada (pesos)</span>' +
        '<span style="color:' + col(r.tir) + ';font-size:22px;font-weight:900">' + fPct(r.tir) + "</span></div>" +
        '<div style="color:#888;font-size:12px;margin-top:6px">Tiene en cuenta <b>cuando</b> pusiste cada peso, ' +
        'no solo cuanto. Es el equivalente a la funcion TIR.NO.PER de Excel. ' +
        'El ' + fPct(r.gananciaPct) + ' de arriba compara totales y no mira fechas.</div>' +
        '<div style="color:#FF9800;font-size:12px;margin-top:6px">Esta en pesos, asi que incluye inflacion y ' +
        'devaluacion: no es rendimiento real.</div></div>';
    }

    // Evolucion
    h += '<h3 style="color:#fff;margin:16px 0 8px;font-size:15px">\uD83D\uDCC8 Evolucion</h3>';
    if (serie.length < 2) {
      h += '<div style="background:#0d1117;border-radius:8px;padding:12px;color:#888;font-size:13px">' +
        "La serie historica arranca recien ahora: se guarda una foto por dia en cada corrida de precios. " +
        "Con unos dias acumulados van a aparecer aca la curva, el rendimiento sin efecto de aportes y la " +
        "comparacion contra el S&P 500." +
        (serie.length === 1 ? '<div style="color:#666;margin-top:6px">Primera foto: ' + serie[0].fecha + "</div>" : "") +
        "</div>";
    } else {
      h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px">';
      h += '<div style="color:#888;font-size:11px;margin-bottom:4px">Valor de la cartera en dolares (CCL) — ' +
        "incluye lo que fuiste aportando, no es el rendimiento</div>";
      h += sparkline(serie, "valorUSD", "#4CAF50");
      h += '<div style="display:flex;justify-content:space-between;color:#666;font-size:11px">' +
        "<span>" + serie[0].fecha + "</span><span>" + serie[serie.length - 1].fecha + "</span></div></div>";

      if (t) {
        h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
        h += bloque("Tu cartera", fPct(t.pct), "sin efecto de aportes", col(t.pct));
        if (bm) {
          h += bloque("S&P 500 (SPY)", fPct(bm.pct), "mismo periodo", col(bm.pct));
          var dif = t.pct - bm.pct;
          h += bloque("Diferencia", fPct(dif), dif >= 0 ? "le estas ganando" : "te esta ganando", col(dif));
        }
        h += "</div>";
        h += '<div style="color:#888;font-size:12px">Desde ' + t.desde + " hasta " + t.hasta +
          ". El rendimiento descuenta el dinero que fuiste agregando, que es la unica forma de compararlo " +
          "contra un indice.</div>";
      }
    }

    // ---------- diversificacion ----------
    h += '<h3 style="color:#fff;margin:16px 0 8px;font-size:15px">\uD83E\uDDE9 Diversificacion</h3>';
    var barra = function (pct, color) {
      return '<div style="background:#000;border-radius:3px;height:6px;overflow:hidden;margin-top:4px">' +
        '<div style="width:' + Math.min(100, pct) + '%;height:100%;background:' + color + '"></div></div>';
    };

    var mayor = r.posiciones[0];
    var pesoMayor = r.valor > 0 ? mayor.valor / r.valor * 100 : 0;
    h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px">';
    h += '<div style="color:#888;font-size:12px;margin-bottom:8px">Posicion mas grande: <b style="color:#fff">' +
      mayor.ticker + "</b> con el " + pesoMayor.toFixed(1) + "% de la cartera" +
      (pesoMayor > 20 ? ' <span style="color:#FF9800">— concentracion alta</span>' : "") + "</div>";
    r.posiciones.slice(0, 6).forEach(function (p) {
      var w = r.valor > 0 ? p.valor / r.valor * 100 : 0;
      h += '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:12px">' +
        '<span style="color:#fff">' + p.ticker + '</span><span style="color:#888">' + w.toFixed(1) + "%</span></div>" +
        barra(w * 3, "#64B5F6") + "</div>";
    });
    h += "</div>";

    if (GRUPOS && GRUPOS.grupos) {
      var deTicker = {};
      Object.keys(GRUPOS.grupos).forEach(function (g) {
        (GRUPOS.grupos[g].tickers || []).forEach(function (t) { deTicker[t] = g; });
      });
      var porGrupo = {}, sinGrupo = [];
      r.posiciones.forEach(function (p) {
        var g = deTicker[p.ticker];
        if (!g) { sinGrupo.push(p.ticker); g = "Sin grupo"; }
        porGrupo[g] = (porGrupo[g] || 0) + p.valor;
      });

      h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px">';
      h += '<div style="color:#888;font-size:12px;margin-bottom:8px">Por grupo, contra tu objetivo</div>';
      Object.keys(porGrupo).sort(function (a, b) { return porGrupo[b] - porGrupo[a]; }).forEach(function (g) {
        var w = r.valor > 0 ? porGrupo[g] / r.valor * 100 : 0;
        var obj = GRUPOS.grupos[g] && GRUPOS.grupos[g].objetivo;
        var txt = w.toFixed(1) + "%";
        if (obj != null) {
          var dif = w - obj;
          var monto = (obj / 100) * r.valor - porGrupo[g];
          txt += ' <span style="color:' + (Math.abs(dif) < 3 ? "#888" : dif > 0 ? "#FF9800" : "#64B5F6") + '">' +
            "(objetivo " + obj + "%" + (Math.abs(dif) >= 3 ? ", " + (monto > 0 ? "faltan " : "sobran ") + f0(Math.abs(monto)) : "") + ")</span>";
        }
        h += '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:12px">' +
          '<span style="color:#fff">' + g + '</span><span style="color:#888">' + txt + "</span></div>" +
          barra(w * 2, obj != null && Math.abs(w - obj) >= 3 ? "#FF9800" : "#4CAF50") + "</div>";
      });
      if (sinGrupo.length)
        h += '<div style="color:#FF9800;font-size:11px;margin-top:6px">Sin grupo asignado: ' + sinGrupo.join(", ") +
          ". Agregalos en grupos.json.</div>";
      h += "</div>";

      if (GRUPOS.argentina) {
        var arg = 0;
        r.posiciones.forEach(function (p) { if (GRUPOS.argentina.indexOf(p.ticker) !== -1) arg += p.valor; });
        var pa = r.valor > 0 ? arg / r.valor * 100 : 0;
        h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;font-size:13px">' +
          '<span style="color:#fff">Riesgo argentino</span>' +
          '<span style="color:' + (pa > 30 ? "#FF9800" : "#4CAF50") + ';font-weight:700">' + pa.toFixed(1) + "%</span></div>" +
          barra(pa * 2, pa > 30 ? "#FF9800" : "#4CAF50") +
          '<div style="color:#888;font-size:11px;margin-top:6px">' + f0(arg) + " en activos argentinos. " +
          "El resto son empresas del exterior via CEDEAR, aunque liquiden en el mercado local.</div></div>";
      }
    }

    // ---------- operaciones cerradas ----------
    var cer = PF.cerradas(ls("operaciones_raw", []));
    h += '<h3 style="color:#fff;margin:16px 0 8px;font-size:15px">\uD83D\uDCCB Operaciones cerradas</h3>';
    h += '<div style="background:#0d1117;border-radius:8px;padding:12px;margin-bottom:8px">';
    if (!cer.ventas.length) {
      h += '<div style="color:#888;font-size:13px">Todavia no vendiste nada.</div>';
    } else {
      cer.ventas.slice().sort(function (a, b) { return b.resultado - a.resultado; }).forEach(function (v) {
        h += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;' +
          'padding:5px 0;border-bottom:1px solid #1f2430">' +
          '<span style="color:#fff">' + v.ticker + ' <span style="color:#666">' + v.cantidad + " el " + v.fecha + "</span></span>" +
          '<span style="color:' + col(v.resultado) + ';font-weight:700">' + f0(v.resultado) + " (" + fPct(v.pct) + ")</span></div>";
      });
    }
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:10px">' +
      '<span style="color:#888">Comisiones pagadas en total</span>' +
      '<span style="color:#FF9800;font-weight:700">' + f0(cer.comisiones) +
      (r.invertido > 0 ? " (" + (cer.comisiones / r.invertido * 100).toFixed(2) + "% de lo invertido)" : "") +
      "</span></div></div>";

    if (r.sinPrecio.length) {
      h += '<div style="background:#F4433622;border-left:3px solid #F44336;color:#F44336;padding:8px 10px;' +
        'border-radius:4px;margin-top:12px;font-size:12px">Sin precio, valuados en 0: ' + r.sinPrecio.join(", ") + "</div>";
    }
    if (!DIV.length) {
      h += '<div style="color:#666;font-size:12px;margin-top:12px">Para sumar dividendos, cargalos en ' +
        "<b>dividendos.json</b> del repo.</div>";
    }

    h += '<button id="met-close2" style="width:100%;padding:10px;background:#333;color:#fff;border:none;' +
      'border-radius:8px;font-size:14px;cursor:pointer;margin-top:14px">Cerrar</button></div></div>';

    var m = document.createElement("div");
    m.id = "met-modal";
    m.innerHTML = h;
    document.body.appendChild(m);
    var cerrar = function () { var n = document.getElementById("met-modal"); if (n) n.remove(); };
    var a = document.getElementById("met-close"), b = document.getElementById("met-close2");
    if (a) a.onclick = cerrar;
    if (b) b.onclick = cerrar;
  }

  function boton() {
    if (document.getElementById("met-btn")) return;
    var b = document.createElement("button");
    b.id = "met-btn";
    b.textContent = "\uD83D\uDCCA";
    b.title = "Rendimiento";
    b.style.cssText = "position:fixed;bottom:144px;left:16px;z-index:9999;background:#2E7D32;color:#fff;" +
      "border:none;border-radius:50%;width:48px;height:48px;font-size:22px;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.4)";
    b.onclick = abrir;
    document.body.appendChild(b);
  }

  getJSON("history.json", function (d) { HIST = d; });
  getJSON("grupos.json", function (d) { GRUPOS = d; });
  getJSON("dividendos.json", function (d) { DIV = Array.isArray(d) ? d : (d && d.dividendos) || []; });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boton);
  else boton();
  setTimeout(boton, 1500);
  console.log("\uD83D\uDCCA metrics-ui v1");
})();
