/**
 * Consulta de la cohorte (solo lectura).
 *
 * Instalación (cuenta institucional de Carlos, cbuiles@hptu.org.co):
 *  1. script.google.com → Proyecto nuevo "Consulta cohorte". Pegar este archivo, Consulta.html y appsscript.json
 *     (Configuración del proyecto → Mostrar el archivo de manifiesto "appsscript.json").
 *  2. Completar CONFIG abajo: ID de la hoja con la información, nombre de la pestaña,
 *     columnas que se pueden usar como filtro y columnas que se muestran en el listado.
 *  3. Implementar → Nueva implementación → Aplicación web.
 *       Ejecutar como: Yo.
 *       Quién tiene acceso: Cualquier usuario de Hospital Pablo Tobón Uribe (dominio hptu.org.co).
 *  4. Copiar la URL en assets/config.js → CONSULTA_URL.
 *
 * Por qué es de solo lectura:
 *  - Los usuarios no reciben permisos sobre la hoja; solo ven lo que este script devuelve.
 *  - El script solo lee la hoja (Sheets.Spreadsheets.Values.get); no hay ninguna función que escriba en ella.
 *  - Además, appsscript.json limita el permiso a hojas de cálculo en SOLO LECTURA
 *    (spreadsheets.readonly): aunque el código tuviera un error, Google no le permitiría escribir.
 *  - Solo las columnas de FILTROS y LISTADO salen del script; el resto nunca llega al navegador.
 *  - AUTORIZADOS limita quién puede consultar aunque tenga cuenta del hospital.
 *  - Cada consulta se registra (quién, cuándo, qué filtros) en un documento de Google aparte.
 */

const CONFIG = {
  HOJA_ID: 'PEGAR_AQUI_EL_ID_DE_LA_HOJA',   // Debe ser una hoja de Google Sheets (no un .xlsx).
  PESTANA: 'Consolidado',
  FILA_ENCABEZADOS: 1,
  // Los encabezados se leen hasta el primer salto de línea:
  // "Ruta de Ingreso\nEnviado EPS Sura..." queda como "Ruta de Ingreso".

  // Columnas disponibles como filtro y para agrupar.
  FILTROS: [
    'UNIDAD', 'UNIDAD A LA QUE PERTENECERÍA', 'ESTADO EN LA UNIDAD', 'ESTADO ACTUAL', 'MODELO DE GESTIÓN HPTU',
    'GRUPO DE EDAD', 'Sexo', 'DepartamentoResidencia', 'Regional', 'Estado_Suspension',
    'Ruta de Ingreso', 'Gestion SURA EH#1', 'REPORTADO A SIVIGILA', 'REPORTADO HPTU',
    'REGISTRADO EN UNIDADES', 'CAUSA EGRESO CONSOLIDADO', 'Prioridad', 'GESTIONADO'
  ],
  // Filtros que buscan en varias columnas a la vez (un paciente puede tener hasta 4 enfermedades huérfanas).
  FILTROS_MULTIPLES: {
    'Enfermedad huérfana (cualquiera de las 4)': ['EnfermedadHuérfana #1', 'EnfermedadHuérfana #2', 'EnfermedadHuérfana #3', 'EnfermedadHuérfana #4'],
    'Diagnóstico CIE-10 (cualquiera de los 4)': ['DiagnosticoCIE10#1', 'DiagnosticoCIE10#2', 'DiagnosticoCIE10#3', 'DiagnosticoCIE10#4']
  },
  // Filtros visibles de entrada (los demás quedan en "Más filtros").
  PRINCIPALES: ['Enfermedad huérfana (cualquiera de las 4)', 'UNIDAD', 'ESTADO ACTUAL', 'GRUPO DE EDAD', 'Sexo'],
  // Preguntas rápidas: un clic aplica estos filtros y esta agrupación.
  RAPIDAS: [
    { titulo: 'Pacientes por enfermedad', agrupar: 'Enfermedad huérfana (cualquiera de las 4)', filtros: {} },
    { titulo: 'Pacientes por unidad', agrupar: 'UNIDAD', filtros: {} },
    { titulo: 'Activos por unidad', agrupar: 'UNIDAD', filtros: { 'ESTADO ACTUAL': ['ACTIVO'] } },
    { titulo: 'Adultos y niños', agrupar: 'GRUPO DE EDAD', filtros: {} },
    { titulo: 'Ruta de ingreso', agrupar: 'Ruta de Ingreso', filtros: {} },
    { titulo: 'Reporte a SIVIGILA', agrupar: 'REPORTADO A SIVIGILA', filtros: {} },
    { titulo: 'Pendientes de gestión por prioridad', agrupar: 'Prioridad', filtros: { 'GESTIONADO': ['PENDIENTE'] } }
  ],
  // Valores que no cuentan como enfermedad en los filtros múltiples.
  VACIOS: ['', 'SIN REGISTRO', 'SD', '0'],

  // Columnas que aparecen en el listado. Las demás (nombres, teléfono, correo, historia clínica,
  // observaciones de llamadas) nunca salen del script.
  LISTADO: [
    'KeyID', 'TipoDocumento', 'Documento', 'Edad', 'Sexo', 'EnfermedadHuérfana #1',
    'UNIDAD', 'ESTADO EN LA UNIDAD', 'ESTADO ACTUAL', 'FECHA INGRESO A MODELOS', 'FECHA ULTIMA CITA CUMPLIDA HPTU'
  ],
  // Correos autorizados. Vacío = cualquier cuenta del dominio que tenga el enlace.
  AUTORIZADOS: [],
  // Documento de Google (no hoja de cálculo) donde se registra cada consulta. Vacío = sin registro.
  REGISTRO_DOC_ID: '',
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
  // Se lee con la API de Sheets (servicio avanzado), que funciona con el permiso de solo lectura.
  const pestana = "'" + CONFIG.PESTANA.replace(/'/g, "''") + "'";
  // Valores sin formato (evita "#####" en columnas angostas); las fechas como texto.
  const r = Sheets.Spreadsheets.Values.get(CONFIG.HOJA_ID, pestana,
    { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
  const valores = r.values || [];
  const enc = (valores[CONFIG.FILA_ENCABEZADOS - 1] || []).map(function (h) { return String(h).split('\n')[0].trim(); });
  const n = enc.length;

  // Fecha de nacimiento como número de serie, para calcular la edad sin depender del formato de fecha.
  const jNac = enc.indexOf('Fecha_Nacimiento');
  let nac = [];
  if (jNac >= 0) {
    const col = letra_(jNac + 1), ini = CONFIG.FILA_ENCABEZADOS + 1;
    const rr = Sheets.Spreadsheets.Values.get(CONFIG.HOJA_ID, pestana + '!' + col + ini + ':' + col,
      { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    nac = (rr.values || []).map(function (x) { return x[0]; });
  }

  const jDoc = enc.indexOf('Documento');
  const hoy = new Date();
  const filas = valores.slice(CONFIG.FILA_ENCABEZADOS)
    .map(function (f, i) {
      const g = f.slice(0, n); while (g.length < n) g.push('');
      g.push(grupoEdad_(serialAFecha_(nac[i]), hoy));
      return g;
    })
    .filter(function (f) { return jDoc < 0 ? f.slice(0, n).some(function (c) { return c !== ''; }) : String(f[jDoc]).trim() !== ''; });
  enc.push('GRUPO DE EDAD');
  return { enc: enc, filas: filas };
}

function serialAFecha_(v) {
  return (typeof v === 'number' && v > 0) ? new Date(Math.round((v - 25569) * 86400000)) : null;
}

function letra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Grupo de edad calculado desde la fecha de nacimiento (la columna Edad puede venir desactualizada).
function grupoEdad_(nac, hoy) {
  if (!(nac instanceof Date)) return 'Sin fecha de nacimiento';
  let e = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) e--;
  return e < 18 ? 'Pediátrico (<18)' : 'Adulto (≥18)';
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
  Object.keys(CONFIG.FILTROS_MULTIPLES).forEach(function (nombre) {
    const vals = {};
    valoresMultiples_(d, nombre).forEach(function (lista) { lista.forEach(function (v) { vals[v] = true; }); });
    out[nombre] = Object.keys(vals).sort();
  });
  const principales = CONFIG.PRINCIPALES.filter(function (c) { return out[c]; });
  return { filtros: out, principales: principales, multiples: Object.keys(CONFIG.FILTROS_MULTIPLES),
           rapidas: CONFIG.RAPIDAS, total: d.filas.length, listado: CONFIG.LISTADO };
}

// Para cada fila, la lista de valores no vacíos de las columnas de un filtro múltiple.
function valoresMultiples_(d, nombre) {
  const idxs = CONFIG.FILTROS_MULTIPLES[nombre].map(function (c) { return d.enc.indexOf(c); }).filter(function (j) { return j >= 0; });
  return d.filas.map(function (f) {
    return idxs.map(function (j) { return texto_(f[j]); }).filter(function (v) { return CONFIG.VACIOS.indexOf(v.toUpperCase()) < 0; });
  });
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
  const multi = {};
  Object.keys(CONFIG.FILTROS_MULTIPLES).forEach(function (n) { multi[n] = valoresMultiples_(d, n); });
  const pos = d.filas.map(function (f, i) { return i; }).filter(function (i) {
    const f = d.filas[i];
    return Object.keys(filtros).every(function (col) {
      const sel = filtros[col]; if (!sel || !sel.length) return true;
      if (multi[col]) {
        // En los filtros de enfermedad se acepta texto parcial: "acrom" encuentra "Acromegalia".
        const bus = sel.map(function (x) { return String(x).toLowerCase(); });
        return multi[col][i].some(function (v) { v = v.toLowerCase(); return bus.some(function (b) { return v.indexOf(b) >= 0; }); });
      }
      if (CONFIG.FILTROS.indexOf(col) < 0) return true;
      return sel.indexOf(texto_(f[idx(col)])) >= 0;
    });
  });
  const filas = pos.map(function (i) { return d.filas[i]; });

  let grupos = null;
  if (q.agrupar && (CONFIG.FILTROS.indexOf(q.agrupar) >= 0 || multi[q.agrupar])) {
    const c = {};
    pos.forEach(function (i) {
      const vals = multi[q.agrupar] ? multi[q.agrupar][i] : [texto_(d.filas[i][idx(q.agrupar)])];
      (vals.length ? vals : ['(vacío)']).forEach(function (k) { k = k || '(vacío)'; c[k] = (c[k] || 0) + 1; });
    });
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
  if (!CONFIG.REGISTRO_DOC_ID) return;
  try {
    const cuerpo = DocumentApp.openById(CONFIG.REGISTRO_DOC_ID).getBody();
    const fecha = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    cuerpo.appendParagraph([fecha, correo, JSON.stringify(q.filtros || {}), 'agrupar=' + (q.agrupar || '-'), 'listado=' + (q.listado ? 'sí' : 'no'), 'n=' + n].join(' | '));
  } catch (e) { /* el registro no debe impedir la consulta */ }
}

function texto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Bogota', 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
