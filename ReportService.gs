/**
 * ReportService.gs — [EXTENSIÓN DEMO] Google Docs + Drive
 * -----------------------------------------------------------------------------
 * Builds a formatted session report as a Google Doc, files it in a Drive
 * folder and (optionally) exports a PDF copy next to it.
 * -----------------------------------------------------------------------------
 */

var ReportService = (function () {

  var COLOR_HEAD = '#0a3f3a';
  var COLOR_SOFT = '#f3efe6';

  function carpeta_() {
    var it = DriveApp.getFoldersByName(AUTOMATION.REPORTS_FOLDER_NAME);
    return it.hasNext() ? it.next() : DriveApp.createFolder(AUTOMATION.REPORTS_FOLDER_NAME);
  }

  function estiloTabla_(table, headerRow) {
    table.setBorderColor('#ddd6c8');
    for (var r = 0; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      for (var c = 0; c < row.getNumCells(); c++) {
        var cell = row.getCell(c);
        cell.setPaddingTop(4).setPaddingBottom(4);
        var text = cell.editAsText();
        text.setFontSize(10);
        if (headerRow && r === 0) {
          cell.setBackgroundColor(COLOR_HEAD);
          text.setForegroundColor('#ffffff').setBold(true);
        } else if (!headerRow && c === 0) {
          cell.setBackgroundColor(COLOR_SOFT);
          text.setBold(true);
        }
      }
    }
  }

  /**
   * Creates the report for one session. Returns
   * { ok, docId, docUrl, pdfUrl, pdfBlob, nombre }.
   */
  function generarInformeSesion(id_sesion) {
    var sesion = DB.findById(TABLES.SESSION, id_sesion);
    if (!sesion) throw new Error('Sesión no encontrada: ' + id_sesion);
    var exp = IngresosService.obtener(sesion[FIELDS.SESSION.FK_MASTER]);
    var eventos = SesionesService.matrizPorSesion(id_sesion);

    var fecha = String(sesion[FIELDS.SESSION.FECHA]).slice(0, 10);
    var area = humanizeEnum(sesion[FIELDS.SESSION.AREA]);
    var nombre = 'Informe ' + area + ' · ' + exp[FIELDS.MASTER.NOMBRE] + ' · ' + fecha;

    var doc = DocumentApp.create(nombre);
    var body = doc.getBody();
    body.setMarginTop(48).setMarginBottom(48).setMarginLeft(56).setMarginRight(56);

    var t = body.getParagraphs()[0];
    t.setText(AUTOMATION.CENTER_NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
    t.editAsText().setForegroundColor(COLOR_HEAD).setFontSize(20);
    body.appendParagraph('Informe de sesión — ' + area).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

    body.appendParagraph('Datos del caso').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    estiloTabla_(body.appendTable([
      ['Nombre', String(exp[FIELDS.MASTER.NOMBRE] || '')],
      ['Edad', String(exp[FIELDS.MASTER.EDAD] == null ? '—' : exp[FIELDS.MASTER.EDAD])],
      ['Diagnóstico base', String(exp[FIELDS.MASTER.DIAGNOSTICO] || '—')],
      ['ID caso', String(exp[FIELDS.MASTER.PK])]
    ]), false);

    body.appendParagraph('Encabezado de la sesión').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    estiloTabla_(body.appendTable([
      ['Fecha', fecha],
      ['Diagnóstico de sesión', humanizeEnum(sesion.diagnostico_sesion)],
      ['Acercamiento inicial', humanizeEnum(sesion.acercamiento_inicial)],
      ['Nivel de alerta', humanizeEnum(sesion.nivel_alerta)],
      ['Involucramiento', humanizeEnum(sesion.involucramiento)],
      ['Duración de actividad', humanizeEnum(sesion.duracion_actividad)],
      ['Adaptaciones / apoyos', (sesion.adaptaciones_apoyos_req || []).map(humanizeEnum).join(', ') || '—'],
      ['Propósito logrado', humanizeEnum(sesion.proposito_logrado)]
    ]), false);

    if (sesion.fatiga_agitacion_obs) {
      body.appendParagraph('Observaciones').setHeading(DocumentApp.ParagraphHeading.HEADING3);
      body.appendParagraph(String(sesion.fatiga_agitacion_obs));
    }

    body.appendParagraph('Matriz A-B-C (' + eventos.length + ' eventos)').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (eventos.length) {
      var filas = [['#', 'Dominio', 'Fase', 'Antecedente (A)', 'Conducta (B)', 'Intervención (C)', 'Resultado']];
      eventos.forEach(function (e) {
        filas.push([String(e.orden_evento), humanizeEnum(e.dominio_clinico), humanizeEnum(e.temporalidad_fase),
                    humanizeEnum(e.antecedente_a), humanizeEnum(e.conducta_observada_b),
                    humanizeEnum(e.intervencion_c), humanizeEnum(e.resultado_c)]);
      });
      estiloTabla_(body.appendTable(filas), true);
    } else {
      body.appendParagraph('Sin eventos registrados.').editAsText().setItalic(true);
    }

    var pie = body.appendParagraph('Documento generado automáticamente a partir del registro de sesión. Datos de demostración.');
    pie.editAsText().setFontSize(8).setForegroundColor('#5b665f').setItalic(true);

    doc.saveAndClose();

    var folder = carpeta_();
    var file = DriveApp.getFileById(doc.getId());
    file.moveTo(folder);

    var out = { ok: true, docId: doc.getId(), docUrl: doc.getUrl(), nombre: nombre, pdfUrl: null, pdfBlob: null };
    if (AUTOMATION.EXPORT_PDF) {
      var pdfBlob = file.getAs(MimeType.PDF).setName(nombre + '.pdf');
      var pdfFile = folder.createFile(pdfBlob);
      out.pdfUrl = pdfFile.getUrl();
      out.pdfBlob = pdfBlob;
    }
    return out;
  }

  return { generarInformeSesion: generarInformeSesion };
})();
