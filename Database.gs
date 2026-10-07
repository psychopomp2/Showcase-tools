/**
 * Database.gs
 * -----------------------------------------------------------------------------
 * Generic data-access layer over Google Sheets. Knows nothing about business
 * rules; only reads/writes rows according to SCHEMAS.
 *
 * Sheets has no referential integrity, uniqueness or transactions. Those
 * guarantees are EMULATED in code, and writes are serialized with LockService
 * (see Code.gs).
 *
 * Demo-build fix: Sheets auto-converts strings like "2026-10-07" or "09:30"
 * into Date objects, and google.script.run cannot return Date objects to the
 * browser. fromCell_ now normalizes date/time/datetime values back to strings.
 * -----------------------------------------------------------------------------
 */

var DB = (function () {

  function ss_() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function getSheet_(tableName) {
    var sheet = ss_().getSheetByName(SHEET_NAMES[tableName] || tableName);
    if (!sheet) {
      throw new Error('La hoja "' + tableName + '" no existe. Ejecuta setupDatabase() primero.');
    }
    return sheet;
  }

  function getSchema_(tableName) {
    var schema = SCHEMAS[tableName];
    if (!schema) throw new Error('No hay esquema definido para "' + tableName + '".');
    return schema;
  }

  function headers_(tableName) {
    return getSchema_(tableName).map(function (f) { return f.key; });
  }

  // Realm-safe Date check (also works for Dates created outside this script).
  function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

  function tz_() {
    try { return Session.getScriptTimeZone() || 'UTC'; } catch (e) { return 'UTC'; }
  }

  // ---- Cell <-> typed value --------------------------------------------------

  function toCell_(field, value) {
    if (value === null || value === undefined || value === '') return '';
    switch (field.type) {
      case 'boolean':    return (value === true || value === 'true' || value === 'TRUE') ? 'TRUE' : 'FALSE';
      case 'integer':    return parseInt(value, 10);
      case 'decimal':    return parseFloat(value);
      case 'enum_array': return (Array.isArray(value) ? value : String(value).split(ARRAY_SEP)).join(ARRAY_SEP);
      case 'date':       return isDate_(value) ? Utilities.formatDate(value, tz_(), 'yyyy-MM-dd') : String(value);
      case 'time':       return isDate_(value) ? Utilities.formatDate(value, tz_(), 'HH:mm') : String(value);
      case 'datetime':   return isDate_(value) ? value.toISOString() : String(value);
      default:           return String(value);
    }
  }

  function fromCell_(field, raw) {
    if (raw === '' || raw === null || raw === undefined) {
      return (field.type === 'enum_array') ? [] : (field.type === 'boolean' ? false : null);
    }
    switch (field.type) {
      case 'boolean':    return (raw === true || raw === 'TRUE' || raw === 'true');
      case 'integer':    return parseInt(raw, 10);
      case 'decimal':    return parseFloat(raw);
      case 'enum_array': return String(raw).split(ARRAY_SEP).filter(function (x) { return x !== ''; });
      case 'date':       return isDate_(raw) ? Utilities.formatDate(raw, tz_(), 'yyyy-MM-dd') : String(raw).slice(0, 10);
      case 'time':       return isDate_(raw) ? Utilities.formatDate(raw, tz_(), 'HH:mm') : String(raw);
      case 'datetime':   return isDate_(raw) ? raw.toISOString() : String(raw);
      default:           return isDate_(raw) ? raw.toISOString() : raw;
    }
  }

  // ---- Read ------------------------------------------------------------------

  function readAll(tableName) {
    var sheet = getSheet_(tableName);
    var schema = getSchema_(tableName);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var range = sheet.getRange(2, 1, lastRow - 1, schema.length).getValues();
    return range.map(function (row) {
      var obj = {};
      schema.forEach(function (field, i) { obj[field.key] = fromCell_(field, row[i]); });
      return obj;
    });
  }

  function findById(tableName, idValue) {
    var schema = getSchema_(tableName);
    var pkField = schema.filter(function (f) { return f.pk; })[0];
    if (!pkField) throw new Error('La tabla "' + tableName + '" no tiene PK.');
    return readAll(tableName).filter(function (r) { return String(r[pkField.key]) === String(idValue); })[0] || null;
  }

  function findWhere(tableName, predicate) {
    return readAll(tableName).filter(predicate);
  }

  // ---- Write -----------------------------------------------------------------

  /** Inserts a record: UUID primary key, defaults, per-group auto-increment. */
  function insert(tableName, data) {
    var sheet = getSheet_(tableName);
    var schema = getSchema_(tableName);
    var record = {};

    schema.forEach(function (field) {
      var v = data[field.key];
      if (field.pk && field.type === 'uuid') {
        v = Utilities.getUuid();
      } else if ((v === undefined || v === null || v === '') && field.default === 'now') {
        v = new Date();
      } else if (field.autoIncrementPer) {
        v = nextSequence_(tableName, field, data[field.autoIncrementPer]);
      }
      record[field.key] = v;
    });

    var row = schema.map(function (field) { return toCell_(field, record[field.key]); });
    sheet.appendRow(row);

    var out = {};
    schema.forEach(function (field) { out[field.key] = fromCell_(field, toCell_(field, record[field.key])); });
    return out;
  }

  function update(tableName, idValue, patch) {
    var sheet = getSheet_(tableName);
    var schema = getSchema_(tableName);
    var pkField = schema.filter(function (f) { return f.pk; })[0];
    var pkCol = schema.map(function (f) { return f.key; }).indexOf(pkField.key);

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var values = sheet.getRange(2, 1, lastRow - 1, schema.length).getValues();

    for (var r = 0; r < values.length; r++) {
      if (String(values[r][pkCol]) === String(idValue)) {
        schema.forEach(function (field, c) {
          if (patch.hasOwnProperty(field.key) && !field.pk) {
            values[r][c] = toCell_(field, patch[field.key]);
          }
        });
        sheet.getRange(r + 2, 1, 1, schema.length).setValues([values[r]]);
        return findById(tableName, idValue);
      }
    }
    return null;
  }

  // Next sequence number per group (e.g. orden_evento per id_sesion).
  function nextSequence_(tableName, field, groupValue) {
    var rows = readAll(tableName).filter(function (r) {
      return String(r[field.autoIncrementPer]) === String(groupValue);
    });
    var max = 0;
    rows.forEach(function (r) { if (r[field.key] > max) max = r[field.key]; });
    return max + 1;
  }

  return {
    getSheet_: getSheet_,
    getSchema_: getSchema_,
    headers_: headers_,
    readAll: readAll,
    findById: findById,
    findWhere: findWhere,
    insert: insert,
    update: update
  };
})();
