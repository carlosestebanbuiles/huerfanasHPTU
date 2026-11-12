/* Portal de indicadores del Programa de Enfermedades Huérfanas */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const CFG = window.CONFIG || {};
  const IC = window.ICONOS || {};
  const datos = { enfermedades: null, resultados: null };
  const CAMPOS = [
    ["resultado", "Indicador"],
    ["definicion", "Definición operativa"],
    ["tipo", "Tipo"],
    ["numerador", "Numerador"],
    ["denominador", "Denominador"],
    ["exclusiones", "Exclusiones"],
    ["poblacion", "Población"],
    ["periodicidad", "Periodicidad"],
    ["fuente", "Fuente de información"],
    ["meta", "Meta propuesta"],
    ["responsable", "Responsable"],
    ["base", "Base (guía o referencia)"]
  ];
  const PRINCIPALES = ["resultado", "definicion"];
  const TIPOS = { adherencia: "Adherencia a la guía", "desempeño": "Desempeño del seguimiento", resultado: "Resultado en salud" };
  const ORIGENES = { guia: "Desde la guía institucional", "guia-int": "Desde guía internacional", referencia: "Referencia internacional", programa: "Propuesta del programa", borrador: "Borrador del programa" };
  // Ícono y color de cada unidad
  const UNIDADES = {
    "Endocrinología": ["endocrino", "c-rosa"],
    "Amiloidosis": ["corazon", "c-rosa"],
    "Fibrosis quística": ["pulmon", "c-azul"],
    "Dermatología": ["piel", "c-morado"],
    "Enfermedad inflamatoria intestinal": ["intestino", "c-verde"],
    "Falla intestinal": ["nutricion", "c-verde"],
    "Neurometabólicas": ["adn", "c-azul"],
    "Transversal": ["usuarios", "c-morado"]
  };
  const icUnidad = (u) => { const x = UNIDADES[u] || ["adn", "c-morado"]; return `<span class="ic ${x[1]}">${IC[x[0]] || ""}</span>`; };
  const ESTADOS = { borrador: "Borrador", revision: "En revisión", validado: "Validado" };

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const borrar = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const fechaLarga = (iso) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  async function cargar(nombre) {
    if (datos[nombre]) return datos[nombre];
    const r = await fetch("data/" + nombre + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo cargar " + nombre);
    datos[nombre] = await r.json();
    return datos[nombre];
  }

  // Resumen de revisiones (solo conteos, sin nombres) desde el Apps Script de revisiones.
  let promesaAvance = null;
  function avance() {
    if (!promesaAvance) {
      promesaAvance = (async () => {
        if (!CFG.REVISIONES_URL) return null;
        try {
          const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(CFG.REVISIONES_URL + "?resumen=1", { signal: ctrl.signal });
          clearTimeout(t);
          const j = await r.json();
          return j && j.ok ? j : null;
        } catch (e) { return null; }
      })();
    }
    return promesaAvance;
  }
  const todas = (d) => (d.transversales ? [d.transversales] : []).concat(d.enfermedades);

  // Estado de una enfermedad: validado (manual en el JSON) > en revisión (hay revisiones) > borrador
  function estadoDe(e, av) {
    if (e.estado === "validado") return "validado";
    const r = av && av.porEnfermedad && av.porEnfermedad[e.nombre];
    return r && r.revisiones ? "revision" : "borrador";
  }
  function revisadosDe(e, av) {
    const r = av && av.porEnfermedad && av.porEnfermedad[e.nombre];
    if (!r || !r.indicadores) return 0;
    return e.indicadores.filter((i) => r.indicadores.indexOf(i.id) >= 0).length;
  }

  function marcarMenu(ruta) {
    $$(".menu a").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === ruta));
  }

  // ---------- tema ----------
  const raiz = document.documentElement;
  const botonTema = $("#tema");
  const oscuro = () => raiz.getAttribute("data-theme") === "dark" || (!raiz.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  const pintarTema = () => { botonTema.innerHTML = oscuro() ? IC.sol : IC.luna; botonTema.title = oscuro() ? "Tema claro" : "Tema oscuro"; };
  botonTema.addEventListener("click", () => {
    const nuevo = oscuro() ? "light" : "dark";
    raiz.setAttribute("data-theme", nuevo); guardar("tema", nuevo); try { localStorage.setItem("tema", nuevo); } catch (e) {}
    pintarTema();
  });
  pintarTema();

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
    const r = await cargar("resultados");
    const nInd = todas(d).reduce((s, e) => s + e.indicadores.length, 0);
    const nVal = d.enfermedades.filter((e) => e.estado === "validado").length;

    const pintar = (av) => {
      const revisados = av ? todas(d).reduce((s, e) => s + revisadosDe(e, av), 0) : null;
      const enRev = av ? d.enfermedades.filter((e) => estadoDe(e, av) === "revision").length : null;
      const p = revisados == null ? null : pct(revisados, nInd);
      app.innerHTML = `
        <section class="heroe">
          <span class="etiqueta">Espacio de trabajo del programa</span>
          <h1>Indicadores y resultados en salud</h1>
          <p>Construimos con los equipos los indicadores de cada enfermedad, presentamos los resultados y consultamos la cohorte del programa.</p>
        </section>

        <section class="kpis" aria-label="Resumen">
          <div class="kpi">
            <div class="k-et"><span class="k-ic c-rosa">${IC.construccion}</span>Enfermedades en construcción</div>
            <div class="k-val">${d.enfermedades.length}</div>
            <div class="k-pie">${nVal} validadas${enRev != null ? ` · ${enRev} en revisión` : ""}</div>
          </div>
          <div class="kpi">
            <div class="k-et"><span class="k-ic c-azul">${IC.lista}</span>Indicadores propuestos</div>
            <div class="k-val">${nInd}</div>
            <div class="k-pie">Versión ${esc(d.version)} del catálogo</div>
          </div>
          <div class="kpi">
            <div class="k-et"><span class="k-ic c-morado">${IC.usuarios}</span>Revisiones recibidas</div>
            <div class="k-val">${av ? av.total : "—"}</div>
            <div class="k-pie">${av && av.ultima ? "Última: " + esc(fechaLarga(av.ultima)) : av ? "Aún no hay revisiones" : "Resumen pendiente de activar"}</div>
          </div>
          <div class="kpi">
            <div class="k-et"><span class="k-ic c-verde">${IC.resultados}</span>Avance de la revisión</div>
            <div class="k-val">${p == null ? "—" : p + " %"}</div>
            <div class="k-pie">${p == null ? "Indicadores con al menos una revisión" : `${revisados} de ${nInd} indicadores revisados`}</div>
            <div class="barra"><span style="width:${p || 0}%"></span></div>
          </div>
        </section>

        <h2>Espacios de trabajo</h2>
        <div class="rejilla">
          <a class="tarjeta espacio" href="#construccion">
            <span class="ic c-rosa">${IC.construccion}</span>
            <span class="num">1 · Construcción</span>
            <h3>Revisar y proponer indicadores</h3>
            <p>Gestión valida que se puedan medir; los equipos asistenciales, que tengan sentido clínico.</p>
            <span class="ir">Ir a construcción →</span>
          </a>
          <a class="tarjeta espacio" href="#resultados">
            <span class="ic c-azul">${IC.resultados}</span>
            <span class="num">2 · Resultados</span>
            <h3>Resultados en salud</h3>
            <p>Tablero ${esc(r.version || "")} con la primera medición (corte del ${esc(fechaLarga(r.corte))}). Acceso con contraseña.</p>
            <span class="ir">Ver resultados →</span>
          </a>
          <a class="tarjeta espacio" href="#consulta">
            <span class="ic c-morado">${IC.consulta}</span>
            <span class="num">3 · Consulta</span>
            <h3>Consultar la cohorte</h3>
            <p>Para el equipo de gestión. Solo lectura, con cuenta del hospital.</p>
            <span class="ir">Abrir consulta →</span>
          </a>
        </div>`;
    };
    pintar(null);
    const av = await avance();
    if (av && (location.hash.replace(/^#/, "") || "inicio") === "inicio") pintar(av);
  }

  // ---------- construcción: listado ----------
  let filtroUnidad = "", filtroEstado = "";
  async function vistaConstruccion() {
    const d = await cargar("enfermedades");
    const unidadesTodas = [...new Set(todas(d).map((e) => e.unidad))];

    const pintar = (av) => {
      const lista = todas(d).filter((e) => (!filtroUnidad || e.unidad === filtroUnidad) && (!filtroEstado || estadoDe(e, av) === filtroEstado));
      const unidades = {};
      lista.forEach((e) => (unidades[e.unidad] = unidades[e.unidad] || []).push(e));
      const cuenta = (est) => todas(d).filter((e) => estadoDe(e, av) === est).length;
      const bloques = Object.keys(unidades).map((u) => `
        <section class="unidad">
          <h2 class="unidad-tit">${icUnidad(u)}${esc(u)}</h2>
          <div class="rejilla">
            ${unidades[u].map((e) => {
              const est = estadoDe(e, av), rev = revisadosDe(e, av), n = e.indicadores.length;
              const pendiente = leer("rev:" + e.id);
              return `<a class="tarjeta enf" href="#e-${esc(e.id)}">
                <div class="fila"><h3>${esc(e.nombre)}</h3><span class="chip ${est}">${ESTADOS[est]}</span></div>
                ${e.piloto ? '<span class="chip guia">Piloto: fichas técnicas</span>' : ""}
                <span class="meta">${n} indicador${n === 1 ? "" : "es"}${(() => { const c = (t) => e.indicadores.filter((i) => i.tipo === t).length; const a = c("adherencia"), ds = c("desempeño"); return a || ds ? ` · ${a} adherencia, ${ds} desempeño` : ""; })()} · ${esc(e.poblacion)}</span>
                ${av ? `<div class="barra" title="${rev} de ${n} indicadores revisados"><span style="width:${pct(rev, n)}%"></span></div><span class="meta">${rev} de ${n} revisados</span>` : ""}
                ${pendiente ? '<span class="chip temporal">Tiene una revisión sin enviar</span>' : ""}
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
        <div class="filtros" role="group" aria-label="Filtrar por unidad">
          <span class="rotulo">Unidad</span>
          <button type="button" class="filtro" data-u="" aria-pressed="${!filtroUnidad}">Todas</button>
          ${unidadesTodas.map((u) => `<button type="button" class="filtro" data-u="${esc(u)}" aria-pressed="${filtroUnidad === u}">${esc(u)}</button>`).join("")}
        </div>
        <div class="filtros" role="group" aria-label="Filtrar por estado">
          <span class="rotulo">Estado</span>
          <button type="button" class="filtro" data-s="" aria-pressed="${!filtroEstado}">Todos</button>
          ${Object.keys(ESTADOS).map((s) => `<button type="button" class="filtro" data-s="${s}" aria-pressed="${filtroEstado === s}">${ESTADOS[s]} · ${cuenta(s)}</button>`).join("")}
        </div>
        ${bloques || '<p class="tenue" style="margin-top:24px">No hay enfermedades con esos filtros.</p>'}
        <p class="resumen-envio" style="margin-top:28px">Catálogo versión ${esc(d.version)} · ${esc(d.fuente)}</p>`;

      $$(".filtro[data-u]").forEach((b) => b.addEventListener("click", () => { filtroUnidad = b.dataset.u; pintar(av); }));
      $$(".filtro[data-s]").forEach((b) => b.addEventListener("click", () => { filtroEstado = b.dataset.s; pintar(av); }));
    };
    pintar(null);
    const av = await avance();
    if (av && location.hash.replace(/^#/, "") === "construccion") pintar(av);
  }

  // ---------- construcción: ficha ----------
  async function vistaFicha(id) {
    const d = await cargar("enfermedades");
    const enf = todas(d).find((e) => e.id === id);
    if (!enf) throw new Error("No se encontró la enfermedad.");
    const clave = "rev:" + enf.id;
    const borrador = leer(clave) || {};
    const revisor = leer("revisor") || {};
    const nuevos = borrador.nuevos || [];

    app.innerHTML = `
      <div class="migas"><a href="#construccion">← Todas las enfermedades</a></div>
      <div class="ficha-cabecera">
        ${icUnidad(enf.unidad)}
        <div>
          <span class="etiqueta">${esc(enf.unidad)}</span>
          <h1>${esc(enf.nombre)}</h1>
          ${enf.detalle ? `<p class="lead" style="margin:0">${esc(enf.detalle)}</p>` : ""}
          <p class="resumen-envio" style="margin:4px 0 0">${esc(enf.poblacion)}</p>
        </div>
      </div>
      ${enf.guias && enf.guias.length ? `<ul class="guias">${enf.guias.map((g) => `<li><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.titulo)}</a></li>`).join("")}</ul>` : ""}
      ${enf.nota_guia ? `<div class="aviso info" style="margin-top:16px">${esc(enf.nota_guia)}</div>` : ""}
      ${enf.reemplaza && enf.reemplaza.length ? `<details class="reemplaza"><summary>Reemplaza ${enf.reemplaza.length} indicadores que estaban repetidos en cada enfermedad</summary><ul>${enf.reemplaza.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : ""}

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
        const dec = $("input[type=radio]:checked", card);
        card.classList.remove("d-acuerdo", "d-ajustar", "d-eliminar");
        if (dec) card.classList.add("d-" + dec.value);
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
      const it = { id: card.dataset.id, codigo: card.dataset.codigo || "", clase: card.classList.contains("nuevo") ? "nuevo" : "existente" };
      CAMPOS.forEach(([k]) => (it[k] = $(`[data-campo=${k}]`, card).value.trim()));
      const dec = $("input[type=radio]:checked", card);
      it.decision = dec ? dec.value : (it.clase === "nuevo" ? "nuevo" : "");
      it.comentario = $("[data-campo=comentario]", card).value.trim();
      it.cambios = [];
      if (it.clase === "existente") {
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
      const tarjetaN = lista.lastElementChild; const det = $("details", tarjetaN); if (det) det.open = true;
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
      <div class="tarjeta indicador" data-id="${esc(ind.id)}" data-codigo="${esc(ind.codigo || "")}" data-original="1">
        <div class="indicador-cabecera">
          <span class="codigo">${esc(ind.codigo || "Indicador " + n)}
            ${ind.tipo ? `<span class="chip tipo-${ind.tipo === "adherencia" ? "adh" : ind.tipo === "resultado" ? "res" : "des"}">${esc(TIPOS[ind.tipo] || ind.tipo)}</span>` : ""}
            ${ORIGENES[ind.origen] ? `<span class="chip ${ind.origen === "borrador" ? "" : "guia"}">${ORIGENES[ind.origen]}</span>` : ""}</span>
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
    const campo = (k, t, ancho) => {
      const v = val(k);
      if (k === "tipo") {
        return `<div><label for="${esc(id)}-tipo">${t}</label>
          <select id="${esc(id)}-tipo" data-campo="tipo"><option value="">Seleccione…</option>
          ${Object.keys(TIPOS).map((x) => `<option value="${x}" ${v === x ? "selected" : ""}>${TIPOS[x]}</option>`).join("")}</select></div>`;
      }
      const largo = ["definicion", "numerador", "denominador", "base"].indexOf(k) >= 0;
      return `<div class="${ancho || largo ? "ancho" : ""}">
          <label for="${esc(id)}-${k}">${t}</label>
          <textarea id="${esc(id)}-${k}" data-campo="${k}" rows="${largo ? 2 : 1}" placeholder="Por definir">${esc(v)}</textarea>
        </div>`;
    };
    const ficha = CAMPOS.filter(([k]) => PRINCIPALES.indexOf(k) < 0);
    const llenos = ficha.filter(([k]) => val(k)).length;
    return `<div class="campos">
      ${CAMPOS.filter(([k]) => PRINCIPALES.indexOf(k) >= 0).map(([k, t]) => campo(k, t, true)).join("")}
      <details class="ancho ficha-tec" ${llenos > 3 ? "open" : ""}>
        <summary>Ficha técnica <span class="tenue">(${llenos} de ${ficha.length} campos)</span></summary>
        <div class="campos">${ficha.map(([k, t]) => campo(k, t)).join("")}</div>
      </details>
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
        <span class="etiqueta"><span class="ic c-azul" style="width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">${IC.resultados}</span>Tablero ${esc(r.version)} · corte del ${esc(corte)}</span>
        <h3 style="margin-top:6px">Tablero de resultados en salud</h3>
        <p>Elija la enfermedad y el resultado que quiere ver: indicadores clave, gráficos y tablas, con búsqueda y descarga de cada tabla en CSV.</p>
        <p style="margin-top:14px"><a class="boton" href="${esc(r.tablero)}" target="_blank" rel="noopener">Abrir el tablero →</a></p>
      </div>
      <div class="aviso info" style="margin-top:18px">
        ${IC.candado} <strong>Acceso con contraseña.</strong> El tablero es un documento confidencial del programa. Solicite la contraseña al coordinador del programa; no la comparta junto con el enlace.
      </div>`;
  }

  // ---------- consulta ----------
  function vistaConsulta() {
    const conectado = !!CFG.CONSULTA_URL;
    app.innerHTML = `
      <h1>Consulta de la cohorte</h1>
      <p class="lead">Para responder preguntas sobre la cohorte con la información del programa, sin modificarla.</p>
      <div class="tarjeta" style="max-width:640px">
        <span class="etiqueta"><span class="ic c-morado" style="width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">${IC.consulta}</span>Solo lectura · cuentas @hptu.org.co</span>
        <h3 style="margin-top:6px">Consulta de la cohorte</h3>
        <p>Preguntas rápidas, filtros por unidad, enfermedad, estado y grupo de edad, y resultados con conteos y porcentajes.</p>
        <p style="margin-top:14px">${conectado
          ? `<a class="boton" href="${esc(CFG.CONSULTA_URL)}" target="_blank" rel="noopener">Abrir la consulta →</a>`
          : '<span class="chip temporal">Aún no está conectada</span>'}</p>
      </div>
      <div class="aviso info" style="margin-top:18px;max-width:780px">
        ${IC.candado} La consulta se abre en una aplicación del Google Workspace del hospital. Solo entran cuentas autorizadas, la información es de solo lectura y cada consulta queda registrada. Este sitio no guarda ni muestra datos de pacientes.
      </div>
      <h2>Cómo funciona</h2>
      <ol class="pasos">
        <li>Inicie sesión con su cuenta del hospital.</li>
        <li>Use una pregunta rápida o filtre por unidad, enfermedad, grupo de edad u otras variables.</li>
        <li>La consulta muestra el número de pacientes, la distribución por la variable que elija y, si lo necesita, el listado.</li>
        <li>No hay forma de editar la hoja original desde la consulta.</li>
      </ol>
      <div class="aviso alerta" style="max-width:780px"><strong>Si aparece «Sorry, unable to open the file at this time»:</strong> el navegador tiene varias cuentas de Google abiertas. Abra la consulta en una ventana de incógnito o cierre las otras sesiones y entre solo con la cuenta del hospital.</div>`;
  }

  window.addEventListener("hashchange", enrutar);
  cargar("enfermedades").then((d) => { $("#version").textContent = "Catálogo de indicadores v" + d.version; }).catch(() => {});
  enrutar();
})();
