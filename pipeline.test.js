/**
 * End-to-end tests of the Apps Script backend, run locally with Node's
 * built-in test runner against the mocks in gas-mocks.js:
 *
 *   node --test test/
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeMocks } = require('./gas-mocks');

const SRC = path.join(__dirname, '..', 'src');
// Load order mirrors Apps Script (files share one global scope).
const FILES = ['Config', 'AutomationConfig', 'Database', 'Validation', 'IngresosService',
  'TriajeService', 'AgendaService', 'SesionesService', 'SearchService',
  'NotificationService', 'CalendarService', 'ReportService', 'AutomationService',
  'Code', 'DemoData'];

function load(opts) {
  const mocks = makeMocks(opts);
  const ctx = vm.createContext(Object.assign({ console }, mocks.globals));
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(SRC, f + '.gs'), 'utf8'), ctx, { filename: f + '.gs' }));
  // `var` declarations at top level become context properties; const/let would not.
  vm.runInContext('setupDatabase();', ctx);
  return { ctx, sent: mocks.sent, sheets: mocks.sheets, run: code => vm.runInContext(code, ctx) };
}

function tomorrow(run) { return run("isoDia_(1)"); }

test('setupDatabase creates every sheet with headers', () => {
  const { sheets, run } = load();
  const expected = Object.values(run('SHEET_NAMES'));
  assert.deepStrictEqual(Object.keys(sheets).sort(), expected.sort());
  assert.strictEqual(sheets.expedientes.rows[0][0], 'id_caso');
});

test('intake validates catalogs, uniqueness and future birth dates', () => {
  const { run } = load();
  const bad = run(`api_crearIngreso({ nombres_nna: 'X', cedula_nna: 'D1', fecha_nacimiento: '2015-01-01',
                    genero_identidad: 'otro', autoidentificacion_etnica: 'mestizo' })`);
  assert.strictEqual(bad.ok, false);
  assert.match(bad.errors.join(' '), /Valor no permitido en Género/);

  const ok = run(`api_crearIngreso(casoDemo_(0))`);
  assert.strictEqual(ok.ok, true);
  const dup = run(`(function(){ var c = casoDemo_(1); c.cedula_nna = '${ok.registro.cedula_nna}'; return api_crearIngreso(c); })()`);
  assert.strictEqual(dup.ok, false);
  assert.match(dup.errors.join(' '), /Ya existe/);

  const future = run(`(function(){ var c = casoDemo_(2); c.fecha_nacimiento = '2999-01-01'; return api_crearIngreso(c); })()`);
  assert.strictEqual(future.ok, false);
  assert.match(future.errors.join(' '), /futura/);
});

test('appointment → Calendar event + confirmation email (safe mode → owner)', () => {
  const { run, sent } = load();
  const ing = run('api_crearIngreso(casoDemo_(3))');
  const res = run(`api_crearTriaje(citaDemo_('${ing.id_caso}', 3, 1))`);
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.automatizacion.calendario.ok, true, JSON.stringify(res.automatizacion));
  assert.strictEqual(res.automatizacion.email.ok, true);

  assert.strictEqual(sent.events.length, 1);
  const ev = sent.events[0];
  const minutes = (ev.end - ev.start) / 60000;
  assert.strictEqual(minutes, run('AUTOMATION.APPOINTMENT_MINUTES'));
  // 11:30 local in Guayaquil (UTC-5) == 16:30 UTC.
  assert.strictEqual(ev.start.toISOString().slice(11, 16), '16:30');

  assert.strictEqual(sent.emails.length, 1);
  assert.strictEqual(sent.emails[0].to, 'owner@example.org');
  assert.doesNotMatch(sent.emails[0].html, /presion|saturaci/i, 'vital signs must not be emailed');
});

test('dates survive Sheets auto-conversion and the agenda query finds them', () => {
  const { run, sheets } = load();
  // Remove the plain-text formats to force Sheets-style Date conversion.
  sheets.agenda_triaje.formats = {};
  const ing = run('api_crearIngreso(casoDemo_(4))');
  run(`api_crearTriaje(citaDemo_('${ing.id_caso}', 4, 1))`);
  const raw = sheets.agenda_triaje.rows[1];
  assert.ok(raw.some(v => v instanceof Date), 'mock should have converted a date cell');
  const citas = run(`api_citasDelDia('', '${tomorrow(run)}')`);
  assert.strictEqual(citas.length, 1);
  assert.strictEqual(typeof citas[0].hora_cita, 'string');
  assert.match(citas[0].hora_cita, /^\d{2}:\d{2}$/);
});

test('session → formatted Doc in Drive folder + PDF + email with attachment', () => {
  const { run, sent } = load();
  const ing = run('api_crearIngreso(casoDemo_(5))');
  const res = run(`api_crearSesionConEventos(sesionDemo_('${ing.id_caso}', 'lenguaje', 5), eventosDemo_(5))`);
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.eventos.length, 3);
  assert.strictEqual(JSON.stringify(res.eventos.map(e => e.orden_evento)), "[1,2,3]");

  const a = res.automatizacion;
  assert.strictEqual(a.informe.ok, true, JSON.stringify(a));
  assert.strictEqual(a.pdf.ok, true);
  assert.strictEqual(a.email.ok, true);
  assert.ok(!('pdfBlob' in a.informe), 'blobs must not be returned to the browser');

  const doc = sent.docs[0];
  assert.ok(doc.saved);
  assert.strictEqual(doc.folder, run('AUTOMATION.REPORTS_FOLDER_NAME'));
  const tables = doc.blocks.filter(b => b.type === 'table');
  assert.strictEqual(tables.length, 3);                 // case, header, A-B-C
  assert.strictEqual(tables[2].cells.length, 4);        // header row + 3 events
  assert.strictEqual(sent.files[0].mime, 'application/pdf');
  assert.strictEqual(sent.emails[0].attachments.length, 1);
});

test('a failing step is logged and does not undo the saved record', () => {
  const { run, sent, sheets } = load({ failCalendar: true });
  const ing = run('api_crearIngreso(casoDemo_(6))');
  const res = run(`api_crearTriaje(citaDemo_('${ing.id_caso}', 6, 1))`);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.automatizacion.calendario.ok, false);
  assert.match(res.automatizacion.calendario.error, /Simulated calendar/);
  assert.strictEqual(res.automatizacion.email.ok, true, 'email still goes out');
  assert.strictEqual(sheets.agenda_triaje.rows.length, 2, 'appointment row kept');
  const log = run('api_automationLog(10)');
  assert.ok(log.some(r => r.tipo === 'calendario' && r.resultado === 'error'));
  assert.strictEqual(sent.events.length, 0);
});

test('daily digest groups the day by area; trigger install is idempotent', () => {
  const { run, sent, sent: { triggers } } = load();
  run('seedDemoData(6)');
  assert.strictEqual(sent.emails.length, 0, 'seeding must not send email');
  const r = run('Automation.enviarAgendaDiaria(isoDia_(1))');
  assert.strictEqual(r.ok, true);
  assert.match(sent.emails[0].subject, /Agenda del día/);
  run('installTriggers()'); run('installTriggers()');
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].fn, 'enviarAgendaDiaria');
});

test('runDemoPipeline walks one case through every automation', () => {
  const { run, sent } = load();
  const log = run('runDemoPipeline()');
  assert.ok(Array.isArray(log) && log.length >= 8, String(log));
  assert.strictEqual(sent.events.length, 1);
  assert.strictEqual(sent.docs.length, 1);
  assert.strictEqual(sent.files.length, 1);
  assert.strictEqual(sent.emails.length, 3);   // confirmation, report, digest
});

test('360° view and search work on seeded data', () => {
  const { run } = load();
  run('seedDemoData(4)');
  const found = run("api_buscar('demo-0001')");
  assert.strictEqual(found.length, 1);
  const v = run(`api_vista360('${found[0].id_caso}')`);
  assert.ok(v.header && v.ultimo_triaje);
  assert.strictEqual(v.total_sesiones, 1);
  const freq = run(`api_frecuencia('${found[0].id_caso}', 'conducta_observada_b')`);
  assert.strictEqual(Object.values(freq).reduce((a, b) => a + b, 0), 3);
});
