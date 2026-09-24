// groq-proxy.js v4 — Redirige Groq API via CORS proxy
// No requiere backend propio. Usa corsproxy.io (público, gratis, estable).
(function(){
  "use strict";
  var _fetch = window.fetch;
  var GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  var PROXY = "https://corsproxy.io/?url=" + encodeURIComponent(GROQ_URL);

  window.fetch = function(url, opts){
    // Solo interceptar llamadas a Groq
    if(typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    console.log("🔍 Lupa: redirigiendo via CORS proxy...");

    // Redirigir al proxy manteniendo method, headers y body
    return _fetch.call(this, PROXY, opts).catch(function(err){
      console.warn("❌ Proxy CORS falló:", err.message);
      // Fallback: intentar directo (por si Groq habilitó CORS)
      return _fetch.call(this, GROQ_URL, opts).catch(function(err2){
        console.warn("❌ Groq directo también falló:", err2.message);
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: "⚠️ No pude conectar con el asistente AI. Intentá de nuevo en unos segundos."
            }
          }]
        }), { status: 200, headers: {"Content-Type":"application/json"} });
      });
    });
  };
  console.log("🔍 groq-proxy v4: CORS proxy activo");
})();
