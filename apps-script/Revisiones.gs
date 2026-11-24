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

/**
 * Crea (o rehace) la pestaña «Monitoreo»: resumen de las revisiones por enfermedad,
 * por indicador y lista de indicadores nuevos propuestos. Todo son fórmulas sobre la
 * pestaña «Revisiones», así que se actualiza sola con cada envío.
 * Ejecutar una vez desde el editor: seleccionar crearMonitoreo y pulsar Ejecutar.
 * Excluye las enfermedades que empiezan por PRUEBA.
 */
function crearMonitoreo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  obtenerHoja_();
  const vieja = ss.getSheetByName('Monitoreo');
  if (vieja) ss.deleteSheet(vieja);
  const m = ss.insertSheet('Monitoreo', 0);
  const R = "'" + PESTANA + "'!";
  const col = function (n) { const l = String.fromCharCode(65 + COLUMNAS.indexOf(n)); return R + l + '2:' + l; };
  const ENF = col('Enfermedad'), ENV = col('Enviado'), REV = col('Revisor'), EQ = col('Equipo'),
    IND = col('Indicador'), TIPO = col('Tipo'), DEC = col('Decisión'), TXT = col('Resultado en salud'),
    COM = col('Comentario'), GEN = col('Comentario general'), COD = col('Código'),
    TIND = col('Tipo de indicador'), REC = col('Recibido');
  const NOPRUEBA = 'NOT(REGEXMATCH(' + ENF + ',"(?i)^PRUEBA"))';
  const fila = function (expr) { return '=BYROW(A6:A40,LAMBDA(e,IF(e="",,' + expr + ')))'; };

  m.getRange('A1').setValue('Monitoreo de las revisiones de indicadores').setFontSize(14).setFontWeight('bold');
  m.getRange('A2').setValue('Se actualiza con cada envío del portal. No incluye las enfermedades que empiezan por «PRUEBA».').setFontColor('#625E78');

  // 1. Por enfermedad (A4:L40)
  m.getRange('A4').setValue('Por enfermedad');
  m.getRange('A5:L5').setValues([['Enfermedad', 'Envíos', 'Revisores', 'Revisores de gestión', 'Revisores asistenciales',
    'Indicadores revisados', 'De acuerdo', 'Ajustar', 'Eliminar', 'Indicadores nuevos', 'Comentarios generales', 'Último envío']]);
  m.getRange('A6').setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + ENF + ',' + ENF + '<>"",' + NOPRUEBA + '))),"Sin revisiones todavía")');
  m.getRange('B6').setFormula(fila('COUNTUNIQUEIFS(' + ENV + ',' + ENF + ',e)'));
  m.getRange('C6').setFormula(fila('COUNTUNIQUEIFS(' + REV + ',' + ENF + ',e)'));
  m.getRange('D6').setFormula(fila('COUNTUNIQUEIFS(' + REV + ',' + ENF + ',e,' + EQ + ',"Gestión")'));
  m.getRange('E6').setFormula(fila('COUNTUNIQUEIFS(' + REV + ',' + ENF + ',e,' + EQ + ',"Asistencial")'));
  m.getRange('F6').setFormula(fila('COUNTUNIQUEIFS(' + IND + ',' + ENF + ',e,' + TIPO + ',"existente")'));
  m.getRange('G6').setFormula(fila('COUNTIFS(' + ENF + ',e,' + DEC + ',"acuerdo")'));
  m.getRange('H6').setFormula(fila('COUNTIFS(' + ENF + ',e,' + DEC + ',"ajustar")'));
  m.getRange('I6').setFormula(fila('COUNTIFS(' + ENF + ',e,' + DEC + ',"eliminar")'));
  m.getRange('J6').setFormula(fila('COUNTIFS(' + ENF + ',e,' + TIPO + ',"nuevo")'));
  m.getRange('K6').setFormula(fila('COUNTUNIQUEIFS(' + GEN + ',' + ENF + ',e,' + GEN + ',"<>")'));
  m.getRange('L6').setFormula(fila('MAXIFS(' + REC + ',' + ENF + ',e)'));
  m.getRange('L6:L40').setNumberFormat('yyyy-mm-dd hh:mm');

  // 2. Indicadores nuevos propuestos (N4:T)
  m.getRange('N4').setValue('Indicadores nuevos propuestos');
  m.getRange('N5:T5').setValues([['Recibido', 'Enfermedad', 'Revisor', 'Equipo', 'Indicador propuesto', 'Tipo de indicador', 'Justificación']]);
  m.getRange('N6').setFormula('=IFERROR(SORT(FILTER({' + [REC, ENF, REV, EQ, TXT, TIND, COM].join(',') + '},' +
    TIPO + '="nuevo",' + NOPRUEBA + '),1,FALSE),"Sin propuestas todavía")');
  m.getRange('N6:N').setNumberFormat('yyyy-mm-dd hh:mm');

  // 3. Por indicador (A44:J)
  m.getRange('A43').setValue('Por indicador');
  m.getRange('A44:J44').setValues([['Enfermedad', 'Código', 'Id', 'Indicador (texto del primer envío)', 'Revisiones',
    'De acuerdo', 'Ajustar', 'Eliminar', '% de acuerdo', 'Con comentario']]);
  m.getRange('A45').setFormula('=IFERROR(SORT(UNIQUE(FILTER({' + ENF + ',' + COD + ',' + IND + '},' + TIPO + '="existente",' +
    NOPRUEBA + ')),1,TRUE,2,TRUE),"Sin revisiones todavía")');
  const porInd = function (expr) { return '=BYROW(C45:C,LAMBDA(i,IF(i="",,' + expr + ')))'; };
  m.getRange('D45').setFormula(porInd('INDEX(FILTER(' + TXT + ',' + IND + '=i),1)'));
  m.getRange('E45').setFormula(porInd('COUNTIFS(' + IND + ',i,' + TIPO + ',"existente")'));
  m.getRange('F45').setFormula(porInd('COUNTIFS(' + IND + ',i,' + DEC + ',"acuerdo")'));
  m.getRange('G45').setFormula(porInd('COUNTIFS(' + IND + ',i,' + DEC + ',"ajustar")'));
  m.getRange('H45').setFormula(porInd('COUNTIFS(' + IND + ',i,' + DEC + ',"eliminar")'));
  m.getRange('I45').setFormula('=BYROW(E45:F,LAMBDA(r,IF(INDEX(r,1)="",,IF(INDEX(r,1)=0,0,INDEX(r,2)/INDEX(r,1)))))');
  m.getRange('J45').setFormula(porInd('COUNTIFS(' + IND + ',i,' + COM + ',"<>")'));
  m.getRange('I45:I').setNumberFormat('0%');

  // Formato
  [m.getRange('A4'), m.getRange('N4'), m.getRange('A43')].forEach(function (r) { r.setFontWeight('bold').setFontSize(12).setFontColor('#A8287A'); });
  [m.getRange('A5:L5'), m.getRange('N5:T5'), m.getRange('A44:J44')].forEach(function (r) {
    r.setFontWeight('bold').setBackground('#F3EEF7').setWrap(true).setVerticalAlignment('middle');
  });
  m.getRange('A:Z').setFontFamily('Arial');
  m.setColumnWidth(1, 200); m.setColumnWidths(2, 11, 95);
  m.setColumnWidth(4, 260); m.setColumnWidth(13, 24);
  m.setColumnWidths(14, 4, 120); m.setColumnWidth(18, 260); m.setColumnWidth(19, 150); m.setColumnWidth(20, 260);
  m.getRange('R6:T').setWrap(true);
  m.setFrozenRows(5);
  m.protect().setDescription('Monitoreo: fórmulas automáticas').setWarningOnly(true);
  ss.setActiveSheet(m);
}
