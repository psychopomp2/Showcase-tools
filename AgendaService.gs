/**
 * AgendaService.gs — agenda by specialty
 * -----------------------------------------------------------------------------
 * Backs the specialty panel (psychology, speech, occupational therapy):
 * - Actionable list of people scheduled on a day for one area.
 * - Appointment status changes (agendado -> en_atencion -> atendido, ...).
 * Uses TABLES/FIELDS roles, so sheet or field renames don't affect it.
 * -----------------------------------------------------------------------------
 */

var AgendaService = (function () {

  function soloFecha_(v) { return v ? String(v).slice(0, 10) : ''; }

  /** Appointments for one area on a date (YYYY-MM-DD), joined with the person's name. */
  function citasDelDia(area, fechaISO) {
    var fecha = soloFecha_(fechaISO) || soloFecha_(new Date().toISOString());

    var citas = DB.findWhere(TABLES.AGENDA, function (r) {
      return (!area || r[FIELDS.AGENDA.AREA] === area) &&
             soloFecha_(r[FIELDS.AGENDA.FECHA_CITA]) === fecha;
    });

    // id_caso -> record map so we don't read the master sheet once per row.
    var maestros = {};
    IngresosService.listar().forEach(function (m) { maestros[m[FIELDS.MASTER.PK]] = m; });

    return citas.map(function (c) {
      var m = maestros[c[FIELDS.AGENDA.FK_MASTER]] || {};
      return {
        id_agenda:   c[FIELDS.AGENDA.PK],
        id_caso:     c[FIELDS.AGENDA.FK_MASTER],
        nombres_nna: m[FIELDS.MASTER.NOMBRE] || '(expediente no encontrado)',
        cedula_nna:  m[FIELDS.MASTER.CEDULA] || '',
        hora_cita:   c[FIELDS.AGENDA.HORA],
        estado_cita: c[FIELDS.AGENDA.ESTADO],
        area:        c[FIELDS.AGENDA.AREA],
        especialista:c[FIELDS.AGENDA.ESPECIALISTA] || ''
      };
    }).sort(function (a, b) { return String(a.hora_cita).localeCompare(String(b.hora_cita)); });
  }

  function actualizarEstado(id_agenda, nuevoEstado) {
    if (ENUMS.estado_cita.indexOf(nuevoEstado) === -1) {
      return { ok: false, errors: ['Estado de cita no válido: ' + nuevoEstado + '.'] };
    }
    var patch = {};
    patch[FIELDS.AGENDA.ESTADO] = nuevoEstado;
    var rec = DB.update(TABLES.AGENDA, id_agenda, patch);
    if (!rec) return { ok: false, errors: ['No se encontró la cita ' + id_agenda + '.'] };
    return { ok: true, registro: rec };
  }

  function formularioNivel2(area) {
    return AREA_SESSION_FORM[area] || TABLES.SESSION;
  }

  return { citasDelDia: citasDelDia, actualizarEstado: actualizarEstado, formularioNivel2: formularioNivel2 };
})();
