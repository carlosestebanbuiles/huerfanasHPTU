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
  'Campos cambiados', 'Comentario', 'Comentario general'
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
      return base.concat([i.id, i.tipo, i.decision, i.resultado, i.definicion, i.fuente, i.responsable, i.cambios, i.comentario, p.comentario_general]);
    });
    if (!filas.length && p.comentario_general) {
      filas.push(base.concat(['', 'general', '', '', '', '', '', '', '', p.comentario_general]));
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
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
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
