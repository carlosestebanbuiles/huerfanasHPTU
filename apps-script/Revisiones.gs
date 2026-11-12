/**
 * Recepción de revisiones de indicadores.
 *
 * Instalación (cuenta institucional de Carlos, cbuiles@hptu.org.co):
 *  1. Crear una hoja de cálculo nueva: "Revisiones de indicadores".
 *  2. Extensiones → Apps Script. Pegar este archivo.
 *  3. Implementar → Nueva implementación → Aplicación web.
 *       Ejecutar como: Yo.   Quién tiene acceso: Cualquier usuario.
 *     (Es necesario para que el sitio pueda enviar sin pedir inicio de sesión.
 *      La aplicación solo agrega filas; no devuelve ni lee nada de la hoja.)
 *  4. Copiar la URL de la aplicación web en assets/config.js → REVISIONES_URL.
 *
 * Cada indicador revisado queda en una fila de la pestaña "Revisiones".
 */

const PESTANA = 'Revisiones';
const COLUMNAS = [
  'Recibido', 'Enviado', 'Revisor', 'Equipo', 'Cargo',
  'Enfermedad', 'Versión', 'Indicador', 'Tipo', 'Decisión',
  'Resultado en salud', 'Definición', 'Fuente', 'Responsable',
  'Campos cambiados', 'Comentario', 'Comentario general',
  'Código', 'Tipo de indicador', 'Numerador', 'Denominador', 'Exclusiones', 'Población',
  'Periodicidad', 'Meta', 'Base (guía o referencia)'
];
const MAX_TEXTO = 3000;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    const hoja = obtenerHoja_();
    const r = p.revisor || {};
    const base = [new Date(), p.enviado, r.nombre, r.equipo, r.cargo, p.enfermedad_nombre || p.enfermedad, p.version];
    const items = Array.isArray(p.items) ? p.items.slice(0, 50) : [];
    const filas = items.map(function (i) {
      return base.concat([i.id, i.clase || i.tipo, i.decision, i.resultado, i.definicion, i.fuente, i.responsable, i.cambios, i.comentario, p.comentario_general,
        i.codigo, i.clase ? i.tipo : '', i.numerador, i.denominador, i.exclusiones, i.poblacion, i.periodicidad, i.meta, i.base]);
    });
    if (!filas.length && p.comentario_general) {
      filas.push(base.concat(['', 'general', '', '', '', '', '', '', '', p.comentario_general, '', '', '', '', '', '', '', '', '']));
    }
    if (filas.length) {
      const limpias = filas.map(function (f) { return f.map(limpiar_); });
      hoja.getRange(hoja.getLastRow() + 1, 1, limpias.length, COLUMNAS.length).setValues(limpias);
    }
    return respuesta_({ ok: true, filas: filas.length });
  } catch (err) {
    return respuesta_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function obtenerHoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(PESTANA);
  if (!hoja) hoja = ss.insertSheet(PESTANA);
  if (hoja.getLastRow() === 0 || hoja.getLastColumn() < COLUMNAS.length) {
    // Crea o completa la fila de títulos (versiones anteriores tenían menos columnas).
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Evita fórmulas inyectadas y textos excesivos.
function limpiar_(v) {
  if (v instanceof Date) return v;
  let s = v == null ? '' : String(v).slice(0, MAX_TEXTO);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Resumen público de avance (solo conteos, sin nombres ni comentarios).
 * El sitio lo consulta con ?resumen=1 para mostrar el avance de la revisión.
 */
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.resumen) return respuesta_({ ok: false, error: 'Use ?resumen=1' });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(PESTANA);
  const out = { ok: true, total: 0, ultima: null, porEnfermedad: {} };
  if (!hoja || hoja.getLastRow() < 2) return respuesta_(out);
  const v = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS.length).getValues();
  const c = function (n) { return COLUMNAS.indexOf(n); };
  const envios = {};
  const tmp = {};
  v.forEach(function (f) {
    const enf = String(f[c('Enfermedad')] || '').trim();
    if (!enf || /^PRUEBA/i.test(enf)) return;
    const envio = String(f[c('Enviado')]) + '|' + String(f[c('Revisor')]).toLowerCase();
    envios[envio] = true;
    const r = tmp[enf] || (tmp[enf] = { revisiones: {}, revisores: {}, indicadores: {}, decisiones: {} });
    r.revisiones[envio] = true;
    r.revisores[String(f[c('Revisor')]).toLowerCase()] = true;
    if (f[c('Tipo')] === 'existente' && f[c('Indicador')]) r.indicadores[f[c('Indicador')]] = true;
    const d = String(f[c('Decisión')] || '');
    if (d) r.decisiones[d] = (r.decisiones[d] || 0) + 1;
    const rec = f[c('Recibido')];
    if (rec instanceof Date && (!out.ultima || rec > new Date(out.ultima))) out.ultima = rec.toISOString();
  });
  Object.keys(tmp).forEach(function (k) {
    const r = tmp[k];
    out.porEnfermedad[k] = {
      revisiones: Object.keys(r.revisiones).length,
      revisores: Object.keys(r.revisores).length,
      indicadores: Object.keys(r.indicadores),
      decisiones: r.decisiones
    };
  });
  out.total = Object.keys(envios).length;
  return respuesta_(out);
}
