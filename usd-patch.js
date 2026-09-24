// usd-patch.js v4 — USD bajo Invertido y Valor actual
// Navega el DOM por estructura, no por estilos
(function(){
  "use strict";

  var RATIOS = {
    ADBE:44, MELI:120, MSFT:30, MU:5, NVDA:24, PANW:50, SPY:60,
    VIST:3, ACN:75, MCD:24, META:24, NU:2, PAMP:25, IBIT:10,
    BMA:10, GGAL:10, YPF:1, ALUA:1, ICLN:5, EWZ:1,
    IOLCAMA:1, IOLDOLD:1, AL30D:1
  };

  function fmt(n) {
    return n >= 1000
      ? Math.round(n).toLocaleString('en-US')
      : Math.round(n).toLocaleString('en-US');
  }

  function calcUSD() {
    var pd, ops;
    try { pd = JSON.parse(localStorage.getItem('prices_data')); } catch(e) { return; }
    try { ops = JSON.parse(localStorage.getItem('operaciones_raw')); } catch(e) { return; }
    if (!pd || !pd.prices || !ops || !ops.length) return;
    var ccl = pd.ccl || 1578;

    // Tenencia neta
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

    // USD con mismo método que app.js
    var invUSD = 0, valUSD = 0;
    Object.keys(holdings).forEach(function(tk) {
      var h = holdings[tk];
      if (h.cant <= 0) return;
      var ratio = RATIOS[tk] || 1;
      var p = pd.prices[tk];
      var usdPrice = p ? (p.usd || 0) : 0;
      if (usdPrice > 0) {
        valUSD += h.cant / ratio * usdPrice;
      } else {
        var ars = p ? (p.ars || 0) : 0;
        if (ars > 0) valUSD += h.cant * ars / ccl;
      }
      invUSD += h.costoARS / ccl;
    });

    if (valUSD === 0) return;

    // Buscar labels "Invertido" y "Valor actual" en el DOM
    var allDivs = document.querySelectorAll('#root div');
    allDivs.forEach(function(el) {
      var txt = (el.textContent || '').trim();
      var isLabel = (txt === 'Invertido' || txt === 'Valor actual');
      if (!isLabel) return;
      // Verificar que es el label chico (0.8rem), no un container
      if (el.children.length > 0) return;
      var fs = el.style.fontSize;
      if (fs && fs !== '0.8rem') return;

      var usdVal = txt === 'Invertido' ? invUSD : valUSD;
      var valueDiv = el.nextElementSibling;
      if (!valueDiv) return;

      // Buscar si ya existe mi sub
      var parent = el.parentElement;
      var existing = parent ? parent.querySelector('.usd-eq') : null;
      if (existing) {
        existing.textContent = '≈ USD ' + fmt(usdVal);
        return;
      }

      // Crear sub
      var sub = document.createElement('div');
      sub.className = 'usd-eq';
      sub.style.cssText = 'color:#58a6ff;font-size:0.8rem;margin-top:2px;';
      sub.textContent = '≈ USD ' + fmt(usdVal);
      valueDiv.insertAdjacentElement('afterend', sub);
    });
  }

  // Esperar render de React, luego polling suave
  setTimeout(calcUSD, 2500);
  setTimeout(calcUSD, 4000);
  setInterval(calcUSD, 5000);
  console.log('💵 usd-patch v4 activo');
})();
