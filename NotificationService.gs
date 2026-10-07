/**
 * NotificationService.gs — [EXTENSIÓN DEMO] email (MailApp)
 * -----------------------------------------------------------------------------
 * Builds and sends HTML emails. Content is kept minimal on purpose: no vital
 * signs or clinical detail in the email body, only what the recipient needs.
 * -----------------------------------------------------------------------------
 */

var NotificationService = (function () {

  function ownerEmail_() {
    return Session.getEffectiveUser().getEmail();
  }

  /** Resolves the recipient. In DEMO_SAFE_MODE it is always the script owner. */
  function destinatario(expediente) {
    if (AUTOMATION.DEMO_SAFE_MODE) return ownerEmail_();
    var e = expediente && expediente[FIELDS.MASTER.EMAIL_REP];
    return e ? String(e) : ownerEmail_();
  }

  function esc_(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function layout_(titulo, cuerpoHtml) {
    return '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1d2421">' +
      '<div style="background:#0a3f3a;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">' +
      '<b>' + esc_(AUTOMATION.CENTER_NAME) + '</b></div>' +
      '<div style="border:1px solid #ddd6c8;border-top:0;padding:18px;border-radius:0 0 8px 8px">' +
      '<h2 style="margin:0 0 12px;font-size:18px">' + esc_(titulo) + '</h2>' + cuerpoHtml +
      '<p style="color:#5b665f;font-size:12px;margin-top:20px">Mensaje automático · datos de demostración.</p>' +
      '</div></div>';
  }

  function enviar_(to, subject, titulo, cuerpoHtml, plain, attachments) {
    var opts = { htmlBody: layout_(titulo, cuerpoHtml), name: AUTOMATION.CENTER_NAME };
    if (attachments && attachments.length) opts.attachments = attachments;
    MailApp.sendEmail(to, subject, plain, opts);
    return { ok: true, to: to };
  }

  function confirmacionCita(expediente, cita, eventoCal) {
    var to = destinatario(expediente);
    var nombre = expediente[FIELDS.MASTER.NOMBRE];
    var area = humanizeEnum(cita[FIELDS.AGENDA.AREA]);
    var cuando = cita[FIELDS.AGENDA.FECHA_CITA] + ' · ' + cita[FIELDS.AGENDA.HORA];
    var html =
      '<p>Se agendó una cita para <b>' + esc_(nombre) + '</b>.</p>' +
      '<table style="font-size:14px;border-collapse:collapse">' +
      '<tr><td style="padding:4px 12px 4px 0;color:#5b665f">Área</td><td>' + esc_(area) + '</td></tr>' +
      '<tr><td style="padding:4px 12px 4px 0;color:#5b665f">Fecha y hora</td><td>' + esc_(cuando) + '</td></tr>' +
      '<tr><td style="padding:4px 12px 4px 0;color:#5b665f">Profesional</td><td>' + esc_(cita[FIELDS.AGENDA.ESPECIALISTA] || '—') + '</td></tr>' +
      '</table>' +
      (eventoCal && eventoCal.ok ? '<p style="font-size:13px">La cita ya está en el calendario del centro.</p>' : '');
    var plain = 'Cita agendada para ' + nombre + ' — ' + area + ', ' + cuando + '.';
    return enviar_(to, 'Cita agendada · ' + area + ' · ' + cuando, 'Confirmación de cita', html, plain);
  }

  function informeSesion(expediente, sesion, informe) {
    var to = destinatario(expediente);
    var nombre = expediente[FIELDS.MASTER.NOMBRE];
    var area = humanizeEnum(sesion[FIELDS.SESSION.AREA]);
    var html =
      '<p>Se registró una sesión de <b>' + esc_(area) + '</b> para <b>' + esc_(nombre) + '</b>.</p>' +
      '<p><a href="' + esc_(informe.docUrl) + '">Abrir el informe en Google Docs</a>' +
      (informe.pdfUrl ? ' · <a href="' + esc_(informe.pdfUrl) + '">PDF en Drive</a>' : '') + '</p>';
    var plain = 'Informe de sesión: ' + informe.docUrl;
    var att = (AUTOMATION.ATTACH_PDF_TO_EMAIL && informe.pdfBlob) ? [informe.pdfBlob] : [];
    return enviar_(to, 'Informe de sesión · ' + area + ' · ' + nombre, 'Informe de sesión listo', html, plain, att);
  }

  function agendaDiaria(fecha, citas) {
    var to = ownerEmail_();
    var porArea = {};
    citas.forEach(function (c) { (porArea[c.area] = porArea[c.area] || []).push(c); });
    var html = Object.keys(porArea).sort().map(function (area) {
      var filas = porArea[area].map(function (c) {
        return '<tr><td style="padding:4px 10px 4px 0">' + esc_(c.hora_cita) + '</td><td>' + esc_(c.nombres_nna) +
               '</td><td style="padding-left:10px;color:#5b665f">' + esc_(c.especialista || '') + '</td></tr>';
      }).join('');
      return '<h3 style="font-size:15px;margin:14px 0 6px">' + esc_(humanizeEnum(area)) + ' (' + porArea[area].length + ')</h3>' +
             '<table style="font-size:14px">' + filas + '</table>';
    }).join('') || '<p>No hay citas agendadas para hoy.</p>';
    var plain = 'Agenda del ' + fecha + ': ' + citas.length + ' cita(s).';
    return enviar_(to, 'Agenda del día · ' + fecha + ' · ' + citas.length + ' cita(s)', 'Agenda del ' + fecha, html, plain);
  }

  return {
    destinatario: destinatario,
    confirmacionCita: confirmacionCita,
    informeSesion: informeSesion,
    agendaDiaria: agendaDiaria
  };
})();

/** Human label for an enum value (shared by the automation modules). */
function humanizeEnum(id) {
  if (id === '' || id == null) return '—';
  if (ENUM_LABELS[id]) return ENUM_LABELS[id];
  var s = String(id).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
