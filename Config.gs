/**
 * Config.gs
 * -----------------------------------------------------------------------------
 * Single source of truth: sheet names, catalogs (enums) and table schemas.
 * Services and the front end never use literal sheet/field names; they use the
 * logical roles in TABLES / FIELDS, so a rename only touches this file.
 *
 * Demo build: sheet names were made generic and all data is synthetic.
 * -----------------------------------------------------------------------------
 */

var SHEET_NAMES = {
  expedientes: 'expedientes',
  agenda_triaje: 'agenda_triaje',
  sesiones_clinicas: 'sesiones_clinicas',
  matriz_actividad_clinica: 'matriz_actividad_clinica',
  automation_log: 'automation_log'          // [EXTENSIÓN DEMO] bitácora de automatizaciones
};

// -----------------------------------------------------------------------------
// CATÁLOGOS (ENUMS)
// -----------------------------------------------------------------------------
var ENUMS = {
  genero_identidad: ['femenino', 'masculino', 'lgbti'],
  autoidentificacion_etnica: ['afroecuatoriano', 'mestizo', 'indigena', 'montubio', 'otros'],
  terapias_solicitadas: [
    'terapia_fisica', 'terapia_ocupacional', 'terapia_lenguaje',
    'terapia_psicologica', 'terapia_sensorial', 'estimulacion_temprana'
  ],

  // Triaje
  estado_cita: ['agendado', 'en_espera', 'en_atencion', 'atendido', 'ausente'],
  area_admision: ['psicologia', 'lenguaje', 'terapia_ocupacional', 'medicina'],

  // Sesión clínica
  area_intervencion: ['psicologia', 'lenguaje', 'terapia_ocupacional'],
  diagnostico_sesion: ['presuntivo', 'definitivo'],
  acercamiento_inicial: ['entusiasmo', 'neutro', 'resistencia'],
  nivel_alerta: ['bajo', 'justo', 'acelerado'],
  involucramiento: ['activo', 'pasivo', 'distante'],
  duracion_actividad: ['corto_menor_10', 'moderado_10_a_20', 'largo_mayor_20'],
  adaptaciones_apoyos_req: ['apoyo_visual', 'apoyo_fisico', 'apoyo_verbal', 'adaptacion_material'],
  proposito_logrado: ['logrado', 'parcialmente'],

  // Matriz A-B-C
  dominio_clinico: [
    'funciones_ejecutivas', 'regulacion_afectiva', 'lenguaje_expresivo',
    'lenguaje_comprensivo', 'motricidad_fina', 'motricidad_gruesa',
    'habilidades_sociales', 'integracion_sensorial'
  ],
  temporalidad_fase: ['t1_inicio_instruccion', 't2_desarrollo_consumo', 't3_cierre_transicion'],
  antecedente_a: [
    'instruccion_directa_verbal', 'presentacion_material_nuevo', 'transicion_actividad_rutina',
    'retiro_de_estimulo_agradable', 'detonante_ambiental', 'juego_libre_espontaneo'
  ],
  conducta_observada_b: [
    'participacion_activa_adaptativa', 'evitacion_escape_tarea', 'inercia_fase_consumo',
    'disregulacion_emocional_llanto', 'estereotipia_autoestimulacion', 'ausencia_de_respuesta'
  ],
  intervencion_c: [
    'instigacion_fisica_total_parcial', 'instigacion_verbal_directiva', 'modelado_imitacion',
    'refuerzo_positivo_social_tangible', 'tiempo_fuera_pausa_activa',
    'reestructuracion_ambiental_apoyo_visual', 'observacion_sin_intervencion'
  ],
  resultado_c: [
    'logro_autonomo_independiente', 'logro_con_apoyo_minimo',
    'aproximacion_sucesiva_en_proceso', 'no_logrado_requiere_reformulacion'
  ],

  // [EXTENSIÓN DEMO]
  tipo_automatizacion: ['email', 'calendario', 'informe_doc', 'informe_pdf', 'agenda_diaria'],
  resultado_automatizacion: ['ok', 'error', 'omitido']
};

var ENUM_LABELS = {
  lgbti: 'LGBTI+',
  en_espera: 'En espera', en_atencion: 'En atención',
  corto_menor_10: 'Corto (< 10 min)',
  moderado_10_a_20: 'Moderado (10–20 min)',
  largo_mayor_20: 'Largo (> 20 min)',
  t1_inicio_instruccion: 'T1 · Inicio / Instrucción',
  t2_desarrollo_consumo: 'T2 · Desarrollo / Consumo',
  t3_cierre_transicion: 'T3 · Cierre / Transición'
};

// -----------------------------------------------------------------------------
// ESQUEMAS (el orden define el orden de columnas)
// type: uuid|string|text|integer|decimal|date|time|datetime|boolean|enum|enum_array
// -----------------------------------------------------------------------------
var SCHEMAS = {

  // 1) EXPEDIENTE MAESTRO
  expedientes: [
    { key: 'id_caso',                    label: 'ID Caso',                  type: 'uuid', pk: true },
    { key: 'fecha_ingreso',              label: 'Fecha de ingreso',         type: 'datetime', default: 'now' },
    { key: 'nombres_nna',                label: 'Nombres',                  type: 'string', required: true },
    { key: 'cedula_nna',                 label: 'Documento de identidad',   type: 'string', required: true, unique: true },
    { key: 'fecha_nacimiento',           label: 'Fecha de nacimiento',      type: 'date', required: true },
    { key: 'edad',                       label: 'Edad',                     type: 'integer', computedFrom: 'fecha_nacimiento' },
    { key: 'genero_identidad',           label: 'Género / Identidad',       type: 'enum', enum: 'genero_identidad', required: true },
    { key: 'autoidentificacion_etnica',  label: 'Autoidentificación étnica',type: 'enum', enum: 'autoidentificacion_etnica', required: true },
    { key: 'tiene_discapacidad_registrada', label: 'Discapacidad registrada',  type: 'boolean' },
    { key: 'porcentaje_discapacidad',    label: '% de discapacidad',        type: 'integer', nullable: true },
    { key: 'diagnostico_base',           label: 'Diagnóstico base',         type: 'string' },
    { key: 'nombre_representante_legal', label: 'Representante legal',      type: 'string' },
    { key: 'cedula_representante',       label: 'Documento del representante', type: 'string' },
    { key: 'email_representante',        label: 'Email del representante',  type: 'string' },   // [EXTENSIÓN DEMO]
    { key: 'direccion_barrio',           label: 'Dirección / Barrio',       type: 'string' },
    { key: 'telefono_principal',         label: 'Teléfono principal',       type: 'string' },
    { key: 'terapias_solicitadas',       label: 'Terapias solicitadas',     type: 'enum_array', enum: 'terapias_solicitadas' },
    { key: 'motivo_consulta',            label: 'Motivo de consulta',       type: 'text' }
  ],

  // 2) TRIAJE & AGENDA
  agenda_triaje: [
    { key: 'id_agenda',                  label: 'ID Agenda',                type: 'uuid', pk: true },
    { key: 'id_caso',                    label: 'ID Caso',                  type: 'string', required: true, fk: 'expedientes.id_caso' },
    { key: 'marca_temporal',             label: 'Marca temporal',           type: 'datetime', default: 'now' },
    { key: 'fecha_cita',                 label: 'Fecha de cita',            type: 'date', required: true },
    { key: 'hora_cita',                  label: 'Hora de cita',             type: 'time', required: true },
    { key: 'estado_cita',                label: 'Estado de la cita',        type: 'enum', enum: 'estado_cita', required: true },
    { key: 'medico_especialista',        label: 'Médico / Especialista',    type: 'string' },
    { key: 'area_admision',              label: 'Área de admisión',         type: 'enum', enum: 'area_admision', required: true },
    { key: 'motivo_consulta_triaje',     label: 'Motivo de consulta (triaje)', type: 'text', nullable: true },
    { key: 'presion_arterial',           label: 'Presión arterial',         type: 'string' },
    { key: 'frecuencia_cardiaca_fc',     label: 'Frecuencia cardíaca (FC)', type: 'integer', nullable: true },
    { key: 'frecuencia_respiratoria_fr', label: 'Frecuencia respiratoria (FR)', type: 'integer', nullable: true },
    { key: 'talla_cm',                   label: 'Talla (cm)',               type: 'decimal', nullable: true },
    { key: 'peso_kg',                    label: 'Peso (kg)',                type: 'decimal', nullable: true },
    { key: 'saturacion_oxigeno',         label: 'Saturación de oxígeno (%)',type: 'integer', nullable: true },
    { key: 'glicemia',                   label: 'Glicemia',                 type: 'decimal', nullable: true }
  ],

  // 3) SESIÓN CLÍNICA (encabezado/cierre)
  sesiones_clinicas: [
    { key: 'id_sesion',            label: 'ID Sesión',             type: 'uuid', pk: true },
    { key: 'id_caso',              label: 'ID Caso',               type: 'string', required: true, fk: 'expedientes.id_caso' },
    { key: 'fecha_sesion',         label: 'Fecha de sesión',       type: 'datetime', default: 'now' },
    { key: 'area_intervencion',    label: 'Área de intervención',  type: 'enum', enum: 'area_intervencion', required: true },
    { key: 'diagnostico_sesion',   label: 'Diagnóstico de sesión', type: 'enum', enum: 'diagnostico_sesion', required: true },
    { key: 'acercamiento_inicial', label: 'Acercamiento inicial',  type: 'enum', enum: 'acercamiento_inicial', required: true },
    { key: 'nivel_alerta',         label: 'Nivel de alerta',       type: 'enum', enum: 'nivel_alerta', required: true },
    { key: 'involucramiento',      label: 'Involucramiento',       type: 'enum', enum: 'involucramiento', required: true },
    { key: 'duracion_actividad',   label: 'Duración de actividad', type: 'enum', enum: 'duracion_actividad', required: true },
    { key: 'fatiga_agitacion_obs', label: 'Obs. fatiga/agitación', type: 'text', nullable: true },
    { key: 'adaptaciones_apoyos_req', label: 'Adaptaciones / apoyos', type: 'enum_array', enum: 'adaptaciones_apoyos_req' },
    { key: 'proposito_logrado',    label: 'Propósito logrado',     type: 'enum', enum: 'proposito_logrado', required: true }
  ],

  // 4) MATRIZ A-B-C (motor de datos, solo enums)
  matriz_actividad_clinica: [
    { key: 'id_evento',            label: 'ID Evento',             type: 'uuid', pk: true },
    { key: 'id_sesion',            label: 'ID Sesión',             type: 'string', required: true, fk: 'sesiones_clinicas.id_sesion' },
    { key: 'orden_evento',         label: 'Orden del evento',      type: 'integer', autoIncrementPer: 'id_sesion' },
    { key: 'dominio_clinico',      label: 'Dominio clínico',       type: 'enum', enum: 'dominio_clinico', required: true },
    { key: 'temporalidad_fase',    label: 'Temporalidad / Fase',   type: 'enum', enum: 'temporalidad_fase', required: true },
    { key: 'antecedente_a',        label: 'Antecedente (A)',       type: 'enum', enum: 'antecedente_a', required: true },
    { key: 'conducta_observada_b', label: 'Conducta observada (B)',type: 'enum', enum: 'conducta_observada_b', required: true },
    { key: 'intervencion_c',       label: 'Intervención (C)',      type: 'enum', enum: 'intervencion_c', required: true },
    { key: 'resultado_c',          label: 'Resultado (C)',         type: 'enum', enum: 'resultado_c', required: true }
  ],

  // 5) [EXTENSIÓN DEMO] Bitácora de automatizaciones (auditoría)
  automation_log: [
    { key: 'id_log',      label: 'ID Log',      type: 'uuid', pk: true },
    { key: 'marca',       label: 'Marca',       type: 'datetime', default: 'now' },
    { key: 'tipo',        label: 'Tipo',        type: 'enum', enum: 'tipo_automatizacion', required: true },
    { key: 'ref_id',      label: 'Referencia',  type: 'string' },
    { key: 'resultado',   label: 'Resultado',   type: 'enum', enum: 'resultado_automatizacion', required: true },
    { key: 'detalle',     label: 'Detalle',     type: 'text' },
    { key: 'enlace',      label: 'Enlace',      type: 'string' }
  ]
};

// -----------------------------------------------------------------------------
// CAPA DE NOMBRES LÓGICOS (robustez ante renombrados)
// -----------------------------------------------------------------------------
var TABLES = {
  MASTER: 'expedientes',
  AGENDA: 'agenda_triaje',
  SESSION: 'sesiones_clinicas',
  MATRIX: 'matriz_actividad_clinica',
  LOG: 'automation_log'
};

var FIELDS = {
  MASTER:  { PK:'id_caso', CEDULA:'cedula_nna', NOMBRE:'nombres_nna', TERAPIAS:'terapias_solicitadas',
             FECHA_INGRESO:'fecha_ingreso', EDAD:'edad', GENERO:'genero_identidad', DIAGNOSTICO:'diagnostico_base',
             EMAIL_REP:'email_representante' },
  AGENDA:  { PK:'id_agenda', FK_MASTER:'id_caso', FECHA_CITA:'fecha_cita', HORA:'hora_cita',
             ESTADO:'estado_cita', AREA:'area_admision', ESPECIALISTA:'medico_especialista', MARCA:'marca_temporal' },
  SESSION: { PK:'id_sesion', FK_MASTER:'id_caso', AREA:'area_intervencion', FECHA:'fecha_sesion' },
  MATRIX:  { PK:'id_evento', FK_SESSION:'id_sesion', ORDEN:'orden_evento', CONDUCTA_B:'conducta_observada_b' }
};

// Área de especialidad -> esquema (hoja) del registro de Nivel 2.
var AREA_SESSION_FORM = {
  psicologia: 'sesiones_clinicas',
  lenguaje: 'sesiones_clinicas',
  terapia_ocupacional: 'sesiones_clinicas'
};

var ARRAY_SEP = '|';

// -----------------------------------------------------------------------------
// CONTROL DE ACCESO (capa secundaria; la principal es el "access" del deploy)
// Session.getActiveUser().getEmail() solo es fiable dentro del mismo dominio
// de Google Workspace; con cuentas Gmail suele devolver cadena vacía.
// -----------------------------------------------------------------------------
var CONTROL_ACCESO_ACTIVO = false;
var USUARIOS_AUTORIZADOS = [
  // 'recepcion@example.org'
];
