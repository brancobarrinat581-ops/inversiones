// usd-patch.js v3 — USD equivalente para Invertido y Valor actual
// Usa el MISMO cálculo que app.js: sum(cantidad/ratio × precio_USD)
// No usa ARS/CCL (que infla por spread)
(function(){
  "use strict";

  var RATIOS = {
    ADBE:44, MELI:120, MSFT:30, MU:5, NVDA:24, PANW:50, SPY:60,
    VIST:3, ACN:75, MCD:24, META:24, NU:2, PAMP:25, IBIT:10,
    BMA:10, GGAL:10, YPF:1, ALUA:1, ICLN:5, EWZ:1,
    IOLCAMA:1, IOLDOLD:1, AL30D:1
  };

  function fmt(n) {
    if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
    return Math.round(n).toLocaleString('es-AR');
  }

  function calcUSD() {
    var pd, ops;
    try { pd = JSON.parse(localStorage.getItem('prices_data')); } catch(e) { return; }
    try { ops = JSON.parse(localStorage.getItem('operaciones_raw')); } catch(e) { return; }
    if (!pd || !pd.prices || !ops || !ops.length) return;
    var ccl = pd.ccl || 1578;

    // Calcular tenencia neta por ticker
    var holdings = {};
    ops.forEach(function(o) {
      var tk = o.ticker;
      if (!holdings[tk]) holdings[tk] = { cant: 0, costoARS: 0 };
      if (o.tipo === 'COMPRA') {
        holdings[tk].cant += o.cantidad;
        holdings[tk].costoARS += o.cantidad * (o.ppc || o.precio);
      } else if (o.tipo === 'VENTA') {
        holdings[tk].cant -= o.cantidad;
      }
    });

    // Calcular USD invertido y USD valor actual con MISMO método de app.js
    var invUSD = 0, valUSD = 0;
    Object.keys(holdings).forEach(function(tk) {
      var h = holdings[tk];
      if (h.cant <= 0) return;
      var ratio = RATIOS[tk] || 1;
      var p = pd.prices[tk];
      var usdPrice = p ? (p.usd || 0) : 0;

      if (usdPrice > 0) {
        // Valor actual USD = cantidad/ratio × precio_USD (igual que app.js)
        valUSD += h.cant / ratio * usdPrice;
        // Invertido USD = costoARS / CCL (aproximación, porque no tenemos el CCL histórico)
        invUSD += h.costoARS / ccl;
      } else {
        // Sin precio USD: usar ARS/CCL como fallback
        var arsPrice = p ? (p.ars || 0) : 0;
        if (arsPrice > 0) {
          valUSD += h.cant * arsPrice / ccl;
          invUSD += h.costoARS / ccl;
        }
      }
    });

    if (valUSD === 0) return;

    // Buscar los elementos del resumen
    var spans = document.querySelectorAll('div');
    var invertidoEl = null, valorEl = null;

    spans.forEach(function(el) {
      var text = el.textContent.trim();
      if (text === 'Invertido') invertidoEl = el;
      if (text === 'Valor actual') valorEl = el;
    });

    // Inyectar USD debajo de cada valor
    if (invertidoEl) {
      var container = invertidoEl.parentElement;
      if (container && !container.querySelector('.usd-sub')) {
        var valDiv = container.querySelector('div[style*="1.4rem"], div[style*="1.5rem"], div[style*="1.6rem"]');
        if (valDiv) {
          var sub = document.createElement('div');
          sub.className = 'usd-sub';
          sub.style.cssText = 'color:#58a6ff;font-size:0.8rem;margin-top:2px;';
          sub.textContent = '≈ USD ' + fmt(invUSD);
          valDiv.after(sub);
        }
      } else if (container) {
        var existing = container.querySelector('.usd-sub');
        if (existing) existing.textContent = '≈ USD ' + fmt(invUSD);
      }
    }

    if (valorEl) {
      var container2 = valorEl.parentElement;
      if (container2 && !container2.querySelector('.usd-sub')) {
        var valDiv2 = container2.querySelector('div[style*="1.4rem"], div[style*="1.5rem"], div[style*="1.6rem"]');
        if (valDiv2) {
          var sub2 = document.createElement('div');
          sub2.className = 'usd-sub';
          sub2.style.cssText = 'color:#58a6ff;font-size:0.8rem;margin-top:2px;';
          sub2.textContent = '≈ USD ' + fmt(valUSD);
          valDiv2.after(sub2);
        }
      } else if (container2) {
        var existing2 = container2.querySelector('.usd-sub');
        if (existing2) existing2.textContent = '≈ USD ' + fmt(valUSD);
      }
    }
  }

  // Polling suave: esperar a que React renderice, luego cada 5s
  setTimeout(calcUSD, 2000);
  setTimeout(calcUSD, 4000);
  setInterval(calcUSD, 5000);
  console.log('💵 usd-patch v3: USD consistente con app.js');
})();
