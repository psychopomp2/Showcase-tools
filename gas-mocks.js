/**
 * Minimal in-memory mocks of the Google Apps Script services this project
 * uses, so the backend can be exercised locally with Node (no Google account).
 * They record every side effect (emails, events, docs, files) for assertions.
 *
 * The Sheets mock imitates one real Sheets behaviour on purpose: strings that
 * look like dates/times are auto-converted into Date objects on write, unless
 * the column is formatted as plain text ('@').
 */
'use strict';
const crypto = require('crypto');

function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = {};
  f.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  return p;
}

function makeMocks(opts) {
  opts = opts || {};
  const TZ = opts.tz || 'America/Guayaquil';
  const sent = { emails: [], events: [], docs: [], files: [], folders: [], triggers: [], logs: [] };

  // ---------------- Sheets ----------------
  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sheet.rows[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    setValues(vals) {
      vals.forEach((row, i) => {
        const target = this.sheet.rows[this.r - 1 + i] = this.sheet.rows[this.r - 1 + i] || [];
        row.forEach((v, j) => { target[this.c - 1 + j] = this.sheet.convert(this.c + j, v); });
      });
      return this;
    }
    setFontWeight() { return this; }
    setDataValidation() { return this; }
    setNumberFormat(fmt) { for (let j = 0; j < this.nc; j++) this.sheet.formats[this.c + j] = fmt; return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; this.formats = {}; }
    convert(col, v) {
      if (this.formats[col] === '@' || typeof v !== 'string') return v;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 5)); }
      if (/^\d{2}:\d{2}$/.test(v)) { const [h, mi] = v.split(':').map(Number); return new Date(Date.UTC(1899, 11, 30, h + 5, mi)); }
      return v;
    }
    getName() { return this.name; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return 1000; }
    appendRow(row) { this.rows.push(row.map((v, j) => this.convert(j + 1, v))); }
    setFrozenRows() {}
    deleteRows(start, n) { this.rows.splice(start - 1, n); }
  }
  const sheets = {};
  const spreadsheet = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: s => { delete sheets[s.name]; }
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    newDataValidation: () => {
      const b = { requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) };
      return b;
    },
    getUi: () => { throw new Error('no UI in tests'); }
  };

  // ---------------- Utilities / Session / Lock / Logger ----------------
  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    formatDate: (date, tz, fmt) => {
      const p = tzParts(date, tz);
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
                .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
    parseDate: (str, tz, fmt) => {
      if (fmt !== 'yyyy-MM-dd HH:mm') throw new Error('mock only supports yyyy-MM-dd HH:mm');
      const [d, t] = str.split(' ');
      const [y, m, dd] = d.split('-').map(Number);
      const [h, mi] = t.split(':').map(Number);
      const guess = new Date(Date.UTC(y, m - 1, dd, h, mi));
      const p = tzParts(guess, tz);
      const asTz = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      return new Date(guess.getTime() - (asTz - guess.getTime()));
    }
  };
  const Session = {
    getScriptTimeZone: () => TZ,
    getEffectiveUser: () => ({ getEmail: () => 'owner@example.org' }),
    getActiveUser: () => ({ getEmail: () => '' })
  };
  const lock = { tryLock: () => true, waitLock: () => {}, releaseLock: () => {} };
  const LockService = { getScriptLock: () => lock };
  const Logger = { log: m => sent.logs.push(String(m)) };

  // ---------------- Mail ----------------
  const MailApp = {
    sendEmail: (to, subject, body, o) => {
      if (opts.failEmail) throw new Error('Simulated mail quota error');
      sent.emails.push({ to, subject, body, html: o && o.htmlBody, attachments: (o && o.attachments) || [] });
    }
  };

  // ---------------- Calendar ----------------
  function makeCalendar(id) {
    return {
      id,
      createEvent: (title, start, end, o) => {
        if (opts.failCalendar) throw new Error('Simulated calendar error');
        const ev = { id: 'evt_' + (sent.events.length + 1), title, start, end, options: o, reminders: [] };
        sent.events.push(ev);
        return {
          getId: () => ev.id,
          addPopupReminder: m => { ev.reminders.push(['popup', m]); },
          addEmailReminder: m => { ev.reminders.push(['email', m]); }
        };
      }
    };
  }
  const CalendarApp = { getDefaultCalendar: () => makeCalendar('default'), getCalendarById: id => makeCalendar(id) };

  // ---------------- Docs ----------------
  function textEl(log) {
    const t = {};
    ['setForegroundColor', 'setFontSize', 'setBold', 'setItalic'].forEach(m => { t[m] = () => t; });
    return t;
  }
  function paragraph(doc, text) {
    const p = { text, heading: null };
    doc.blocks.push({ type: 'p', ref: p });
    const api = {
      setText: s => { p.text = s; return api; },
      setHeading: h => { p.heading = h; return api; },
      editAsText: () => textEl()
    };
    return api;
  }
  function table(doc, cells) {
    doc.blocks.push({ type: 'table', cells });
    const cellApi = () => {
      const c = {};
      ['setPaddingTop', 'setPaddingBottom', 'setBackgroundColor'].forEach(m => { c[m] = () => c; });
      c.editAsText = () => textEl();
      return c;
    };
    return {
      setBorderColor() { return this; },
      getNumRows: () => cells.length,
      getRow: r => ({ getNumCells: () => cells[r].length, getCell: () => cellApi() })
    };
  }
  const DocumentApp = {
    ParagraphHeading: { TITLE: 'TITLE', SUBTITLE: 'SUBTITLE', HEADING2: 'H2', HEADING3: 'H3' },
    create: name => {
      const doc = { id: 'doc_' + (sent.docs.length + 1), name, blocks: [], saved: false };
      sent.docs.push(doc);
      const first = paragraph(doc, '');
      const body = {
        setMarginTop() { return body; }, setMarginBottom() { return body; },
        setMarginLeft() { return body; }, setMarginRight() { return body; },
        getParagraphs: () => [first],
        appendParagraph: t => paragraph(doc, t),
        appendTable: cells => {
          cells.forEach(r => r.forEach(v => { if (typeof v !== 'string') throw new Error('Docs table cells must be strings, got ' + typeof v); }));
          return table(doc, cells);
        }
      };
      return {
        getBody: () => body, getId: () => doc.id,
        getUrl: () => 'https://docs.google.com/document/d/' + doc.id,
        saveAndClose: () => { doc.saved = true; }
      };
    }
  };

  // ---------------- Drive ----------------
  const MimeType = { PDF: 'application/pdf' };
  const folders = {};
  function folderApi(name) {
    const f = folders[name] || (folders[name] = { name, files: [] });
    return {
      getName: () => name,
      createFile: blob => {
        const file = { id: 'file_' + (sent.files.length + 1), name: blob.name, mime: blob.mime, folder: name };
        sent.files.push(file); f.files.push(file);
        return { getUrl: () => 'https://drive.google.com/file/d/' + file.id, getId: () => file.id };
      },
      _record: f
    };
  }
  const DriveApp = {
    getFoldersByName: name => {
      let done = !folders[name];
      return { hasNext: () => !done, next: () => { done = true; return folderApi(name); } };
    },
    createFolder: name => { sent.folders.push(name); return folderApi(name); },
    getFileById: id => ({
      moveTo: folder => { const d = sent.docs.find(x => x.id === id); if (d) d.folder = folder.getName(); },
      getAs: mime => {
        const blob = { mime, name: id };
        blob.setName = n => { blob.name = n; return blob; };
        return blob;
      }
    })
  };

  // ---------------- Triggers ----------------
  const ScriptApp = {
    getProjectTriggers: () => sent.triggers.map(t => ({ getHandlerFunction: () => t.fn, _t: t })),
    deleteTrigger: t => { sent.triggers.splice(sent.triggers.indexOf(t._t), 1); },
    newTrigger: fn => {
      const t = { fn };
      const b = {
        timeBased: () => b, atHour: h => { t.hour = h; return b; }, everyDays: d => { t.days = d; return b; },
        inTimezone: z => { t.tz = z; return b; }, create: () => { sent.triggers.push(t); return t; }
      };
      return b;
    }
  };

  return {
    globals: { SpreadsheetApp, Utilities, Session, LockService, Logger, MailApp, CalendarApp,
               DocumentApp, DriveApp, MimeType, ScriptApp, HtmlService: {} },
    sent, sheets
  };
}

module.exports = { makeMocks };
