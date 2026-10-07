/**
 * IngresosService.gs — TIER 1: intake
 * -----------------------------------------------------------------------------
 * Creates the master case record from the intake form.
 * -----------------------------------------------------------------------------
 */

var IngresosService = (function () {

  // Age in years from fecha_nacimiento (ISO string or Date).
  function calcularEdad_(fechaNac, hoyOpt) {
    if (!fechaNac) return null;
    var nac = (fechaNac instanceof Date) ? fechaNac : new Date(fechaNac);
    if (isNaN(nac.getTime())) return null;
    var hoy = hoyOpt || new Date();
    var edad = hoy.getFullYear() - nac.getFullYear();
    var m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }

  function cedulaExiste_(cedula) {
    if (!cedula) return false;
    return DB.findWhere(TABLES.MASTER, function (r) {
      return String(r[FIELDS.MASTER.CEDULA]) === String(cedula);
    }).length > 0;
  }

  /** Returns { ok, id_caso, edad } or { ok:false, errors }. */
  function crear(data) {
    var errors = Validate.recordAgainstSchema(TABLES.MASTER, data);

    // Emulated uniqueness rule (Sheets does not enforce it).
    if (data[FIELDS.MASTER.CEDULA] && cedulaExiste_(data[FIELDS.MASTER.CEDULA])) {
      errors.push('Ya existe un expediente con el documento ' + data[FIELDS.MASTER.CEDULA] + '.');
    }

    // Derived age must not be negative (birth date in the future).
    var edad = calcularEdad_(data.fecha_nacimiento);
    if (edad !== null && edad < 0) {
      errors.push('La fecha de nacimiento no puede ser futura.');
    }

    if (errors.length) return { ok: false, errors: errors };

    data[FIELDS.MASTER.EDAD] = edad;
    var rec = DB.insert(TABLES.MASTER, data);
    return { ok: true, id_caso: rec[FIELDS.MASTER.PK], edad: rec[FIELDS.MASTER.EDAD], registro: rec };
  }

  function obtener(id_caso) {
    return DB.findById(TABLES.MASTER, id_caso);
  }

  // Record matching an ID document (used to hydrate the triage form).
  function obtenerPorCedula(cedula) {
    if (!cedula) return null;
    var match = DB.findWhere(TABLES.MASTER, function (r) {
      return String(r[FIELDS.MASTER.CEDULA]) === String(cedula).trim();
    });
    return match[0] || null;
  }

  function listar() {
    return DB.readAll(TABLES.MASTER);
  }

  return { crear: crear, obtener: obtener, obtenerPorCedula: obtenerPorCedula, listar: listar, calcularEdad_: calcularEdad_ };
})();
