/**
 * TriajeService.gs — triage & scheduling
 * -----------------------------------------------------------------------------
 * Records appointments and vital signs before the session. Demographics are
 * NOT re-entered: they are linked by id_caso (the UI shows them read-only).
 * -----------------------------------------------------------------------------
 */

var TriajeService = (function () {

  function crear(data) {
    var errors = Validate.recordAgainstSchema(TABLES.AGENDA, data);

    // Emulated referential integrity.
    if (data.id_caso && !DB.findById(TABLES.MASTER, data.id_caso)) {
      errors.push('El id_caso "' + data.id_caso + '" no corresponde a ningún expediente.');
    }

    // Range warnings (non-blocking; guidance for triage staff).
    var avisos = [];
    if (data.saturacion_oxigeno != null && data.saturacion_oxigeno !== '' &&
        (data.saturacion_oxigeno < 70 || data.saturacion_oxigeno > 100)) {
      avisos.push('Saturación de oxígeno fuera del rango esperado (70–100%). Verificar medición.');
    }
    if (data.frecuencia_cardiaca_fc != null && data.frecuencia_cardiaca_fc !== '' &&
        (data.frecuencia_cardiaca_fc < 30 || data.frecuencia_cardiaca_fc > 220)) {
      avisos.push('Frecuencia cardíaca fuera del rango esperado. Verificar medición.');
    }

    if (errors.length) return { ok: false, errors: errors };

    var rec = DB.insert(TABLES.AGENDA, data);
    return { ok: true, id_agenda: rec.id_agenda, avisos: avisos, registro: rec };
  }

  function triajesPorCaso(id_caso) {
    return DB.findWhere(TABLES.AGENDA, function (r) {
      return String(r.id_caso) === String(id_caso);
    });
  }

  // Latest triage (by marca_temporal) for the 360° view.
  function ultimoPorCaso(id_caso) {
    var rows = triajesPorCaso(id_caso);
    if (!rows.length) return null;
    return rows.sort(function (a, b) {
      return new Date(b.marca_temporal) - new Date(a.marca_temporal);
    })[0];
  }

  return { crear: crear, triajesPorCaso: triajesPorCaso, ultimoPorCaso: ultimoPorCaso };
})();
