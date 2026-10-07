/**
 * Code.gs
 * -----------------------------------------------------------------------------
 * Web-app entry point + sheet installer + API functions the front end calls
 * through google.script.run.
 * -----------------------------------------------------------------------------
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(AUTOMATION.CENTER_NAME + ' — Gestión Clínica')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =============================================================================
// SETUP: run ONCE. Creates the sheets with headers, dropdowns and text formats.
// =============================================================================
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SCHEMAS).forEach(function (tableName) {
    var schema = SCHEMAS[tableName];
    var name = SHEET_NAMES[tableName];
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);

    var headers = schema.map(function (f) { return f.key; });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);

    schema.forEach(function (field, i) {
      var col = i + 1;
      var body = sheet.getRange(2, col, sheet.getMaxRows() - 1, 1);
      if (field.type === 'enum') {
        body.setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(ENUMS[field.enum], true).setAllowInvalid(false)
          .setHelpText('Valor de catálogo: ' + field.label).build());
      }
      if (field.type === 'boolean') {
        body.setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(['TRUE', 'FALSE'], true).build());
      }
      // Keep dates/times/IDs as plain text so Sheets doesn't auto-convert them.
      if (['date', 'time', 'datetime', 'uuid', 'string'].indexOf(field.type) !== -1) {
        body.setNumberFormat('@');
      }
    });
  });

  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });

  try { SpreadsheetApp.getUi().alert('Base de datos instalada correctamente.'); }
  catch (e) { Logger.log('Base de datos instalada correctamente.'); }
}

// =============================================================================
// API (google.script.run.<fn>). Writes are serialized with LockService.
// tryLock waits up to 20 s; on timeout the user gets a clear retry message.
// This mitigates races but is not a full guarantee (Sheets has no transactions).
// =============================================================================
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    Logger.log('CONCURRENCY: lock timeout. Possible simultaneous writes.');
    return { ok: false, errors: ['El sistema está ocupado en este momento. Reintenta en unos segundos.'] };
  }
  try {
    return fn();
  } catch (err) {
    Logger.log('ERROR en operación con lock: ' + err);
    return { ok: false, errors: ['Error interno: ' + err] };
  } finally {
    lock.releaseLock();
  }
}

// Returns null if allowed, or { ok:false, errors:[...] } if blocked.
function verificarAcceso_() {
  if (!CONTROL_ACCESO_ACTIVO) return null;
  var correo = '';
  try { correo = Session.getActiveUser().getEmail() || ''; } catch (e) { correo = ''; }
  if (correo && USUARIOS_AUTORIZADOS.indexOf(correo) === -1) {
    return { ok: false, errors: ['Usuario no autorizado (' + correo + ').'] };
  }
  return null;
}

function api_getFormConfig() {
  return {
    schemas: SCHEMAS, enums: ENUMS, enumLabels: ENUM_LABELS, arraySep: ARRAY_SEP,
    tables: TABLES, fields: FIELDS, areaSessionForm: AREA_SESSION_FORM,
    automationEnabled: AUTOMATION.ENABLED
  };
}

// --- Tier 1: intake ---
function api_crearIngreso(data) {
  var noAcceso = verificarAcceso_(); if (noAcceso) return noAcceso;
  return withLock_(function () { return IngresosService.crear(data); });
}

function api_hidratarPorCedula(cedula) {
  var r = IngresosService.obtenerPorCedula(cedula);
  if (!r) return { encontrado: false };
  return { encontrado: true, expediente: r };
}

// --- Triage + scheduling (+ Calendar & email hooks) ---
function api_crearTriaje(data) {
  var noAcceso = verificarAcceso_(); if (noAcceso) return noAcceso;
  var res = withLock_(function () { return TriajeService.crear(data); });
  if (res.ok) res.automatizacion = Automation.onCitaAgendada(res.registro);   // after the lock is released
  return res;
}

// --- Agenda by specialty ---
function api_citasDelDia(area, fechaISO) {
  return AgendaService.citasDelDia(area, fechaISO);
}
function api_actualizarEstadoCita(id_agenda, nuevoEstado) {
  var noAcceso = verificarAcceso_(); if (noAcceso) return noAcceso;
  return withLock_(function () { return AgendaService.actualizarEstado(id_agenda, nuevoEstado); });
}

// --- Tier 2: session + A-B-C matrix (+ Docs report, Drive, email hooks) ---
function api_crearSesionConEventos(sesionData, eventos) {
  var noAcceso = verificarAcceso_(); if (noAcceso) return noAcceso;
  var res = withLock_(function () { return SesionesService.crearSesionConEventos(sesionData, eventos); });
  if (res.ok) res.automatizacion = Automation.onSesionGuardada(res.id_sesion);
  return res;
}

// --- Tier 3: search / dashboard ---
function api_buscar(query)            { return SearchService.buscar(query); }
function api_vista360(id_caso)        { return SearchService.vista360(id_caso); }
function api_filtrar(filtros)         { return SearchService.filtrar(filtros); }
function api_frecuencia(id_caso, campo) { return SearchService.frecuenciaMatrizPorCaso(id_caso, campo); }

// --- Automation log (demo) ---
function api_automationLog(limit) {
  var rows = DB.readAll(TABLES.LOG);
  rows.sort(function (a, b) { return String(b.marca).localeCompare(String(a.marca)); });
  return rows.slice(0, limit || 20);
}
