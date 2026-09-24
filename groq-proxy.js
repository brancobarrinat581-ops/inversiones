// groq-proxy.js v4 — Redirige Groq API via CORS proxy
(function(){
  "use strict";
  var _fetch = window.fetch;
  var GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  var PROXY = "https://corsproxy.io/?url=" + encodeURIComponent(GROQ_URL);

  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    console.log("🔍 Lupa: redirigiendo via CORS proxy...");
    return _fetch.call(this, PROXY, opts).catch(function(err){
      console.warn("❌ Proxy falló, intentando directo:", err.message);
      return _fetch.call(this, GROQ_URL, opts).catch(function(err2){
        return new Response(JSON.stringify({
          choices: [{ message: { content: "⚠️ No pude conectar con el asistente AI. Intentá de nuevo." } }]
        }), { status: 200, headers: {"Content-Type":"application/json"} });
      });
    });
  };
  console.log("🔍 groq-proxy v4: CORS proxy activo");
})();
