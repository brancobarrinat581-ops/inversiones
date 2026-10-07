// groq-proxy.js v7 — la clave de Groq ya no vive en el repo.
//
// Por que cambio: el repo es publico. Cada vez que la clave quedaba escrita aca,
// GitHub la detectaba, avisaba a Groq y Groq la revocaba. Desde que esta activa la
// proteccion de secretos, GitHub directamente rechaza el commit.
//
// Ahora la clave se guarda en el navegador de cada uno (localStorage) y nunca se
// publica. Se pide una sola vez por dispositivo. La podes borrar desde la consola
// con: localStorage.removeItem("groq_key")
(function () {
  "use strict";
  var _fetch = window.fetch;
  var CLAVE = "groq_key";

  function leer() { try { return localStorage.getItem(CLAVE) || ""; } catch (e) { return ""; } }
  function guardar(k) { try { localStorage.setItem(CLAVE, k); } catch (e) {} }

  function pedir() {
    if (document.getElementById("groq-modal")) return;
    var m = document.createElement("div");
    m.id = "groq-modal";
    m.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10003;display:flex;' +
      'align-items:center;justify-content:center;padding:16px">' +
      '<div style="max-width:420px;width:100%;background:#1a1a2e;border-radius:16px;padding:20px">' +
      '<h3 style="color:#fff;margin:0 0 10px;font-size:17px">Clave del asistente</h3>' +
      '<div style="color:#888;font-size:13px;line-height:1.5;margin-bottom:12px">' +
      'Pegá tu clave de Groq. Queda guardada solo en este navegador y no se sube al repositorio, ' +
      'asi que no se la revoca nadie. La sacas de <b>console.groq.com</b>, en API Keys.</div>' +
      '<input id="groq-input" type="password" placeholder="gsk_..." autocomplete="off" ' +
      'style="width:100%;box-sizing:border-box;background:#0d1117;color:#fff;border:1px solid #333;' +
      'border-radius:8px;padding:10px;font-size:14px;margin-bottom:10px" />' +
      '<div style="display:flex;gap:8px">' +
      '<button id="groq-ok" style="flex:1;padding:10px;background:#4CAF50;color:#fff;border:none;' +
      'border-radius:8px;font-size:14px;cursor:pointer">Guardar</button>' +
      '<button id="groq-no" style="flex:1;padding:10px;background:#333;color:#fff;border:none;' +
      'border-radius:8px;font-size:14px;cursor:pointer">Ahora no</button>' +
      "</div></div></div>";
    document.body.appendChild(m);
    var cerrar = function () { var n = document.getElementById("groq-modal"); if (n) n.remove(); };
    document.getElementById("groq-no").onclick = cerrar;
    document.getElementById("groq-ok").onclick = function () {
      var v = (document.getElementById("groq-input").value || "").trim();
      if (v) guardar(v);
      cerrar();
    };
    var i = document.getElementById("groq-input");
    i.focus();
    i.onkeydown = function (e) { if (e.key === "Enter") document.getElementById("groq-ok").click(); };
  }

  function respuesta(texto) {
    return new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  window.fetch = function (url, opts) {
    if (typeof url !== "string" || url.indexOf("api.groq.com") === -1)
      return _fetch.apply(this, arguments);

    var key = leer();
    if (!key) {
      pedir();
      return Promise.resolve(respuesta("⚠️ Falta la clave del asistente. Pegala en la ventana que se abrio y volve a preguntar."));
    }

    if (opts && opts.headers) {
      if (opts.headers instanceof Headers) {
        opts.headers.set("Authorization", "Bearer " + key);
      } else if (typeof opts.headers === "object") {
        opts.headers.Authorization = "Bearer " + key;
        opts.headers.authorization = "Bearer " + key;
      }
    }

    return _fetch.apply(this, arguments)
      .then(function (resp) {
        if (!resp.ok) {
          return resp.clone().text().then(function (body) {
            var msg = "Error del asistente (HTTP " + resp.status + ")";
            try { var e = JSON.parse(body); if (e.error && e.error.message) msg = e.error.message; } catch (x) {}
            if (resp.status === 401 || resp.status === 403) {
              try { localStorage.removeItem(CLAVE); } catch (x) {}
              pedir();
              msg = "La clave no es valida o fue revocada. Pegá una nueva en la ventana que se abrio.";
            }
            return respuesta("⚠️ " + msg);
          });
        }
        return resp;
      })
      .catch(function (err) {
        return respuesta("⚠️ No pude conectar con el asistente: " + err.message);
      });
  };

  console.log("🔍 groq-proxy v7: clave desde el navegador, no desde el repo");
})();
