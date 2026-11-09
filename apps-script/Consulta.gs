/**
 * Consulta de la cohorte (solo lectura).
 *
 * Instalación (cuenta institucional de Carlos, cbuiles@hptu.org.co):
 *  1. script.google.com → Proyecto nuevo "Consulta cohorte". Pegar este archivo y Consulta.html.
 *  2. Completar CONFIG abajo: ID de la hoja con la información, nombre de la pestaña,
 *     columnas que se pueden usar como filtro y columnas que se muestran en el listado.
 *  3. Implementar → Nueva implementación → Aplicación web.
 *       Ejecutar como: Yo.
 *       Quién tiene acceso: Cualquier usuario de Hospital Pablo Tobón Uribe (dominio hptu.org.co).
 *  4. Copiar la URL en assets/config.js → CONSULTA_URL.
 *
 * Por qué es de solo lectura:
 *  - Los usuarios no reciben permisos sobre la hoja; solo ven lo que este script devuelve.
 *  - El script abre la hoja y únicamente llama getValues(); no hay ninguna función que escriba en ella.
 *  - AUTORIZADOS limita quién puede consultar aunque tenga cuenta del hospital.
 *  - Cada consulta se registra (quién, cuándo, qué filtros) en una hoja de registro aparte.
 */

const CONFIG = {
  HOJA_ID: 'PEGAR_AQUI_EL_ID_DE_LA_HOJA',
  PESTANA: 'COHORTE',
  FILA_ENCABEZADOS: 1,
  // Columnas disponibles como filtro y para agrupar (nombres exactos de los encabezados).
  FILTROS: ['UNIDAD', 'ENFERMEDAD', 'GRUPO_EDAD', 'SEXO', 'ASEGURADOR', 'REGIMEN', 'ESTADO', 'DEPARTAMENTO', 'TERAPIA_ALTO_COSTO'],
  // Columnas que aparecen en el listado. Las demás nunca salen del script.
  LISTADO: ['ID_PROGRAMA', 'TIPO_DOC', 'DOCUMENTO', 'UNIDAD', 'ENFERMEDAD', 'GRUPO_EDAD', 'EDAD', 'ASEGURADOR', 'ESTADO', 'FECHA_ULTIMA_CONSULTA'],
  // Correos autorizados. Vacío = cualquier cuenta del dominio que tenga el enlace.
  AUTORIZADOS: [],
  // Hoja de registro de consultas (otra hoja de cálculo). Vacío = sin registro.
  REGISTRO_ID: '',
  MAX_FILAS_LISTADO: 500
};

function doGet() {
  verificarAcceso_();
  return HtmlService.createTemplateFromFile('Consulta')
    .evaluate()
    .setTitle('Consulta de la cohorte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function verificarAcceso_() {
  const correo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!correo) throw new Error('Inicie sesión con su cuenta del hospital.');
  const autorizados = CONFIG.AUTORIZADOS.map(function (c) { return String(c).toLowerCase(); });
  if (autorizados.length && autorizados.indexOf(correo) < 0) {
    throw new Error('Su cuenta no está autorizada para esta consulta.');
  }
  return correo;
}

function leerDatos_() {
  const valores = SpreadsheetApp.openById(CONFIG.HOJA_ID).getSheetByName(CONFIG.PESTANA).getDataRange().getValues();
  const enc = valores[CONFIG.FILA_ENCABEZADOS - 1].map(function (h) { return String(h).trim(); });
  const filas = valores.slice(CONFIG.FILA_ENCABEZADOS).filter(function (f) { return f.some(function (c) { return c !== ''; }); });
  return { enc: enc, filas: filas };
}

/** Opciones de cada filtro (valores distintos). */
function opciones() {
  verificarAcceso_();
  const d = leerDatos_();
  const out = {};
  CONFIG.FILTROS.forEach(function (col) {
    const j = d.enc.indexOf(col);
    if (j < 0) return;
    const vals = {};
    d.filas.forEach(function (f) { vals[texto_(f[j])] = true; });
    out[col] = Object.keys(vals).sort();
  });
  return { filtros: out, total: d.filas.length, listado: CONFIG.LISTADO };
}

/**
 * Ejecuta una consulta.
 * @param {Object} q {filtros: {COL: [valores]}, agrupar: 'COL', listado: bool}
 */
function consultar(q) {
  const correo = verificarAcceso_();
  const d = leerDatos_();
  const idx = function (c) { return d.enc.indexOf(c); };
  const filtros = q.filtros || {};
  const filas = d.filas.filter(function (f) {
    return Object.keys(filtros).every(function (col) {
      if (CONFIG.FILTROS.indexOf(col) < 0) return true;
      const sel = filtros[col]; if (!sel || !sel.length) return true;
      return sel.indexOf(texto_(f[idx(col)])) >= 0;
    });
  });

  let grupos = null;
  if (q.agrupar && CONFIG.FILTROS.indexOf(q.agrupar) >= 0) {
    const j = idx(q.agrupar); const c = {};
    filas.forEach(function (f) { const k = texto_(f[j]) || '(vacío)'; c[k] = (c[k] || 0) + 1; });
    grupos = Object.keys(c).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  let listado = null;
  if (q.listado) {
    const cols = CONFIG.LISTADO.filter(function (c) { return idx(c) >= 0; });
    listado = { columnas: cols, filas: filas.slice(0, CONFIG.MAX_FILAS_LISTADO).map(function (f) { return cols.map(function (c) { return texto_(f[idx(c)]); }); }), recortado: filas.length > CONFIG.MAX_FILAS_LISTADO };
  }

  registrar_(correo, q, filas.length);
  return { n: filas.length, grupos: grupos, listado: listado };
}

function registrar_(correo, q, n) {
  if (!CONFIG.REGISTRO_ID) return;
  try {
    const ss = SpreadsheetApp.openById(CONFIG.REGISTRO_ID);
    const h = ss.getSheetByName('Registro') || ss.insertSheet('Registro');
    if (h.getLastRow() === 0) h.appendRow(['Fecha', 'Usuario', 'Filtros', 'Agrupar', 'Listado', 'Resultado (n)']);
    h.appendRow([new Date(), correo, JSON.stringify(q.filtros || {}), q.agrupar || '', q.listado ? 'sí' : 'no', n]);
  } catch (e) { /* el registro no debe impedir la consulta */ }
}

function texto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Bogota', 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
