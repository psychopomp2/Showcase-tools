/**
 * AutomationService.gs — [EXTENSIÓN DEMO] orchestration
 * -----------------------------------------------------------------------------
 * Event hooks that run AFTER a record has been saved (and after the write lock
 * is released, so slow API calls never block other users):
 *
 *   appointment saved  -> Calendar event -> confirmation email
 *   session saved      -> Google Doc report -> PDF in Drive -> email with link + PDF
 *   daily trigger      -> agenda digest email
 *
 * Each step is isolated: a failure is logged to the automation_log sheet and
 * reported back to the UI, but it never undoes the saved record.
 * -----------------------------------------------------------------------------
 */

var Automation = (function () {

  function log_(tipo, ref, resultado, detalle, enlace) {
    try {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) { Logger.log('automation_log: lock timeout'); return; }
      try {
        DB.insert(TABLES.LOG, { tipo: tipo, ref_id: ref, resultado: resultado, detalle: detalle || '', enlace: enlace || '' });
      } finally { lock.releaseLock(); }
    } catch (e) {
      Logger.log('automation_log no disponible: ' + e);
    }
  }

  // Runs one step, logs it and returns a JSON-safe summary.
  function paso_(tipo, ref, fn) {
    try {
      var r = fn();
      log_(tipo, ref, 'ok', r.detalle || '', r.enlace || '');
      return { ok: true, detalle: r.detalle || '', enlace: r.enlace || '' };
    } catch (e) {
      log_(tipo, ref, 'error', String(e && e.message || e), '');
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  function omitido_(tipo, ref, motivo) {
    log_(tipo, ref, 'omitido', motivo, '');
    return { ok: false, omitido: true, detalle: motivo };
  }

  /** Hook: appointment/triage saved. `cita` is the inserted agenda record. */
  function onCitaAgendada(cita) {
    if (!AUTOMATION.ENABLED) return { habilitado: false };
    var ref = cita[FIELDS.AGENDA.PK];
    var exp = IngresosService.obtener(cita[FIELDS.AGENDA.FK_MASTER]);
    if (!exp) return { calendario: omitido_('calendario', ref, 'expediente no encontrado') };

    var evento = null;
    var cal = paso_('calendario', ref, function () {
      evento = CalendarService.crearEventoCita(exp, cita);
      return { detalle: evento.titulo + ' @ ' + evento.inicio, enlace: evento.eventId };
    });

    var mail = paso_('email', ref, function () {
      var r = NotificationService.confirmacionCita(exp, cita, evento);
      return { detalle: 'confirmación de cita → ' + r.to };
    });

    return { calendario: cal, email: mail };
  }

  /** Hook: clinical session saved. */
  function onSesionGuardada(id_sesion) {
    if (!AUTOMATION.ENABLED) return { habilitado: false };
    var informe = null;

    var doc = paso_('informe_doc', id_sesion, function () {
      informe = ReportService.generarInformeSesion(id_sesion);
      return { detalle: informe.nombre, enlace: informe.docUrl };
    });

    var pdf = informe && informe.pdfUrl
      ? (log_('informe_pdf', id_sesion, 'ok', informe.nombre + '.pdf', informe.pdfUrl), { ok: true, enlace: informe.pdfUrl })
      : { ok: false, omitido: true };

    var mail = informe
      ? paso_('email', id_sesion, function () {
          var sesion = DB.findById(TABLES.SESSION, id_sesion);
          var exp = IngresosService.obtener(sesion[FIELDS.SESSION.FK_MASTER]);
          var r = NotificationService.informeSesion(exp, sesion, informe);
          return { detalle: 'informe de sesión → ' + r.to };
        })
      : omitido_('email', id_sesion, 'no se generó el informe');

    return { informe: doc, pdf: pdf, email: mail };
  }

  /** Time-driven: emails today's agenda for every area. */
  function enviarAgendaDiaria(fechaOpt) {
    var fecha = fechaOpt || Utilities.formatDate(new Date(), AUTOMATION.TIMEZONE, 'yyyy-MM-dd');
    return paso_('agenda_diaria', fecha, function () {
      var citas = AgendaService.citasDelDia('', fecha);
      var r = NotificationService.agendaDiaria(fecha, citas);
      return { detalle: citas.length + ' cita(s) → ' + r.to };
    });
  }

  return { onCitaAgendada: onCitaAgendada, onSesionGuardada: onSesionGuardada, enviarAgendaDiaria: enviarAgendaDiaria };
})();

// ---- Entry points for triggers / the Apps Script editor ---------------------

function enviarAgendaDiaria() {
  return Automation.enviarAgendaDiaria();
}

/** Installs (once) the daily agenda-digest trigger. Re-running replaces it. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarAgendaDiaria') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarAgendaDiaria')
    .timeBased().atHour(AUTOMATION.DAILY_DIGEST_HOUR).everyDays(1)
    .inTimezone(AUTOMATION.TIMEZONE)
    .create();
  Logger.log('Trigger diario instalado a las ' + AUTOMATION.DAILY_DIGEST_HOUR + ':00 (' + AUTOMATION.TIMEZONE + ').');
}
