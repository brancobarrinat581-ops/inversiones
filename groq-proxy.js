// groq-proxy.js v5 — Manejo de errores para lupa/chat AI
// Groq API soporta CORS directo. Solo interceptamos errores.
(function(){
  "use strict";
  var _fetch = window.fetch;

  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    console.log("🔍 Lupa: llamando Groq directo...");

    return _fetch.apply(this, arguments)
      .then(function(resp){
        if(!resp.ok){
          console.warn("⚠️ Groq respondió HTTP " + resp.status);
          // Clonar para leer el error sin consumir el body
          return resp.clone().text().then(function(body){
            var msg = "Error del servidor AI (HTTP " + resp.status + ")";
            try {
              var err = JSON.parse(body);
              if(err.error && err.error.message) msg = err.error.message;
            } catch(e){}
            // Devolver respuesta con formato que app.js entiende
            return new Response(JSON.stringify({
              choices: [{ message: { content: "⚠️ " + msg } }]
            }), { status: 200, headers: {"Content-Type":"application/json"} });
          });
        }
        return resp;
      })
      .catch(function(err){
        console.error("❌ Groq no accesible:", err.message);
        return new Response(JSON.stringify({
          choices: [{ message: { content: "⚠️ No pude conectar con el asistente AI: " + err.message + ". Verificá tu conexión e intentá de nuevo." } }]
        }), { status: 200, headers: {"Content-Type":"application/json"} });
      });
  };
  console.log("🔍 groq-proxy v5: error handler activo");
})();
