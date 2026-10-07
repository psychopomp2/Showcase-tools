/**
 * AutomationConfig.gs — [EXTENSIÓN DEMO]
 * -----------------------------------------------------------------------------
 * Settings for the Gmail / Calendar / Docs / Drive automations that were added
 * for this demo. The original case-management system did not have them.
 *
 * Safe by default: DEMO_SAFE_MODE sends every email to the account running the
 * script, never to the address stored in a record.
 * -----------------------------------------------------------------------------
 */

var AUTOMATION = {
  ENABLED: true,

  // true  -> all email goes to the script owner (Session.getEffectiveUser()).
  // false -> email goes to email_representante when present.
  DEMO_SAFE_MODE: true,

  // Calendar: '' uses the default calendar of the account running the script.
  CALENDAR_ID: '',
  APPOINTMENT_MINUTES: 45,

  // Drive: reports go to this folder (created on first use).
  REPORTS_FOLDER_NAME: 'Demo — Informes de sesión',
  EXPORT_PDF: true,
  ATTACH_PDF_TO_EMAIL: true,

  // Daily agenda digest (installed with installTriggers()).
  DAILY_DIGEST_HOUR: 7,

  CENTER_NAME: 'Centro Demo de Atención Integral',
  TIMEZONE: 'America/Guayaquil'
};
