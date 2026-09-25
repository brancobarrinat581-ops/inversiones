// groq-proxy.js v6 — Reemplaza API key y maneja errores
(function(){
  "use strict";
  var _fetch = window.fetch;
  var NEW_KEY = "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";

  window.fetch = function(url, opts){
    if(typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    if(opts && opts.headers){
      if(opts.headers instanceof Headers){
        opts.headers.set("Authorization", "Bearer " + NEW_KEY);
      } else if(typeof opts.headers === "object"){
        opts.headers.Authorization = "Bearer " + NEW_KEY;
        opts.headers.authorization = "Bearer " + NEW_KEY;
      }
    }

    return _fetch.apply(this, arguments)
      .then(function(resp){
        if(!resp.ok){
          return resp.clone().text().then(function(body){
            var msg = "Error del servidor AI (HTTP " + resp.status + ")";
            try { var e = JSON.parse(body); if(e.error && e.error.message) msg = e.error.message; } catch(x){}
            return new Response(JSON.stringify({
              choices: [{ message: { content: "⚠️ " + msg } }]
            }), { status: 200, headers: {"Content-Type":"application/json"} });
          });
        }
        return resp;
      })
      .catch(function(err){
        return new Response(JSON.stringify({
          choices: [{ message: { content: "⚠️ No pude conectar con el asistente AI: " + err.message } }]
        }), { status: 200, headers: {"Content-Type":"application/json"} });
      });
  };
  console.log("🔍 groq-proxy v6: key actualizada + error handler");
})();
