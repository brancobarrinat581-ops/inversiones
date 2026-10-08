// watchlist-ui.js — seguimiento de acciones que todavia no tenes en cartera.
// Boton 👀 abajo a la izquierda. Junta en una sola vista: precio en dolares,
// precio del CEDEAR en pesos, consenso de analistas, proximo balance y noticias.
(function () {
  "use strict";

  var UI = window.__UI;
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
    return h + sello(f.source || "Yahoo", f.updated) + "</div>";
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

  // Donde esta parado el precio respecto de su propio año. No pronostica: ubica.
  function bloqueTecnico(t) {
    if (!t) return "";
    var colorZona = t.zona === "compra" ? "#4CAF50" : t.zona === "venta" ? "#FF9800" : "#64B5F6";
    var titulo = t.zona === "compra" ? "Zona de compra" : t.zona === "venta" ? "Zona de venta" : "Zona neutral";
    var tono = { compra: "#4CAF50", venta: "#FF9800", neutro: "#8b93a7" };

    var h = '<div style="margin-top:8px;background:#1a1a2e;border-radius:6px;padding:10px;border-left:3px solid ' + colorZona + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
      '<span style="color:' + colorZona + ';font-size:13px;font-weight:700">' + titulo + "</span>" +
      '<span style="color:#8b93a7;font-size:11px">' + t.desdeMax + "% del maximo del año</span></div>";

    // Barra: donde cae el precio entre el minimo y el maximo de 52 semanas.
    h += '<div style="position:relative;background:#000;border-radius:3px;height:8px;margin:8px 0">' +
      '<div style="position:absolute;left:' + Math.max(0, Math.min(98, t.posicion52)) + '%;top:-3px;width:3px;height:14px;' +
      "background:" + colorZona + ';border-radius:2px"></div></div>';
    h += '<div style="display:flex;justify-content:space-between;color:#5c6478;font-size:10px;margin-bottom:6px">' +
      "<span>min " + fUSD(t.min52) + "</span><span>max " + fUSD(t.max52) + "</span></div>";

    (t["señales"] || []).forEach(function (s) {
      h += '<div style="color:' + (tono[s.tono] || "#8b93a7") + ';font-size:12px;padding:2px 0">• ' + s.texto + "</div>";
    });
    if (t.sma200)
      h += '<div style="color:#5c6478;font-size:11px;margin-top:4px">Media 200 dias: ' + fUSD(t.sma200) +
        (t.sma50 ? " · 50 dias: " + fUSD(t.sma50) : "") + "</div>";
    return h + sello("Yahoo", t.actualizado) + "</div>";
  }

  // Sello de procedencia. La idea es que ningun numero se vea igual venga de donde
  // venga: un target traido hace diez minutos y uno de hace cuatro meses tienen que
  // distinguirse de un vistazo.
  function antiguedad(iso) {
    if (!iso) return null;
    var ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    var h = ms / 3600000;
    if (h < 1) return "hace " + Math.max(1, Math.round(ms / 60000)) + " min";
    if (h < 48) return "hace " + Math.round(h) + " h";
    return "hace " + Math.round(h / 24) + " dias";
  }

  function sello(fuente, iso) {
    var edad = antiguedad(iso);
    if (!fuente && !edad) return "";
    // Mas de una semana ya no es un dato de hoy: se avisa en naranja.
    var viejo = iso && (Date.now() - new Date(iso).getTime()) > 7 * 86400000;
    return '<div style="text-align:right;color:' + (viejo ? "#FF9800" : "#5c6478") + ';font-size:10px;margin-top:6px">' +
      (fuente || "") + (edad ? " · " + edad : "") + (viejo ? " · dato viejo" : "") + "</div>";
  }

  var fM = function (n) {
    var v = Math.abs(n);
    if (v >= 1e6) return "US$ " + (n / 1e6).toFixed(1) + " M";
    if (v >= 1e3) return "US$ " + Math.round(n / 1e3) + " mil";
    return "US$ " + Math.round(n);
  };

  // Compras y ventas de los propios ejecutivos. Las compras pesan; las ventas casi
  // nada, porque se vende por impuestos, por diversificar o por comprarse una casa.
  function bloqueDirectivos(d) {
    if (!d) return "";
    if (!d.compras && !d.ventas && d.netoPct == null) return "";
    var hayCompras = d.compras > 0;
    var color = hayCompras && d.montoCompras > d.montoVentas ? "#4CAF50" : "#8b93a7";
    var h = '<div style="margin-top:8px;background:#1a1a2e;border-radius:6px;padding:10px">';
    h += '<div style="color:#8b93a7;font-size:11px;margin-bottom:6px">Directivos, ultimos 6 meses</div>';
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">' +
      '<span style="color:#aaa">Compras / ventas</span>' +
      '<span style="color:' + color + ';font-weight:700">' + d.compras + " / " + d.ventas + "</span></div>";
    if (d.montoCompras || d.montoVentas)
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">' +
        '<span style="color:#aaa">Montos</span><span style="color:#fff">' +
        fM(d.montoCompras) + " comprado · " + fM(d.montoVentas) + "</span></div>";
    (d.ultimas || []).slice(0, 2).forEach(function (m) {
      h += '<div style="color:#5c6478;font-size:11px;padding:2px 0">' + (m.fecha || "") + " · " +
        (m.cargo || m.quien || "") + ": " + (m.que || "") + (m.valor ? " (" + fM(m.valor) + ")" : "") + "</div>";
    });
    if (!hayCompras)
      h += '<div style="color:#5c6478;font-size:11px;margin-top:4px">Sin compras de insiders. ' +
        "Las ventas solas no dicen mucho: se vende por impuestos o por plata personal.</div>";
    return h + sello(d.fuente || "Yahoo", d.traido) + "</div>";
  }

  // Si el consenso le viene errando por abajo trimestre a trimestre, las
  // proyecciones que ves arriba probablemente tambien esten cortas.
  function bloqueSorpresas(sp) {
    if (!sp || !sp.trimestres || !sp.trimestres.length) return "";
    var color = sp.superados >= sp.total - 1 ? "#4CAF50" : sp.superados <= 1 ? "#FF9800" : "#8b93a7";
    var h = '<div style="margin-top:8px;background:#1a1a2e;border-radius:6px;padding:10px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
      '<span style="color:#8b93a7;font-size:11px">Balances vs lo esperado</span>' +
      '<span style="color:' + color + ';font-size:12px;font-weight:700">' + sp.superados + " de " + sp.total + " superados</span></div>";
    sp.trimestres.slice().reverse().forEach(function (q) {
      var c = q.sorpresaPct == null ? "#8b93a7" : q.sorpresaPct >= 0 ? "#4CAF50" : "#F44336";
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">' +
        '<span style="color:#aaa">' + (q.periodo || "") + "</span>" +
        '<span style="color:' + c + '">' + (q.sorpresaPct != null ? fPct(q.sorpresaPct) : "") +
        ' <span style="color:#5c6478">(' + q.real + " vs " + q.esperado + ")</span></span></div>";
    });
    return h + sello(sp.fuente || "Yahoo", sp.traido) + "</div>";
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
    if (px) h += sello(px.src, px.asOf);

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
    h += bloqueTecnico((an && an.tecnicos && an.tecnicos[tk]) || null);
    h += bloqueFundamentos(tk, f);
    h += bloqueSorpresas((an && an.sorpresas && an.sorpresas[tk]) || null);
    h += bloqueDirectivos((an && an.directivos && an.directivos[tk]) || null);

    if (bancos.length) {
      h += '<div style="margin-top:8px"><div style="color:#888;font-size:11px;margin-bottom:4px">Bancos</div>';
      bancos.slice(0, 4).forEach(function (b) {
        h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">' +
          '<span style="color:#ccc">' + b.bank + (b.rating ? ' <span style="color:#888">' + b.rating + "</span>" : "") + "</span>" +
          '<span style="color:#fff">' + (b.target ? fUSD(b.target) : "") + "</span></div>";
      });
      h += sello(bancos[0].fuente || "Yahoo", bancos[0].traido) + "</div>";
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

    var SEC = {};
    var h = "";
    h += '<div style="color:#888;font-size:12px;margin-bottom:14px">Acciones que mirás sin tenerlas. ' +
      "Editá la lista y tu precio de entrada en <b>watchlist.json</b>.</div>";

    if (!WL.length) {
      h += '<div style="color:#888;font-size:13px">La lista esta vacia. Agregá tickers en watchlist.json.</div>';
    } else {
      WL.forEach(function (it) { h += tarjeta(it, precios, AN, enCartera[it.ticker]); });
    }

    SEC["SEGUIMIENTO"] = h; h = "";

    // Candidatos agrupados por perfil de riesgo.
    if (PERF && PERF.perfiles) {
      h += '<div style="color:#888;font-size:12px;margin-bottom:10px">No son recomendaciones de compra: son candidatos ' +
        "para pasar por el analisis de fundamentos de cada ficha y decidir vos.</div>";
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

    SEC["PERFILES"] = h; h = "";

    // Las que ya tenes, con los mismos criterios: sirve tanto para decidir una
    // compra nueva como para revisar si lo que tenes sigue teniendo sentido.
    var propias = Object.keys(enCartera).filter(function (t) {
      return (AN && AN.fundamentals && AN.fundamentals[t]) || SIN_BALANCE.indexOf(t) !== -1;
    }).sort();
    if (propias.length) {
      propias.forEach(function (t) {
        h += tarjeta({ ticker: t, objetivo: null, nota: "" }, precios, AN, true);
      });
    }

    SEC["PROPIAS"] = h;

    UI.modal("wl-modal", "\uD83D\uDC40 Acciones", [
      { nombre: "En seguimiento", html: SEC.SEGUIMIENTO },
      { nombre: "Por perfil", html: SEC.PERFILES },
      { nombre: "Mis posiciones", html: SEC.PROPIAS }
    ]);
  }

  function boton() {
    if (!UI) return;
    UI.registrar("\uD83D\uDC40", "Seguimiento", abrir, "Fundamentos, precio de entrada y candidatos");
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
