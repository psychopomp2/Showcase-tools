/**
 * SesionesService.gs — TIER 2A + 2B
 * -----------------------------------------------------------------------------
 * 2A sesiones_clinicas: session header/closing.
 * 2B matriz_actividad_clinica: A-B-C events (longitudinal data engine).
 * -----------------------------------------------------------------------------
 */

var SesionesService = (function () {

  function crearSesion(data) {
    var errors = Validate.recordAgainstSchema(TABLES.SESSION, data);
    if (data.id_caso && !DB.findById(TABLES.MASTER, data.id_caso)) {
      errors.push('El id_caso "' + data.id_caso + '" no corresponde a ningún expediente.');
    }
    if (errors.length) return { ok: false, errors: errors };

    var rec = DB.insert(TABLES.SESSION, data);
    return { ok: true, id_sesion: rec.id_sesion, registro: rec };
  }

  function agregarEvento(data) {
    var errors = Validate.recordAgainstSchema(TABLES.MATRIX, data);
    if (data.id_sesion && !DB.findById(TABLES.SESSION, data.id_sesion)) {
      errors.push('El id_sesion "' + data.id_sesion + '" no existe.');
    }

    // Clinical consistency warning (non-blocking).
    var aviso = null;
    if (data.conducta_observada_b === 'inercia_fase_consumo' &&
        data.temporalidad_fase !== 't2_desarrollo_consumo') {
      aviso = 'Advertencia: "inercia_fase_consumo" suele correlacionar con la fase T2 (desarrollo/consumo).';
    }

    if (errors.length) return { ok: false, errors: errors };

    var rec = DB.insert(TABLES.MATRIX, data);
    return { ok: true, id_evento: rec.id_evento, orden_evento: rec.orden_evento, aviso: aviso, registro: rec };
  }

  /** Creates a session and all of its A-B-C events in one call. */
  function crearSesionConEventos(sesionData, eventos) {
    var res = crearSesion(sesionData);
    if (!res.ok) return res;

    var insertados = [];
    var avisos = [];
    (eventos || []).forEach(function (ev) {
      ev.id_sesion = res.id_sesion;
      var r = agregarEvento(ev);
      if (!r.ok) {
        avisos.push('Evento no guardado: ' + r.errors.join(' '));
      } else {
        insertados.push(r.registro);
        if (r.aviso) avisos.push(r.aviso);
      }
    });

    return { ok: true, id_sesion: res.id_sesion, eventos: insertados, avisos: avisos };
  }

  function sesionesPorCaso(id_caso) {
    return DB.findWhere(TABLES.SESSION, function (r) {
      return String(r.id_caso) === String(id_caso);
    });
  }

  function matrizPorSesion(id_sesion) {
    return DB.findWhere(TABLES.MATRIX, function (r) {
      return String(r.id_sesion) === String(id_sesion);
    }).sort(function (a, b) { return a.orden_evento - b.orden_evento; });
  }

  return {
    crearSesion: crearSesion,
    agregarEvento: agregarEvento,
    crearSesionConEventos: crearSesionConEventos,
    sesionesPorCaso: sesionesPorCaso,
    matrizPorSesion: matrizPorSesion
  };
})();
