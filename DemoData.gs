/**
 * DemoData.gs — synthetic data + one-click pipeline run
 * -----------------------------------------------------------------------------
 * Every name, ID and value here is invented. Nothing comes from a real record.
 *
 *   seedDemoData()      -> fills the sheets with fictional cases, appointments
 *                          and sessions (no emails/events are created).
 *   runDemoPipeline()   -> walks one fictional case through the whole flow and
 *                          fires every automation: Calendar event, emails,
 *                          Google Doc report, PDF in Drive, daily digest.
 *   resetDemoData()     -> clears data rows (keeps headers) in THIS spreadsheet.
 * -----------------------------------------------------------------------------
 */

var DEMO_NOMBRES = [
  'Lucía Andrade Paz', 'Mateo Cedeño Ruiz', 'Valentina Mora Vélez', 'Thiago Salazar Lino',
  'Emilia Zambrano Ortiz', 'Gael Intriago Bravo', 'Isabella Loor Mendoza', 'Santiago Vera Cano',
  'Martina Alcívar Reyes', 'Joaquín Macías Solís', 'Renata Pico Arteaga', 'Benjamín Rivas Mero'
];
var DEMO_DIAGNOSTICOS = ['Retraso del lenguaje (demo)', 'TEA nivel 1 (demo)', 'TDAH presentación combinada (demo)',
                         'Dificultades de integración sensorial (demo)', 'En evaluación (demo)'];
var DEMO_PROFESIONALES = ['Ps. Demo Uno', 'Lcda. Demo Dos', 'T.O. Demo Tres'];

function pick_(arr, i) { return arr[i % arr.length]; }
function isoDia_(offset) {
  var d = new Date(); d.setDate(d.getDate() + offset);
  return Utilities.formatDate(d, AUTOMATION.TIMEZONE, 'yyyy-MM-dd');
}

function casoDemo_(i) {
  var anio = 2014 + (i % 9);
  return {
    nombres_nna: pick_(DEMO_NOMBRES, i),
    cedula_nna: 'DEMO-' + ('0000' + (i + 1)).slice(-4) + '-' + Utilities.getUuid().slice(0, 4),
    fecha_nacimiento: anio + '-' + ('0' + ((i % 12) + 1)).slice(-2) + '-15',
    genero_identidad: pick_(ENUMS.genero_identidad, i),
    autoidentificacion_etnica: pick_(ENUMS.autoidentificacion_etnica, i),
    tiene_discapacidad_registrada: i % 3 === 0,
    porcentaje_discapacidad: i % 3 === 0 ? 30 + (i % 4) * 10 : null,
    diagnostico_base: pick_(DEMO_DIAGNOSTICOS, i),
    nombre_representante_legal: 'Representante Demo ' + (i + 1),
    cedula_representante: 'DEMO-R-' + (i + 1),
    email_representante: 'representante' + (i + 1) + '@example.org',
    direccion_barrio: 'Barrio Ficticio ' + ((i % 5) + 1),
    telefono_principal: '000-000-' + ('000' + i).slice(-4),
    terapias_solicitadas: [pick_(ENUMS.terapias_solicitadas, i), pick_(ENUMS.terapias_solicitadas, i + 2)],
    motivo_consulta: 'Motivo de consulta ficticio para la demostración.'
  };
}

function citaDemo_(id_caso, i, diaOffset) {
  var area = pick_(['psicologia', 'lenguaje', 'terapia_ocupacional'], i);
  return {
    id_caso: id_caso,
    fecha_cita: isoDia_(diaOffset),
    hora_cita: ('0' + (8 + (i % 8))).slice(-2) + ':' + (i % 2 ? '30' : '00'),
    estado_cita: 'agendado',
    medico_especialista: pick_(DEMO_PROFESIONALES, i),
    area_admision: area,
    motivo_consulta_triaje: 'Control de seguimiento (demo).',
    presion_arterial: '100/65',
    frecuencia_cardiaca_fc: 80 + (i % 15),
    frecuencia_respiratoria_fr: 18 + (i % 4),
    talla_cm: 110 + i,
    peso_kg: 20 + (i % 10),
    saturacion_oxigeno: 97,
    glicemia: 90
  };
}

function sesionDemo_(id_caso, area, i) {
  return {
    id_caso: id_caso,
    area_intervencion: area,
    diagnostico_sesion: pick_(ENUMS.diagnostico_sesion, i),
    acercamiento_inicial: pick_(ENUMS.acercamiento_inicial, i),
    nivel_alerta: pick_(ENUMS.nivel_alerta, i + 1),
    involucramiento: pick_(ENUMS.involucramiento, i),
    duracion_actividad: pick_(ENUMS.duracion_actividad, i + 1),
    fatiga_agitacion_obs: i % 2 ? 'Fatiga leve al cierre de la sesión (demo).' : '',
    adaptaciones_apoyos_req: [pick_(ENUMS.adaptaciones_apoyos_req, i)],
    proposito_logrado: pick_(ENUMS.proposito_logrado, i)
  };
}

function eventosDemo_(i) {
  return [0, 1, 2].map(function (k) {
    return {
      dominio_clinico: pick_(ENUMS.dominio_clinico, i + k),
      temporalidad_fase: ENUMS.temporalidad_fase[k],
      antecedente_a: pick_(ENUMS.antecedente_a, i + k),
      conducta_observada_b: pick_(ENUMS.conducta_observada_b, i + 2 * k),
      intervencion_c: pick_(ENUMS.intervencion_c, i + k),
      resultado_c: pick_(ENUMS.resultado_c, i + k)
    };
  });
}

/** Fills the sheets with N fictional cases. Does NOT fire automations. */
function seedDemoData(n) {
  n = n || 10;
  var creados = 0;
  for (var i = 0; i < n; i++) {
    var ing = IngresosService.crear(casoDemo_(i));
    if (!ing.ok) { Logger.log(ing.errors.join(' ')); continue; }
    var cita = TriajeService.crear(citaDemo_(ing.id_caso, i, i % 3 === 0 ? 0 : 1));
    if (i % 2 === 0) {
      SesionesService.crearSesionConEventos(sesionDemo_(ing.id_caso, cita.registro.area_admision === 'medicina' ? 'psicologia' : cita.registro.area_admision, i), eventosDemo_(i));
    }
    creados++;
  }
  Logger.log('Casos de demostración creados: ' + creados);
  return creados;
}

/** Runs one fictional case end to end and fires every automation. */
function runDemoPipeline() {
  var i = Math.floor(Math.random() * 1000);
  var log = [];

  var ing = api_crearIngreso(casoDemo_(i));
  log.push('1. Ingreso: ' + (ing.ok ? 'id_caso ' + ing.id_caso : ing.errors.join(' ')));
  if (!ing.ok) { Logger.log(log.join('\n')); return log; }

  var cita = api_crearTriaje(citaDemo_(ing.id_caso, i, 1));
  log.push('2. Cita/triaje: ' + (cita.ok ? cita.id_agenda : cita.errors.join(' ')));
  log.push('   → Calendar: ' + JSON.stringify(cita.automatizacion && cita.automatizacion.calendario));
  log.push('   → Email:    ' + JSON.stringify(cita.automatizacion && cita.automatizacion.email));

  var area = cita.ok ? cita.registro.area_admision : 'psicologia';
  var ses = api_crearSesionConEventos(sesionDemo_(ing.id_caso, area, i), eventosDemo_(i));
  log.push('3. Sesión: ' + (ses.ok ? ses.id_sesion + ' (' + ses.eventos.length + ' eventos)' : ses.errors.join(' ')));
  log.push('   → Doc:   ' + JSON.stringify(ses.automatizacion && ses.automatizacion.informe));
  log.push('   → PDF:   ' + JSON.stringify(ses.automatizacion && ses.automatizacion.pdf));
  log.push('   → Email: ' + JSON.stringify(ses.automatizacion && ses.automatizacion.email));

  var dig = Automation.enviarAgendaDiaria(isoDia_(1));
  log.push('4. Agenda diaria (mañana): ' + JSON.stringify(dig));

  Logger.log(log.join('\n'));
  return log;
}

/** Clears all data rows (keeps headers) in the active spreadsheet. */
function resetDemoData() {
  Object.keys(SCHEMAS).forEach(function (t) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES[t]);
    if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  Logger.log('Datos de demostración eliminados.');
}
