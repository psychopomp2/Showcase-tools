/**
 * SearchService.gs — TIER 3
 * -----------------------------------------------------------------------------
 * Universal search, 360° case view (with latest triage vitals), cross filters
 * and aggregation for charts. All joins happen in memory.
 * -----------------------------------------------------------------------------
 */

var SearchService = (function () {

  function norm_(s) { return String(s == null ? '' : s).toLowerCase().trim(); }

  function buscar(query) {
    var q = norm_(query);
    if (!q) return [];
    return IngresosService.listar().filter(function (r) {
      return norm_(r.nombres_nna).indexOf(q) !== -1 ||
             norm_(r.cedula_nna).indexOf(q) !== -1 ||
             norm_(r.id_caso) === q;
    }).map(function (r) {
      return {
        id_caso: r.id_caso, nombres_nna: r.nombres_nna, cedula_nna: r.cedula_nna,
        edad: r.edad, diagnostico_base: r.diagnostico_base,
        terapias_solicitadas: r.terapias_solicitadas
      };
    });
  }

  function vista360(id_caso) {
    var header = IngresosService.obtener(id_caso);
    if (!header) return null;

    var ultimoTriaje = TriajeService.ultimoPorCaso(id_caso);
    var sesiones = SesionesService.sesionesPorCaso(id_caso);

    var ultimaPorArea = {};
    sesiones.forEach(function (s) {
      var actual = ultimaPorArea[s.area_intervencion];
      if (!actual || new Date(s.fecha_sesion) > new Date(actual.fecha_sesion)) {
        ultimaPorArea[s.area_intervencion] = s;
      }
    });
    var resumenClinico = Object.keys(ultimaPorArea).map(function (area) {
      var s = ultimaPorArea[area];
      return {
        area_intervencion: area, fecha_sesion: s.fecha_sesion,
        acercamiento_inicial: s.acercamiento_inicial,
        proposito_logrado: s.proposito_logrado, id_sesion: s.id_sesion
      };
    });

    var idsSesion = sesiones.map(function (s) { return String(s.id_sesion); });
    var eventos = DB.findWhere(TABLES.MATRIX, function (e) {
      return idsSesion.indexOf(String(e.id_sesion)) !== -1;
    });

    return {
      header: header,
      ultimo_triaje: ultimoTriaje,
      resumen_clinico: resumenClinico,
      total_sesiones: sesiones.length,
      datos_longitudinales: eventos
    };
  }

  function filtrar(filtros) {
    filtros = filtros || {};
    return IngresosService.listar().filter(function (r) {
      if (filtros.terapias_contains && filtros.terapias_contains.length) {
        var todas = filtros.terapias_contains.every(function (t) {
          return (r.terapias_solicitadas || []).indexOf(t) !== -1;
        });
        if (!todas) return false;
      }
      if (filtros.genero_identidad && r.genero_identidad !== filtros.genero_identidad) return false;
      if (filtros.diagnostico_base &&
          norm_(r.diagnostico_base).indexOf(norm_(filtros.diagnostico_base)) === -1) return false;
      if (filtros.edad_min != null && (r.edad == null || r.edad < filtros.edad_min)) return false;
      if (filtros.edad_max != null && (r.edad == null || r.edad > filtros.edad_max)) return false;
      if (filtros.fecha_desde && new Date(r.fecha_ingreso) < new Date(filtros.fecha_desde)) return false;
      if (filtros.fecha_hasta && new Date(r.fecha_ingreso) > new Date(filtros.fecha_hasta)) return false;
      return true;
    });
  }

  function frecuenciaMatrizPorCaso(id_caso, campo) {
    var v360 = vista360(id_caso);
    if (!v360) return {};
    var conteo = {};
    v360.datos_longitudinales.forEach(function (e) {
      var val = e[campo];
      if (val == null || val === '') return;
      conteo[val] = (conteo[val] || 0) + 1;
    });
    return conteo;
  }

  return {
    buscar: buscar, vista360: vista360, filtrar: filtrar,
    frecuenciaMatrizPorCaso: frecuenciaMatrizPorCaso
  };
})();
