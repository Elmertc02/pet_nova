export const qualityMetrics = [
  { label: 'Cumplimiento global', value: '94%', detail: '+6% vs. auditoria anterior' },
  { label: 'No conformidades abiertas', value: '7', detail: '3 criticas priorizadas' },
  { label: 'Lotes liberados', value: '98.2%', detail: 'Base: soplado e inspeccion' },
  { label: 'Trazabilidad documental', value: '100%', detail: 'Fichas, moldes y cambios' },
];

export const clauses = [
  { id: '4', title: 'Contexto', score: 92, owner: 'Direccion', status: 'Controlado' },
  { id: '5', title: 'Liderazgo', score: 96, owner: 'Gerencia', status: 'Solido' },
  { id: '6', title: 'Planificacion', score: 88, owner: 'SGC', status: 'En mejora' },
  { id: '7', title: 'Soporte', score: 91, owner: 'RRHH / Metrologia', status: 'Controlado' },
  { id: '8', title: 'Operacion', score: 95, owner: 'Produccion PET', status: 'Solido' },
  { id: '9', title: 'Evaluacion', score: 90, owner: 'Calidad', status: 'Controlado' },
  { id: '10', title: 'Mejora', score: 86, owner: 'Mejora continua', status: 'En mejora' },
];

export const processFlow = [
  'Recepcion de resina PET',
  'Secado y preforma',
  'Soplado',
  'Inspeccion dimensional',
  'Liberacion de lote',
  'Embalaje y despacho',
];

export const controls = [
  {
    title: 'Control de documentos',
    text: 'Versiones vigentes para fichas tecnicas, etiquetas, parametros de soplado y cambios de molde.',
    tag: 'Clausula 7.5',
  },
  {
    title: 'Gestion de riesgos',
    text: 'Evaluacion de contaminacion, variacion de gramaje, fallas de cierre y desviaciones de color.',
    tag: 'Clausula 6.1',
  },
  {
    title: 'Control operacional',
    text: 'Puntos de inspeccion en peso, capacidad, torque, apariencia, espesor y resistencia.',
    tag: 'Clausula 8.5',
  },
  {
    title: 'Acciones correctivas',
    text: 'Analisis de causa raiz, contencion de lote, verificacion de eficacia y lecciones aprendidas.',
    tag: 'Clausula 10.2',
  },
];

export const risks = [
  { risk: 'Variacion de gramaje', severity: 'Alta', action: 'SPC por cavidad y ajuste de setpoints' },
  { risk: 'Liberacion con ficha obsoleta', severity: 'Critica', action: 'Bloqueo documental y aprobacion digital' },
  { risk: 'Defecto de rosca o tapa', severity: 'Media', action: 'Muestreo AQL y prueba de torque' },
  { risk: 'Contaminacion visual', severity: 'Alta', action: 'Inspeccion luminica y limpieza validada' },
];

export const timeline = [
  { month: 'Ene', event: 'Revision de contexto y partes interesadas' },
  { month: 'Mar', event: 'Auditoria interna de proceso PET' },
  { month: 'Jun', event: 'Calibracion y verificacion metrologica' },
  { month: 'Sep', event: 'Revision por la direccion' },
  { month: 'Nov', event: 'Auditoria externa ISO 9001' },
];
