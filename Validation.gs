/**
 * Validation.gs
 * -----------------------------------------------------------------------------
 * Validates data against the schema BEFORE insert. Complements the sheet's
 * dropdowns: even if someone pastes data by hand, the backend rejects values
 * outside the catalog. Returns an array of errors (empty = OK).
 * -----------------------------------------------------------------------------
 */

var Validate = (function () {

  function recordAgainstSchema(tableName, data) {
    var schema = DB.getSchema_(tableName);
    var errors = [];

    schema.forEach(function (field) {
      var v = data[field.key];
      var empty = (v === undefined || v === null || v === '' ||
                   (Array.isArray(v) && v.length === 0));

      // PK, default 'now', auto-increment and computed fields are filled by the DB layer.
      if (field.pk || field.default === 'now' || field.autoIncrementPer || field.computedFrom) return;

      if (field.required && empty) {
        errors.push('Campo obligatorio faltante: ' + field.label + ' (' + field.key + ').');
        return;
      }
      if (empty) return;

      if (field.type === 'enum') {
        if (ENUMS[field.enum].indexOf(String(v)) === -1) {
          errors.push('Valor no permitido en ' + field.label + ': "' + v +
                      '". Permitidos: ' + ENUMS[field.enum].join(', ') + '.');
        }
      }

      if (field.type === 'enum_array') {
        var arr = Array.isArray(v) ? v : String(v).split(ARRAY_SEP);
        arr.forEach(function (item) {
          if (ENUMS[field.enum].indexOf(String(item)) === -1) {
            errors.push('Valor no permitido en ' + field.label + ': "' + item + '".');
          }
        });
      }

      if (field.type === 'integer' && isNaN(parseInt(v, 10))) {
        errors.push(field.label + ' debe ser un número entero.');
      }

      if (field.type === 'decimal' && isNaN(parseFloat(v))) {
        errors.push(field.label + ' debe ser un número.');
      }

      if (field.mustBeTrue && !(v === true || v === 'true' || v === 'TRUE')) {
        errors.push(field.label + ' es obligatorio y debe estar aceptado.');
      }
    });

    return errors;
  }

  return { recordAgainstSchema: recordAgainstSchema };
})();
