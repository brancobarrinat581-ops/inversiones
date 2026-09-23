// groq-proxy.js v2 — Fix para la lupa (chat AI con Groq)
// Solo intercepta errores de red/CORS. Deja pasar errores HTTP de Groq (401, 429).
(function(){
  "use strict";
  var _fetch = window.fetch;

  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    console.log("🔍 Lupa: llamando Groq API...");

    // Intentar directo. Si Groq responde (aunque sea error HTTP), devolver tal cual.
    // Solo interceptar si el fetch FALLA por completo (CORS / red).
    return _fetch.apply(this, arguments).catch(function(err){
      console.warn("❌ Groq no accesible:", err.message);
      // Devolver respuesta con mensaje legible (formato que app.js entiende)
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: "⚠️ No pude conectar con Groq API (" + err.message + "). Posibles causas: CORS bloqueado desde GitHub Pages, o problema de red. Intentá de nuevo en unos segundos."
          }
        }]
      }), { status: 200, headers: {"Content-Type":"application/json"} });
    });
  };
  console.log("🔍 groq-proxy v2: interceptor activado");
})();
