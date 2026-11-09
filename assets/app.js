/* Portal de indicadores del Programa de Enfermedades Huérfanas */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const CFG = window.CONFIG || {};
  const datos = { enfermedades: null, resultados: null };
  const CAMPOS = [
    ["resultado", "Resultado en salud"],
    ["definicion", "Definición operativa"],
    ["fuente", "Fuente de información"],
    ["responsable", "Responsable"]
  ];

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const borrar = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  async function cargar(nombre) {
    if (datos[nombre]) return datos[nombre];
    const r = await fetch("data/" + nombre + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo cargar " + nombre);
    datos[nombre] = await r.json();
    return datos[nombre];
  }

  function marcarMenu(ruta) {
    $$(".menu a").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === ruta));
  }

  // ---------- enrutador ----------
  async function enrutar() {
    const h = location.hash.replace(/^#\/?/, "");
    const ficha = h.indexOf("e-") === 0 ? h.slice(2) : null;
    const ruta = ficha ? "construccion" : (h || "inicio");
    marcarMenu(ruta);
    try {
      if (ficha) await vistaFicha(ficha);
      else if (ruta === "construccion") await vistaConstruccion();
      else if (ruta === "resultados") await vistaResultados();
      else if (ruta === "consulta") vistaConsulta();
      else await vistaInicio();
    } catch (e) {
      app.innerHTML = '<div class="aviso error">' + esc(e.message) + "</div>";
    }
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  // ---------- inicio ----------
  async function vistaInicio() {
    const d = await cargar("enfermedades");
    const n = d.enfermedades.reduce((s, e) => s + e.indicadores.length, 0);
    app.innerHTML = `
      <h1>Indicadores y resultados en salud</h1>
      <p class="lead">Espacio de trabajo del programa para construir los indicadores con los equipos, presentar los resultados y consultar la cohorte.</p>
      <div class="rejilla">
        <a class="tarjeta espacio" href="#construccion">
          <span class="num">1 · Construcción</span>
          <h3>Revisar y proponer indicadores</h3>
          <p>${d.enfermedades.length} enfermedades y ${n} indicadores en borrador. Gestión valida que se puedan medir; los equipos asistenciales, que tengan sentido clínico.</p>
        </a>
        <a class="tarjeta espacio" href="#resultados">
          <span class="num">2 · Resultados</span>
          <h3>Resultados en salud</h3>
          <p>Cifras agregadas de los análisis del programa. Por ahora, la primera medición (octubre de 2026).</p>
        </a>
        <a class="tarjeta espacio" href="#consulta">
          <span class="num">3 · Consulta</span>
          <h3>Consultar la cohorte</h3>
          <p>Para el equipo de gestión. Solo lectura, con cuenta del hospital.</p>
        </a>
      </div>`;
  }

  // ---------- construcción: listado ----------
  async function vistaConstruccion() {
    const d = await cargar("enfermedades");
    const unidades = {};
    d.enfermedades.forEach((e) => (unidades[e.unidad] = unidades[e.unidad] || []).push(e));
    const bloques = Object.keys(unidades).map((u) => `
      <section class="unidad">
        <h2>${esc(u)}</h2>
        <div class="rejilla">
          ${unidades[u].map((e) => {
            const borrador = leer("rev:" + e.id);
            return `<a class="tarjeta" href="#e-${esc(e.id)}">
              <h3>${esc(e.nombre)}</h3>
              <p>${e.indicadores.length} indicador${e.indicadores.length === 1 ? "" : "es"} · ${esc(e.poblacion)}</p>
              ${borrador ? '<p><span class="chip temporal">Revisión sin enviar</span></p>' : ""}
            </a>`;
          }).join("")}
        </div>
      </section>`).join("");

    app.innerHTML = `
      <h1>Construcción de indicadores</h1>
      <p class="lead">Elija una enfermedad, revise cada indicador y marque si está de acuerdo, si hay que ajustarlo o si debe eliminarse. Puede editar los campos directamente y proponer indicadores nuevos.</p>
      <div class="aviso info">
        <strong>Equipo de gestión:</strong> revise que la definición, la fuente y el responsable permitan medir el indicador con lo que hoy se registra.<br>
        <strong>Equipos asistenciales:</strong> revise la pertinencia clínica, el umbral y proponga lo que falte.
      </div>
      <p class="resumen-envio">Versión ${esc(d.version)} · ${esc(d.fuente)}</p>
      ${bloques}`;
  }

  // ---------- construcción: ficha ----------
  async function vistaFicha(id) {
    const d = await cargar("enfermedades");
    const enf = d.enfermedades.find((e) => e.id === id);
    if (!enf) throw new Error("No se encontró la enfermedad.");
    const clave = "rev:" + enf.id;
    const borrador = leer(clave) || {};
    const revisor = leer("revisor") || {};
    const nuevos = borrador.nuevos || [];

    app.innerHTML = `
      <div class="migas"><a href="#construccion">← Todas las enfermedades</a></div>
      <div class="ficha-cabecera">
        <div>
          <span class="etiqueta">${esc(enf.unidad)}</span>
          <h1>${esc(enf.nombre)}</h1>
          ${enf.detalle ? `<p class="lead" style="margin:0">${esc(enf.detalle)}</p>` : ""}
          <p class="resumen-envio" style="margin:4px 0 0">${esc(enf.poblacion)}</p>
        </div>
      </div>
      ${enf.guias && enf.guias.length ? `<ul class="guias">${enf.guias.map((g) => `<li><a href="${esc(g.url)}" target="_blank" rel="noopener">📄 ${esc(g.titulo)}</a></li>`).join("")}</ul>` : ""}

      <h2>Quién revisa</h2>
      <div class="tarjeta revisor">
        <div><label for="rv-nombre">Nombre</label><input type="text" id="rv-nombre" autocomplete="name" value="${esc(revisor.nombre)}"></div>
        <div><label for="rv-equipo">Equipo</label>
          <select id="rv-equipo">
            <option value="">Seleccione…</option>
            ${["Gestión", "Asistencial"].map((o) => `<option ${revisor.equipo === o ? "selected" : ""}>${o}</option>`).join("")}
          </select></div>
        <div><label for="rv-cargo">Cargo o especialidad</label><input type="text" id="rv-cargo" value="${esc(revisor.cargo)}"></div>
      </div>

      <h2>Indicadores</h2>
      <div id="lista">
        ${enf.indicadores.map((ind, i) => tarjetaIndicador(ind, i + 1, borrador.items && borrador.items[ind.id])).join("")}
        ${nuevos.map((n) => tarjetaNuevo(n)).join("")}
      </div>

      <div class="acciones">
        <button type="button" class="secundario" id="btn-nuevo">+ Proponer indicador nuevo</button>
      </div>

      <h2>Comentario general</h2>
      <textarea id="comentario-general" rows="3" placeholder="Observaciones sobre la enfermedad, la población o el conjunto de indicadores">${esc(borrador.general)}</textarea>

      <div class="acciones">
        <button type="button" id="btn-enviar">Enviar revisión</button>
        <button type="button" class="secundario" id="btn-limpiar">Descartar cambios</button>
        <span class="resumen-envio" id="resumen"></span>
      </div>
      <div id="estado" style="margin-top:14px"></div>`;

    const lista = $("#lista");

    function estadoActual() {
      const items = {};
      $$(".indicador[data-original]", lista).forEach((card) => {
        const it = leerTarjeta(card);
        if (it.decision || it.comentario || it.cambios.length) items[card.dataset.id] = it;
      });
      const nuevosAct = $$(".indicador.nuevo", lista).map((card) => leerTarjeta(card)).filter((n) => n.resultado || n.definicion || n.comentario);
      return { items, nuevos: nuevosAct, general: $("#comentario-general").value.trim() };
    }

    function actualizar() {
      $$(".indicador[data-original]", lista).forEach((card) => {
        const orig = enf.indicadores.find((x) => x.id === card.dataset.id);
        CAMPOS.forEach(([k]) => {
          const el = $(`[data-campo=${k}]`, card);
          el.classList.toggle("cambiado", el.value.trim() !== (orig[k] || "").trim());
        });
      });
      const est = estadoActual();
      const n = Object.keys(est.items).length + est.nuevos.length + (est.general ? 1 : 0);
      if (n) guardar(clave, est); else borrar(clave);
      guardar("revisor", { nombre: $("#rv-nombre").value.trim(), equipo: $("#rv-equipo").value, cargo: $("#rv-cargo").value.trim() });
      $("#resumen").textContent = n ? `${Object.keys(est.items).length} indicador(es) revisado(s), ${est.nuevos.length} nuevo(s). El borrador se guarda en este navegador.` : "";
    }

    function leerTarjeta(card) {
      const it = { id: card.dataset.id, tipo: card.classList.contains("nuevo") ? "nuevo" : "existente" };
      CAMPOS.forEach(([k]) => (it[k] = $(`[data-campo=${k}]`, card).value.trim()));
      const dec = $("input[type=radio]:checked", card);
      it.decision = dec ? dec.value : (it.tipo === "nuevo" ? "nuevo" : "");
      it.comentario = $("[data-campo=comentario]", card).value.trim();
      it.cambios = [];
      if (it.tipo === "existente") {
        const orig = enf.indicadores.find((x) => x.id === it.id);
        CAMPOS.forEach(([k]) => { if (it[k] !== (orig[k] || "").trim()) it.cambios.push(k); });
      }
      return it;
    }

    lista.addEventListener("input", actualizar);
    lista.addEventListener("change", actualizar);
    $("#comentario-general").addEventListener("input", actualizar);
    ["#rv-nombre", "#rv-equipo", "#rv-cargo"].forEach((s) => $(s).addEventListener("input", actualizar));
    $("#rv-equipo").addEventListener("change", actualizar);
    lista.addEventListener("click", (ev) => {
      if (ev.target.matches("button.quitar")) { ev.target.closest(".indicador").remove(); actualizar(); }
    });
    $("#btn-nuevo").addEventListener("click", () => {
      lista.insertAdjacentHTML("beforeend", tarjetaNuevo({ id: enf.id + "-nuevo-" + Date.now().toString(36) }));
      const ult = lista.lastElementChild; $("[data-campo=resultado]", ult).focus();
    });
    $("#btn-limpiar").addEventListener("click", (ev) => {
      const b = ev.currentTarget;
      if (!b.dataset.confirmar) { b.dataset.confirmar = "1"; b.textContent = "¿Seguro? Clic de nuevo para descartar"; return; }
      borrar(clave); vistaFicha(id);
    });
    $("#btn-enviar").addEventListener("click", () => enviar(enf, estadoActual(), clave));
    actualizar();
  }

  function tarjetaIndicador(ind, n, guardado) {
    const g = guardado || {};
    const val = (k) => (g[k] != null ? g[k] : ind[k] || "");
    return `
      <div class="tarjeta indicador" data-id="${esc(ind.id)}" data-original="1">
        <div class="indicador-cabecera">
          <span class="codigo">Indicador ${n}</span>
          <div class="decision" role="radiogroup" aria-label="Decisión">
            ${[["acuerdo", "De acuerdo"], ["ajustar", "Ajustar"], ["eliminar", "Eliminar"]].map(([v, t]) => `
              <input type="radio" name="dec-${esc(ind.id)}" id="dec-${esc(ind.id)}-${v}" value="${v}" ${g.decision === v ? "checked" : ""}>
              <label for="dec-${esc(ind.id)}-${v}">${t}</label>`).join("")}
          </div>
        </div>
        ${campos(ind.id, val)}
      </div>`;
  }

  function tarjetaNuevo(n) {
    const val = (k) => n[k] || "";
    return `
      <div class="tarjeta indicador nuevo" data-id="${esc(n.id)}">
        <div class="indicador-cabecera">
          <span class="chip">Propuesta nueva</span>
          <button type="button" class="quitar">Quitar</button>
        </div>
        ${campos(n.id, val)}
      </div>`;
  }

  function campos(id, val) {
    return `<div class="campos">
      ${CAMPOS.map(([k, t], i) => `
        <div class="${i < 2 ? "ancho" : ""}">
          <label for="${esc(id)}-${k}">${t}</label>
          <textarea id="${esc(id)}-${k}" data-campo="${k}" rows="${k === "definicion" ? 2 : 1}" placeholder="${k === "definicion" || k === "fuente" ? "Por definir" : ""}">${esc(val(k))}</textarea>
        </div>`).join("")}
      <div class="ancho">
        <label for="${esc(id)}-comentario">Comentario o justificación</label>
        <textarea id="${esc(id)}-comentario" data-campo="comentario" rows="2">${esc(val("comentario"))}</textarea>
      </div>
    </div>`;
  }

  async function enviar(enf, est, clave) {
    const estado = $("#estado");
    const revisor = { nombre: $("#rv-nombre").value.trim(), equipo: $("#rv-equipo").value, cargo: $("#rv-cargo").value.trim() };
    const items = Object.values(est.items).concat(est.nuevos);
    if (!revisor.nombre || !revisor.equipo) {
      estado.innerHTML = '<div class="aviso alerta">Escriba su nombre y seleccione el equipo antes de enviar.</div>';
      $("#rv-nombre").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!items.length && !est.general) {
      estado.innerHTML = '<div class="aviso alerta">No hay cambios para enviar. Marque una decisión, edite un campo o escriba un comentario.</div>';
      return;
    }
    const sinDecision = Object.values(est.items).filter((i) => !i.decision && i.cambios.length);
    sinDecision.forEach((i) => (i.decision = "ajustar"));

    const paquete = {
      enviado: new Date().toISOString(),
      revisor,
      enfermedad: enf.id,
      enfermedad_nombre: enf.nombre,
      version: datos.enfermedades.version,
      comentario_general: est.general,
      items: items.map((i) => ({ ...i, cambios: (i.cambios || []).join(", ") }))
    };

    if (!CFG.REVISIONES_URL) {
      estado.innerHTML = '<div class="aviso alerta"><strong>El envío aún no está conectado.</strong> Su revisión quedó guardada en este navegador y podrá enviarla cuando se active.</div>';
      return;
    }
    const btn = $("#btn-enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await fetch(CFG.REVISIONES_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(paquete) });
      borrar(clave);
      estado.innerHTML = `<div class="aviso exito"><strong>Revisión enviada.</strong> Gracias, ${esc(revisor.nombre)}. Se registraron ${items.length} indicador(es)${est.general ? " y el comentario general" : ""}.</div>`;
      $("#resumen").textContent = "";
    } catch (e) {
      estado.innerHTML = '<div class="aviso error">No se pudo enviar. Revise la conexión e intente de nuevo; su borrador sigue guardado.</div>';
    } finally {
      btn.disabled = false; btn.textContent = "Enviar revisión";
    }
  }

  // ---------- resultados ----------
  async function vistaResultados() {
    const r = await cargar("resultados");
    const corte = new Date(r.corte + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    app.innerHTML = `
      <h1>${esc(r.titulo)}</h1>
      <p class="lead">${esc(r.nota)}</p>
      <div class="tarjeta" style="max-width:640px">
        <span class="etiqueta">Tablero ${esc(r.version)} · corte del ${esc(corte)}</span>
        <h3 style="margin-top:6px">Tablero de resultados en salud</h3>
        <p>Elija la enfermedad y el resultado que quiere ver: indicadores clave, gráficos y tablas, con búsqueda y descarga de cada tabla en CSV.</p>
        <p style="margin-top:14px"><a class="boton" href="${esc(r.tablero)}" target="_blank" rel="noopener">Abrir el tablero →</a></p>
      </div>
      <div class="aviso info" style="margin-top:18px">
        <strong>Acceso con contraseña.</strong> El tablero es un documento confidencial del programa. Solicite la contraseña al coordinador del programa; no la comparta junto con el enlace.
      </div>`;
  }

  // ---------- consulta ----------
  function vistaConsulta() {
    const conectado = !!CFG.CONSULTA_URL;
    app.innerHTML = `
      <h1>Consulta de la cohorte</h1>
      <p class="lead">Para responder preguntas sobre la cohorte con la información del programa, sin modificarla.</p>
      <div class="aviso info">
        La consulta se abre en una aplicación del Google Workspace del hospital. Solo entran cuentas <strong>@hptu.org.co</strong> autorizadas, la información es de solo lectura y cada consulta queda registrada. Este sitio no guarda ni muestra datos de pacientes.
      </div>
      ${conectado
        ? `<a class="boton" href="${esc(CFG.CONSULTA_URL)}" target="_blank" rel="noopener">Abrir la consulta →</a>`
        : '<div class="aviso alerta">La consulta aún no está conectada.</div>'}
      <h2>Cómo funciona</h2>
      <ol class="pasos">
        <li>Inicie sesión con su cuenta del hospital.</li>
        <li>Filtre por unidad, enfermedad, grupo de edad u otras variables.</li>
        <li>La consulta muestra el número de pacientes, la distribución por la variable que elija y, si lo necesita, el listado.</li>
        <li>No hay forma de editar la hoja original desde la consulta.</li>
      </ol>`;
  }

  window.addEventListener("hashchange", enrutar);
  enrutar();
})();
