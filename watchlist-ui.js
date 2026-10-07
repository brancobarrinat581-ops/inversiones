// watchlist-ui.js — seguimiento de acciones que todavia no tenes en cartera.
// Boton 👀 abajo a la izquierda. Junta en una sola vista: precio en dolares,
// precio del CEDEAR en pesos, consenso de analistas, proximo balance y noticias.
(function () {
  "use strict";

  var WL = [], AN = null, WLCFG = null, PERF = null;

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

  var fUSD = function (n) { return "US$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 }); };
  var fARS = function (n) { return "$" + Math.round(n).toLocaleString("es-AR"); };
  var fPct = function (n) { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; };
  var col = function (n) { return n >= 0 ? "#4CAF50" : "#F44336"; };

  function dias(f) {
    var d = Math.round((new Date(f + "T00:00:00Z") - new Date()) / 86400000);
    if (d < 0) return null;
    return d === 0 ? "hoy" : d === 1 ? "mañana" : "en " + d + " dias";
  }

  // ETFs y fondos: no tienen balance propio, no se les mide salud del negocio.
  var SIN_BALANCE = ["SPY", "IBIT", "EWZ", "ILF", "ICLN", "IOLCAMA", "IOLDOLD"];

  // Cada criterio devuelve bien / regular / flojo, con el umbral a la vista para
  // que se pueda discutir el numero en vez de confiar en un puntaje opaco.
  function criterios(f) {
    var c = [];
    var add = function (nombre, valor, fmt, bien, regular, mayorEsMejor, ayuda) {
      if (valor == null || !isFinite(valor)) return;
      var ok = mayorEsMejor ? valor >= bien : valor <= bien;
      var med = mayorEsMejor ? valor >= regular : valor <= regular;
      c.push({ nombre: nombre, texto: fmt(valor), estado: ok ? "bien" : med ? "regular" : "flojo", ayuda: ayuda });
    };
    var pct = function (v) { return (v * 100).toFixed(1) + "%"; };
    var n1 = function (v) { return v.toFixed(1); };

    add("Margen operativo", f.margenOperativo, pct, 0.20, 0.10, true, "Cuanto le queda de cada peso vendido despues de los costos del negocio");
    add("Rentabilidad sobre patrimonio", f.roe, pct, 0.15, 0.08, true, "Cuanto gana por cada peso que pusieron los accionistas");
    add("Crecimiento de ventas", f.crecimientoVentas, pct, 0.10, 0.03, true, "Cuanto crecieron los ingresos contra el mismo periodo del año anterior");
    add("Deuda sobre patrimonio", f.deudaPatrimonio, n1, 60, 150, false, "Cuanto debe comparado con lo que vale. Mas bajo es mas solido");
    add("PEG", f.peg, n1, 1.5, 3, false, "Precio en relacion al crecimiento. Arriba de 3 suele estar caro");
    if (f.flujoLibre != null && isFinite(f.flujoLibre))
      c.push({
        nombre: "Flujo de caja libre", texto: "US$ " + Math.round(f.flujoLibre / 1e6).toLocaleString("es-AR") + " M",
        estado: f.flujoLibre > 0 ? "bien" : "flojo",
        ayuda: "Plata que le sobra despues de operar e invertir. Negativo significa que se financia con deuda o emision"
      });
    return c;
  }

  function bloqueFundamentos(tk, f) {
    if (SIN_BALANCE.indexOf(tk) !== -1)
      return '<div style="margin-top:8px;color:#666;font-size:11px">Es un ETF o fondo: no tiene balance propio que analizar.</div>';
    var c = criterios(f || {});
    if (!c.length)
      return '<div style="margin-top:8px;color:#666;font-size:11px">Sin datos de balance todavia. Los trae el analisis de Yahoo.</div>';

    var bien = c.filter(function (x) { return x.estado === "bien"; }).length;
    var flojos = c.filter(function (x) { return x.estado === "flojo"; }).length;
    var color = flojos >= 2 ? "#F44336" : bien >= c.length - 1 ? "#4CAF50" : "#FF9800";
    var veredicto = flojos >= 2 ? "Fundamentos debiles" : bien >= c.length - 1 ? "Fundamentos solidos" : "Fundamentos mixtos";
    var punto = { bien: "#4CAF50", regular: "#FF9800", flojo: "#F44336" };

    var h = '<div style="margin-top:10px;background:#1a1a2e;border-radius:6px;padding:10px;border-left:3px solid ' + color + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
      '<span style="color:' + color + ';font-size:13px;font-weight:700">' + veredicto + "</span>" +
      '<span style="color:#888;font-size:11px">' + bien + " de " + c.length + " criterios bien</span></div>";
    c.forEach(function (x) {
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0" title="' + x.ayuda + '">' +
        '<span style="color:#aaa">' + x.nombre + "</span>" +
        '<span style="color:' + punto[x.estado] + ';font-weight:700">' + x.texto + "</span></div>";
    });
    return h + "</div>";
  }

  // Precio de referencia: no predice nada, ordena lo que dicen los analistas y
  // le aplica un margen de seguridad para no comprar justo en el techo.
  function bloqueEntrada(f, px, objetivo, margen) {
    if (!(f && f.target > 0) || !(px && px.usd > 0)) return "";
    var piso = f.targetLow > 0 ? f.targetLow : f.target * 0.8;
    var conMargen = f.target * (1 - margen / 100);
    var referencia = Math.min(piso, conMargen);
    var falta = (px.usd / referencia - 1) * 100;

    var h = '<div style="margin-top:8px;background:#1a1a2e;border-radius:6px;padding:10px">';
    h += '<div style="color:#888;font-size:11px;margin-bottom:6px">Precio de referencia para entrar</div>';
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">' +
      '<span style="color:#aaa">Analistas: minimo / promedio / maximo</span>' +
      '<span style="color:#fff">' + (f.targetLow > 0 ? fUSD(f.targetLow) : "-") + " / " + fUSD(f.target) +
      " / " + (f.targetHigh > 0 ? fUSD(f.targetHigh) : "-") + "</span></div>";
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">' +
      '<span style="color:#aaa">Con ' + margen + "% de margen de seguridad</span>" +
      '<span style="color:#64B5F6;font-weight:700">' + fUSD(referencia) + "</span></div>";
    h += '<div style="color:' + (falta <= 0 ? "#4CAF50" : "#888") + ';font-size:12px;margin-top:6px">' +
      (falta <= 0 ? "Hoy cotiza por debajo de esa referencia." : "Hoy esta " + fPct(falta) + " por encima de esa referencia.") + "</div>";
    if (objetivo != null)
      h += '<div style="color:#666;font-size:11px;margin-top:4px">Tu precio propio: ' + fUSD(objetivo) + "</div>";
    return h + "</div>";
  }

  function tarjeta(it, precios, an, enCartera) {
    var tk = it.ticker;
    var px = (precios && precios.prices && precios.prices[tk]) || null;
    var f = (an && an.fundamentals && an.fundamentals[tk]) || {};
    var info = (an && an.tickers && an.tickers[tk]) || {};
    var bancos = (an && an.bank_targets && an.bank_targets[tk]) || [];
    var cats = (an && an.catalysts && an.catalysts[tk]) || [];
    var news = (an && an.news && an.news[tk]) || [];

    var h = '<div style="background:#0d1117;border-radius:10px;padding:12px;margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div><span style="color:#fff;font-weight:700;font-size:17px">' + tk + "</span> " +
      '<span style="color:#888;font-size:12px">' + (info.name || "") + "</span>" +
      (info.sector ? '<div style="color:#FF9800;font-size:11px">' + info.sector + "</div>" : "") +
      (enCartera ? '<div style="color:#4CAF50;font-size:11px">Ya la tenes en cartera</div>' : "") + "</div>";
    if (px && px.usd > 0) {
      h += '<div style="text-align:right"><div style="color:#fff;font-size:17px;font-weight:700">' + fUSD(px.usd) + "</div>" +
        (px.ars > 0 ? '<div style="color:#888;font-size:12px">CEDEAR ' + fARS(px.ars) + "</div>" : "") +
        (px.changePct != null ? '<div style="color:' + col(px.changePct) + ';font-size:12px">' + fPct(px.changePct) + "</div>" : "") +
        "</div>";
    } else {
      h += '<div style="color:#F44336;font-size:12px;text-align:right">Sin precio todavia</div>';
    }
    h += "</div>";

    // Consenso de analistas
    if (f.target > 0 && px && px.usd > 0) {
      var up = (f.target / px.usd - 1) * 100;
      h += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">';
      h += '<div style="flex:1;min-width:110px;background:#1a1a2e;border-radius:6px;padding:8px">' +
        '<div style="color:#888;font-size:10px">Precio objetivo</div>' +
        '<div style="color:' + col(up) + ';font-size:15px;font-weight:700">' + fUSD(f.target) + " (" + fPct(up) + ")</div>" +
        (f.analysts ? '<div style="color:#666;font-size:10px">' + f.analysts + " analistas</div>" : "") + "</div>";
      if (f.consensus)
        h += '<div style="flex:1;min-width:90px;background:#1a1a2e;border-radius:6px;padding:8px">' +
          '<div style="color:#888;font-size:10px">Consenso</div>' +
          '<div style="color:#fff;font-size:14px;font-weight:700;text-transform:capitalize">' + f.consensus + "</div></div>";
      if (f.forwardPE)
        h += '<div style="flex:1;min-width:80px;background:#1a1a2e;border-radius:6px;padding:8px">' +
          '<div style="color:#888;font-size:10px">P/E futuro</div>' +
          '<div style="color:#fff;font-size:14px;font-weight:700">' + Number(f.forwardPE).toFixed(1) + "</div></div>";
      h += "</div>";
    }

    h += bloqueEntrada(f, px, it.objetivo, (WLCFG && WLCFG.margen_seguridad) || 20);
    h += bloqueFundamentos(tk, f);

    if (bancos.length) {
      h += '<div style="margin-top:8px"><div style="color:#888;font-size:11px;margin-bottom:4px">Bancos</div>';
      bancos.slice(0, 4).forEach(function (b) {
        h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">' +
          '<span style="color:#ccc">' + b.bank + (b.rating ? ' <span style="color:#888">' + b.rating + "</span>" : "") + "</span>" +
          '<span style="color:#fff">' + (b.target ? fUSD(b.target) : "") + "</span></div>";
      });
      h += "</div>";
    }

    var prox = cats.filter(function (c) { return dias(c.date); })[0];
    if (prox)
      h += '<div style="margin-top:8px;color:#64B5F6;font-size:12px">\uD83D\uDCC5 ' + prox.event + " " + dias(prox.date) + "</div>";

    if (news.length) {
      h += '<div style="margin-top:8px">';
      news.slice(0, 2).forEach(function (n) {
        h += '<a href="' + n.url + '" target="_blank" rel="noopener" style="display:block;padding:5px 8px;background:#1a1a2e;' +
          'border-radius:5px;text-decoration:none;margin-bottom:4px"><div style="color:#ccc;font-size:12px">' +
          (n.titleEs || n.title) + "</div></a>";
      });
      h += "</div>";
    }

    if (it.nota)
      h += '<div style="margin-top:8px;color:#888;font-size:12px;font-style:italic;border-top:1px solid #1f2430;padding-top:6px">' +
        it.nota + "</div>";

    return h + "</div>";
  }

  function abrir() {
    var precios = ls("prices_data", null);
    var ops = ls("operaciones_raw", []);
    var enCartera = {};
    ops.forEach(function (o) { enCartera[String(o.ticker).toUpperCase()] = true; });

    var h = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10002;overflow-y:auto;padding:12px">' +
      '<div style="max-width:640px;margin:0 auto;background:#1a1a2e;border-radius:16px;padding:20px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<h2 style="color:#fff;margin:0;font-size:20px">\uD83D\uDC40 En seguimiento</h2>' +
      '<button id="wl-close" style="background:#ff4444;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer">\u2715</button></div>';
    h += '<div style="color:#888;font-size:12px;margin-bottom:14px">Acciones que mirás sin tenerlas. ' +
      "Editá la lista y tu precio de entrada en <b>watchlist.json</b>.</div>";

    if (!WL.length) {
      h += '<div style="color:#888;font-size:13px">La lista esta vacia. Agregá tickers en watchlist.json.</div>';
    } else {
      WL.forEach(function (it) { h += tarjeta(it, precios, AN, enCartera[it.ticker]); });
    }

    // Candidatos agrupados por perfil de riesgo.
    if (PERF && PERF.perfiles) {
      h += '<h3 style="color:#fff;margin:18px 0 6px;font-size:15px">\uD83C\uDFAF Candidatos por perfil</h3>';
      h += '<div style="color:#888;font-size:12px;margin-bottom:10px">No son recomendaciones de compra: son candidatos ' +
        "para pasar por el analisis de fundamentos de arriba y decidir vos.</div>";
      Object.keys(PERF.perfiles).forEach(function (nombre) {
        var pf = PERF.perfiles[nombre];
        h += '<div style="margin-bottom:6px;padding:10px;background:' + pf.color + '18;border-left:3px solid ' +
          pf.color + ';border-radius:6px">' +
          '<div style="color:' + pf.color + ';font-weight:700;font-size:15px">' + nombre + "</div>" +
          '<div style="color:#aaa;font-size:12px;margin-top:2px">' + (pf.descripcion || "") + "</div></div>";
        (pf.tickers || []).forEach(function (t) {
          h += tarjeta({ ticker: t.ticker, objetivo: t.objetivo != null ? t.objetivo : null, nota: t.nota },
            precios, AN, enCartera[t.ticker]);
        });
      });
    }

    // Las que ya tenes, con los mismos criterios: sirve tanto para decidir una
    // compra nueva como para revisar si lo que tenes sigue teniendo sentido.
    var propias = Object.keys(enCartera).filter(function (t) {
      return (AN && AN.fundamentals && AN.fundamentals[t]) || SIN_BALANCE.indexOf(t) !== -1;
    }).sort();
    if (propias.length) {
      h += '<h3 style="color:#fff;margin:18px 0 8px;font-size:15px">\uD83D\uDCBC Tus posiciones</h3>';
      propias.forEach(function (t) {
        h += tarjeta({ ticker: t, objetivo: null, nota: "" }, precios, AN, true);
      });
    }

    h += '<button id="wl-close2" style="width:100%;padding:10px;background:#333;color:#fff;border:none;' +
      'border-radius:8px;font-size:14px;cursor:pointer;margin-top:10px">Cerrar</button></div></div>';

    var m = document.createElement("div");
    m.id = "wl-modal";
    m.innerHTML = h;
    document.body.appendChild(m);
    var cerrar = function () { var n = document.getElementById("wl-modal"); if (n) n.remove(); };
    var a = document.getElementById("wl-close"), b = document.getElementById("wl-close2");
    if (a) a.onclick = cerrar;
    if (b) b.onclick = cerrar;
  }

  function boton() {
    if (document.getElementById("wl-btn")) return;
    var b = document.createElement("button");
    b.id = "wl-btn";
    b.textContent = "\uD83D\uDC40";
    b.title = "En seguimiento";
    b.style.cssText = "position:fixed;bottom:208px;left:16px;z-index:9999;background:#5E35B1;color:#fff;" +
      "border:none;border-radius:50%;width:48px;height:48px;font-size:22px;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.4)";
    b.onclick = abrir;
    document.body.appendChild(b);
  }

  getJSON("watchlist.json", function (d) {
    WLCFG = d && !Array.isArray(d) ? d : null;
    WL = (d && (Array.isArray(d) ? d : d.watchlist)) || [];
  });
  getJSON("analysts.json", function (d) { AN = d; });
  getJSON("perfiles.json", function (d) { PERF = d; });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boton);
  else boton();
  setTimeout(boton, 1500);
  console.log("\uD83D\uDC40 watchlist-ui v1");
})();
