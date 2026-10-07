/**
 * CalendarService.gs — [EXTENSIÓN DEMO] Google Calendar
 * -----------------------------------------------------------------------------
 * Turns a triage/appointment record into a calendar event with reminders.
 * -----------------------------------------------------------------------------
 */

var CalendarService = (function () {

  function calendario_() {
    return AUTOMATION.CALENDAR_ID
      ? CalendarApp.getCalendarById(AUTOMATION.CALENDAR_ID)
      : CalendarApp.getDefaultCalendar();
  }

  /** 'yyyy-MM-dd' + 'HH:mm' in the configured time zone -> Date. */
  function inicioCita(fecha, hora) {
    var h = String(hora || '').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || !/^\d{2}:\d{2}$/.test(h)) {
      throw new Error('Fecha/hora de cita inválida: ' + fecha + ' ' + hora);
    }
    return Utilities.parseDate(fecha + ' ' + h, AUTOMATION.TIMEZONE, 'yyyy-MM-dd HH:mm');
  }

  function crearEventoCita(expediente, cita) {
    var cal = calendario_();
    if (!cal) throw new Error('No se encontró el calendario configurado.');

    var inicio = inicioCita(cita[FIELDS.AGENDA.FECHA_CITA], cita[FIELDS.AGENDA.HORA]);
    var fin = new Date(inicio.getTime() + AUTOMATION.APPOINTMENT_MINUTES * 60000);
    var area = humanizeEnum(cita[FIELDS.AGENDA.AREA]);

    var titulo = area + ' · ' + expediente[FIELDS.MASTER.NOMBRE];
    var descripcion =
      'Profesional: ' + (cita[FIELDS.AGENDA.ESPECIALISTA] || '—') + '\n' +
      'ID caso: ' + expediente[FIELDS.MASTER.PK] + '\n' +
      'ID agenda: ' + cita[FIELDS.AGENDA.PK] + '\n\n' +
      'Creado automáticamente desde el sistema de gestión (demo).';

    var evento = cal.createEvent(titulo, inicio, fin, {
      description: descripcion,
      location: AUTOMATION.CENTER_NAME
    });
    evento.addPopupReminder(30);
    evento.addEmailReminder(24 * 60);

    return { ok: true, eventId: evento.getId(), titulo: titulo, inicio: inicio.toISOString() };
  }

  return { crearEventoCita: crearEventoCita, inicioCita: inicioCita };
})();
