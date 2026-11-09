/**
 * Consulta de la cohorte (solo lectura).
 *
 * Instalación (cuenta institucional de Carlos, cbuiles@hptu.org.co):
 *  1. script.google.com → proyecto "Consulta cohorte". Pegar este archivo, Consulta.html y appsscript.json
 *     (Configuración del proyecto → Mostrar el archivo de manifiesto "appsscript.json").
 *  2. Completar los tres ID de abajo.
 *  3. Implementar → Aplicación web. Ejecutar como: Yo. Acceso: solo el dominio hptu.org.co.
 *
 * Todo lo ajustable (filtros, listado, preguntas rápidas, autorizados) está en la hoja
 * "Configuración de la consulta" (CONFIG_ID). Los cambios ahí se ven al recargar, sin tocar este código.
 *
 * Por qué es de solo lectura:
 *  - appsscript.json pide permiso de hojas de cálculo en SOLO LECTURA (spreadsheets.readonly):
 *    Google no le permite escribir en ninguna hoja, aunque el código lo intentara.
 *  - El script solo lee (Sheets.Spreadsheets.Values.get / batchGet).
 *  - Los usuarios no reciben permisos sobre la hoja; solo ven lo que este script devuelve.
 *  - COLUMNAS_BLOQUEADAS nunca salen del script, aunque se agreguen al listado en la configuración.
 *  - Cada consulta se registra (quién, cuándo, qué filtros) en un documento de Google aparte.
 */

const HOJA_ID = 'PEGAR_AQUI_EL_ID_DE_LA_HOJA_CONSOLIDADO';
const REGISTRO_DOC_ID = 'PEGAR_AQUI_EL_ID_DEL_DOCUMENTO_DE_REGISTRO';
const CONFIG_ID = '1YplFmzGyTOhYQbUqJr8kr0VwCffnyD2T6CkZQSYykdk';

// Nunca se muestran, sin importar lo que diga la configuración.
const COLUMNAS_BLOQUEADAS = [
  'Primer_Apellido', 'Segundo_Apellido', 'Primer_Nombre', 'Segundo_Nombre',
  'Telefono de Contacto', 'EMAIL', 'HISTORIA CLÍNICA HPTU',
  'OBSERVACIÓN LLAMADAS', 'Observación de la llamada', 'Observación de agendamiento',
  'Observaciones generales', 'OBSERVACIONES ADICIONALES',
  'Observación SURA EH#1', 'Observación SURA EH#2', 'Observación SURA EH#3', 'Observación SURA EH#4'
];

// ---------------- configuración ----------------

function config_() {
  const r = Sheets.Spreadsheets.Values.batchGet(CONFIG_ID, {
    ranges: ['FILTROS!A2:C', 'LISTADO!A2:A', 'RAPIDAS!A2:F', 'AUTORIZADOS!A2:A', 'AJUSTES!A2:B']
  }).valueRanges.map(function (v) { return v.values || []; });
  const t = function (x) { return String(x == null ? '' : x).trim(); };

  const filtros = [];
  r[0].forEach(function (f) {
    const nombre = t(f[0]); if (!nombre) return;
    const cols = t(f[1] || nombre).split('|').map(t).filter(String);
    filtros.push({ nombre: nombre, columnas: cols, principal: /^s/i.test(t(f[2])) });
  });
  const listado = r[1].map(function (f) { return t(f[0]); }).filter(String);
  const rapidas = r[2].map(function (f) {
    const fil = {};
    if (t(f[2]) && t(f[3])) fil[t(f[2])] = [t(f[3])];
    if (t(f[4]) && t(f[5])) fil[t(f[4])] = [t(f[5])];
    return { titulo: t(f[0]), agrupar: t(f[1]), filtros: fil };
  }).filter(function (p) { return p.titulo; });
  const autorizados = r[3].map(function (f) { return t(f[0]).toLowerCase(); }).filter(String);
  const aj = {}; r[4].forEach(function (f) { aj[t(f[0])] = t(f[1]); });

  return {
    filtros: filtros, listado: listado, rapidas: rapidas, autorizados: autorizados,
    pestana: aj.PESTANA || 'Consolidado',
    filaEnc: parseInt(aj.FILA_ENCABEZADOS, 10) || 1,
    maxListado: parseInt(aj.MAX_FILAS_LISTADO, 10) || 500,
    vacios: [''].concat((aj.VALORES_VACIOS || '').split('|').map(function (v) { return t(v).toUpperCase(); }))
  };
}

// ---------------- acceso ----------------

function doGet() {
  verificarAcceso_(config_());
  return HtmlService.createTemplateFromFile('Consulta')
    .evaluate()
    .setTitle('Consulta de la cohorte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function verificarAcceso_(cfg) {
  const correo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!correo) throw new Error('Inicie sesión con su cuenta del hospital.');
  if (cfg.autorizados.length && cfg.autorizados.indexOf(correo) < 0) {
    throw new Error('Su cuenta (' + correo + ') no está autorizada para esta consulta.');
  }
  return correo;
}

// ---------------- datos ----------------

function leerDatos_(cfg) {
  const pestana = "'" + cfg.pestana.replace(/'/g, "''") + "'";
  // Valores sin formato (evita "#####" en columnas angostas); las fechas como texto.
  const r = Sheets.Spreadsheets.Values.get(HOJA_ID, pestana,
    { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
  const valores = r.values || [];
  const enc = (valores[cfg.filaEnc - 1] || []).map(function (h) { return String(h).split('\n')[0].trim(); });
  const n = enc.length;

  // Fecha de nacimiento como número de serie, para calcular la edad sin depender del formato.
  const jNac = enc.indexOf('Fecha_Nacimiento');
  let nac = [];
  if (jNac >= 0) {
    const col = letra_(jNac + 1), ini = cfg.filaEnc + 1;
    const rr = Sheets.Spreadsheets.Values.get(HOJA_ID, pestana + '!' + col + ini + ':' + col,
      { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    nac = (rr.values || []).map(function (x) { return x[0]; });
  }

  const jDoc = enc.indexOf('Documento');
  const hoy = new Date();
  const filas = valores.slice(cfg.filaEnc)
    .map(function (f, i) {
      const g = f.slice(0, n); while (g.length < n) g.push('');
      g.push(grupoEdad_(serialAFecha_(nac[i]), hoy));
      return g;
    })
    .filter(function (f) { return jDoc < 0 ? f.slice(0, n).some(function (c) { return c !== ''; }) : String(f[jDoc]).trim() !== ''; });
  enc.push('GRUPO DE EDAD');
  return { enc: enc, filas: filas };
}

// Para cada fila, los valores no vacíos de las columnas de un filtro.
function valoresFiltro_(d, cfg, filtro) {
  const idxs = filtro.columnas.map(function (c) { return d.enc.indexOf(c); }).filter(function (j) { return j >= 0; });
  return d.filas.map(function (f) {
    const vs = idxs.map(function (j) { return texto_(f[j]); });
    return filtro.columnas.length > 1 ? vs.filter(function (v) { return cfg.vacios.indexOf(v.toUpperCase()) < 0; }) : vs;
  });
}

// ---------------- funciones llamadas desde la página ----------------

/** Opciones de cada filtro, botones y avisos de configuración. */
function opciones() {
  const cfg = config_();
  verificarAcceso_(cfg);
  const d = leerDatos_(cfg);
  const avisos = [];
  const out = {};
  cfg.filtros.forEach(function (fl) {
    const faltan = fl.columnas.filter(function (c) { return d.enc.indexOf(c) < 0; });
    if (faltan.length) avisos.push('Filtro «' + fl.nombre + '»: no se encontró la columna ' + faltan.join(', '));
    if (faltan.length === fl.columnas.length) return;
    const vals = {};
    valoresFiltro_(d, cfg, fl).forEach(function (l) { l.forEach(function (v) { if (v !== '') vals[v] = true; }); });
    out[fl.nombre] = Object.keys(vals).sort();
  });
  const listado = listadoPermitido_(cfg, d, avisos);
  cfg.rapidas.forEach(function (p) {
    [p.agrupar].concat(Object.keys(p.filtros)).forEach(function (n) {
      if (n && !out[n]) avisos.push('Pregunta «' + p.titulo + '»: no existe el filtro «' + n + '»');
    });
  });
  return {
    filtros: out,
    orden: cfg.filtros.map(function (f) { return f.nombre; }).filter(function (n) { return out[n]; }),
    principales: cfg.filtros.filter(function (f) { return f.principal && out[f.nombre]; }).map(function (f) { return f.nombre; }),
    busqueda: cfg.filtros.filter(function (f) { return f.columnas.length > 1; }).map(function (f) { return f.nombre; }),
    rapidas: cfg.rapidas.filter(function (p) { return out[p.agrupar] || !p.agrupar; }),
    listado: listado, total: d.filas.length, avisos: avisos
  };
}

/**
 * Ejecuta una consulta.
 * @param {Object} q {filtros: {nombreFiltro: [valor]}, agrupar: 'nombreFiltro', listado: bool}
 */
function consultar(q) {
  const cfg = config_();
  const correo = verificarAcceso_(cfg);
  const d = leerDatos_(cfg);
  const porNombre = {}; cfg.filtros.forEach(function (f) { porNombre[f.nombre] = f; });
  const cache = {};
  const vals = function (n) { return cache[n] || (cache[n] = valoresFiltro_(d, cfg, porNombre[n])); };

  const filtros = q.filtros || {};
  const pos = d.filas.map(function (f, i) { return i; }).filter(function (i) {
    return Object.keys(filtros).every(function (n) {
      const sel = filtros[n]; if (!sel || !sel.length || !porNombre[n]) return true;
      const v = vals(n)[i];
      if (porNombre[n].columnas.length > 1) {
        // Filtros de varias columnas: texto parcial, sin distinguir mayúsculas ("acrom" → "Acromegalia").
        const bus = sel.map(function (x) { return String(x).toLowerCase(); });
        return v.some(function (x) { x = x.toLowerCase(); return bus.some(function (b) { return x.indexOf(b) >= 0; }); });
      }
      return sel.indexOf(v[0]) >= 0;
    });
  });

  let grupos = null;
  if (q.agrupar && porNombre[q.agrupar]) {
    const c = {};
    pos.forEach(function (i) {
      const vs = vals(q.agrupar)[i];
      (vs.length ? vs : ['']).forEach(function (k) { k = k || '(vacío)'; c[k] = (c[k] || 0) + 1; });
    });
    grupos = Object.keys(c).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  let listado = null;
  if (q.listado) {
    const cols = listadoPermitido_(cfg, d, []);
    listado = {
      columnas: cols,
      filas: pos.slice(0, cfg.maxListado).map(function (i) { return cols.map(function (c) { return texto_(d.filas[i][d.enc.indexOf(c)]); }); }),
      recortado: pos.length > cfg.maxListado
    };
  }

  registrar_(correo, q, pos.length);
  return { n: pos.length, grupos: grupos, listado: listado };
}

function listadoPermitido_(cfg, d, avisos) {
  return cfg.listado.filter(function (c) {
    if (COLUMNAS_BLOQUEADAS.indexOf(c) >= 0) { avisos.push('Listado: la columna «' + c + '» está bloqueada y no se muestra'); return false; }
    if (d.enc.indexOf(c) < 0) { avisos.push('Listado: no se encontró la columna «' + c + '»'); return false; }
    return true;
  });
}

// ---------------- utilidades ----------------

function registrar_(correo, q, n) {
  if (!REGISTRO_DOC_ID || REGISTRO_DOC_ID.indexOf('PEGAR') === 0) return;
  try {
    const cuerpo = DocumentApp.openById(REGISTRO_DOC_ID).getBody();
    const fecha = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    cuerpo.appendParagraph([fecha, correo, JSON.stringify(q.filtros || {}), 'agrupar=' + (q.agrupar || '-'),
      'listado=' + (q.listado ? 'sí' : 'no'), 'n=' + n].join(' | '));
  } catch (e) { /* el registro no debe impedir la consulta */ }
}

function grupoEdad_(nac, hoy) {
  if (!(nac instanceof Date)) return 'Sin fecha de nacimiento';
  let e = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) e--;
  return e < 18 ? 'Pediátrico (<18)' : 'Adulto (≥18)';
}

function serialAFecha_(v) {
  return (typeof v === 'number' && v > 0) ? new Date(Math.round((v - 25569) * 86400000)) : null;
}

function letra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function texto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Bogota', 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
