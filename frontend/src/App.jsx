import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { supabase, supabaseConfigReady } from './supabaseClient.js';
import { preformasDashboardData } from './preformasDashboardData.js';
import QualityRecordHistoryDialog, { QualityRecordReviewDialog } from './QualityRecordHistoryDialog.jsx';
import EtiquetasView from './EtiquetasView.jsx';
import PlanificacionView from './PlanificacionView.jsx';
import EquipoOperativoView from './EquipoOperativoView.jsx';
import ProductosInsumosView from './ProductosInsumosView.jsx';
import ReportesView from './ReportesView.jsx';
import AlmacenProduccionView from './AlmacenProduccionView.jsx';
import { loginLocal, logoutLocal, getLocalSession, localApi } from './localApiClient.js';
import {
  QUALITY_RECORD_STATUS,
  canGenerateQualityCertificate,
  canReviewQualityRecord,
  diffQualitySnapshots,
} from './qualityRecordWorkflow.js';
import {
  buildCertificateRecordFromNewQuality,
  findLinkedQualityTestsRecord,
  validateQualityCertificateData,
} from './newQualityCertificate.js';

// crypto.randomUUID() solo existe en "contextos seguros" (HTTPS o localhost).
// Al abrir la app por la IP de la red local (ej. http://192.168.x.x:5000, sin
// HTTPS) el navegador no lo expone y rompe el login local y todo lo que
// genera ids con esta funcion. Se rellena con un generador RFC4122 v4 basado
// en crypto.getRandomValues, que si esta disponible en contextos no seguros
// (Math.random queda solo como ultimo recurso si ni eso existiera).
if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID !== 'function') {
  window.crypto.randomUUID = function randomUUIDFallback() {
    const bytes = typeof window.crypto.getRandomValues === 'function'
      ? window.crypto.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };
}

const STORAGE_KEY = 'pet-specification-records';
const VISUAL_CONTROL_STORAGE_KEY = 'pet-visual-control-records';
const DELETED_VISUAL_SESSIONS_STORAGE_KEY = 'pet-deleted-visual-session-ids';
const PRODUCTION_FORMATS_STORAGE_KEY = 'pet-production-format-options';
const BOTTLE_FORMATS_STORAGE_KEY = 'pet-bottle-format-options';
const SAVED_VISUAL_REPORTS_STORAGE_KEY = 'pet-saved-visual-reports';
const QUALITY_MANAGEMENT_STORAGE_KEY = 'pet-quality-management-records';
const MEASUREMENT_EQUIPMENT_STORAGE_KEY = 'pet-measurement-equipment-records';
const OPERATOR_PRODUCTION_STORAGE_KEY = 'pet-operator-production-records';
const BLOWER_VARIABLE_CONTROL_STORAGE_KEY = 'pet-blower-variable-control-records';
const BLOWER_PROCESS_VARIABLE_STORAGE_KEY = 'pet-blower-process-variable-records';
const FINISHED_PACKAGE_INSPECTION_STORAGE_KEY = 'pet-finished-package-inspection-records';
const NEW_QUALITY_INSPECTION_STORAGE_KEY = 'pet-new-quality-inspection-records';
const NEW_QUALITY_TESTS_STORAGE_KEY = 'pet-new-quality-tests-records';
const OPERATOR_PRODUCTION_SEM78_SEED_KEY = 'pet-operator-production-sem78-june-2026-seeded';
const AUTH_STORAGE_KEY = 'petnova-authenticated';
const THEME_STORAGE_KEY = 'petnova-theme';
const AUDIT_LOG_STORAGE_KEY = 'petnova-audit-logs';
const DEVICE_ID_STORAGE_KEY = 'petnova-device-id';
const DEFECT_PHOTO_BUCKET = 'defect-photos';
const BOTTLE_ASSET_BUCKET = 'bottle-format-assets';
const ACTIVE_USER_SESSION_TABLE = 'active_user_sessions';
const VISUAL_CONTROL_CODE = 'REG-LAS-CB-03-Rev.0';
const MIN_VISUAL_CONTROLS_PER_SHIFT = 5;
const ACTIVE_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVE_SESSION_HEARTBEAT_MS = 60 * 1000;
const VISUAL_SESSION_STATUS_CONTROLLED = 'Controlado';
const VISUAL_SESSION_STATUS_NO_PRODUCTION = 'Sin produccion';
const VISUAL_NO_PRODUCTION_REASON = 'No se realiza control porque la maquina no esta produciendo.';
const VISUAL_REPORT_PROMPT_ROUND = 4;

const machines = ['SEM78-F', 'SEM63-L', 'SEM66-M', 'SEM106-T', 'SEM139-U', 'SEM50-R', 'SEM99-P', 'SEM48-Q', 'SEM77-S'];
const operatorProductionMachineOptions = [
  { value: 'SEM99-P', label: 'CHINA - 1 - MAQUINA - SEM99 "P"' },
  { value: 'SEM48-Q', label: 'CHINA - 2 - MAQUINA - SEM48 "Q"' },
  { value: 'SEM50-R', label: 'CHINA - 3 - MAQUINA - SEM50 "R"' },
  { value: 'SEM77-S', label: 'CHINA - 4 - MAQUINA - SEM77 "S"' },
  { value: 'SEM106-T', label: 'CHINA - 5 - MAQUINA - SEM106 "T"' },
  { value: 'SEM139-U', label: 'CHINA - 6 - MAQUINA - SEM139 "U"' },
  { value: 'SEM66-M', label: 'MAG PLASTIC SEM 66 "M"' },
  { value: 'SEM63-L', label: 'SIDEL-SBO/4-SEM 63 "L"' },
  { value: 'SEM78-F', label: 'SIDEL-SBO/6 SEM 78 "F"' },
];
const visualResponsibleOptions = ['Leonel Apaza', 'Rafael Gaspar'];
const fallbackProductionFormatOptions = [
  '2L Cristal-3 Vajillero Generico 23.16g',
  '3L Cristal-3 Prolibo 56g',
  '5L Cristal-3 Ola Unilever 93g',
];
const resinBoxOptions = ['JADE CZ 328A', 'JADE CZ 320', 'ECOPET', 'RELPET', 'EASTLON CB'];
const saiCodeReferences = [
  { code: '27113', format: 'BOT. CR DE 330 ML DE 17,5 GR', gramaje: '17.5', color: 'CRISTAL', quantity: '294', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '32805', format: 'BOT-CR-250 CC-MISTER', gramaje: '17.5', color: 'CRISTAL', quantity: '345', client: 'Mister', resin: 'JADE CZ 328A' },
  { code: '36309', format: 'BOT-CR-300 CC LEONEL', gramaje: '17.5', color: 'CRISTAL', quantity: '297', client: 'Leonel', resin: 'JADE CZ 328A' },
  { code: '10346', format: 'BOT-CR-500 CC-20.6 GR-SHORT FINISH - LEONEL', gramaje: '20.6', color: 'CRISTAL', quantity: '340', client: 'Leonel', resin: 'JADE CZ 328A' },
  { code: '7097-100', format: 'BOT-CR-1/2 LT-22 GR-MISIL', gramaje: '22', color: 'CRISTAL', quantity: '350', client: 'Misil', resin: 'ECOPET' },
  { code: '7097-3', format: 'BOT-CR-1/2 LT-22 GR-MISIL', gramaje: '22', color: 'CRISTAL', quantity: '350', client: 'Misil', resin: 'JADE CZ 328A' },
  { code: '13734', format: 'BOT-CR-600 CC-22 GR-ESTRIADAS', gramaje: '22', color: 'CRISTAL', quantity: '304', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '14590', format: 'BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', gramaje: '22', color: 'CRISTAL', quantity: '295', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '14590-100', format: 'BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', gramaje: '22', color: 'CRISTAL', quantity: '295', client: 'Bebidas', resin: 'ECOPET' },
  { code: '14591', format: 'BOT-CR-660 CC-22-G-LISA-AGUA-BEBIDAS S.A', gramaje: '22', color: 'CRISTAL', quantity: '330', client: 'Bebidas', resin: 'JADE CZ 328A' },
  { code: '15649', format: 'BOT-VE-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.', gramaje: '22', color: 'VERDE', quantity: '295', client: 'Bebidas', resin: 'JADE CZ 328A' },
  { code: '32573', format: 'BOT-CR-600 CC - 22 GR - SWIRL', gramaje: '22', color: 'CRISTAL', quantity: '330', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '32692-100', format: 'BOT-CR-500 CC- MISTER', gramaje: '22', color: 'CRISTAL', quantity: '340', client: 'Mister', resin: 'ECOPET' },
  { code: '38226', format: 'BOT-CR-360 CC- ACTIVA', gramaje: '23.1', color: 'CRISTAL', quantity: '213', client: 'Activa', resin: 'JADE CZ 328A' },
  { code: '39326', format: 'BOT-CR-900 CC- 28 GR - GENERICO', gramaje: '28', color: 'CRISTAL', quantity: '238', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '37568', format: 'BOT-CR-1000 CC-31.5 GR-LEONEL', gramaje: '31.5', color: 'CRISTAL', quantity: '208', client: 'Leonel', resin: 'JADE CZ 328A' },
  { code: '38339', format: 'BOT-CR-600 CC-31.5 GR-ACTIVA', gramaje: '31.5', color: 'CRISTAL', quantity: '364', client: 'Activa', resin: 'JADE CZ 328A' },
  { code: '43826', format: 'BOT-CR-3000 CC-54.6 GR SF-LEONEL', gramaje: '54.6', color: 'CRISTAL', quantity: '80', client: 'Leonel', resin: 'JADE CZ 328A' },
  { code: '47269', format: 'BOT-CR-3000 CC-56 GR-LIMONERO', gramaje: '56', color: 'CRISTAL', quantity: '80', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '38481', format: 'BOT-CR-2000 CC 48 GR-VAJILLERO', gramaje: '60', color: 'CRISTAL', quantity: '120', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '13736-100', format: 'BOT-CR-1.5 LTS -37-GR-ONDA GENERICO', gramaje: '37', color: 'CRISTAL', quantity: '161', client: 'Varios', resin: 'ECOPET' },
  { code: '31306', format: 'BOT-CR- 5 LT-SAP;68414057-UNILEVER 93 GR', gramaje: '93', color: 'CRISTAL', quantity: '42', client: 'Gr', resin: 'JADE CZ 328A' },
  { code: '20244-3', format: 'BOT.CR 5.0 LT-93 GR GENERICO', gramaje: '93', color: 'CRISTAL', quantity: '49', client: '', resin: 'JADE CZ 328A' },
  { code: '46493', format: 'BOT-CR-200 CC-20.66 GR-GENERICO LICOR', gramaje: '20.66', color: 'CRISTAL', quantity: '5000', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '40998-3', format: 'BOT-CR-3000 CC-54.6 GR SF-MASIVOS', gramaje: '54.6', color: 'CRISTAL', quantity: '80', client: 'Masivos', resin: 'JADE CZ 328A' },
  { code: '13737', format: 'BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.', gramaje: '48', color: 'CRISTAL', quantity: '126', client: 'Seasa', resin: 'JADE CZ 328A' },
  { code: '13737-100', format: 'BOT-CR-2.000 CC-48-GR-ESTRIADA-BEBIDAS S.A.', gramaje: '48', color: 'CRISTAL', quantity: '126', client: 'Seasa', resin: 'ECOPET' },
  { code: '7200-3', format: 'BOT-CR-3000 CC-56 GR-GENERICO', gramaje: '56', color: 'CRISTAL', quantity: '80', client: 'Varios', resin: 'JADE CZ 328A' },
  { code: '7200-100', format: 'BOT-CR-3000 CC-56 GR-GENERICO', gramaje: '56', color: 'CRISTAL', quantity: '80', client: 'Varios', resin: 'ECOPET' },
];

function normalizeSaiCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function getSaiCodeReference(value, masterFormats = []) {
  const normalizedCode = normalizeSaiCode(value);

  const masterFormat = (masterFormats ?? []).find((format) => normalizeSaiCode(format.saiCode || format.sai_code || format.id) === normalizedCode);

  if (masterFormat) {
    return {
      code: masterFormat.saiCode || masterFormat.sai_code || masterFormat.id,
      format: masterFormat.label || masterFormat.format || '',
      volume: masterFormat.volume || '',
      gramaje: masterFormat.gramaje || '',
      color: masterFormat.color || '',
      quantity: masterFormat.packageQuantity || masterFormat.package_quantity || '',
      client: masterFormat.client || '',
      resin: masterFormat.resin || '',
      technicalFormat: {
        id: masterFormat.id,
        name: masterFormat.label || masterFormat.format || '',
        canonicalLabel: masterFormat.label || masterFormat.format || '',
        imagePath: masterFormat.imagePath || '',
        imageSrc: masterFormat.imageSrc || '',
        productionFormatId: masterFormat.id,
        molds: masterFormat.molds || [],
        specs: masterFormat.specs || {},
        subtitle: masterFormat.subtitle || '',
        accent: masterFormat.accent || '#2457a6',
        height: masterFormat.height || 214,
        shoulder: masterFormat.shoulder || 64,
        body: masterFormat.body || 82,
      },
    };
  }

  return saiCodeReferences.find((reference) => normalizeSaiCode(reference.code) === normalizedCode) ?? null;
}

function getSaiGramColor(reference) {
  return reference ? `${reference.gramaje} - ${reference.color}` : '';
}

function getSaiVolume(reference) {
  if (reference?.volume) {
    return String(reference.volume);
  }

  const format = String(reference?.format ?? '').toUpperCase();
  const ccMatch = format.match(/(\d+(?:[.,]\d+)?)\s*(?:CC|ML)/);
  const ltMatch = format.match(/(\d+(?:[.,]\d+)?)\s*(?:LT|LTS|L\b)/);
  const halfLiterMatch = format.match(/1\/2\s*LT/);

  if (halfLiterMatch) {
    return '500';
  }

  if (ccMatch) {
    return ccMatch[1].replace(',', '.');
  }

  if (ltMatch) {
    const liters = Number(ltMatch[1].replace(',', '.'));
    return Number.isFinite(liters) ? String(liters * 1000) : '';
  }

  return '';
}

const equipmentTypeOptions = ['Balanza', 'Calibrador digital', 'Medidor de espesores', 'Probeta', 'Termometro', 'Medidor de altura', 'Otro'];
const equipmentStatusOptions = ['Activo', 'En calibracion', 'Fuera de servicio'];
const calibrationResultOptions = ['Conforme', 'No conforme', 'Ajustado'];
const equipmentDocumentTypeOptions = ['Ficha tecnica', 'Certificado de calibracion', 'Manual de uso', 'Verificacion interna', 'Mantenimiento', 'Otro'];
const operatorOptions = [
  'Elvis C.',
  'Daniel M.',
  'Grover C.',
  'Esteban P.',
  'Bernardino H.',
  'Marcial O.',
  'Alvaro M.',
  'Roberto M.',
  'Jose Luis M.',
  'Rene P.',
  'Gabriel C.',
  'Wilber C.',
  'Samuel F.',
];

const sem78OperatorProductionSeedRecords = [
  {
    id: 'sem78-2026-06-08-084f-2026',
    date: '2026-06-08',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '06:00',
    endTime: '14:00',
    format: 'BOT-CR-2000 CC-46.66 GR SF - LEONEL',
    opBot: '084F-2026',
    goodBottles: '23200',
    usedTotal: '23613',
    balance: '4348',
    opPerBox: '071I-2023',
    resinPerBox: 'JADE CZ 328A',
    boxNumber: '14,9,35,47',
    fromNumber: '1',
    toNumber: '290',
    totalBags: '290',
    createdAt: '2026-06-08T14:00:00.000Z',
    updatedAt: '2026-06-08T14:00:00.000Z',
  },
  {
    id: 'sem78-2026-06-09-084f-2026',
    date: '2026-06-09',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '07:30',
    endTime: '15:30',
    format: 'BOT-CR-2000 CC-46.66 GR SF - LEONEL',
    opBot: '084F-2026',
    goodBottles: '31040',
    usedTotal: '31516',
    balance: '1000',
    opPerBox: '071I-2023',
    resinPerBox: 'JADE CZ 328A',
    boxNumber: '28,15,40,60',
    fromNumber: '291',
    toNumber: '678',
    totalBags: '388',
    createdAt: '2026-06-09T15:30:00.000Z',
    updatedAt: '2026-06-09T15:30:00.000Z',
  },
  {
    id: 'sem78-2026-06-10-084f-2026-a',
    date: '2026-06-10',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '07:30',
    endTime: '12:55',
    format: 'BOT-CR-2000 CC-46.66 GR SF - LEONEL',
    opBot: '084F-2026',
    goodBottles: '21920',
    usedTotal: '22126',
    balance: '42',
    opPerBox: '071I-2023',
    resinPerBox: 'JADE CZ 328A',
    boxNumber: '39,6,1',
    fromNumber: '679',
    toNumber: '952',
    totalBags: '274',
    createdAt: '2026-06-10T12:55:00.000Z',
    updatedAt: '2026-06-10T12:55:00.000Z',
  },
  {
    id: 'sem78-2026-06-10-085f-2026',
    date: '2026-06-10',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '12:55',
    endTime: '15:30',
    format: 'BOT-CR-3.0 LT-56 GR-LAUVAL',
    opBot: '085F-2026',
    goodBottles: '2880',
    usedTotal: '3082',
    balance: '3918',
    opPerBox: '014H-2025',
    resinPerBox: 'ECOPET',
    boxNumber: '69',
    fromNumber: '1',
    toNumber: '37',
    totalBags: '37',
    createdAt: '2026-06-10T15:30:00.000Z',
    updatedAt: '2026-06-10T15:30:00.000Z',
  },
  {
    id: 'sem78-2026-06-11-085f-2026',
    date: '2026-06-11',
    machine: 'SEM78-F',
    operatorName: 'Rene Poma',
    startTime: '07:30',
    endTime: '09:30',
    format: 'BOT-CR-3.0 LT-56 GR-LAUVAL',
    opBot: '085F-2026',
    goodBottles: '3360',
    usedTotal: '3918',
    balance: '',
    opPerBox: '014H-2025',
    resinPerBox: 'ECOPET',
    boxNumber: '69',
    fromNumber: '38',
    toNumber: '78',
    totalBags: '41',
    createdAt: '2026-06-11T09:30:00.000Z',
    updatedAt: '2026-06-11T09:30:00.000Z',
  },
  {
    id: 'sem78-2026-06-15-086f-2026',
    date: '2026-06-15',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '07:30',
    endTime: '15:30',
    format: 'BOT-CR-3.0 LT-56 GR-GENERICO',
    opBot: '086F-2026',
    goodBottles: '9680',
    usedTotal: '10487',
    balance: '3487',
    opPerBox: '063TH-2025',
    resinPerBox: 'ECOPET',
    boxNumber: '11.2',
    fromNumber: '1',
    toNumber: '121',
    totalBags: '121',
    createdAt: '2026-06-15T15:30:00.000Z',
    updatedAt: '2026-06-15T15:30:00.000Z',
  },
  {
    id: 'sem78-2026-06-16-086f-2026',
    date: '2026-06-16',
    machine: 'SEM78-F',
    operatorName: 'Jose L. Mamani',
    startTime: '07:30',
    endTime: '15:30',
    format: 'BOT-CR-3.0 LT-56 GR-GENERICO',
    opBot: '086F-2026',
    goodBottles: '20240',
    usedTotal: '20439',
    balance: '4059',
    opPerBox: '063TH-2025',
    resinPerBox: 'ECOPET',
    boxNumber: '13,17,14',
    fromNumber: '122',
    toNumber: '374',
    totalBags: '253',
    createdAt: '2026-06-16T15:30:00.000Z',
    updatedAt: '2026-06-16T15:30:00.000Z',
  },
];

const visualDefectCategories = ['Menor', 'Mayor', 'Critico'];

const materialDistributionZones = [
  'Cuello / rosca',
  'Hombro',
  'Cuerpo',
  'Panel de etiqueta',
  'Base',
  'Fondo / petaloide',
  'Toda la botella',
  'Otro',
];

const bagDefectOptions = [
  'Bolsa rota',
  'Bolsa sucia',
  'Mal sellada',
  'Sin identificacion',
  'Humedad',
  'Cantidad incorrecta',
  'Otro',
];

const complaintSeverityOptions = ['Menor', 'Mayor', 'Critico'];
const complaintStatusOptions = ['Abierto', 'En seguimiento', 'Accion correctiva', 'Cerrado'];
const complaintSourceOptions = ['Cliente', 'Correo / Excel', 'Produccion', 'Calidad', 'Despacho', 'Otro'];
const correctiveActionStatusOptions = ['Pendiente', 'En ejecucion', 'Verificacion de eficacia', 'Cerrada'];
const themeOptions = ['light', 'dark'];
const documentTypeOptions = ['Procedimiento', 'Instructivo', 'Registro', 'Politica', 'Manual'];
const documentFormatTemplates = [
  {
    id: 'registro-calidad-letter',
    type: 'Registro',
    code: 'REG-LAS-01',
    title: 'Registro de inspeccion y control',
    description: 'Formato carta para registros operativos con datos, tablas de control, observaciones y firma.',
  },
  {
    id: 'instructivo-trabajo-letter',
    type: 'Instructivo',
    code: 'ITR-XXX-00',
    title: 'Instructivo de trabajo',
    description: 'Formato carta para instrucciones con objetivo, responsable, frecuencia, actividades, metodos y firmas.',
  },
  {
    id: 'procedimiento-sgc-letter',
    type: 'Procedimiento',
    code: 'PRO-SGC-00',
    title: 'Procedimiento del sistema',
    description: 'Formato carta para procedimientos con alcance, responsabilidades, desarrollo, registros y aprobaciones.',
  },
];
const documentCreationCopy = {
  Registro: {
    heading: 'Crear registro',
    objective: 'Uso del registro',
    objectivePlaceholder: 'Ej. Registrar y conservar evidencia del control realizado.',
    scope: 'Aplicacion',
    responsibilities: 'Responsable del llenado',
    steps: 'Campos / instrucciones de llenado',
    records: 'Conservacion / archivo',
    submit: 'Crear registro',
  },
  Procedimiento: {
    heading: 'Crear procedimiento',
    objective: 'Objetivo',
    objectivePlaceholder: 'Ej. Definir el metodo de trabajo y criterios de control.',
    scope: 'Alcance',
    responsibilities: 'Responsabilidades',
    steps: 'Desarrollo del procedimiento',
    records: 'Registros asociados',
    submit: 'Crear procedimiento',
  },
  Instructivo: {
    heading: 'Crear instructivo',
    objective: 'Objetivo del instructivo',
    objectivePlaceholder: 'Ej. Describir los pasos para ejecutar una actividad especifica.',
    scope: 'Frecuencia',
    responsibilities: 'Responsable de ejecucion',
    steps: 'Instrucciones paso a paso',
    records: 'Evidencia / registros',
    submit: 'Crear instructivo',
  },
};
const userRoleLabels = {
  admin: 'Administrador',
  calidad: 'Control de calidad',
  lectura: 'Solo lectura',
};

const productionPlanningItems = [
  {
    title: 'Plan de produccion',
    text: 'Organiza formatos, maquinas, prioridades y responsables antes de liberar cada turno.',
  },
  {
    title: 'Ordenes programadas',
    text: 'Centraliza las ordenes pendientes, cambios de formato y observaciones de capacidad.',
  },
  {
    title: 'Seguimiento del turno',
    text: 'Permite revisar el avance de produccion y registrar novedades por maquina.',
  },
];

const maintenanceItems = [
  {
    title: 'Mantenimiento preventivo',
    text: 'Programa revisiones, limpieza, lubricacion y verificaciones criticas de equipos.',
  },
  {
    title: 'Correctivos de maquina',
    text: 'Registra paradas, causa probable, responsable y estado de cierre de cada intervencion.',
  },
  {
    title: 'Historial tecnico',
    text: 'Conserva la trazabilidad de trabajos realizados para apoyar decisiones de mantenimiento.',
  },
];

const inventoryItems = [
  {
    title: 'Inventario de producto',
    text: 'Controla entradas, salidas, stock disponible y ubicacion de producto terminado.',
  },
  {
    title: 'Inventario de insumos',
    text: 'Da seguimiento a resina, bolsas, etiquetas y materiales requeridos por produccion.',
  },
  {
    title: 'Alertas de stock',
    text: 'Identifica niveles minimos para evitar quiebres antes de iniciar una orden.',
  },
];

const dispatchItems = [
  {
    title: 'Despachos programados',
    text: 'Organiza pedidos, clientes, fechas de entrega y responsables de carga.',
  },
  {
    title: 'Liberacion para despacho',
    text: 'Vincula controles de calidad y autorizaciones antes de enviar producto.',
  },
  {
    title: 'Trazabilidad de salida',
    text: 'Registra lote, cantidad, transporte y evidencia de entrega.',
  },
];

const administrationItems = [
  {
    title: 'Usuarios y permisos',
    text: 'Gestiona accesos, responsables y roles para mantener control del sistema.',
  },
  {
    title: 'Documentos administrativos',
    text: 'Agrupa registros, reportes y documentos internos que respaldan la operacion.',
  },
  {
    title: 'Configuracion general',
    text: 'Mantiene parametros de la planta, listas maestras y ajustes del sistema.',
  },
];

const dashboardKpis = {
  production: {
    label: 'Produccion',
    unit: '%',
    color: '#087d7d',
    values: [88, 91, 94, 90, 96, 93, 97],
  },
  quality: {
    label: 'Calidad',
    unit: '%',
    color: '#2457a6',
    values: [96, 97, 98, 95, 99, 98, 99],
  },
  warehouse: {
    label: 'Almacen',
    unit: '%',
    color: '#3b8d5a',
    values: [82, 86, 84, 89, 91, 88, 92],
  },
  maintenance: {
    label: 'Mantenimiento',
    unit: '%',
    color: '#c98518',
    values: [78, 83, 86, 84, 88, 90, 87],
  },
};

const dashboardDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Hoy'];

// ── Produccion por dia real (Dashboard) ──────────────────────────────────
// A diferencia del resto del dashboard (todavia con datos de referencia),
// "Produccion por dia" se calcula de verdad: cuanto se reporto realmente
// en Reportes diarios ese dia contra cuanto tenia planificado Planificacion
// para ese dia (sumando todas las maquinas), para los ultimos 7 dias
// (terminando hoy).
const DASHBOARD_DIAS_ABR = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function dashboardFechaLocalISO(date) {
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
}

function dashboardUltimosDias(n) {
  const hoy = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    out.push({ fecha: dashboardFechaLocalISO(d), label: i === 0 ? 'Hoy' : DASHBOARD_DIAS_ABR[d.getDay()] });
  }
  return out;
}

// Indice 0 (domingo del plan) .. 6 (sabado) de que dia de la semana del
// plan es "fechaISO", o null si esta fuera de esa semana.
function dashboardDiaIdxEnPlan(fechaDomingoISO, fechaISO) {
  const domingo = new Date(`${fechaDomingoISO}T00:00:00`);
  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(domingo.getTime()) || Number.isNaN(fecha.getTime())) return null;
  const diff = Math.round((fecha - domingo) / 86400000);
  return diff >= 0 && diff <= 6 ? diff : null;
}

// Real (suma de botBuenas reportado ese dia, todas las maquinas) vs
// planificado (suma de lo que Planificacion tenia repartido para ese dia,
// todas las maquinas/planes vigentes esa semana) por cada dia pedido.
function dashboardCalcularProduccionReal(planes, reportes, dias) {
  return dias.map(({ fecha, label }) => {
    const real = reportes
      .filter((r) => r.fecha === fecha)
      .reduce((sum, r) => sum + (Number(r.botBuenas) || 0), 0);
    let planificado = 0;
    planes.forEach((p) => {
      if (!p.fecha) return;
      const idx = dashboardDiaIdxEnPlan(p.fecha, fecha);
      if (idx == null) return;
      const d = p.datos || {};
      planificado += d.esPar
        ? (Number(d.diasTotales78?.[idx]) || 0) + (Number(d.diasTotales63?.[idx]) || 0)
        : (Number(d.diasTotales?.[idx]) || 0);
    });
    const pct = planificado > 0 ? Math.round((real / planificado) * 100) : (real > 0 ? 100 : 0);
    return { fecha, label, real, planificado, pct };
  });
}

// "Produccion por maquina": mismo cruce real-vs-planificado que arriba,
// pero agrupado por maquina en vez de por dia (mismos ultimos 7 dias). Los
// planes de SEM 63/78 (esPar) se reparten en sus dos sub-maquinas reales
// ("SEM 78"/"SEM 63") porque asi es como quedan archivados los reportes.
function dashboardCalcularProduccionPorMaquina(planes, reportes, dias) {
  const porMaquina = new Map();
  const sumarPlanificado = (maquina, cantidad) => {
    if (!maquina || !cantidad) return;
    const cur = porMaquina.get(maquina) || { real: 0, planificado: 0 };
    cur.planificado += cantidad;
    porMaquina.set(maquina, cur);
  };

  dias.forEach(({ fecha }) => {
    planes.forEach((p) => {
      if (!p.fecha) return;
      const idx = dashboardDiaIdxEnPlan(p.fecha, fecha);
      if (idx == null) return;
      const d = p.datos || {};
      if (d.esPar) {
        sumarPlanificado('SEM 78', Number(d.diasTotales78?.[idx]) || 0);
        sumarPlanificado('SEM 63', Number(d.diasTotales63?.[idx]) || 0);
      } else {
        sumarPlanificado(p.maquina, Number(d.diasTotales?.[idx]) || 0);
      }
    });
  });

  const diasSet = new Set(dias.map((d) => d.fecha));
  reportes.forEach((r) => {
    if (!diasSet.has(r.fecha) || !r.maquina) return;
    const cur = porMaquina.get(r.maquina) || { real: 0, planificado: 0 };
    cur.real += Number(r.botBuenas) || 0;
    porMaquina.set(r.maquina, cur);
  });

  return Array.from(porMaquina.entries())
    .filter(([, v]) => v.real > 0 || v.planificado > 0)
    .map(([maquina, v]) => ({
      label: maquina,
      value: v.planificado > 0 ? Math.min(100, Math.round((v.real / v.planificado) * 100)) : (v.real > 0 ? 100 : 0),
      detail: `${v.real.toLocaleString()} botellas`,
      real: v.real,
      planificado: v.planificado,
    }))
    .sort((a, b) => b.real - a.real)
    .slice(0, 8);
}

const dashboardAreaStatus = [
  { area: 'Produccion', value: 94, detail: 'Ordenes cumplidas', tone: 'green' },
  { area: 'Calidad', value: 98, detail: 'Lotes conformes', tone: 'blue' },
  { area: 'Almacen', value: 89, detail: 'Despachos a tiempo', tone: 'teal' },
  { area: 'Mantenimiento', value: 86, detail: 'Preventivos cerrados', tone: 'amber' },
];

const dashboardPriorities = [
  { title: 'SEM99-P requiere seguimiento', text: 'Se detectaron 2 observaciones visuales menores esta semana.', status: 'Atencion' },
  { title: 'Inventario de bolsas cerca del minimo', text: 'Stock estimado para 4 dias de produccion.', status: 'Revisar' },
  { title: 'Despachos dentro de plan', text: '92% de cumplimiento acumulado en la semana.', status: 'Bien' },
];

const dashboardMonthlyTrend = [
  { month: 'Ene', value: 89 },
  { month: 'Feb', value: 91 },
  { month: 'Mar', value: 92 },
  { month: 'Abr', value: 94 },
  { month: 'May', value: 95 },
  { month: 'Jun', value: 96 },
];

const dashboardMachineOutput = [
  { label: 'SEM78-F', value: 96, detail: '24.800 botellas' },
  { label: 'SEM63-L', value: 88, detail: '19.200 botellas' },
  { label: 'SEM66-M', value: 91, detail: '21.500 botellas' },
  { label: 'SEM106-T', value: 84, detail: '17.600 botellas' },
  { label: 'SEM139-U', value: 98, detail: '28.100 botellas' },
  { label: 'SEM99-P', value: 76, detail: '15.900 botellas' },
];

const dashboardDefectMix = [
  { label: 'Menor', value: 8, color: '#c98518' },
  { label: 'Mayor', value: 3, color: '#b9574f' },
  { label: 'Critico', value: 1, color: '#7b2f3f' },
  { label: 'Sin defecto', value: 88, color: '#3b8d5a' },
];

const dashboardShiftCompliance = [
  { label: 'Turno A', production: 95, quality: 99, dispatch: 91 },
  { label: 'Turno B', production: 90, quality: 97, dispatch: 88 },
  { label: 'Turno C', production: 87, quality: 96, dispatch: 84 },
];

const dashboardWarehouseCoverage = [
  { item: 'Resina virgen', days: 12, value: 86 },
  { item: 'Ecopet', days: 8, value: 62 },
  { item: 'Bolsas', days: 4, value: 38 },
  { item: 'Etiquetas', days: 10, value: 74 },
];

const viewIds = [
  'dashboard',
  'etiquetas',
  'produccion-planificacion',
  'produccion-reportes',
  'produccion-almacen',
  'produccion-equipo',
  'produccion-productos',
  'produccion-mantenimiento',
  'almacen-inventario',
  'almacen-despachos',
  'administracion',
  'especificaciones-tecnicas',
  'controles-visuales',
  'base-visual',
  'equipos-medicion',
  'registro-operadores',
  'control-variables-sopladora',
  'administrar-formatos',
  'defectos-encontrados',
  'reportes-guardados',
  'auditoria',
  'sgc-reclamos',
  'sgc-documentos',
  'sgc-seguimiento',
  'sgc-acciones-correctivas',
  'base-datos',
];
const qualityControlViewIds = [
  'especificaciones-tecnicas',
  'controles-visuales',
  'base-visual',
  'equipos-medicion',
  'registro-operadores',
  'control-variables-sopladora',
  'defectos-encontrados',
  'reportes-guardados',
];

const measurementGroups = [
  {
    title: 'PESO',
    fields: [{ key: 'pesoVacia', label: 'Peso de botella vacia (g)' }],
  },
  {
    title: 'VOLUMEN DE LLENADO',
    fields: [{ key: 'concavidad', label: 'Concavidad (mm)' }],
  },
  {
    title: 'DIMENSIONES DE LA BOTELLA',
    fields: [
      { key: 'alturaTotal', label: 'Altura total (mm)' },
      { key: 'diametroSuperior', label: 'Diametro mayor superior (mm)' },
      { key: 'diametroInferior', label: 'Diametro mayor inferior (mm)' },
    ],
  },
  {
    title: 'ESPESORES',
    fields: [
      { key: 'e1', label: 'E-1 (1 cm alrededor del punto) (mm)' },
      { key: 'e2', label: 'E-2 (Base) (mm)' },
      { key: 'e3', label: 'E-3 (Diametro mayor inferior) (mm)' },
      { key: 'e4', label: 'E-4 (Panel etiqueta) (mm)' },
      { key: 'e5', label: 'E-5 (Diametro mayor superior) (mm)' },
      { key: 'e6', label: 'E-6 (Curvatura hombro) (mm)' },
    ],
  },
  {
    title: 'ALTURA DE LLENADO',
    fields: [{ key: 'alturaLlenado', label: 'Altura de llenado (mm)' }],
  },
  {
    title: 'FINISHED',
    fields: [
      { key: 'diametroInterno', label: 'Diametro interno (mm)' },
      { key: 'diametroExterno', label: 'Diametro externo (mm)' },
      { key: 'diametroRoturaBanda', label: 'Diametro de rotura de banda (mm)' },
      { key: 'diametroAnillaSoporte', label: 'Diametro anilla de soporte (mm)' },
    ],
  },
  {
    title: 'PRUEBA DE CAIDA',
    fields: [{ key: 'pruebaCaida', label: 'Prueba de caida', type: 'text', placeholder: 'Sin fugas / Conforme' }],
  },
];

const emptyMeasurements = measurementGroups
  .flatMap((group) => group.fields)
  .reduce((values, field) => ({ ...values, [field.key]: '' }), {});

const emptyCertificateDetails = {
  lote: '',
  ordenProduccion: '',
  resinaUtilizada: '',
};

const resinRecipes = ['100% JADE CZ - 302', '70% JADE CZ-328A + 30% ECOPET (PET-PCR)', '100% Ecopet'];

const measurementFields = measurementGroups.flatMap((group) => group.fields);
const technicalSpecificationSampleGroups = measurementGroups
  .filter((group) => !['VOLUMEN DE LLENADO', 'FINISHED', 'PRUEBA DE CAIDA'].includes(group.title))
  .map((group) => ({
    ...group,
    fields: group.fields.filter((field) => field.type !== 'text'),
  }))
  .filter((group) => group.fields.length > 0);
const technicalSpecificationSampleFields = technicalSpecificationSampleGroups.flatMap((group) => group.fields);
const MAX_REVIEW_PHOTOS = 3;

function getToday() {
  return new Date().toLocaleDateString('en-CA');
}

function formatControlTime(value) {
  if (!value) {
    return 'En curso';
  }

  return new Date(value).toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatControlDate(value, fallbackDate = '') {
  if (!value) {
    return fallbackDate || 'Sin fecha';
  }

  return new Date(value).toLocaleDateString('es-BO');
}

function toDatetimeLocalValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function createVisualReview() {
  return {
    id: crypto.randomUUID(),
    checkedAt: new Date().toISOString(),
    defectStatus: 'Conforme',
    defectComment: '',
    defects: [],
    otherDefect: '',
    photoName: '',
    photoPath: '',
    photoDataUrl: '',
    photoNames: [],
    photoPaths: [],
    photoDataUrls: [],
    distribution: 'Pendiente',
    distributionComment: '',
    materialZones: [],
    materialOtherZone: '',
    bagStatus: 'Pendiente',
    bagComment: '',
    bagDefects: [],
    bagOtherDefect: '',
    bagPhotoName: '',
    bagPhotoPath: '',
    bagPhotoDataUrl: '',
    bagPhotoNames: [],
    bagPhotoPaths: [],
    bagPhotoDataUrls: [],
  };
}

function uniqueNonEmpty(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function uniqueById(values) {
  return Array.from(
    new Map((values ?? []).filter((value) => value?.id).map((value) => [value.id, value])).values(),
  );
}

function uniqueProductionFormatsByIdentity(values) {
  const formatsByIdentity = new Map();

  (values ?? []).forEach((format) => {
    const label = String(format?.label ?? '').trim().replace(/\s+/g, ' ');
    const identityKey = getFormatIdentityKey(label);

    if (!label || !identityKey) {
      return;
    }

    const existingFormat = formatsByIdentity.get(identityKey);
    const nextFormat = {
      ...(existingFormat ?? {}),
      ...format,
      id: existingFormat?.id ?? format.id ?? createStableTextId('production-format', label),
      label,
      imagePath: format.imagePath || existingFormat?.imagePath || '',
      imageSrc: format.imageSrc || existingFormat?.imageSrc || '',
    };

    formatsByIdentity.set(identityKey, nextFormat);
  });

  return Array.from(formatsByIdentity.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function normalizePhotoList(primaryValue, listValue) {
  return uniqueNonEmpty([
    ...(Array.isArray(listValue) ? listValue : []),
    primaryValue,
  ]);
}

function getReviewVisualPhotoUrls(review) {
  return normalizePhotoList(review.photoDataUrl, review.photoDataUrls);
}

function getReviewBagPhotoUrls(review) {
  return normalizePhotoList(review.bagPhotoDataUrl, review.bagPhotoDataUrls);
}

function getReviewPhotoItems(review) {
  return [
    ...getReviewVisualPhotoUrls(review).map((src, index) => ({ src, label: `Defecto ${index + 1}`, target: 'visual', index })),
    ...getReviewBagPhotoUrls(review).map((src, index) => ({ src, label: `Bolsa ${index + 1}`, target: 'bag', index })),
  ];
}

function normalizeNewQualityEvidencePhotos(photos = []) {
  return Array.isArray(photos)
    ? photos
      .map((photo) => ({
        id: photo.id || crypto.randomUUID(),
        section: photo.section ?? '',
        label: photo.label ?? 'Evidencia',
        name: photo.name ?? '',
        path: photo.path ?? '',
        dataUrl: photo.dataUrl ?? photo.src ?? '',
        takenAt: photo.takenAt ?? new Date().toISOString(),
      }))
      .filter((photo) => photo.dataUrl || photo.path)
    : [];
}

function getNewQualityEvidencePhotoUrls(record) {
  return normalizeNewQualityEvidencePhotos(record.evidencePhotos).map((photo) => photo.dataUrl).filter(Boolean);
}

function appendNewQualityEvidencePhoto(photos, photo) {
  return [
    ...normalizeNewQualityEvidencePhotos(photos),
    {
      id: crypto.randomUUID(),
      ...photo,
      takenAt: photo.takenAt || new Date().toISOString(),
    },
  ].slice(0, MAX_REVIEW_PHOTOS);
}

function removeNewQualityEvidencePhoto(photos, photoId) {
  return normalizeNewQualityEvidencePhotos(photos).filter((photo) => photo.id !== photoId);
}

function needsNonConformityDetails(value) {
  return value !== 'Pendiente' && value !== 'Conforme';
}

function getReviewDefectSummary(review) {
  if (review.defectStatus === 'Conforme') {
    return '-';
  }

  const defects = review.defects ?? [];

  if (defects.length === 0) {
    return 'No especificado';
  }

  const category = defects[0];
  return review.otherDefect ? `${category}: ${review.otherDefect}` : category;
}

function getMaterialZoneSummary(review) {
  if (!needsNonConformityDetails(review.distribution)) {
    return '-';
  }

  const zones = review.materialZones ?? [];

  if (zones.length === 0) {
    return 'No especificado';
  }

  return zones
    .map((zone) => (zone === 'Otro' && review.materialOtherZone ? `Otro: ${review.materialOtherZone}` : zone))
    .join(', ');
}

function getBagDefectSummary(review) {
  if (!needsNonConformityDetails(review.bagStatus)) {
    return '-';
  }

  const defects = review.bagDefects ?? [];

  if (defects.length === 0) {
    return 'No especificado';
  }

  return defects
    .map((defect) => (defect === 'Otro' && review.bagOtherDefect ? `Otro: ${review.bagOtherDefect}` : defect))
    .join(', ');
}

function getReviewCommentSummary(review) {
  return [
    review.defectComment && `Visual: ${review.defectComment}`,
    review.distributionComment && `Material: ${review.distributionComment}`,
    review.bagComment && `Bolsa: ${review.bagComment}`,
  ].filter(Boolean).join(' | ');
}

function getVisualFindingSummary(session) {
  if (session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION) {
    return session.skipReason || VISUAL_NO_PRODUCTION_REASON;
  }

  const reviewSummaries = (session.reviews ?? []).flatMap((review) => {
    const findings = [];

    if (review.defectStatus === 'No conforme') {
      findings.push(`Visual: ${getReviewDefectSummary(review)}`);
    }

    if (needsNonConformityDetails(review.distribution)) {
      findings.push(`Material: ${getMaterialZoneSummary(review)}`);
    }

    if (needsNonConformityDetails(review.bagStatus)) {
      findings.push(`Bolsa: ${getBagDefectSummary(review)}`);
    }

    const comments = getReviewCommentSummary(review);

    if (comments) {
      findings.push(comments);
    }

    return findings;
  });

  return reviewSummaries.length > 0 ? reviewSummaries.join(' | ') : 'Sin hallazgos';
}

function hasVisualNonConformity(session) {
  return (session.reviews ?? []).some((review) => (
    review.defectStatus === 'No conforme'
    || needsNonConformityDetails(review.distribution)
    || needsNonConformityDetails(review.bagStatus)
  ));
}

function getVisualSessionDisplayStatus(session) {
  if (session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION) {
    return 'Sin produccion';
  }

  if (!session.endedAt) {
    return 'En curso';
  }

  return hasVisualNonConformity(session) ? 'Revisar' : 'Conforme';
}

function groupVisualSessionsByRound(sessions) {
  const groups = sessions.reduce((rounds, session) => {
    const cycleNumber = Number(session.cycleNumber ?? 1);
    const currentRound = rounds[cycleNumber] ?? { cycleNumber, sessions: [] };

    return {
      ...rounds,
      [cycleNumber]: {
        ...currentRound,
        sessions: [...currentRound.sessions, session],
      },
    };
  }, {});

  return Object.values(groups).sort((a, b) => b.cycleNumber - a.cycleNumber);
}

function getRoundResponsible(sessions) {
  return sessions.find((session) => session.responsible)?.responsible ?? '';
}

function normalizeVisualSession(session) {
  const legacyReview = session.controls
    ? {
        id: crypto.randomUUID(),
        checkedAt: session.startedAt ?? new Date().toISOString(),
        defectStatus: session.controls['Defectos visuales'] === 'Conforme' ? 'Conforme' : 'No conforme',
        defectComment: '',
        defects: [],
        otherDefect: '',
        photoName: '',
        photoPath: '',
        photoDataUrl: '',
        photoNames: [],
        photoPaths: [],
        photoDataUrls: [],
        distribution: session.controls['Distribucion del material'] ?? 'Pendiente',
        distributionComment: '',
        materialZones: [],
        materialOtherZone: '',
        bagStatus: session.controls['Estado de bolsa'] ?? 'Pendiente',
        bagComment: '',
        bagDefects: [],
        bagOtherDefect: '',
        bagPhotoName: '',
        bagPhotoPath: '',
        bagPhotoDataUrl: '',
        bagPhotoNames: [],
        bagPhotoPaths: [],
        bagPhotoDataUrls: [],
      }
    : null;

  return {
    ...session,
    cycleNumber: Number(session.cycleNumber ?? session.cycle_number ?? 1),
    status: session.status ?? session.sessionStatus ?? session.session_status ?? VISUAL_SESSION_STATUS_CONTROLLED,
    skipReason: session.skipReason ?? session.skip_reason ?? '',
    productionFormat: session.productionFormat ?? session.product_format ?? '',
    operatorName: session.operatorName ?? session.operator_name ?? '',
    reviews: Array.isArray(session.reviews)
      ? session.reviews.map((review) => ({
          ...review,
          defectStatus: review.defectStatus ?? 'Conforme',
          defectComment: review.defectComment ?? review.defect_comment ?? '',
          defects: review.defects ?? [],
          otherDefect: review.otherDefect ?? '',
          photoName: review.photoName ?? '',
          photoPath: review.photoPath ?? '',
          photoDataUrl: review.photoDataUrl ?? '',
          photoNames: normalizePhotoList(review.photoName, review.photoNames),
          photoPaths: normalizePhotoList(review.photoPath, review.photoPaths),
          photoDataUrls: normalizePhotoList(review.photoDataUrl, review.photoDataUrls),
          distribution: review.distribution ?? 'Pendiente',
          distributionComment: review.distributionComment ?? review.distribution_comment ?? '',
          materialZones: review.materialZones ?? [],
          materialOtherZone: review.materialOtherZone ?? '',
          bagStatus: review.bagStatus ?? 'Pendiente',
          bagComment: review.bagComment ?? review.bag_comment ?? '',
          bagDefects: review.bagDefects ?? [],
          bagOtherDefect: review.bagOtherDefect ?? '',
          bagPhotoName: review.bagPhotoName ?? '',
          bagPhotoPath: review.bagPhotoPath ?? '',
          bagPhotoDataUrl: review.bagPhotoDataUrl ?? '',
          bagPhotoNames: normalizePhotoList(review.bagPhotoName, review.bagPhotoNames),
          bagPhotoPaths: normalizePhotoList(review.bagPhotoPath, review.bagPhotoPaths),
          bagPhotoDataUrls: normalizePhotoList(review.bagPhotoDataUrl, review.bagPhotoDataUrls),
        }))
      : legacyReview ? [legacyReview] : [],
  };
}

function sanitizeStorageName(name) {
  return String(name || 'foto.jpg')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-');
}

function createStableTextId(prefix, value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${prefix}-${slug || crypto.randomUUID()}`;
}

async function uploadDefectPhoto(userId, dataUrl, photoName) {
  if (!userId || !dataUrl) {
    return '';
  }

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const safeName = sanitizeStorageName(photoName);
    const path = `${userId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(DEFECT_PHOTO_BUCKET)
      .upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.error('No se pudo guardar la foto en Supabase:', error);
      return '';
    }

    return path;
  } catch (error) {
    console.error('No se pudo preparar la foto:', error);
    return '';
  }
}

async function getDefectPhotoUrl(path) {
  if (!path) {
    return '';
  }

  const { data, error } = await supabase.storage
    .from(DEFECT_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.error('No se pudo cargar la foto guardada:', error);
    return '';
  }

  return data?.signedUrl ?? '';
}

function getFileNameFromPath(path) {
  return path ? path.split('/').pop() : '';
}

async function mapSupabaseReview(row) {
  const photoPaths = normalizePhotoList(row.photo_path, row.defect_photo_paths);
  const bagPhotoPaths = normalizePhotoList(row.bag_photo_path, row.bag_photo_paths);
  const [photoDataUrls, bagPhotoDataUrls] = await Promise.all([
    Promise.all(photoPaths.map(getDefectPhotoUrl)),
    Promise.all(bagPhotoPaths.map(getDefectPhotoUrl)),
  ]);
  const validPhotoDataUrls = photoDataUrls.filter(Boolean);
  const validBagPhotoDataUrls = bagPhotoDataUrls.filter(Boolean);

  return {
    id: row.id,
    sessionId: row.session_id,
    checkedAt: row.checked_at,
    defectStatus: row.defect_status ?? 'Conforme',
    defectComment: row.defect_comment ?? '',
    defects: row.defects ?? [],
    otherDefect: row.other_defect ?? '',
    photoName: getFileNameFromPath(photoPaths[0]),
    photoPath: photoPaths[0] ?? '',
    photoDataUrl: validPhotoDataUrls[0] ?? '',
    photoNames: photoPaths.map(getFileNameFromPath),
    photoPaths,
    photoDataUrls: validPhotoDataUrls,
    distribution: row.distribution ?? 'Pendiente',
    distributionComment: row.distribution_comment ?? '',
    materialZones: row.material_zones ?? [],
    materialOtherZone: row.material_other_zone ?? '',
    bagStatus: row.bag_status ?? 'Pendiente',
    bagComment: row.bag_comment ?? '',
    bagDefects: row.bag_defects ?? [],
    bagOtherDefect: row.bag_other_defect ?? '',
    bagPhotoName: getFileNameFromPath(bagPhotoPaths[0]),
    bagPhotoPath: bagPhotoPaths[0] ?? '',
    bagPhotoDataUrl: validBagPhotoDataUrls[0] ?? '',
    bagPhotoNames: bagPhotoPaths.map(getFileNameFromPath),
    bagPhotoPaths,
    bagPhotoDataUrls: validBagPhotoDataUrls,
  };
}

function mapSupabaseSession(row, reviews) {
  return normalizeVisualSession({
    id: row.id,
    userId: row.user_id,
    responsible: row.responsible ?? '',
    machine: row.machine,
    productionFormat: row.product_format ?? '',
    operatorName: row.operator_name ?? '',
    cycleNumber: row.cycle_number ?? 1,
    status: row.session_status ?? VISUAL_SESSION_STATUS_CONTROLLED,
    skipReason: row.skip_reason ?? '',
    date: row.control_date,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? '',
    reviews,
  });
}

function getVisualSessionPayload(session, userId) {
  return {
    id: session.id,
    user_id: userId,
    responsible: session.responsible ?? '',
    machine: session.machine,
    product_format: session.productionFormat ?? '',
    operator_name: session.operatorName ?? '',
    cycle_number: session.cycleNumber ?? 1,
    session_status: session.status ?? VISUAL_SESSION_STATUS_CONTROLLED,
    skip_reason: session.skipReason ?? '',
    control_date: session.date,
    started_at: session.startedAt,
    ended_at: session.endedAt || null,
    updated_at: new Date().toISOString(),
  };
}

function getVisualReviewPayload(review, sessionId, userId, { includePhotoLists = true, includeComments = true } = {}) {
  const photoPaths = normalizePhotoList(review.photoPath, review.photoPaths);
  const bagPhotoPaths = normalizePhotoList(review.bagPhotoPath, review.bagPhotoPaths);

  const payload = {
    id: review.id,
    session_id: sessionId,
    user_id: userId,
    checked_at: review.checkedAt,
    defect_status: review.defectStatus ?? 'Conforme',
    defects: review.defects ?? [],
    other_defect: review.otherDefect ?? '',
    photo_path: photoPaths[0] ?? '',
    distribution: review.distribution ?? 'Pendiente',
    material_zones: review.materialZones ?? [],
    material_other_zone: review.materialOtherZone ?? '',
    bag_status: review.bagStatus ?? 'Pendiente',
    bag_defects: review.bagDefects ?? [],
    bag_other_defect: review.bagOtherDefect ?? '',
    bag_photo_path: bagPhotoPaths[0] ?? '',
    updated_at: new Date().toISOString(),
  };

  if (includeComments) {
    payload.defect_comment = review.defectComment ?? '';
    payload.distribution_comment = review.distributionComment ?? '';
    payload.bag_comment = review.bagComment ?? '';
  }

  if (includePhotoLists) {
    payload.defect_photo_paths = photoPaths;
    payload.bag_photo_paths = bagPhotoPaths;
  }

  return payload;
}

function isMissingVisualReviewOptionalColumnError(error) {
  const message = String(error?.message ?? '');

  return [
    'defect_comment',
    'distribution_comment',
    'bag_comment',
    'defect_photo_paths',
    'bag_photo_paths',
  ].some((column) => message.includes(column));
}

async function upsertVisualReview(review, sessionId, userId) {
  const { error } = await supabase
    .from('visual_control_reviews')
    .upsert(getVisualReviewPayload(review, sessionId, userId), { onConflict: 'id' });

  if (!error || !isMissingVisualReviewOptionalColumnError(error)) {
    return { error };
  }

  const fallbackResult = await supabase
    .from('visual_control_reviews')
    .upsert(getVisualReviewPayload(review, sessionId, userId, { includePhotoLists: false, includeComments: false }), { onConflict: 'id' });

  return fallbackResult.error
    ? { error: fallbackResult.error }
    : {
        error: null,
        warning: 'Supabase aun no reconoce columnas nuevas de comentarios/fotos multiples. Se guardo lo compatible con la tabla actual.',
      };
}

async function loadVisualSessionsFromSupabase() {
  const { data: sessionRows, error: sessionsError } = await supabase
    .from('visual_control_sessions')
    .select('*')
    .order('started_at', { ascending: false });

  if (sessionsError) {
    throw sessionsError;
  }

  const { data: reviewRows, error: reviewsError } = await supabase
    .from('visual_control_reviews')
    .select('*')
    .order('checked_at', { ascending: false });

  if (reviewsError) {
    throw reviewsError;
  }

  const mappedReviews = await Promise.all((reviewRows ?? []).map(mapSupabaseReview));
  const reviewsBySession = mappedReviews.reduce((groups, review) => {
    if (!review.sessionId) {
      return groups;
    }

    return {
      ...groups,
      [review.sessionId]: [...(groups[review.sessionId] ?? []), review],
    };
  }, {});

  return (sessionRows ?? []).map((session) => mapSupabaseSession(session, reviewsBySession[session.id] ?? []));
}

function mapSupabaseVisualReport(row) {
  return normalizeSavedVisualReport({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    reportDate: row.report_date,
    responsible: row.responsible,
    generatedAt: row.generated_at,
    sessionCount: row.session_count,
    reviewCount: row.review_count,
    sessions: row.snapshot?.sessions ?? [],
  });
}

async function loadVisualReportsFromSupabase() {
  const { data, error } = await supabase
    .from('visual_control_reports')
    .select('*')
    .order('generated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapSupabaseVisualReport);
}

async function persistVisualReportToSupabase(report, userId) {
  if (!userId || !report?.id) {
    return false;
  }

  const { error } = await supabase
    .from('visual_control_reports')
    .upsert({
      id: report.id,
      user_id: userId,
      title: report.title,
      report_date: report.reportDate,
      responsible: report.responsible,
      generated_at: report.generatedAt,
      session_count: report.sessionCount,
      review_count: report.reviewCount,
      snapshot: { sessions: report.sessions },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('No se pudo guardar el reporte visual en Supabase:', error);
    return false;
  }

  return true;
}

async function syncLocalVisualSessionsToSupabase(localSessions, userId, deletedSessionIds = []) {
  if (!userId || !Array.isArray(localSessions) || localSessions.length === 0) {
    return { ok: true, synced: 0 };
  }

  const deletedIds = new Set(deletedSessionIds);
  const sessionsToSync = localSessions
    .map(normalizeVisualSession)
    .filter((session) => (
      session?.id
      && !deletedIds.has(session.id)
      && session?.machine
      && session?.date
      && (!session.userId || session.userId === userId)
    ));

  let synced = 0;

  for (const session of sessionsToSync) {
    const sessionToSync = { ...session, userId };
    const { error: sessionError } = await supabase
      .from('visual_control_sessions')
      .upsert(getVisualSessionPayload(sessionToSync, userId), { onConflict: 'id' });

    if (sessionError) {
      console.error('No se pudo sincronizar una ronda local:', sessionError);
      return {
        ok: false,
        synced,
        message: `No se pudo sincronizar una ronda local con Supabase: ${sessionError.message}`,
      };
    }

    for (const review of sessionToSync.reviews ?? []) {
      const reviewToSync = { ...review };

      const visualDataUrls = getReviewVisualPhotoUrls(reviewToSync);
      const visualNames = normalizePhotoList(reviewToSync.photoName, reviewToSync.photoNames);
      const visualPaths = normalizePhotoList(reviewToSync.photoPath, reviewToSync.photoPaths);
      const syncedVisualPaths = [...visualPaths];

      for (let index = 0; index < visualDataUrls.length; index += 1) {
        if (!syncedVisualPaths[index]) {
          syncedVisualPaths[index] = await uploadDefectPhoto(userId, visualDataUrls[index], visualNames[index] || `foto-defecto-${index + 1}.jpg`);
        }
      }

      const bagDataUrls = getReviewBagPhotoUrls(reviewToSync);
      const bagNames = normalizePhotoList(reviewToSync.bagPhotoName, reviewToSync.bagPhotoNames);
      const bagPaths = normalizePhotoList(reviewToSync.bagPhotoPath, reviewToSync.bagPhotoPaths);
      const syncedBagPaths = [...bagPaths];

      for (let index = 0; index < bagDataUrls.length; index += 1) {
        if (!syncedBagPaths[index]) {
          syncedBagPaths[index] = await uploadDefectPhoto(userId, bagDataUrls[index], bagNames[index] || `foto-bolsa-${index + 1}.jpg`);
        }
      }

      reviewToSync.photoPaths = syncedVisualPaths.filter(Boolean);
      reviewToSync.photoPath = reviewToSync.photoPaths[0] ?? '';
      reviewToSync.bagPhotoPaths = syncedBagPaths.filter(Boolean);
      reviewToSync.bagPhotoPath = reviewToSync.bagPhotoPaths[0] ?? '';

      const { error: reviewError, warning } = await upsertVisualReview(reviewToSync, sessionToSync.id, userId);

      if (warning) {
        console.warn(warning);
      }

      if (reviewError) {
        console.error('No se pudo sincronizar una revision local:', reviewError);
        return {
          ok: false,
          synced,
          message: `No se pudo sincronizar una revision local con Supabase: ${reviewError.message}`,
        };
      }
    }

    synced += 1;
  }

  return { ok: true, synced };
}

function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('La camara no esta disponible en este navegador.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('No se pudo abrir la camara. Revise el permiso del navegador.');
      }
    };

    startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capturePhoto = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.82));
    onClose();
  };

  return (
    <div className="camera-capture-panel">
      <div className="camera-preview">
        {error ? (
          <p>{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted />
        )}
      </div>
      <div className="camera-actions">
        <button type="button" className="primary-action" onClick={capturePhoto} disabled={Boolean(error)}>
          Tomar foto
        </button>
        <button type="button" className="secondary-action" onClick={onClose}>
          Cerrar camara
        </button>
      </div>
    </div>
  );
}

function NewQualityEvidenceCapture({
  photos = [],
  onChange,
  userId = '',
  sections = [],
  compact = false,
}) {
  const normalizedPhotos = normalizeNewQualityEvidencePhotos(photos);
  const defaultSection = sections[0]?.key ?? 'general';
  const [selectedSection, setSelectedSection] = useState(defaultSection);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const selectedSectionData = sections.find((section) => section.key === selectedSection) ?? sections[0] ?? { key: 'general', label: 'General' };
  const photoLimitReached = normalizedPhotos.length >= MAX_REVIEW_PHOTOS;

  useEffect(() => {
    if (sections.some((section) => section.key === selectedSection)) {
      return;
    }

    setSelectedSection(defaultSection);
  }, [defaultSection, sections, selectedSection]);

  const saveEvidenceDataUrl = async (dataUrl, sourceName = '') => {
    const photoName = sourceName || `foto-${selectedSectionData.key}-${new Date().toISOString()}.jpg`;
    const photoPath = await uploadDefectPhoto(userId, dataUrl, photoName);

    onChange?.(appendNewQualityEvidencePhoto(normalizedPhotos, {
      section: selectedSectionData.key,
      label: selectedSectionData.label,
      name: photoName,
      path: photoPath,
      dataUrl,
    }));
  };

  const saveEvidenceFile = (file) => {
    if (!file || photoLimitReached) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      await saveEvidenceDataUrl(String(reader.result), file.name);
    };

    reader.readAsDataURL(file);
  };

  const captureContent = (
    <>
      <div className="new-quality-evidence-controls">
        {!compact && (
          <label>
            <span>Contexto</span>
            <select value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)}>
              {sections.map((section) => (
                <option key={section.key} value={section.key}>{section.label}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="secondary-action"
          onClick={() => setCameraOpen(true)}
          disabled={photoLimitReached}
        >
          Abrir camara
        </button>
        <label className={`new-quality-file-action ${compact ? 'secondary-action' : ''}`}>
          <span>Subir archivo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={photoLimitReached}
            onChange={(event) => saveEvidenceFile(event.target.files?.[0])}
          />
        </label>
        <small>{normalizedPhotos.length}/{MAX_REVIEW_PHOTOS} fotos</small>
      </div>

      {cameraOpen && (
        <CameraCapture
          onCapture={(dataUrl) => saveEvidenceDataUrl(dataUrl)}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {normalizedPhotos.length > 0 && (
        <div className="defect-photo-preview new-quality-evidence-preview">
          {normalizedPhotos.map((photo, photoIndex) => (
            <figure key={photo.id}>
              <button
                type="button"
                className="photo-thumb-button"
                onClick={() => setSelectedPhoto({ src: photo.dataUrl, label: `${photo.label} / Foto ${photoIndex + 1}` })}
              >
                <img src={photo.dataUrl} alt={`${photo.label} ${photoIndex + 1}`} />
              </button>
              <figcaption>{photo.label}</figcaption>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onChange?.(removeNewQualityEvidencePhoto(normalizedPhotos, photo.id))}
              >
                Quitar
              </button>
            </figure>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true">
          <div className="photo-lightbox-content">
            <div className="photo-lightbox-header">
              <strong>{selectedPhoto.label}</strong>
              <button type="button" className="secondary-action" onClick={() => setSelectedPhoto(null)}>
                Cerrar
              </button>
            </div>
            <img src={selectedPhoto.src} alt={selectedPhoto.label} />
          </div>
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <div className="new-quality-evidence-section compact">
        {captureContent}
      </div>
    );
  }

  return (
    <section className="new-quality-evidence-section">
      <div className="new-quality-table-title">EVIDENCIA FOTOGRAFICA</div>
      {captureContent}
    </section>
  );
}

function getInitialView() {
  const hashView = window.location.hash.replace('#', '');
  return viewIds.includes(hashView) ? hashView : 'dashboard';
}

function loadRecords() {
  try {
    const storedRecords = window.localStorage.getItem(STORAGE_KEY);
    return storedRecords ? normalizeStoredRecords(JSON.parse(storedRecords)) : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadVisualControlState() {
  try {
    const storedState = window.localStorage.getItem(VISUAL_CONTROL_STORAGE_KEY);
    const parsedState = storedState ? JSON.parse(storedState) : {};

    return {
      sessions: Array.isArray(parsedState.sessions) ? parsedState.sessions.map(normalizeVisualSession) : [],
      responsible: parsedState.responsible ?? '',
      closedRounds: Array.isArray(parsedState.closedRounds) ? parsedState.closedRounds : [],
    };
  } catch {
    return { sessions: [], responsible: '', closedRounds: [] };
  }
}

function saveVisualControlState(state) {
  window.localStorage.setItem(VISUAL_CONTROL_STORAGE_KEY, JSON.stringify(state));
}

function loadDeletedVisualSessionIds() {
  try {
    const storedIds = window.localStorage.getItem(DELETED_VISUAL_SESSIONS_STORAGE_KEY);
    const parsedIds = storedIds ? JSON.parse(storedIds) : [];

    return Array.isArray(parsedIds) ? parsedIds.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveDeletedVisualSessionIds(ids) {
  window.localStorage.setItem(DELETED_VISUAL_SESSIONS_STORAGE_KEY, JSON.stringify(uniqueNonEmpty(ids)));
}

function addDeletedVisualSessionId(sessionId) {
  if (!sessionId) {
    return [];
  }

  const ids = uniqueNonEmpty([...loadDeletedVisualSessionIds(), sessionId]);
  saveDeletedVisualSessionIds(ids);
  return ids;
}

function normalizeSavedVisualReport(report) {
  return {
    id: report.id ?? crypto.randomUUID(),
    userId: report.userId ?? report.user_id ?? '',
    title: report.title ?? 'Reporte de controles visuales',
    reportDate: report.reportDate ?? report.report_date ?? getToday(),
    responsible: report.responsible ?? '',
    generatedAt: report.generatedAt ?? report.generated_at ?? new Date().toISOString(),
    sessionCount: Number(report.sessionCount ?? report.session_count ?? report.sessions?.length ?? 0),
    reviewCount: Number(report.reviewCount ?? report.review_count ?? 0),
    sessions: Array.isArray(report.sessions)
      ? report.sessions.map(normalizeVisualSession)
      : Array.isArray(report.snapshot?.sessions)
        ? report.snapshot.sessions.map(normalizeVisualSession)
        : [],
  };
}

function loadSavedVisualReports() {
  try {
    const storedReports = window.localStorage.getItem(SAVED_VISUAL_REPORTS_STORAGE_KEY);
    const parsedReports = storedReports ? JSON.parse(storedReports) : [];

    return Array.isArray(parsedReports)
      ? parsedReports.map(normalizeSavedVisualReport)
      : [];
  } catch {
    return [];
  }
}

function saveSavedVisualReports(reports) {
  window.localStorage.setItem(SAVED_VISUAL_REPORTS_STORAGE_KEY, JSON.stringify(reports));
}

function loadThemePreference() {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  return themeOptions.includes(storedTheme) ? storedTheme : 'light';
}

function saveThemePreference(theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, themeOptions.includes(theme) ? theme : 'light');
}

function getDefaultUserRole(username = '') {
  const cleanUsername = String(username).trim().toLowerCase();

  if (cleanUsername.includes('leonel')) {
    return 'admin';
  }

  if (cleanUsername.includes('rafael')) {
    return 'calidad';
  }

  if (cleanUsername.includes('guest')) {
    return 'lectura';
  }

  return 'lectura';
}

function isAdminUser(user) {
  return user?.role === 'admin';
}

function isGuestUser(user) {
  return user?.role === 'lectura';
}

function canManageFormats(user) {
  return ['admin', 'calidad'].includes(user?.role);
}

function canDeleteQualityRecords(user) {
  return isAdminUser(user);
}

function getAllowedViewIdsForUser(user) {
  if (isGuestUser(user)) {
    return qualityControlViewIds;
  }

  return viewIds;
}

function normalizeAuditLog(log = {}) {
  return {
    id: log.id ?? crypto.randomUUID(),
    userId: log.userId ?? log.user_id ?? '',
    username: log.username ?? '',
    displayName: log.displayName ?? log.display_name ?? '',
    role: log.role ?? getDefaultUserRole(log.username ?? log.displayName),
    action: log.action ?? '',
    area: log.area ?? '',
    target: log.target ?? '',
    detail: log.detail ?? '',
    metadata: log.metadata && typeof log.metadata === 'object' ? log.metadata : {},
    createdAt: log.createdAt ?? log.created_at ?? new Date().toISOString(),
  };
}

function loadAuditLogs() {
  try {
    const storedLogs = window.localStorage.getItem(AUDIT_LOG_STORAGE_KEY);
    const parsedLogs = storedLogs ? JSON.parse(storedLogs) : [];

    return Array.isArray(parsedLogs)
      ? parsedLogs.map(normalizeAuditLog)
      : [];
  } catch {
    return [];
  }
}

function saveAuditLogs(logs) {
  window.localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify((logs ?? []).slice(0, 500)));
}

function getOrCreateDeviceId() {
  try {
    const storedDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

    if (storedDeviceId) {
      return storedDeviceId;
    }

    const nextDeviceId = `PETNOVA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
    return nextDeviceId;
  } catch {
    return 'PETNOVA-SIN-ID';
  }
}

function detectClientBrowser(userAgent = '') {
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/SamsungBrowser/i.test(userAgent)) return 'Samsung Internet';
  if (/Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Navegador desconocido';
}

function detectClientOs(userAgent = '') {
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Sistema desconocido';
}

function detectClientDeviceType(userAgent = '') {
  if (/iPad|Tablet/i.test(userAgent)) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return 'Celular';
  return 'PC/Laptop';
}

function getLocalClientAuditInfo() {
  const userAgent = navigator.userAgent ?? '';

  return {
    deviceId: getOrCreateDeviceId(),
    deviceType: detectClientDeviceType(userAgent),
    browser: detectClientBrowser(userAgent),
    os: detectClientOs(userAgent),
    platform: navigator.platform ?? '',
    language: navigator.language ?? '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    screen: window.screen ? `${window.screen.width}x${window.screen.height}` : '',
    userAgent,
  };
}

let remoteClientInfoCache = null;

async function getRemoteClientAuditInfo() {
  if (remoteClientInfoCache !== null) {
    return remoteClientInfoCache;
  }

  try {
    const response = await fetch('/api/client-info', { cache: 'no-store' });

    if (!response.ok) {
      remoteClientInfoCache = {};
      return remoteClientInfoCache;
    }

    remoteClientInfoCache = await response.json();
    return remoteClientInfoCache;
  } catch {
    remoteClientInfoCache = {};
    return remoteClientInfoCache;
  }
}

async function buildAuditMetadata(metadata = {}) {
  const remoteInfo = await getRemoteClientAuditInfo();

  return {
    ...metadata,
    client: {
      ...getLocalClientAuditInfo(),
      ...remoteInfo,
      ...(metadata.client && typeof metadata.client === 'object' ? metadata.client : {}),
    },
  };
}

function getAuditClientSummary(log) {
  const client = log.metadata?.client ?? {};
  const deviceParts = [
    client.deviceId,
    client.deviceType,
    client.os,
    client.browser,
  ].filter(Boolean);

  return deviceParts.join(' / ') || 'Dispositivo no registrado';
}

function getAuditClientDetails(log) {
  const client = log.metadata?.client ?? {};
  const details = [
    client.ip ? `IP ${client.ip}` : '',
    client.city || client.country ? [client.city, client.country].filter(Boolean).join(', ') : '',
    client.screen ? `Pantalla ${client.screen}` : '',
    client.timezone ? `Zona ${client.timezone}` : '',
  ].filter(Boolean);

  return details.join(' / ');
}

async function loadAuditLogsFromSupabase() {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeAuditLog);
}

async function persistAuditLogToSupabase(log) {
  if (!supabase || !log?.id) {
    return false;
  }

  const { error } = await supabase
    .from('audit_logs')
    .insert({
      id: log.id,
      user_id: log.userId || null,
      username: log.username,
      display_name: log.displayName,
      role: log.role,
      action: log.action,
      area: log.area,
      target: log.target,
      detail: log.detail,
      metadata: log.metadata,
      created_at: log.createdAt,
    });

  if (error) {
    console.error('No se pudo guardar auditoria en Supabase:', error);
    return false;
  }

  return true;
}

function normalizeQualityClaim(claim = {}) {
  return {
    id: claim.id ?? crypto.randomUUID(),
    code: claim.code ?? '',
    date: claim.date ?? getToday(),
    customer: claim.customer ?? '',
    source: claim.source ?? complaintSourceOptions[0],
    product: claim.product ?? '',
    lot: claim.lot ?? '',
    description: claim.description ?? '',
    severity: claim.severity ?? complaintSeverityOptions[0],
    status: claim.status ?? complaintStatusOptions[0],
    owner: claim.owner ?? '',
    customerCode: claim.customerCode ?? '',
    phone: claim.phone ?? '',
    email: claim.email ?? '',
    salesExecutive: claim.salesExecutive ?? '',
    salesType: claim.salesType ?? '',
    salesNote: claim.salesNote ?? '',
    dispatchType: claim.dispatchType ?? '',
    deliveredQuantity: claim.deliveredQuantity ?? '',
    observedQuantity: claim.observedQuantity ?? '',
    productCode: claim.productCode ?? '',
    observedPackageCode: claim.observedPackageCode ?? '',
    returnedQuantity: claim.returnedQuantity ?? '',
    packagingState: claim.packagingState ?? '',
    qualityResponse: claim.qualityResponse ?? '',
    closeDate: claim.closeDate ?? '',
    closureDescription: claim.closureDescription ?? '',
    importedFileName: claim.importedFileName ?? '',
    importedSheetName: claim.importedSheetName ?? '',
    importedAt: claim.importedAt ?? '',
    isoClause: claim.isoClause ?? 'ISO 9001:2015 / 8.2.1 - Comunicacion con el cliente',
    createdAt: claim.createdAt ?? new Date().toISOString(),
    updatedAt: claim.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeComplaintFollowUp(followUp = {}) {
  return {
    id: followUp.id ?? crypto.randomUUID(),
    claimId: followUp.claimId ?? '',
    date: followUp.date ?? getToday(),
    responsible: followUp.responsible ?? '',
    status: followUp.status ?? complaintStatusOptions[1],
    observation: followUp.observation ?? '',
    nextStep: followUp.nextStep ?? '',
    createdAt: followUp.createdAt ?? new Date().toISOString(),
  };
}

function normalizeCorrectiveAction(action = {}) {
  return {
    id: action.id ?? crypto.randomUUID(),
    claimId: action.claimId ?? '',
    date: action.date ?? getToday(),
    responsible: action.responsible ?? '',
    rootCause: action.rootCause ?? '',
    action: action.action ?? '',
    dueDate: action.dueDate ?? '',
    status: action.status ?? correctiveActionStatusOptions[0],
    effectiveness: action.effectiveness ?? '',
    isoClause: action.isoClause ?? 'ISO 9001:2015 / 10.2 - No conformidad y accion correctiva',
    createdAt: action.createdAt ?? new Date().toISOString(),
  };
}

function normalizeQualityDocument(document = {}) {
  return {
    id: document.id ?? crypto.randomUUID(),
    code: document.code ?? '',
    title: document.title ?? '',
    type: document.type ?? documentTypeOptions[0],
    version: document.version ?? 'Rev.0',
    owner: document.owner ?? '',
    process: document.process ?? '',
    status: document.status ?? 'Vigente',
    fileName: document.fileName ?? '',
    fileDataUrl: document.fileDataUrl ?? '',
    content: document.content ?? null,
    createdAt: document.createdAt ?? new Date().toISOString(),
    updatedAt: document.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeQualityManagementState(state = {}) {
  return {
    complaints: Array.isArray(state.complaints) ? state.complaints.map(normalizeQualityClaim) : [],
    followUps: Array.isArray(state.followUps) ? state.followUps.map(normalizeComplaintFollowUp) : [],
    correctiveActions: Array.isArray(state.correctiveActions) ? state.correctiveActions.map(normalizeCorrectiveAction) : [],
    documents: Array.isArray(state.documents) ? state.documents.map(normalizeQualityDocument) : [],
  };
}

function loadQualityManagementState() {
  try {
    const storedState = window.localStorage.getItem(QUALITY_MANAGEMENT_STORAGE_KEY);
    return normalizeQualityManagementState(storedState ? JSON.parse(storedState) : {});
  } catch {
    return normalizeQualityManagementState();
  }
}

function saveQualityManagementState(state) {
  window.localStorage.setItem(QUALITY_MANAGEMENT_STORAGE_KEY, JSON.stringify(normalizeQualityManagementState(state)));
}

function normalizeExcelText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatExcelDateForInput(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function getExcelCellText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatExcelDateForInput(value);
  }

  return String(value ?? '').trim();
}

function getExcelSheets(readResult) {
  if (Array.isArray(readResult) && readResult.some((item) => item?.data && item?.sheet)) {
    return readResult;
  }

  return [{ sheet: 'Hoja 1', data: Array.isArray(readResult) ? readResult : [] }];
}

function pickComplaintSheet(sheets) {
  return sheets.find((sheet) => (
    (sheet.data ?? []).flat().some((cell) => normalizeExcelText(cell).includes('REGISTRO RECLAMO DE CLIENTES'))
  )) || sheets.find((sheet) => (
    (sheet.data ?? []).flat().some((cell) => normalizeExcelText(cell).includes('DESCRIPCION DEL RECLAMO'))
  )) || sheets[0] || { sheet: 'Hoja 1', data: [] };
}

function findExcelLabelPosition(rows, label, startRow = 0) {
  const targetLabel = normalizeExcelText(label);

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (normalizeExcelText(row[columnIndex]).includes(targetLabel)) {
        return { rowIndex, columnIndex };
      }
    }
  }

  return null;
}

function getNextExcelValueInRow(row, startColumn) {
  for (let columnIndex = startColumn + 1; columnIndex < row.length; columnIndex += 1) {
    const value = getExcelCellText(row[columnIndex]);
    if (value) {
      return value;
    }
  }

  return '';
}

function getExcelValueAfterLabel(rows, label, startRow = 0) {
  const position = findExcelLabelPosition(rows, label, startRow);
  if (!position) {
    return '';
  }

  return getNextExcelValueInRow(rows[position.rowIndex] ?? [], position.columnIndex);
}

function getExcelDateAfterLabel(rows, label, startRow = 0) {
  const position = findExcelLabelPosition(rows, label, startRow);
  if (!position) {
    return '';
  }

  const row = rows[position.rowIndex] ?? [];
  for (let columnIndex = position.columnIndex + 1; columnIndex < row.length; columnIndex += 1) {
    const value = row[columnIndex];
    if (value) {
      return formatExcelDateForInput(value);
    }
  }

  return '';
}

function getExcelTextBelowLabel(rows, label, startRow = 0) {
  const position = findExcelLabelPosition(rows, label, startRow);
  if (!position) {
    return '';
  }

  const collectedLines = [];

  for (let rowIndex = position.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const rowValues = (rows[rowIndex] ?? [])
      .map(getExcelCellText)
      .filter(Boolean);
    const line = rowValues.join(' ').trim();
    const normalizedLine = normalizeExcelText(line);

    if (!line) {
      if (collectedLines.length > 0) {
        break;
      }
      continue;
    }

    if (
      collectedLines.length > 0
      && (
        normalizedLine.includes('ACCESORIOS PRODUCTO')
        || normalizedLine.includes('RESPUESTA CALIDAD')
        || normalizedLine.includes('CIERRE RECLAMO')
      )
    ) {
      break;
    }

    collectedLines.push(line);
  }

  return collectedLines.join('\n');
}

function parseQualityComplaintExcelSheet(rows, fileName = '', sheetName = '') {
  const customerSection = findExcelLabelPosition(rows, 'DATOS DEL CLIENTE')?.rowIndex ?? 0;
  const responseSection = findExcelLabelPosition(rows, 'RESPUESTA CALIDAD')?.rowIndex ?? 0;
  const closeSection = findExcelLabelPosition(rows, 'CIERRE RECLAMO')?.rowIndex ?? 0;
  const claimDescription = getExcelTextBelowLabel(rows, 'Descripcion del reclamo');
  const packagingState = getExcelTextBelowLabel(rows, 'Descripcion del estado');
  const qualityResponse = responseSection ? getExcelTextBelowLabel(rows, 'Descripcion respuesta', responseSection) : '';
  const closureDescription = closeSection ? getExcelTextBelowLabel(rows, 'Descripcion respuesta', closeSection) : '';
  const productCode = getExcelValueAfterLabel(rows, 'Codigo Producto');
  const deliveredQuantity = getExcelValueAfterLabel(rows, 'Cantidad entregada');
  const observedQuantity = getExcelValueAfterLabel(rows, 'Cantidad observada');

  return normalizeQualityClaim({
    code: getExcelValueAfterLabel(rows, 'CORRELATIVO') || '',
    date: getExcelDateAfterLabel(rows, 'FECHA APERTURA RECLAMO') || getToday(),
    customer: getExcelValueAfterLabel(rows, 'NOMBRE', customerSection),
    source: 'Correo / Excel',
    product: productCode,
    lot: getExcelValueAfterLabel(rows, 'LOTE (OP)'),
    description: [
      claimDescription,
      deliveredQuantity ? `Cantidad entregada: ${deliveredQuantity}` : '',
      observedQuantity ? `Cantidad observada: ${observedQuantity}` : '',
      packagingState ? `Estado/devolucion: ${packagingState}` : '',
    ].filter(Boolean).join('\n\n'),
    severity: complaintSeverityOptions[1],
    status: complaintStatusOptions[0],
    owner: 'Calidad',
    customerCode: getExcelValueAfterLabel(rows, 'CODIGO', customerSection),
    phone: getExcelValueAfterLabel(rows, 'TELEFONO', customerSection),
    email: getExcelValueAfterLabel(rows, 'e-mail', customerSection),
    salesExecutive: getExcelValueAfterLabel(rows, 'NOMBRE EJECUTIVO DE VENTAS'),
    salesType: getExcelValueAfterLabel(rows, 'TIPO DE VENTA'),
    salesNote: getExcelValueAfterLabel(rows, 'NOTA DE VENTA'),
    dispatchType: getExcelValueAfterLabel(rows, 'TIPO DE DESPACHO'),
    deliveredQuantity,
    observedQuantity,
    productCode,
    observedPackageCode: getExcelValueAfterLabel(rows, 'Cod. Empaque'),
    returnedQuantity: getExcelValueAfterLabel(rows, 'Cantidad devuelta'),
    packagingState,
    qualityResponse,
    closeDate: closeSection ? getExcelDateAfterLabel(rows, 'FECHA DE CIERRE', closeSection) : '',
    closureDescription,
    importedFileName: fileName,
    importedSheetName: sheetName,
    importedAt: new Date().toISOString(),
  });
}

async function readQualityComplaintExcel(file) {
  const workbook = await readXlsxFile(file);
  const sheet = pickComplaintSheet(getExcelSheets(workbook));

  return parseQualityComplaintExcelSheet(sheet.data ?? [], file.name, sheet.sheet);
}

function addMonthsToDate(dateValue, months) {
  if (!dateValue || !Number.isFinite(Number(months))) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setMonth(date.getMonth() + Number(months));

  return date.toISOString().slice(0, 10);
}

function getDaysUntil(dateValue) {
  if (!dateValue) {
    return null;
  }

  const targetDate = new Date(`${dateValue}T00:00:00`);
  const today = new Date(`${getToday()}T00:00:00`);

  if (Number.isNaN(targetDate.getTime())) {
    return null;
  }

  return Math.ceil((targetDate.getTime() - today.getTime()) / 86400000);
}

function getEquipmentCalibrationState(equipment) {
  if (equipment.status === 'Fuera de servicio') {
    return { label: 'Fuera de servicio', className: 'out' };
  }

  if (equipment.status === 'En calibracion') {
    return { label: 'En calibracion', className: 'calibration' };
  }

  const daysUntil = getDaysUntil(equipment.nextCalibrationDate);

  if (daysUntil === null) {
    return { label: 'Sin fecha', className: 'pending' };
  }

  if (daysUntil < 0) {
    return { label: 'Vencido', className: 'expired' };
  }

  if (daysUntil <= 30) {
    return { label: `Vence en ${daysUntil} dia(s)`, className: 'soon' };
  }

  return { label: 'Vigente', className: 'ok' };
}

function getScheduleEventState(daysUntil) {
  if (daysUntil === null) {
    return { label: 'Sin fecha', className: 'pending' };
  }

  if (daysUntil < 0) {
    return { label: `Vencido hace ${Math.abs(daysUntil)} dia(s)`, className: 'expired' };
  }

  if (daysUntil === 0) {
    return { label: 'Programado para hoy', className: 'soon' };
  }

  if (daysUntil <= 30) {
    return { label: `En ${daysUntil} dia(s)`, className: 'soon' };
  }

  return { label: `En ${daysUntil} dia(s)`, className: 'ok' };
}

function addDaysToDate(dateValue, days) {
  if (!dateValue || !Number.isFinite(Number(days))) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + Number(days));

  return date.toISOString().slice(0, 10);
}

function getMonthStartDate(dateValue) {
  const date = new Date(`${dateValue || getToday()}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return `${getToday().slice(0, 7)}-01`;
  }

  date.setDate(1);

  return date.toISOString().slice(0, 10);
}

function createDemoEquipmentScheduleEvents() {
  const today = getToday();
  const demoEquipment = [
    { code: 'EQ-CAL-001', name: 'Calibrador digital', type: 'Calibrador digital', location: 'Laboratorio', responsible: 'Calidad' },
    { code: 'EQ-BAL-002', name: 'Balanza analitica', type: 'Balanza', location: 'Laboratorio', responsible: 'Calidad' },
    { code: 'EQ-ESP-003', name: 'Medidor de espesores', type: 'Medidor de espesores', location: 'Linea PET', responsible: 'Control de calidad' },
    { code: 'EQ-PRO-004', name: 'Probeta 5 L', type: 'Probeta', location: 'Laboratorio', responsible: 'Calidad' },
  ];

  return [
    { id: 'demo-no-cumplido-balanza', type: 'Verificacion', date: addDaysToDate(today, -2), equipment: demoEquipment[1], scheduleClass: 'no-cumplido-event', scheduleLabel: 'No cumplido', isDemo: true },
    { id: 'demo-en-proceso-calibrador', type: 'Calibracion', date: addDaysToDate(today, 2), equipment: demoEquipment[0], scheduleClass: 'en-proceso-event', scheduleLabel: 'En proceso', isDemo: true },
    { id: 'demo-concluido-espesores', type: 'Mantenimiento', date: addDaysToDate(today, 4), equipment: demoEquipment[2], scheduleClass: 'concluido-event', scheduleLabel: 'Concluido', isDemo: true },
    { id: 'demo-reprogramado-probeta', type: 'Calibracion', date: addDaysToDate(today, 6), equipment: demoEquipment[3], scheduleClass: 'reprogramado-event', scheduleLabel: 'Reprogramado', isDemo: true },
    { id: 'demo-verificacion-balanza-semanal', type: 'Verificacion', date: addDaysToDate(today, 8), equipment: demoEquipment[1], scheduleClass: 'verification-event', scheduleLabel: 'Verificacion', isDemo: true },
    { id: 'demo-calibracion-calibrador', type: 'Calibracion', date: addDaysToDate(today, 10), equipment: demoEquipment[0], scheduleClass: 'calibration-event', scheduleLabel: 'Calibracion', isDemo: true },
    { id: 'demo-verificacion-balanza', type: 'Verificacion', date: addDaysToDate(today, 13), equipment: demoEquipment[1], scheduleClass: 'verification-event', scheduleLabel: 'Verificacion', isDemo: true },
    { id: 'demo-mantenimiento-balanza', type: 'Mantenimiento', date: addDaysToDate(today, 16), equipment: demoEquipment[1], scheduleClass: 'en-proceso-event', scheduleLabel: 'En proceso', isDemo: true },
    { id: 'demo-calibracion-balanza', type: 'Calibracion', date: addDaysToDate(today, 25), equipment: demoEquipment[1], scheduleClass: 'calibration-event', scheduleLabel: 'Calibracion', isDemo: true },
  ];
}

function createProjectedBalanceScheduleEvents(equipment) {
  const equipmentText = `${equipment.name ?? ''} ${equipment.type ?? ''}`.toLowerCase();

  if (!equipmentText.includes('balanza')) {
    return [];
  }

  const verificationStart = equipment.nextVerificationDate || addDaysToDate(getToday(), 3);
  const maintenanceStart = equipment.nextMaintenanceDate || addDaysToDate(getToday(), 14);
  const calibrationStart = equipment.nextCalibrationDate || addDaysToDate(getToday(), 25);
  const calibrationFrequency = Number(equipment.frequencyMonths || 12);

  return [
    ...[1, 2, 3, 4, 5, 6].map((index) => ({
      id: `${equipment.id}-verificacion-proyectada-${index}`,
      type: 'Verificacion',
      date: addDaysToDate(verificationStart, index * 7),
      equipment,
      scheduleClass: 'verification-event',
      scheduleLabel: 'Verificacion',
      isProjected: true,
    })),
    ...[1, 2, 3].map((index) => ({
      id: `${equipment.id}-mantenimiento-proyectado-${index}`,
      type: 'Mantenimiento',
      date: addDaysToDate(maintenanceStart, index * 30),
      equipment,
      scheduleClass: index === 1 ? 'en-proceso-event' : 'reprogramado-event',
      scheduleLabel: index === 1 ? 'En proceso' : 'Reprogramado',
      isProjected: true,
    })),
    ...[1, 2].map((index) => ({
      id: `${equipment.id}-calibracion-proyectada-${index}`,
      type: 'Calibracion',
      date: addMonthsToDate(calibrationStart, index * (Number.isFinite(calibrationFrequency) ? calibrationFrequency : 12)),
      equipment,
      scheduleClass: 'calibration-event',
      scheduleLabel: 'Calibracion',
      isProjected: true,
    })),
  ].filter((event) => event.date);
}

function buildEquipmentCalendarCells(events = [], visibleMonthDate = getToday()) {
  const monthDate = new Date(`${getMonthStartDate(visibleMonthDate)}T00:00:00`);

  if (Number.isNaN(monthDate.getTime())) {
    return { title: '', cells: [] };
  }

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let index = 0; index < mondayFirstOffset; index += 1) {
    cells.push({ id: `blank-start-${index}`, empty: true });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const dateKey = date.toISOString().slice(0, 10);
    cells.push({
      id: dateKey,
      day,
      date: dateKey,
      events: events.filter((event) => event.date === dateKey),
      isToday: dateKey === getToday(),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ id: `blank-end-${cells.length}`, empty: true });
  }

  return {
    title: new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(firstDay),
    cells,
  };
}

function getScheduleTypeClass(type) {
  const cleanType = String(type ?? '').toLowerCase();

  if (cleanType.includes('calibr')) {
    return 'calibration-event';
  }

  if (cleanType.includes('verific')) {
    return 'verification-event';
  }

  if (cleanType.includes('manten')) {
    return 'maintenance-event';
  }

  return 'other-event';
}

function getScheduleEventColorClass(event) {
  return event.scheduleClass || getScheduleTypeClass(event.type);
}

function getScheduleEventLabel(event) {
  return event.scheduleLabel || event.type || 'Actividad';
}

function normalizeEquipmentCalibration(calibration = {}) {
  return {
    id: calibration.id ?? crypto.randomUUID(),
    date: calibration.date ?? getToday(),
    nextDate: calibration.nextDate ?? '',
    result: calibration.result ?? 'Conforme',
    certificateNumber: calibration.certificateNumber ?? '',
    provider: calibration.provider ?? '',
    notes: calibration.notes ?? '',
    fileName: calibration.fileName ?? '',
    fileDataUrl: calibration.fileDataUrl ?? '',
    createdAt: calibration.createdAt ?? new Date().toISOString(),
  };
}

function normalizeEquipmentDocument(document = {}) {
  return {
    id: document.id ?? crypto.randomUUID(),
    type: document.type ?? 'Ficha tecnica',
    title: document.title ?? '',
    issueDate: document.issueDate ?? getToday(),
    expirationDate: document.expirationDate ?? '',
    notes: document.notes ?? '',
    fileName: document.fileName ?? '',
    fileDataUrl: document.fileDataUrl ?? '',
    createdAt: document.createdAt ?? new Date().toISOString(),
  };
}

function normalizeMeasurementEquipment(equipment = {}) {
  const calibrations = Array.isArray(equipment.calibrations)
    ? equipment.calibrations.map(normalizeEquipmentCalibration)
    : [];
  const documents = Array.isArray(equipment.documents)
    ? equipment.documents.map(normalizeEquipmentDocument)
    : [];

  return {
    id: equipment.id ?? crypto.randomUUID(),
    code: equipment.code ?? '',
    name: equipment.name ?? '',
    type: equipment.type ?? 'Calibrador digital',
    brand: equipment.brand ?? '',
    model: equipment.model ?? '',
    serial: equipment.serial ?? '',
    location: equipment.location ?? 'Laboratorio',
    responsible: equipment.responsible ?? '',
    frequencyMonths: equipment.frequencyMonths ?? '12',
    lastCalibrationDate: equipment.lastCalibrationDate ?? '',
    nextCalibrationDate: equipment.nextCalibrationDate ?? '',
    nextVerificationDate: equipment.nextVerificationDate ?? '',
    nextMaintenanceDate: equipment.nextMaintenanceDate ?? '',
    status: equipment.status ?? 'Activo',
    notes: equipment.notes ?? '',
    calibrations,
    documents,
    createdAt: equipment.createdAt ?? new Date().toISOString(),
    updatedAt: equipment.updatedAt ?? new Date().toISOString(),
  };
}

function loadMeasurementEquipmentRecords() {
  try {
    const storedRecords = window.localStorage.getItem(MEASUREMENT_EQUIPMENT_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeMeasurementEquipment)
      : [];
  } catch {
    return [];
  }
}

function saveMeasurementEquipmentRecords(records) {
  window.localStorage.setItem(MEASUREMENT_EQUIPMENT_STORAGE_KEY, JSON.stringify((records ?? []).map(normalizeMeasurementEquipment)));
}

function parseOperatorQuantity(value) {
  const parsedValue = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getOperatorWasteValue(record = {}) {
  const usedTotal = parseOperatorQuantity(record.usedTotal);
  const goodBottles = parseOperatorQuantity(record.goodBottles);

  if (usedTotal === null || goodBottles === null) {
    return '';
  }

  return cleanProductionNumber(usedTotal - goodBottles);
}

function getOperatorTotalBags(record = {}) {
  const from = Number.parseInt(record.fromNumber, 10);
  const to = Number.parseInt(record.toNumber, 10);

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return '';
  }

  return String(to - from + 1);
}

function incrementOperatorBot(value, machine, date = getToday()) {
  const machineLetter = String(machine ?? '').split('-').pop() || '';
  const match = String(value ?? '').trim().match(/^(\d+)([A-Za-z])-([0-9]{4})$/);
  const year = match?.[3] || String(date).slice(0, 4);
  const nextNumber = match ? Number.parseInt(match[1], 10) + 1 : 1;
  const paddedNumber = String(nextNumber).padStart(match?.[1]?.length || 3, '0');

  return `${paddedNumber}${machineLetter || match?.[2] || ''}-${year}`;
}

function normalizeOperatorProductionRecord(record = {}) {
  const calculatedWaste = getOperatorWasteValue(record);

  return {
    id: record.id ?? crypto.randomUUID(),
    date: record.date ?? getToday(),
    machine: record.machine ?? machines[0],
    shift: record.shift ?? '',
    operatorName: record.operatorName ?? '',
    startTime: record.startTime ?? '',
    endTime: record.endTime ?? '',
    format: record.format ?? '',
    saiCode: record.saiCode ?? '',
    opBot: record.opBot ?? '',
    goodBottles: record.goodBottles ?? '',
    usedTotal: record.usedTotal ?? '',
    wasteBottlesAndPreforms: calculatedWaste || (record.wasteBottlesAndPreforms ?? ''),
    balance: record.balance ?? '',
    opPerBox: record.opPerBox ?? '',
    resinPerBox: record.resinPerBox ?? '',
    boxNumber: record.boxNumber ?? '',
    fromNumber: record.fromNumber ?? '',
    toNumber: record.toNumber ?? '',
    totalBags: getOperatorTotalBags(record) || (record.totalBags ?? ''),
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

function loadOperatorProductionRecords() {
  try {
    const storedRecords = window.localStorage.getItem(OPERATOR_PRODUCTION_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];
    const baseRecords = Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeOperatorProductionRecord)
      : [];
    const sem78SeedAlreadyApplied = window.localStorage.getItem(OPERATOR_PRODUCTION_SEM78_SEED_KEY) === 'true';

    if (sem78SeedAlreadyApplied) {
      return baseRecords;
    }

    const existingIds = new Set(baseRecords.map((record) => record.id));
    const missingSeedRecords = sem78OperatorProductionSeedRecords
      .map(normalizeOperatorProductionRecord)
      .filter((record) => !existingIds.has(record.id));

    window.localStorage.setItem(OPERATOR_PRODUCTION_SEM78_SEED_KEY, 'true');

    return [...missingSeedRecords, ...baseRecords];
  } catch {
    return sem78OperatorProductionSeedRecords.map(normalizeOperatorProductionRecord);
  }
}

function saveOperatorProductionRecords(records) {
  window.localStorage.setItem(OPERATOR_PRODUCTION_STORAGE_KEY, JSON.stringify((records ?? []).map(normalizeOperatorProductionRecord)));
}

const blowerShiftKeys = ['first', 'second', 'third'];
const blowerShiftLabels = {
  first: '1ER TURNO',
  second: '2DO TURNO',
  third: '3ER TURNO',
};
const blowerVisualInspectionColumns = Array.from({ length: 10 }, (_, index) => `control-${index + 1}`);
const blowerVisualDefectGroups = [
  {
    key: 'critical',
    title: 'CRITICOS',
    defects: [
      'Rosca incompleta',
      'Orificio en el cuerpo',
      'Danos en el anillo de soporte',
      'Grietas en la base',
      'Base hinchada',
      'Burbujas',
      'Puntos negros',
      'Otros',
    ],
  },
  {
    key: 'major',
    title: 'MAYOR',
    defects: [
      'Marca de molde',
      'Diferencia de tono',
      'Cristalinidad en el pto. Iny.',
      'Babeo',
      'Perlescencia u opalescencia',
      'Puntos negros',
      'Otros',
    ],
  },
  {
    key: 'minor',
    title: 'MENOR',
    defects: [
      'Marcas de agua',
      'Punto de iny descentrado',
      'Puntos negro',
      'Otros',
    ],
  },
];
const blowerPresenceCheckRows = [
  { key: 'odorInspection', label: 'Inspeccion de Olor' },
  { key: 'oilGreaseVerification', label: 'Verificacion de aceite o grasa' },
];
const blowerVariableMeasurementRows = [
  { key: 'emptyBottleWeight', label: 'Peso botella vacia (gr)', group: 'control', specKey: 'pesoVacia' },
  { key: 'fillHeight', label: 'Altura de llenado (mm)', group: 'control', specKey: 'alturaLlenado' },
  { key: 'fillVolume', label: 'Volumen de llenado (ml)', group: 'control' },
  { key: 'bottleHeight', label: 'Altura de Botella (mm)', group: 'dimensions', specKey: 'alturaTotal' },
  { key: 'labelZoneHeight', label: 'Altura zona etiqueta (mm)', group: 'dimensions' },
  { key: 'baseLabelZoneHeight', label: 'Altura base-zona etiqueta (mm)', group: 'dimensions' },
  { key: 'upperDiameter', label: 'Ancho/Diametro Superior (mm)', group: 'dimensions', specKey: 'diametroSuperior' },
  { key: 'pinchDiameter', label: 'Diametro Pinch (mm)', group: 'dimensions' },
  { key: 'lowerDiameter', label: 'Diametro Inferior (mm)', group: 'dimensions', specKey: 'diametroInferior' },
  { key: 'baseLength', label: 'Largo base (mm)', group: 'dimensions' },
  { key: 'baseWidth', label: 'Ancho base (mm)', group: 'dimensions' },
  { key: 'thicknessE1', label: 'E-1 (1 cm alrededor del punto)', group: 'thickness', specKey: 'e1' },
  { key: 'thicknessE2', label: 'E-2 (Petaloide/Base)', group: 'thickness', specKey: 'e2' },
  { key: 'thicknessE3', label: 'E-3 (Diametro inferior)', group: 'thickness', specKey: 'e3' },
  { key: 'thicknessE4', label: 'E-4 (Diametro medio)', group: 'thickness', specKey: 'e4' },
  { key: 'thicknessE5', label: 'E-5 (Diametro superior)', group: 'thickness', specKey: 'e5' },
  { key: 'thicknessE6', label: 'E-6 (Curvatura hombro)', group: 'thickness', specKey: 'e6' },
  { key: 'concavity', label: 'Concavidad (mm)', group: 'control', specKey: 'concavidad' },
];
const blowerThreadDiameterRows = [
  { key: 'sampleIdentification', label: 'Identificacion de la muestra' },
  { key: 'pullerDiameter', label: 'Diametro de Pollera (A)' },
  { key: 'externalThreadDiameter', label: 'Diametro externo de la rosca (T)' },
  { key: 'threadChannelDiameter', label: 'Diam. canales de la rosca (E3=E3)' },
  { key: 'externalMouthDiameter', label: 'Diametro externo de boca (E1-E2)' },
  { key: 'totalThreadHeight', label: 'Altura total de la rosca (D)' },
];
const blowerBottleTemperatureRows = [
  { key: 'controlTime', label: 'Hora de control' },
  { key: 'threadTemperature', label: 'Temperatura de la rosca (C)', max: 50 },
  { key: 'lowerBodyDiameterTemperature', label: 'Temp. diametro inf. del cuerpo (C)' },
  { key: 'injectionPointTemperature', label: 'Temp. en el punto de inyeccion (C)', max: 60 },
];
const blowerProcessVariableRows = [
  { key: 'controlTime', label: 'Hora de control' },
  { key: 'moldCoolingTemperature', label: 'Temp. Refrigeracion del molde' },
  { key: 'preblowAirPressure', label: 'Presion de aire de presoplado' },
  { key: 'blowAirPressure', label: 'Presion de aire de soplado' },
];
const blowerProcessColumnKeys = ['control-1', 'control-2', 'control-3'];
const blowerThreadColumnKeys = ['sample-1', 'sample-2', 'sample-3'];
const blowerTemperatureColumnKeys = ['time-1', 'time-2', 'time-3'];
const blowerCommentShiftKeys = ['first', 'second'];

function createEmptyBlowerVariableMeasurements() {
  return blowerVariableMeasurementRows.reduce((measurements, row) => ({
    ...measurements,
    [row.key]: blowerShiftKeys.reduce((shiftValues, shiftKey) => ({
      ...shiftValues,
      [shiftKey]: ['', ''],
    }), {}),
  }), {});
}

function createEmptyBlowerGrid(rows, columns) {
  return rows.reduce((values, row) => ({
    ...values,
    [row.key]: columns.reduce((rowValues, column) => ({
      ...rowValues,
      [column]: '',
    }), {}),
  }), {});
}

function normalizeBlowerGrid(rawGrid = {}, rows, columns) {
  return rows.reduce((values, row) => ({
    ...values,
    [row.key]: columns.reduce((rowValues, column) => ({
      ...rowValues,
      [column]: rawGrid[row.key]?.[column] ?? '',
    }), {}),
  }), {});
}

function createEmptyBlowerProcessVariableDraft() {
  return {
    id: '',
    saiCode: '',
    recordDate: getToday(),
    machine: machines[0],
    format: '',
    responsible: '',
    measurements: createEmptyBlowerVariableMeasurements(),
    threadDiameters: createEmptyBlowerGrid(blowerThreadDiameterRows, blowerThreadColumnKeys),
    bottleTemperatures: createEmptyBlowerGrid(blowerBottleTemperatureRows, blowerTemperatureColumnKeys),
    processVariables: createEmptyBlowerGrid(blowerProcessVariableRows, blowerProcessColumnKeys),
    waterHardnessTime: '',
    waterHardnessValue: '',
    comments: {
      first: '',
      second: '',
    },
    signatures: {
      first: '',
      second: '',
    },
    createdAt: '',
    updatedAt: '',
  };
}

function normalizeBlowerProcessVariableRecord(record = {}) {
  const fallback = createEmptyBlowerProcessVariableDraft();

  return {
    ...fallback,
    ...record,
    id: record.id ?? crypto.randomUUID(),
    saiCode: record.saiCode ?? '',
    recordDate: record.recordDate ?? getToday(),
    machine: record.machine ?? machines[0],
    format: record.format ?? '',
    responsible: record.responsible ?? '',
    measurements: {
      ...fallback.measurements,
      ...(record.measurements ?? {}),
    },
    threadDiameters: normalizeBlowerGrid(record.threadDiameters, blowerThreadDiameterRows, blowerThreadColumnKeys),
    bottleTemperatures: normalizeBlowerGrid(record.bottleTemperatures, blowerBottleTemperatureRows, blowerTemperatureColumnKeys),
    processVariables: normalizeBlowerGrid(record.processVariables, blowerProcessVariableRows, blowerProcessColumnKeys),
    waterHardnessTime: record.waterHardnessTime ?? '',
    waterHardnessValue: record.waterHardnessValue ?? '',
    comments: {
      first: record.comments?.first ?? '',
      second: record.comments?.second ?? '',
    },
    signatures: {
      first: record.signatures?.first ?? '',
      second: record.signatures?.second ?? '',
    },
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

function loadBlowerProcessVariableRecords() {
  try {
    const storedRecords = window.localStorage.getItem(BLOWER_PROCESS_VARIABLE_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeBlowerProcessVariableRecord)
      : [];
  } catch {
    return [];
  }
}

function saveBlowerProcessVariableRecords(records) {
  window.localStorage.setItem(BLOWER_PROCESS_VARIABLE_STORAGE_KEY, JSON.stringify((records ?? []).map(normalizeBlowerProcessVariableRecord)));
}

function getFirstFilledBlowerGridValue(grid, rows, columns) {
  for (const row of rows) {
    for (const column of columns) {
      const value = grid?.[row.key]?.[column];
      if (value) {
        return value;
      }
    }
  }

  return '';
}

function DigitalSignaturePad({ label, value = '', onChange, className = '' }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    const context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2;
    context.strokeStyle = '#111111';

    if (value) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, rect.width, rect.height);
        context.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = value;
    }
  };

  useEffect(() => {
    resizeCanvas();
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [value]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const draw = (event) => {
    if (!drawingRef.current) {
      return;
    }

    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const nextPoint = getPoint(event);
    const lastPoint = lastPointRef.current ?? nextPoint;

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
  };

  const stopDrawing = (event) => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onChange?.(canvasRef.current.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    onChange?.('');
  };

  return (
    <div className={`digital-signature ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        aria-label={label}
      />
      <div className="digital-signature-footer">
        <span>{label}</span>
        <button type="button" onClick={clearSignature}>Limpiar</button>
      </div>
    </div>
  );
}

function normalizeDecimalValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(String(value).replace(',', '.'));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeTimeMinuteValue(value) {
  const cleanValue = String(value ?? '').trim();
  const match = cleanValue.match(/^(\d{2}):(\d{2})/);

  return match ? `${match[1]}:${match[2]}` : cleanValue;
}

function getBlowerVariableLimitStatus(value, limits = {}) {
  const safeLimits = limits ?? {};

  if (value === '' || value === null || value === undefined) {
    return 'pending';
  }

  const numericValue = normalizeDecimalValue(value);

  if (numericValue === null) {
    return 'invalid';
  }

  const min = normalizeDecimalValue(safeLimits.min);
  const max = normalizeDecimalValue(safeLimits.max);

  if (min !== null && numericValue < min) {
    return 'bad';
  }

  if (max !== null && numericValue > max) {
    return 'bad';
  }

  return (min !== null || max !== null) ? 'ok' : 'pending';
}

function getBlowerVariableLimitText(limits = {}) {
  const safeLimits = limits ?? {};
  const min = normalizeDecimalValue(safeLimits.min);
  const max = normalizeDecimalValue(safeLimits.max);

  if (min !== null && max !== null) {
    return `Min ${limits.min} / Max ${limits.max}`;
  }

  if (min !== null) {
    return `Min ${limits.min}`;
  }

  if (max !== null) {
    return `Max ${limits.max}`;
  }

  return '';
}

function normalizeBlowerShift(shift = {}) {
  return {
    qualityAuxiliary: shift.qualityAuxiliary ?? '',
    operator: shift.operator ?? '',
    packageFrom: shift.packageFrom ?? '',
    packageTo: shift.packageTo ?? '',
  };
}

function normalizeBlowerShifts(shifts = {}) {
  return blowerShiftKeys.reduce((normalizedShifts, key) => ({
    ...normalizedShifts,
    [key]: normalizeBlowerShift(shifts[key]),
  }), {});
}

function getBlowerVisualDefectKey(groupKey, defectLabel) {
  return createStableTextId(`${groupKey}-defect`, defectLabel);
}

function normalizeBlowerVisualInspection(inspection = {}) {
  const normalizedEntries = {};
  const normalizedOtherTexts = {};
  const legacyPackagePalletNumber = inspection.packagePalletNumber ?? '';
  const packagePalletNumbers = blowerVisualInspectionColumns.reduce((numbers, column, index) => ({
    ...numbers,
    [column]: inspection.packagePalletNumbers?.[column] ?? (index === 0 ? legacyPackagePalletNumber : ''),
  }), {});

  blowerVisualDefectGroups.forEach((group) => {
    group.defects.forEach((defect) => {
      const defectKey = getBlowerVisualDefectKey(group.key, defect);
      const currentEntry = inspection.entries?.[defectKey] ?? {};
      normalizedEntries[defectKey] = blowerVisualInspectionColumns.reduce((columns, column) => ({
        ...columns,
        [column]: currentEntry[column] === true || currentEntry[column] === 'true' || currentEntry[column] === '✓' || currentEntry[column] === 'x' || currentEntry[column] === 'X',
      }), {});

      if (defect === 'Otros') {
        normalizedOtherTexts[defectKey] = inspection.otherTexts?.[defectKey] ?? '';
      }
    });
  });

  return {
    packagePalletNumber: packagePalletNumbers[blowerVisualInspectionColumns[0]] ?? '',
    packagePalletNumbers,
    entries: normalizedEntries,
    otherTexts: normalizedOtherTexts,
  };
}

function getBlowerPackagePalletSummary(inspection = {}) {
  const normalizedInspection = normalizeBlowerVisualInspection(inspection);

  return blowerVisualInspectionColumns
    .map((column) => normalizedInspection.packagePalletNumbers?.[column] ?? '')
    .filter(Boolean)
    .join(', ');
}

function normalizeBlowerPresenceChecks(checks = {}) {
  return blowerPresenceCheckRows.reduce((normalizedRows, row) => ({
    ...normalizedRows,
    [row.key]: blowerShiftKeys.reduce((normalizedShifts, shiftKey) => {
      const currentCheck = checks[row.key]?.[shiftKey] ?? {};

      return {
        ...normalizedShifts,
        [shiftKey]: {
          presence: Boolean(currentCheck.presence),
          absence: Boolean(currentCheck.absence),
        },
      };
    }, {}),
  }), {});
}

function normalizeBlowerVariableRecord(record = {}) {
  return {
    id: record.id ?? crypto.randomUUID(),
    saiCode: record.saiCode ?? '',
    productionDate: record.productionDate ?? getToday(),
    client: record.client ?? '',
    bottleOp: record.bottleOp ?? '',
    packageType: record.packageType ?? '',
    packageQuantity: record.packageQuantity ?? '',
    format: record.format ?? '',
    packageBag: record.packageBag ?? '',
    pallet: record.pallet ?? '',
    machine: record.machine ?? machines[0],
    preformOp: record.preformOp ?? '',
    gramColor: record.gramColor ?? '',
    resin: record.resin ?? '',
    shifts: normalizeBlowerShifts(record.shifts),
    visualInspection: normalizeBlowerVisualInspection(record.visualInspection),
    presenceChecks: normalizeBlowerPresenceChecks(record.presenceChecks),
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
}

function loadBlowerVariableControlRecords() {
  try {
    const storedRecords = window.localStorage.getItem(BLOWER_VARIABLE_CONTROL_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeBlowerVariableRecord)
      : [];
  } catch {
    return [];
  }
}

function saveBlowerVariableControlRecords(records) {
  window.localStorage.setItem(BLOWER_VARIABLE_CONTROL_STORAGE_KEY, JSON.stringify((records ?? []).map(normalizeBlowerVariableRecord)));
}

function getBlowerPresenceCheckText(record, rowKey, shiftKey) {
  const check = record.presenceChecks?.[rowKey]?.[shiftKey] ?? {};

  if (check.presence) {
    return 'Presencia';
  }

  if (check.absence) {
    return 'Ausencia';
  }

  return '-';
}

function getBlowerVariableDocumentHtml(rawRecord) {
  const record = normalizeBlowerVariableRecord(rawRecord);
  const visualInspection = normalizeBlowerVisualInspection(record.visualInspection);
  const visualRows = blowerVisualDefectGroups.map((group) => `
    <tr class="group-row"><th colspan="${blowerVisualInspectionColumns.length + 1}">${escapeHtml(group.title)}</th></tr>
    ${group.defects.map((defect) => {
      const defectKey = getBlowerVisualDefectKey(group.key, defect);
      const defectLabel = defect === 'Otros' && visualInspection.otherTexts?.[defectKey]
        ? `${defect}: ${visualInspection.otherTexts[defectKey]}`
        : defect;

      return `
        <tr>
          <td>${escapeHtml(defectLabel)}</td>
          ${blowerVisualInspectionColumns.map((column) => `<td>${visualInspection.entries?.[defectKey]?.[column] ? '&#10003;' : ''}</td>`).join('')}
        </tr>
      `;
    }).join('')}
  `).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Registro control variables sopladora</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: letter landscape; margin: 5mm; }
          html,
          body { margin: 0; color: #000; background: #eef2f4; font-family: Arial, sans-serif; }
          body { padding: 10px; }
          .toolbar { display: flex; justify-content: flex-end; width: 10.45in; margin: 0 auto 8px; }
          button { border: 0; border-radius: 6px; padding: 9px 12px; background: #2457a6; color: #fff; font-weight: 700; cursor: pointer; }
          .sheet {
            width: 10.45in;
            min-height: 7.45in;
            margin: 0 auto;
            padding: 0.1in 0.12in;
            overflow: hidden;
            background:
              linear-gradient(#d8dde1 1px, transparent 1px),
              linear-gradient(90deg, #d8dde1 1px, transparent 1px),
              #ffffff;
            background-size: 0.22in 0.22in;
            border: 1px solid #9ba4aa;
          }
          .header { display: grid; grid-template-columns: 1.95in 1fr 1.75in; gap: 0.08in; align-items: center; margin-bottom: 0.05in; }
          .logo { color: #d21f28; font-size: 26px; font-weight: 900; line-height: 1; }
          .logo img { width: 1.65in; max-height: 0.62in; object-fit: contain; }
          h1 { margin: 0; font-size: 16px; line-height: 1.08; text-align: center; }
          .code { text-align: right; font-size: 9px; line-height: 1.2; font-weight: 900; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 0.05in; background: rgba(255, 255, 255, 0.92); break-inside: avoid; page-break-inside: avoid; }
          th { background: #d9e6f2; font-weight: 900; text-align: center; }
          th,
          td { border: 1px solid #111; padding: 1px 3px; height: 0.17in; font-size: 8.2px; line-height: 1.05; vertical-align: middle; overflow: hidden; overflow-wrap: anywhere; }
          .label { width: 1.25in; font-weight: 900; }
          .production-table th,
          .shift-table th { height: 0.18in; font-size: 9px; }
          .shift-table td { text-align: center; }
          .visual-table th,
          .visual-table td { height: 0.135in; padding: 0 2px; font-size: 7.5px; line-height: 1; }
          .visual-table td:first-child { width: 1.85in; text-align: left; }
          .visual-table td:not(:first-child) { text-align: center; font-size: 9px; font-weight: 900; }
          .group-row th { height: 0.14in; background: #eeeeee; text-align: center; font-size: 8.4px; }
          .presence-table { margin-bottom: 0; }
          .presence-table td,
          .presence-table th { text-align: center; height: 0.18in; font-size: 8px; }
          .presence-table td:first-child { text-align: left; font-weight: 900; }
          @media print {
            html,
            body { width: 11in; height: 8.5in; background: #ffffff; }
            body { padding: 0; }
            .toolbar { display: none; }
            .sheet { width: 10.45in; min-height: 7.45in; margin: 0; border-color: #c4c4c4; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
        <section class="sheet">
          <header class="header">
            <div class="logo"><img src="/logos/logo-empacar.png" alt="EMPACAR" onerror="this.replaceWith(document.createTextNode('EMPACAR'))" /></div>
            <h1>Registro de control variables - atributos de botellas PET maquina sopladora</h1>
            <div class="code">
              <div>REG-LAS-01-Rev.02</div>
              <div>REVISION: 05-04-2018</div>
              <div>PAGINA 1 de 4</div>
            </div>
          </header>
          <table class="production-table">
            <tr><th colspan="4">DATOS DE PRODUCCION - BOTELLA</th><th colspan="2">DATOS DE REFERENCIA</th></tr>
            <tr><td class="label">Fecha produccion</td><td>${escapeHtml(record.productionDate)}</td><td class="label">Cliente</td><td>${escapeHtml(record.client)}</td><td class="label">OP-preforma</td><td>${escapeHtml(record.preformOp)}</td></tr>
            <tr><td class="label">OP-botella</td><td>${escapeHtml(record.bottleOp)}</td><td class="label">Tipo empaque</td><td>${escapeHtml(record.packageType)}</td><td class="label">Gramaje - Color</td><td>${escapeHtml(record.gramColor)}</td></tr>
            <tr><td class="label">Formato</td><td colspan="3">${escapeHtml(record.format)}</td><td class="label">Resina</td><td>${escapeHtml(record.resin)}</td></tr>
            <tr><td class="label">Maquina</td><td>${escapeHtml(record.machine)}</td><td class="label">Paquete/Pallet</td><td>${escapeHtml(record.packageBag)} / ${escapeHtml(record.pallet)}</td><td class="label">Codigo SAI</td><td>${escapeHtml(record.saiCode)}</td></tr>
          </table>
          <table class="shift-table">
            <tr><th></th>${blowerShiftKeys.map((shiftKey) => `<th>${escapeHtml(blowerShiftLabels[shiftKey])}</th>`).join('')}</tr>
            <tr><td class="label">Auxiliar de Calidad</td>${blowerShiftKeys.map((shiftKey) => `<td>${escapeHtml(record.shifts?.[shiftKey]?.qualityAuxiliary ?? '')}</td>`).join('')}</tr>
            <tr><td class="label">Operador</td>${blowerShiftKeys.map((shiftKey) => `<td>${escapeHtml(record.shifts?.[shiftKey]?.operator ?? '')}</td>`).join('')}</tr>
            <tr><td class="label">Nro. Empaque producido</td>${blowerShiftKeys.map((shiftKey) => `<td>Del ${escapeHtml(record.shifts?.[shiftKey]?.packageFrom ?? '')} al ${escapeHtml(record.shifts?.[shiftKey]?.packageTo ?? '')}</td>`).join('')}</tr>
          </table>
          <table class="visual-table">
            <tr><th colspan="${blowerVisualInspectionColumns.length + 1}">INSPECCION VISUAL - # DE BOLSA/PALLET: ${escapeHtml(getBlowerPackagePalletSummary(visualInspection))}</th></tr>
            ${visualRows}
          </table>
          <table class="presence-table">
            <tr><th>Control</th>${blowerShiftKeys.map((shiftKey) => `<th>${escapeHtml(blowerShiftLabels[shiftKey])}</th>`).join('')}</tr>
            ${blowerPresenceCheckRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.label)}</td>
                ${blowerShiftKeys.map((shiftKey) => `<td>${escapeHtml(getBlowerPresenceCheckText(record, row.key, shiftKey))}</td>`).join('')}
              </tr>
            `).join('')}
          </table>
        </section>
      </body>
    </html>
  `;
}

function printBlowerVariableDocument(record) {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');

  if (!printWindow) {
    window.alert('El navegador bloqueo la ventana de impresion.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(getBlowerVariableDocumentHtml(record));
  printWindow.document.close();
}

function getClaimCode(complaints) {
  const currentYear = new Date().getFullYear();
  const nextNumber = (complaints ?? []).filter((claim) => String(claim.code ?? '').includes(String(currentYear))).length + 1;

  return `REC-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
}

function getClaimLabel(claim) {
  if (!claim) {
    return 'Reclamo sin seleccionar';
  }

  return `${claim.code || 'REC'} / ${claim.customer || 'Sin cliente'} / ${claim.product || 'Sin producto'}`;
}

function loadLocalProductionFormats() {
  try {
    const storedFormats = window.localStorage.getItem(PRODUCTION_FORMATS_STORAGE_KEY);
    const parsedFormats = storedFormats ? JSON.parse(storedFormats) : [];

    if (!Array.isArray(parsedFormats)) {
      return [];
    }

    return parsedFormats
      .map((format) => {
        if (typeof format === 'string') {
          return {
            id: createStableTextId('production-format', format),
            label: format,
            imagePath: '',
            imageSrc: '',
          };
        }

        return {
          id: format.id ?? createStableTextId('production-format', format.label),
          label: format.label ?? '',
          imagePath: format.imagePath ?? '',
          imageSrc: format.imageSrc ?? '',
        };
      })
      .filter((format) => format.label);
  } catch {
    return [];
  }
}

function saveLocalProductionFormats(formats) {
  window.localStorage.setItem(PRODUCTION_FORMATS_STORAGE_KEY, JSON.stringify(uniqueProductionFormatsByIdentity((formats ?? []).filter((format) => format?.label))));
}

function normalizeLocalBottleFormat(format) {
  const name = format?.name ?? format?.label ?? '';

  return {
    id: format?.id ?? createStableTextId('bottle-format', name),
    name,
    subtitle: format?.subtitle ?? '',
    accent: format?.accent ?? '#2457a6',
    height: Number(format?.height ?? 214),
    shoulder: Number(format?.shoulder ?? 64),
    body: Number(format?.body ?? 82),
    imagePath: format?.imagePath ?? '',
    imageSrc: format?.imageSrc ?? '',
    productionFormatId: format?.productionFormatId ?? format?.production_format_id ?? '',
    molds: Array.isArray(format?.molds) ? format.molds : parseMoldList(format?.moldsText),
    specs: format?.specs ?? {},
  };
}

function loadLocalBottleFormats() {
  try {
    const storedFormats = window.localStorage.getItem(BOTTLE_FORMATS_STORAGE_KEY);
    const parsedFormats = storedFormats ? JSON.parse(storedFormats) : [];

    return Array.isArray(parsedFormats)
      ? parsedFormats.map(normalizeLocalBottleFormat).filter((format) => format.name)
      : [];
  } catch {
    return [];
  }
}

function saveLocalBottleFormats(formats) {
  const cleanFormats = dedupeTechnicalFormats(uniqueById((formats ?? []).map(normalizeLocalBottleFormat).filter((format) => format.name)));
  window.localStorage.setItem(BOTTLE_FORMATS_STORAGE_KEY, JSON.stringify(cleanFormats));
}

function loadAuthSession() {
  const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!storedSession) {
    return null;
  }

  if (storedSession === 'true') {
    saveAuthSession(null);
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession);

    if (!parsedSession?.username || !parsedSession.userId || !parsedSession.sessionId || !parsedSession.loginAt || !parsedSession.loginDate) {
      saveAuthSession(null);
      return null;
    }

    const expiredByDate = parsedSession.loginDate !== getToday();

    if (expiredByDate) {
      saveAuthSession(null);
      return null;
    }

    return {
      ...parsedSession,
      // Las sesiones locales (usuario admin del servidor local) traen su rol real
      // desde SQLite, no hay que pisarlo con la heuristica por nombre de usuario.
      role: parsedSession.authProvider === 'local'
        ? parsedSession.role
        : getDefaultUserRole(parsedSession.username ?? parsedSession.displayName),
    };
  } catch {
    return null;
  }
}

function getSupabaseUserProfile(user) {
  const emailName = user.email?.split('@')[0] ?? 'usuario';
  const username = user.email ?? user.id;

  return {
    username,
    displayName: user.user_metadata?.display_name ?? user.user_metadata?.name ?? emailName,
    userId: user.id,
    sessionId: crypto.randomUUID(),
    role: getDefaultUserRole(username),
  };
}

async function getTrustedQualityRole(user) {
  const fallbackRole = getDefaultUserRole(user?.email ?? user?.user_metadata?.display_name ?? '');
  if (!supabase || !user?.id) return fallbackRole;

  const { data, error } = await supabase.rpc('get_current_quality_role');
  if (error) {
    console.warn('No se pudo consultar el rol seguro del usuario:', error.message);
    return fallbackRole;
  }

  return ['admin', 'calidad', 'lectura'].includes(data) ? data : fallbackRole;
}

function formatDisplayName(value) {
  return String(value ?? 'Usuario')
    .trim()
    .split(/\s+/)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : ''))
    .join(' ');
}

function getLoginEmail(username) {
  const cleanUsername = username.trim().toLowerCase();
  return cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@petnova.local`;
}

function getPasswordSecurityMessage(password) {
  if (password.length < 8) {
    return 'La nueva contrasena debe tener al menos 8 caracteres.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'La nueva contrasena debe incluir al menos una mayuscula.';
  }

  if (!/[a-z]/.test(password)) {
    return 'La nueva contrasena debe incluir al menos una minuscula.';
  }

  if (!/\d/.test(password)) {
    return 'La nueva contrasena debe incluir al menos un numero.';
  }

  return '';
}

function getPasswordStrength(password) {
  const checks = [
    { key: 'length', label: '8 caracteres', ok: password.length >= 8 },
    { key: 'upper', label: 'Mayuscula', ok: /[A-Z]/.test(password) },
    { key: 'lower', label: 'Minuscula', ok: /[a-z]/.test(password) },
    { key: 'number', label: 'Numero', ok: /\d/.test(password) },
    { key: 'symbol', label: 'Simbolo', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((check) => check.ok).length;

  if (!password) {
    return { score: 0, label: 'Sin evaluar', className: 'empty', checks };
  }

  if (score <= 2) {
    return { score, label: 'Debil', className: 'weak', checks };
  }

  if (score <= 4) {
    return { score, label: 'Media', className: 'medium', checks };
  }

  return { score, label: 'Fuerte', className: 'strong', checks };
}

function saveAuthSession(user) {
  if (user) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      username: user.username,
      displayName: user.displayName,
      userId: user.userId,
      sessionId: user.sessionId,
      role: user.role ?? getDefaultUserRole(user.username ?? user.displayName),
      authProvider: user.authProvider ?? 'supabase',
      loginAt: new Date().toISOString(),
      loginDate: getToday(),
    }));
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getActiveSessionExpiry() {
  return new Date(Date.now() + ACTIVE_SESSION_TIMEOUT_MS).toISOString();
}

async function acquireActiveUserSession(profile) {
  if (!supabase || !profile?.userId || !profile?.sessionId) {
    return { ok: false, message: 'No se pudo validar la sesion activa.' };
  }

  const { data: currentSession, error: readError } = await supabase
    .from(ACTIVE_USER_SESSION_TABLE)
    .select('session_id, expires_at')
    .eq('user_id', profile.userId)
    .maybeSingle();

  if (readError) {
    console.error('No se pudo revisar la sesion activa:', readError);
    return { ok: false, message: 'No se pudo validar si la cuenta ya esta en uso.' };
  }

  const sessionIsActive = currentSession?.expires_at
    && new Date(currentSession.expires_at).getTime() > Date.now();
  const sessionBelongsToAnotherDevice = currentSession?.session_id
    && currentSession.session_id !== profile.sessionId;

  if (sessionIsActive && sessionBelongsToAnotherDevice) {
    return {
      ok: false,
      message: 'Esta cuenta ya esta abierta en otro dispositivo. Cierre sesion ahi o espere unos minutos si quedo abierta.',
    };
  }

  const now = new Date().toISOString();
  const { error: writeError } = await supabase
    .from(ACTIVE_USER_SESSION_TABLE)
    .upsert({
      user_id: profile.userId,
      session_id: profile.sessionId,
      username: profile.username,
      last_seen_at: now,
      expires_at: getActiveSessionExpiry(),
      updated_at: now,
    }, { onConflict: 'user_id' });

  if (writeError) {
    console.error('No se pudo guardar la sesion activa:', writeError);
    return { ok: false, message: 'No se pudo registrar la sesion activa.' };
  }

  return { ok: true };
}

async function refreshActiveUserSession(profile) {
  if (!supabase || !profile?.userId || !profile?.sessionId) {
    return false;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(ACTIVE_USER_SESSION_TABLE)
    .update({
      last_seen_at: now,
      expires_at: getActiveSessionExpiry(),
      updated_at: now,
    })
    .eq('user_id', profile.userId)
    .eq('session_id', profile.sessionId)
    .select('session_id')
    .maybeSingle();

  if (error) {
    console.error('No se pudo renovar la sesion activa:', error);
    return false;
  }

  return Boolean(data);
}

async function releaseActiveUserSession(profile) {
  if (!supabase || !profile?.userId || !profile?.sessionId) {
    return;
  }

  const { error } = await supabase
    .from(ACTIVE_USER_SESSION_TABLE)
    .delete()
    .eq('user_id', profile.userId)
    .eq('session_id', profile.sessionId);

  if (error) {
    console.error('No se pudo liberar la sesion activa:', error);
  }
}

function getGroupKey(date, formatId) {
  return `${date}__${formatId}`;
}

function getGroupStatus(entries) {
  return entries.some((entry) => entry.status !== 'Conforme') ? 'Fuera de tolerancia' : 'Conforme';
}

function mergeCertificateDetails(existingDetails = {}, incomingDetails = {}) {
  return {
    lote: incomingDetails.lote || existingDetails.lote || '',
    ordenProduccion: incomingDetails.ordenProduccion || existingDetails.ordenProduccion || '',
    resinaUtilizada: incomingDetails.resinaUtilizada || existingDetails.resinaUtilizada || '',
  };
}

function getRecordCertificateDetails(record) {
  const firstEntryDetails = record.entries?.find((entry) => entry.certificateDetails)?.certificateDetails ?? {};
  return mergeCertificateDetails(firstEntryDetails, record.certificateDetails);
}

function normalizeStoredRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  const groups = new Map();

  records.forEach((record) => {
    if (Array.isArray(record.entries)) {
      groups.set(record.id, {
        ...record,
        status: record.status ?? getGroupStatus(record.entries),
      });
      return;
    }

    const key = getGroupKey(record.date, record.formatId);
    const existingGroup = groups.get(key);
    const entry = {
      id: record.id ?? crypto.randomUUID(),
      mold: record.mold,
      machine: record.machine,
      measurements: record.measurements,
      evaluations: record.evaluations,
      status: record.status ?? 'Sin evaluar',
      createdAt: record.createdAt ?? new Date().toISOString(),
    };

    if (existingGroup) {
      existingGroup.entries.push(entry);
      existingGroup.status = getGroupStatus(existingGroup.entries);
      existingGroup.updatedAt = entry.createdAt;
      return;
    }

    groups.set(key, {
      id: key,
      date: record.date,
      formatId: record.formatId,
      formatName: record.formatName,
      entries: [entry],
      status: entry.status,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
    });
  });

  return Array.from(groups.values());
}

function getMeasurementStatus(value, spec) {
  if (!spec || value === '') {
    return 'pending';
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return 'invalid';
  }

  return numericValue >= spec.min && numericValue <= spec.max ? 'ok' : 'bad';
}

function getValidationLabel(status) {
  const labels = {
    ok: 'Bien',
    bad: 'Mal',
    invalid: 'Dato invalido',
    pending: 'Pendiente',
  };

  return labels[status] ?? labels.pending;
}

function buildEvaluations(measurements, format) {
  return measurementFields.reduce((evaluations, field) => {
    const spec = format?.specs?.[field.key];
    const value = measurements[field.key];

    return {
      ...evaluations,
      [field.key]: {
        status: getMeasurementStatus(value, spec),
        spec: spec ?? null,
      },
    };
  }, {});
}

function createEmptySpecificationSample() {
  return technicalSpecificationSampleFields.reduce((sample, field) => ({ ...sample, [field.key]: '' }), {});
}

function ensureSpecificationSampleCount(samples, sampleCount) {
  const nextCount = Math.max(0, Number(sampleCount) || 0);

  return Array.from({ length: nextCount }, (_, index) => ({
    ...createEmptySpecificationSample(),
    ...(samples[index] ?? {}),
  }));
}

function hasTechnicalSpecs(format) {
  return Object.values(format?.specs ?? {}).some((spec) => (
    Number.isFinite(Number(spec?.min)) && Number.isFinite(Number(spec?.max))
  ));
}

function buildSpecsFromSamples(samples) {
  const specs = technicalSpecificationSampleFields.reduce((currentSpecs, field) => {
    const values = samples
      .map((sample) => Number(String(sample[field.key] ?? '').replace(',', '.')))
      .filter(Number.isFinite);

    if (values.length === 0) {
      return currentSpecs;
    }

    return {
      ...currentSpecs,
      [field.key]: {
        min: Number(Math.min(...values).toFixed(3)),
        max: Number(Math.max(...values).toFixed(3)),
      },
    };
  }, {});

  return applyTechnicalSpecAliases(specs);
}

function applyTechnicalSpecAliases(specs = {}) {
  const nextSpecs = { ...(specs ?? {}) };

  if (nextSpecs.alturaLlenado && !nextSpecs.cabecera) {
    nextSpecs.cabecera = nextSpecs.alturaLlenado;
  }

  if (nextSpecs.cabecera && !nextSpecs.alturaLlenado) {
    nextSpecs.alturaLlenado = nextSpecs.cabecera;
  }

  return nextSpecs;
}

function summarizeEvaluations(evaluations) {
  return Object.values(evaluations).reduce(
    (summary, item) => {
      if (item.status === 'ok') {
        return { ...summary, ok: summary.ok + 1 };
      }

      if (item.status === 'bad' || item.status === 'invalid') {
        return { ...summary, bad: summary.bad + 1 };
      }

      return summary;
    },
    { ok: 0, bad: 0 },
  );
}

function createMoldMeasurementDrafts(format, count, currentDrafts = []) {
  const nextCount = Math.min(24, Math.max(1, Number(count) || 1));
  const formatMolds = Array.isArray(format?.molds) ? format.molds : [];

  return Array.from({ length: nextCount }, (_, index) => {
    const mold = formatMolds[index] || `Molde ${index + 1}`;
    const existingDraft = currentDrafts.find((draft) => draft.mold === mold) ?? currentDrafts[index] ?? {};

    return {
      mold,
      measurements: {
        ...emptyMeasurements,
        ...(existingDraft.measurements ?? {}),
      },
    };
  });
}

function hasAnyMeasurement(measurements = {}) {
  return Object.values(measurements).some((value) => String(value ?? '').trim() !== '');
}

function normalizeFormatText(value) {
  const text = String(value ?? '');

  if (!/[ÃÂ]/.test(text)) {
    return text;
  }

  try {
    const decodedWithUri = decodeURIComponent(escape(text));

    if (!decodedWithUri.includes('�')) {
      return decodedWithUri;
    }
  } catch {
    // Continue with the byte fallback below.
  }

  try {
    const decoded = new TextDecoder('utf-8').decode(
      Uint8Array.from(Array.from(text), (character) => character.charCodeAt(0)),
    );

    return decoded.includes('�') ? text : decoded;
  } catch {
    return text;
  }
}

function getBottleColorLabel(formatName) {
  const name = normalizeFormatText(formatName).toUpperCase();

  if (/\bBL\b|BLANCO/.test(name)) {
    return 'BLANCO';
  }

  if (/\bVE\b|VERDE/.test(name)) {
    return 'VERDE';
  }

  if (/\bCR\b|CRISTAL/.test(name)) {
    return 'CRISTAL';
  }

  return 'SIN COLOR';
}

function getBottleVolumeLabel(formatName) {
  const name = normalizeFormatText(formatName).toUpperCase();
  const literMatch = name.match(/(\d+(?:[.,]\d+)?)\s*(?:LT|LTS|LITROS|L)\b/);

  if (literMatch) {
    return `${literMatch[1].replace(',', '.')} LT`;
  }

  const ccMatch = name.match(/(\d+(?:[.,]\d+)?)\s*CC\b/);

  if (ccMatch) {
    return `${ccMatch[1].replace(',', '.')} CC`;
  }

  return 'SIN VOLUMEN';
}

function getBottleGramLabel(formatName) {
  const name = normalizeFormatText(formatName).toUpperCase();
  const gramsMatch = name.match(/(\d+(?:[.,]\d+)?)\s*(?:GR|G)\b/);

  return gramsMatch ? `${gramsMatch[1].replace(',', '.')} GR` : 'SIN GRAMAJE';
}

function getBottleSuffixLabel(format) {
  const source = normalizeFormatText(`${format?.name ?? ''} ${format?.subtitle ?? ''}`).toUpperCase();
  const suffixMatch = source.match(/-(100|3)\b/);

  return suffixMatch ? `-${suffixMatch[1]}` : 'SIN GUION';
}

function getBottleNameLabel(formatName) {
  const cleanName = normalizeFormatText(formatName)
    .replace(/ESPECIFICACI[ÓO]N\s+T[ÉE]CNICA/gi, '')
    .replace(/ESPECIFICACI\S*N\s+T\S*CNICA/gi, '')
    .replace(/\bESPECIFICACIONES?\b/gi, '')
    .replace(/\bT[ÉE]CNICAS?\b/gi, '')
    .replace(/\bBOTELLA\b|\bBOT\b/gi, '')
    .replace(/\bCR\b|\bBL\b|\bVE\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:CC|LT|LTS|LITROS|L)\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:GR|G)\b/gi, '')
    .replace(/\(\s*[^)]*\s*\)/g, '')
    .replace(/\bSF\b|\bSFRU\b/gi, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanName ? cleanName.toUpperCase() : 'BOTELLA PET';
}

function getBottleFormatOptionLabel(format) {
  return [
    getBottleNameLabel(format.name),
    getBottleColorLabel(format.name),
    getBottleVolumeLabel(format.name),
    getBottleGramLabel(format.name),
    getBottleSuffixLabel(format),
  ].join(' / ');
}

function getComparableFormatText(value) {
  return normalizeFormatText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/([0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([0-9])/g, '$1 $2')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*CC\b/g, (_, rawValue) => {
      const numericValue = Number.parseFloat(String(rawValue).replace(',', '.'));

      if (!Number.isFinite(numericValue)) {
        return `${rawValue} CC`;
      }

      const normalizedValue = numericValue >= 1000 ? numericValue / 1000 : numericValue;
      const unit = numericValue >= 1000 ? 'L' : 'CC';

      return `${normalizedValue.toFixed(3).replace(/\.?0+$/, '')} ${unit}`;
    })
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\b(\d+)\s*(?:LTS|LITROS|LITRO|LT|L)\b/g, '$1 L')
    .replace(/\b(\d+)\s*(?:GRS|GRAMOS|GRAMO|GR|G)\b/g, '$1 G')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFormatIdentityKey(value) {
  return getComparableFormatText(value)
    .replace(/\bESPECIFICACION(?:ES)?\b/g, ' ')
    .replace(/\bTECNICA(?:S)?\b/g, ' ')
    .replace(/\bBOTELLA\b|\bBOT\b/g, ' ')
    .replace(/\bCOD(?:IGO)?\b\s*\d+(?:\s*\d+)?/g, ' ')
    .replace(/\bVE\b/g, ' VERDE ')
    .replace(/\bCR\b/g, ' CRISTAL ')
    .replace(/\bBL\b/g, ' BLANCO ')
    .replace(/\bEN+AL\s+SIN\b/g, ' ENALSIM ')
    .replace(/\bEN+AL\s+SIM\b/g, ' ENALSIM ')
    .replace(/\bEN+ALSI[MN]\b/g, ' ENALSIM ')
    .replace(/\s+/g, ' ')
    .trim();
}

const localBottleImagesByFormat = new Map([
  [
    getFormatIdentityKey('0.660L Cristal-100 Bebidas 22g'),
    '/botellas/botella%20bebidas%20600cc-100%2022g.jpeg',
  ],
]);

function getLocalBottleImageSrc(label) {
  return localBottleImagesByFormat.get(getFormatIdentityKey(label)) ?? '';
}

function matchesFormatSearch(label, search) {
  const cleanSearch = getComparableFormatText(search);

  return !cleanSearch || getComparableFormatText(label).includes(cleanSearch);
}

function getFormatSuffixFromLabel(label) {
  const suffixMatch = normalizeFormatText(label).match(/-(100|3)\b/i);

  return suffixMatch ? `-${suffixMatch[1]}` : '';
}

function isFantaGeneric3LiterFormat(label) {
  const comparableLabel = getComparableFormatText(label);

  return comparableLabel.includes('3 L')
    && comparableLabel.includes('FANTA')
    && comparableLabel.includes('GENERIC');
}

const UNILEVER_OLA_5L_FORMAT_LABEL = '5L Cristal-3 Ola Unilever 93g';
const unileverOla5LiterFallbackTechnicalFormat = {
  id: 'fallback-technical-5l-ola-unilever-31306',
  name: UNILEVER_OLA_5L_FORMAT_LABEL,
  canonicalLabel: UNILEVER_OLA_5L_FORMAT_LABEL,
  specs: {
    pesoVacia: { min: 92.07, max: 93.93 },
    alturaTotal: { min: 322.4, max: 323.4 },
    diametroInferior: { min: 166.5, max: 167.5 },
    e1: { min: 2.88, max: 3.28 },
    e2: { min: 0.28, max: 0.44 },
  },
};

function isUnileverOla5LiterFormatLabel(label) {
  const comparableLabel = getFormatIdentityKey(label);

  return comparableLabel.includes('31306')
    || (
      comparableLabel.includes('5 L')
      && comparableLabel.includes('UNILEVER')
      && comparableLabel.includes('93 G')
    );
}

function formatIncludesUnileverOla5LiterReference(format, productionFormats = []) {
  const linkedProductionFormat = productionFormats.find((productionFormat) => productionFormat.id === format?.productionFormatId);
  const searchableText = [
    format?.canonicalLabel,
    format?.label,
    format?.name,
    format?.subtitle,
    linkedProductionFormat?.label,
  ].filter(Boolean).join(' ');

  return isUnileverOla5LiterFormatLabel(searchableText);
}

function getCanonicalFormatAlias(label) {
  if (isUnileverOla5LiterFormatLabel(label)) {
    return UNILEVER_OLA_5L_FORMAT_LABEL;
  }

  return '';
}

function getFallbackTechnicalFormatForLabel(label) {
  if (isUnileverOla5LiterFormatLabel(label)) {
    return unileverOla5LiterFallbackTechnicalFormat;
  }

  return null;
}

function getCanonicalFormatLabel(format, productionFormats = []) {
  if (format?.canonicalLabel) {
    const canonicalAlias = getCanonicalFormatAlias(format.canonicalLabel);

    return canonicalAlias || format.canonicalLabel;
  }

  const linkedProductionFormat = productionFormats.find((productionFormat) => productionFormat.id === format?.productionFormatId);

  if (linkedProductionFormat?.label) {
    const linkedAlias = getCanonicalFormatAlias(linkedProductionFormat.label);
    const formatAlias = getCanonicalFormatAlias([
      format?.label,
      format?.name,
      format?.subtitle,
    ].filter(Boolean).join(' '));

    return linkedAlias || formatAlias || linkedProductionFormat.label;
  }

  const registeredName = String(format?.label ?? format?.name ?? '').trim().replace(/\s+/g, ' ');
  const canonicalAlias = getCanonicalFormatAlias(registeredName);

  if (canonicalAlias) {
    return canonicalAlias;
  }

  if (registeredName) {
    return registeredName;
  }

  return getBottleFormatOptionLabel(format);
}

function dedupeTechnicalFormats(formats, productionFormats = []) {
  const formatsByLabel = new Map();

  formats.forEach((format) => {
    const label = getCanonicalFormatLabel(format, productionFormats);
    const labelKey = getFormatIdentityKey(label);
    const existingFormat = formatsByLabel.get(labelKey);

    if (!labelKey) {
      return;
    }

    if (
      !existingFormat
      || (!hasTechnicalSpecs(existingFormat) && hasTechnicalSpecs(format))
      || (existingFormat.isTechnicalPlaceholder && !format.isTechnicalPlaceholder)
    ) {
      formatsByLabel.set(labelKey, format);
    }
  });

  return Array.from(formatsByLabel.values());
}

function applyFanta100SpecsFromFanta3(formats, productionFormats = []) {
  const fanta3Format = formats.find((format) => {
    const label = getCanonicalFormatLabel(format, productionFormats);

    return hasTechnicalSpecs(format)
      && isFantaGeneric3LiterFormat(label)
      && getFormatSuffixFromLabel(label) === '-3';
  });

  if (!fanta3Format) {
    return formats;
  }

  return formats.map((format) => {
    const label = getCanonicalFormatLabel(format, productionFormats);

    if (
      hasTechnicalSpecs(format)
      || !isFantaGeneric3LiterFormat(label)
      || getFormatSuffixFromLabel(label) !== '-100'
    ) {
      return format;
    }

    return {
      ...format,
      specs: fanta3Format.specs,
    };
  });
}

function createTechnicalPlaceholderFormat(label, sourceId = '', productionFormatId = '') {
  const cleanLabel = String(label ?? '').trim().replace(/\s+/g, ' ');

  return {
    id: `technical-placeholder-${sourceId || createStableTextId('format', cleanLabel)}`,
    name: cleanLabel,
    canonicalLabel: cleanLabel,
    subtitle: 'Ficha tecnica pendiente',
    accent: '#2457a6',
    height: 214,
    shoulder: 64,
    body: 82,
    imageSrc: '',
    imagePath: '',
    molds: ['Molde 1'],
    specs: {},
    productionFormatId,
    isTechnicalPlaceholder: true,
  };
}

function getUnifiedFormatOptions(bottleFormats = [], productionFormats = []) {
  const formatsByLabel = new Map();
  const labelKeyById = new Map();

  const addFormat = (format = {}) => {
    const label = String(format.label ?? '').trim().replace(/\s+/g, ' ');
    const comparableLabel = getFormatIdentityKey(label);

    if (!label || !comparableLabel) {
      return;
    }

    const formatId = format.productionFormatId
      || format.id
      || createStableTextId('production-format', label);
    const previousLabelKey = labelKeyById.get(formatId);

    if (previousLabelKey && previousLabelKey !== comparableLabel) {
      formatsByLabel.delete(previousLabelKey);
    }

    const existingFormat = formatsByLabel.get(comparableLabel) ?? {};
    const nextFormat = {
      ...existingFormat,
      ...format,
      id: format.productionFormatId
        || existingFormat.productionFormatId
        || existingFormat.id
        || format.id
        || createStableTextId('production-format', label),
      label,
      imageSrc: format.imageSrc || existingFormat.imageSrc || '',
      imagePath: format.imagePath || existingFormat.imagePath || '',
      productionFormatId: format.productionFormatId || existingFormat.productionFormatId || '',
      technicalFormatId: format.technicalFormatId || existingFormat.technicalFormatId || '',
      technicalFormat: format.technicalFormat || existingFormat.technicalFormat || null,
    };

    formatsByLabel.set(comparableLabel, nextFormat);
    labelKeyById.set(nextFormat.id, comparableLabel);
  };

  fallbackProductionFormatOptions.forEach((label) => {
    addFormat({
      id: createStableTextId('production-format', label),
      label,
    });
  });

  productionFormats.forEach((format) => {
    addFormat({
      id: format.id ?? createStableTextId('production-format', format.label),
      label: format.label,
      imageSrc: format.imageSrc ?? '',
      imagePath: format.imagePath ?? '',
      productionFormatId: format.id ?? createStableTextId('production-format', format.label),
    });
  });

  bottleFormats.forEach((format) => {
    const label = getCanonicalFormatLabel(format, productionFormats);

    addFormat({
      id: format.productionFormatId || createStableTextId('production-format', label),
      label,
      imageSrc: format.imageSrc ?? '',
      imagePath: format.imagePath ?? '',
      productionFormatId: format.productionFormatId || '',
      technicalFormatId: format.id,
      technicalFormat: format,
    });
  });

  return Array.from(formatsByLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function getUnifiedTechnicalFormats(bottleFormats = [], productionFormats = []) {
  const usedLabels = new Set(
    bottleFormats
      .map((format) => getCanonicalFormatLabel(format, productionFormats))
      .map(getFormatIdentityKey)
      .filter(Boolean),
  );
  const usedProductionIds = new Set(bottleFormats.map((format) => format.productionFormatId).filter(Boolean));
  const unifiedFormats = getUnifiedFormatOptions(bottleFormats, productionFormats);
  const placeholderFormats = [];

  unifiedFormats.forEach((format, index) => {
    const label = format.label;
    const comparableLabel = getFormatIdentityKey(label);

    if (!comparableLabel || usedLabels.has(comparableLabel) || usedProductionIds.has(format.productionFormatId || format.id)) {
      return;
    }

    usedLabels.add(comparableLabel);
    const productionFormat = productionFormats.find((currentFormat) => (
      currentFormat.id === (format.productionFormatId || format.id)
      || getFormatIdentityKey(currentFormat.label) === comparableLabel
    ));
    placeholderFormats.push({
      ...createTechnicalPlaceholderFormat(label, productionFormat?.id ?? index, productionFormat?.id ?? format.productionFormatId ?? ''),
      imageSrc: productionFormat?.imageSrc ?? '',
      imagePath: productionFormat?.imagePath ?? '',
    });
  });

  return applyFanta100SpecsFromFanta3(dedupeTechnicalFormats([...bottleFormats, ...placeholderFormats], productionFormats), productionFormats);
}

function cleanProductionNumber(value) {
  const parsedValue = Number.parseFloat(String(value).replace(',', '.'));

  if (!Number.isFinite(parsedValue)) {
    return String(value).replace(',', '.');
  }

  return parsedValue.toFixed(3).replace(/\.?0+$/, '');
}

function getProductionVolumeLabel(format) {
  const source = normalizeFormatText(`${format?.name ?? ''} ${format?.subtitle ?? ''}`).toUpperCase();
  const ccMatch = source.match(/(\d+(?:[.,]\d+)?)\s*CC\b/);

  if (ccMatch) {
    const ccValue = Number.parseFloat(ccMatch[1].replace(',', '.'));

    if (Number.isFinite(ccValue) && ccValue >= 1000) {
      return `${cleanProductionNumber(ccValue / 1000)}L`;
    }

    return `${cleanProductionNumber(ccMatch[1])}cc`;
  }

  const literMatch = source.match(/(\d+(?:[.,]\d+)?)\s*(?:LT|LTS|LITROS|L)\b/);

  if (literMatch) {
    const literValue = Number.parseFloat(literMatch[1].replace(',', '.'));

    if (Number.isFinite(literValue) && literValue < 1) {
      return `${cleanProductionNumber(literValue * 1000)}cc`;
    }

    return `${cleanProductionNumber(literMatch[1])}L`;
  }

  return '';
}

function getProductionGramLabel(format) {
  const source = normalizeFormatText(`${format?.name ?? ''} ${format?.subtitle ?? ''}`).toUpperCase();
  const gramsMatch = source.match(/(\d+(?:[.,]\d+)?)\s*(?:GR|G)\b/);

  return gramsMatch ? `${cleanProductionNumber(gramsMatch[1])}g` : '';
}

function getProductionColorLabel(format) {
  const color = getBottleColorLabel(format?.name ?? '');

  if (color === 'SIN COLOR') {
    return '';
  }

  return color.charAt(0) + color.slice(1).toLowerCase();
}

function getProductionSuffixLabel(format) {
  const suffix = getBottleSuffixLabel(format);

  return suffix === 'SIN GUION' ? '' : suffix;
}

function getProductionNameLabel(format) {
  const name = getBottleNameLabel(format?.name ?? '');

  if (!name || name === 'BOTELLA PET') {
    return '';
  }

  return name
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space, letter) => `${space}${letter.toUpperCase()}`)
    .replace(/\bS\.a\b/g, 'S.A.')
    .replace(/\bSf\b/g, 'SF')
    .replace(/\bSfru\b/g, 'SFRU')
    .replace(/\bUni\b/g, 'UNI');
}

function getProductionFormatLabel(format) {
  const volume = getProductionVolumeLabel(format);
  const color = getProductionColorLabel(format);
  const name = getProductionNameLabel(format);
  const grams = getProductionGramLabel(format);

  if (!volume || !color || !name || !grams) {
    return '';
  }

  return `${volume} ${color}${getProductionSuffixLabel(format)} ${name} ${grams}`
    .replace(/\s+/g, ' ')
    .trim();
}

async function getPrivateAssetUrl(bucket, path) {
  if (!path) {
    return '';
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.error('No se pudo cargar el recurso privado:', error);
    return '';
  }

  return data?.signedUrl ?? '';
}

function getAssetExtension(file) {
  const fromName = file?.name?.split('.').pop();

  if (fromName) {
    return fromName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  }

  return file?.type?.split('/')[1] ?? 'jpg';
}

async function uploadBottleAsset(file, folder, id) {
  if (!file || !folder || !id) {
    return '';
  }

  const extension = getAssetExtension(file);
  const path = `${folder}/${sanitizeStorageName(id)}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(BOTTLE_ASSET_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return path;
}

async function mapBottleFormat(row) {
  const imageSrc = await getPrivateAssetUrl(BOTTLE_ASSET_BUCKET, row.image_path);

  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? '',
    accent: row.accent ?? '#2457a6',
    height: Number(row.height ?? 214),
    shoulder: Number(row.shoulder ?? 64),
    body: Number(row.body ?? 82),
    imagePath: row.image_path ?? '',
    imageSrc,
    productionFormatId: row.production_format_id ?? '',
    molds: row.molds ?? [],
    specs: applyTechnicalSpecAliases(row.specs ?? {}),
  };
}

async function loadBottleFormatsFromSupabase() {
  const { data, error } = await supabase
    .from('bottle_formats')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map(mapBottleFormat));
}

async function mapProductionFormat(row) {
  const imageSrc = await getPrivateAssetUrl(BOTTLE_ASSET_BUCKET, row.image_path);

  return {
    id: row.id,
    label: row.label,
    imagePath: row.image_path ?? '',
    imageSrc,
  };
}

async function loadProductionFormatsFromSupabase() {
  const { data, error } = await supabase
    .from('production_formats')
    .select('id, label, image_path')
    .order('label', { ascending: true });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map(mapProductionFormat));
}

async function mapMasterFormat(row) {
  const imageSrc = await getPrivateAssetUrl(BOTTLE_ASSET_BUCKET, row.image_path);

  return {
    id: row.id,
    saiCode: row.sai_code ?? row.id,
    label: row.label ?? '',
    volume: row.volume ?? '',
    gramaje: row.gramaje ?? '',
    color: row.color ?? '',
    packageQuantity: row.package_quantity ?? '',
    client: row.client ?? '',
    resin: row.resin ?? '',
    imagePath: row.image_path ?? '',
    imageSrc,
    subtitle: row.subtitle ?? '',
    accent: row.accent ?? '#2457a6',
    height: Number(row.height ?? 214),
    shoulder: Number(row.shoulder ?? 64),
    body: Number(row.body ?? 82),
    molds: row.molds ?? [],
    specs: applyTechnicalSpecAliases(row.specs ?? {}),
    needsSaiCode: Boolean(row.needs_sai_code),
    legacyProductionFormatId: row.legacy_production_format_id ?? '',
    legacyBottleFormatId: row.legacy_bottle_format_id ?? '',
  };
}

async function loadMasterFormatsFromSupabase() {
  const { data, error } = await supabase
    .from('formats')
    .select('*')
    .order('needs_sai_code', { ascending: false })
    .order('label', { ascending: true });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map(mapMasterFormat));
}

function mapMasterFormatToProductionFormat(format) {
  return {
    id: format.id,
    label: format.label,
    imagePath: format.imagePath ?? '',
    imageSrc: format.imageSrc ?? '',
    saiCode: format.saiCode ?? format.id,
    technicalFormatId: format.id,
  };
}

function mapMasterFormatToBottleFormat(format) {
  return normalizeLocalBottleFormat({
    id: format.id,
    name: format.label,
    productionFormatId: format.id,
    imagePath: format.imagePath ?? '',
    imageSrc: format.imageSrc ?? '',
    subtitle: format.subtitle ?? '',
    accent: format.accent ?? '#2457a6',
    height: format.height ?? 214,
    shoulder: format.shoulder ?? 64,
    body: format.body ?? 82,
    molds: format.molds ?? [],
    specs: applyTechnicalSpecAliases(format.specs ?? {}),
  });
}

async function saveMasterFormatToSupabase(formatDraft, imageFile = null, previousId = '') {
  const cleanLabel = String(formatDraft.label ?? '').trim().replace(/\s+/g, ' ');
  const cleanSaiCode = normalizeSaiCode(formatDraft.saiCode);

  if (!cleanLabel) {
    return { ok: false, message: 'El nombre del formato no puede quedar vacio.' };
  }

  if (!cleanSaiCode) {
    return { ok: false, message: 'Ingrese el codigo SAI para guardar en la tabla unica.' };
  }

  const nextId = cleanSaiCode;

  if (previousId && previousId !== nextId) {
    const { data: existingFormat, error: existingError } = await supabase
      .from('formats')
      .select('id, label')
      .eq('id', nextId)
      .maybeSingle();

    if (existingError) {
      return { ok: false, message: `No se pudo validar el codigo SAI: ${existingError.message}` };
    }

    if (existingFormat?.id) {
      return { ok: false, message: `Ya existe un formato con el codigo SAI ${nextId}: ${existingFormat.label}` };
    }
  }

  let imagePath = formatDraft.imagePath ?? '';

  if (imageFile) {
    imagePath = await uploadBottleAsset(imageFile, 'formats', nextId);
  }

  const isPendingSaiCode = nextId.startsWith('SIN-SAI-');
  const payload = {
    id: nextId,
    sai_code: nextId,
    label: cleanLabel,
    volume: String(formatDraft.volume ?? '').trim(),
    gramaje: String(formatDraft.gramaje ?? '').trim(),
    color: String(formatDraft.color ?? '').trim(),
    package_quantity: String(formatDraft.packageQuantity ?? '').trim(),
    client: String(formatDraft.client ?? '').trim(),
    resin: String(formatDraft.resin ?? '').trim(),
    image_path: imagePath,
    subtitle: formatDraft.subtitle ?? '',
    accent: formatDraft.accent ?? '#2457a6',
    height: Number(formatDraft.height ?? 214),
    shoulder: Number(formatDraft.shoulder ?? 64),
    body: Number(formatDraft.body ?? 82),
    molds: Array.isArray(formatDraft.molds) ? formatDraft.molds : [],
    specs: sanitizeFormatSpecs(formatDraft.specs),
    legacy_production_format_id: formatDraft.legacyProductionFormatId ?? '',
    legacy_bottle_format_id: formatDraft.legacyBottleFormatId ?? '',
    needs_sai_code: isPendingSaiCode,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('formats')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    return { ok: false, message: `No se pudo guardar el formato unico: ${error.message}` };
  }

  if (previousId && previousId !== nextId) {
    const { error: deleteOldError } = await supabase
      .from('formats')
      .delete()
      .eq('id', previousId);

    if (deleteOldError) {
      return { ok: false, message: `Se guardo el codigo nuevo, pero no se pudo borrar el anterior: ${deleteOldError.message}` };
    }
  }

  return { ok: true, format: await mapMasterFormat(data) };
}

function sanitizeFormatSpecs(specs = {}) {
  const cleanSpecs = Object.entries(specs ?? {}).reduce((currentSpecs, [key, limits]) => {
    const min = String(limits?.min ?? '').trim();
    const max = String(limits?.max ?? '').trim();

    if (!min && !max) {
      return currentSpecs;
    }

    return {
      ...currentSpecs,
      [key]: {
        ...(min ? { min: Number(min.replace(',', '.')) } : {}),
        ...(max ? { max: Number(max.replace(',', '.')) } : {}),
      },
    };
  }, {});

  return applyTechnicalSpecAliases(cleanSpecs);
}

async function deleteMasterFormatFromSupabase(formatId) {
  const { error } = await supabase
    .from('formats')
    .delete()
    .eq('id', formatId);

  if (error) {
    return { ok: false, message: `No se pudo borrar el formato unico: ${error.message}` };
  }

  return { ok: true };
}

async function saveProductionFormatToSupabase(label, imageFile = null, currentId = '') {
  const cleanLabel = String(label ?? '').trim().replace(/\s+/g, ' ');

  if (!cleanLabel) {
    return { ok: false, message: 'Escriba el formato que desea agregar.' };
  }

  const id = currentId || createStableTextId('production-format', cleanLabel);
  let imagePath = '';

  if (imageFile) {
    imagePath = await uploadBottleAsset(imageFile, 'production-formats', id);
  }

  const payload = {
    id,
    label: cleanLabel,
    updated_at: new Date().toISOString(),
  };

  if (imagePath) {
    payload.image_path = imagePath;
  }

  const { error } = await supabase
    .from('production_formats')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    if (String(error.message ?? '').includes('production_formats_label_key')) {
      const { data: existingRow, error: existingError } = await supabase
        .from('production_formats')
        .select('id, label, image_path')
        .eq('label', cleanLabel)
        .maybeSingle();

      if (!existingError && existingRow?.id && existingRow.id !== id) {
        return {
          ok: true,
          merged: true,
          mergedFromId: id,
          format: await mapProductionFormat(existingRow),
        };
      }
    }

    return { ok: false, message: `No se pudo guardar el formato en Supabase: ${error.message}` };
  }

  return {
    ok: true,
    format: {
      id,
      label: cleanLabel,
      imagePath,
      imageSrc: imagePath ? await getPrivateAssetUrl(BOTTLE_ASSET_BUCKET, imagePath) : '',
    },
  };
}

function parseMoldList(value) {
  const molds = String(value ?? '')
    .split(',')
    .map((mold) => mold.trim())
    .filter(Boolean);

  return molds.length > 0 ? molds : ['Molde 1'];
}

async function saveBottleFormatToSupabase(format, values) {
  const cleanName = String(values.name ?? format?.name ?? '').trim().replace(/\s+/g, ' ');

  if (!cleanName) {
    return { ok: false, message: 'El nombre del formato tecnico no puede quedar vacio.' };
  }

  const formatId = format?.id ?? createStableTextId('bottle-format', cleanName);
  const payload = {
    id: formatId,
    name: cleanName,
    updated_at: new Date().toISOString(),
  };
  const productionFormatId = values.productionFormatId ?? format?.productionFormatId ?? '';

  if (productionFormatId) {
    payload.production_format_id = productionFormatId;
  }

  if (!format?.id) {
    payload.subtitle = '';
    payload.accent = '#2457a6';
    payload.height = 214;
    payload.shoulder = 64;
    payload.body = 82;
    payload.molds = parseMoldList(values.moldsText);
    payload.specs = applyTechnicalSpecAliases(values.specs ?? {});
    payload.sort_order = 9999;
  }

  if (format?.id && values.preserveExistingData) {
    payload.subtitle = format.subtitle ?? '';
    payload.accent = format.accent ?? '#2457a6';
    payload.height = Number(format.height ?? 214);
    payload.shoulder = Number(format.shoulder ?? 64);
    payload.body = Number(format.body ?? 82);
    payload.molds = Array.isArray(format.molds) ? format.molds : parseMoldList(format.moldsText);
    payload.specs = applyTechnicalSpecAliases(format.specs ?? {});

    if (format.imagePath) {
      payload.image_path = format.imagePath;
    }
  }

  if (values.specs) {
    payload.specs = applyTechnicalSpecAliases(values.specs);
  }

  if (values.imageFile) {
    payload.image_path = await uploadBottleAsset(values.imageFile, 'bottle-formats', formatId);
  }

  let { data, error } = await supabase
    .from('bottle_formats')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error && String(error.message ?? '').includes('production_format_id')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.production_format_id;
    const retry = await supabase
      .from('bottle_formats')
      .upsert(fallbackPayload, { onConflict: 'id' })
      .select('*')
      .single();

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return { ok: false, message: `No se pudo guardar el formato tecnico: ${error.message}` };
  }

  return { ok: true, format: await mapBottleFormat(data) };
}

function MetricCard({ metric }) {
  return (
    <article className="metric-card">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.detail}</small>
    </article>
  );
}

function ClauseBar({ clause }) {
  return (
    <article className="clause-row">
      <div>
        <span className="clause-id">ISO {clause.id}</span>
        <strong>{clause.title}</strong>
        <small>{clause.owner}</small>
      </div>
      <div className="score-area" aria-label={`${clause.score}% de cumplimiento`}>
        <div className="score-track">
          <span style={{ width: `${clause.score}%` }} />
        </div>
        <b>{clause.score}%</b>
      </div>
      <span className="status-pill">{clause.status}</span>
    </article>
  );
}

function BottlePreview({ format, label }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [format?.imageSrc, label]);

  if (!format) {
    return <div className="mold-placeholder">Seleccione un formato para ver la botella.</div>;
  }

  const formatLabel = label || getCanonicalFormatLabel(format);
  const previewImageSrc = format.imageSrc || getLocalBottleImageSrc(formatLabel);
  const previewName = formatLabel || format.name || 'Botella PET';
  const center = 92;
  const bodyX = center - format.body / 2;
  const shoulderX = center - format.shoulder / 2;
  const top = 22;
  const neckWidth = 30;
  const capWidth = 42;
  const bodyTop = 82;
  const bottom = top + format.height;
  const bodyBottom = bottom - 20;

  const outline = [
    `M ${center - capWidth / 2} ${top + 8}`,
    `L ${center + capWidth / 2} ${top + 8}`,
    `L ${center + capWidth / 2} ${top + 24}`,
    `L ${center + neckWidth / 2} ${top + 24}`,
    `L ${center + neckWidth / 2} ${top + 50}`,
    `C ${center + shoulderX / 2} ${top + 58}, ${bodyX + format.body} ${bodyTop - 6}, ${bodyX + format.body} ${bodyTop}`,
    `L ${bodyX + format.body} ${bodyBottom}`,
    `C ${bodyX + format.body} ${bottom - 8}, ${bodyX + format.body - 14} ${bottom}, ${bodyX + format.body - 28} ${bottom}`,
    `L ${bodyX + 28} ${bottom}`,
    `C ${bodyX + 14} ${bottom}, ${bodyX} ${bottom - 8}, ${bodyX} ${bodyBottom}`,
    `L ${bodyX} ${bodyTop}`,
    `C ${bodyX} ${bodyTop - 6}, ${center - shoulderX / 2} ${top + 58}, ${center - neckWidth / 2} ${top + 50}`,
    `L ${center - neckWidth / 2} ${top + 24}`,
    `L ${center - capWidth / 2} ${top + 24}`,
    'Z',
  ].join(' ');

  const formatName = String(format.name ?? '');
  const isStriatedSfru = formatName.includes('600') && formatName.includes('SFRU');

  return (
    <div className="bottle-preview" aria-label={`Imagen de ${previewName}`}>
      {previewImageSrc && !imageFailed ? (
        <img
          className="bottle-photo"
          src={previewImageSrc}
          alt={previewName}
          onError={() => setImageFailed(true)}
        />
      ) : isStriatedSfru ? (
        <svg className="real-bottle-svg" viewBox="0 0 184 320" role="img">
          <defs>
            <linearGradient id="sfruBody" x1="0" x2="1">
              <stop offset="0%" stopColor="#6f7b7e" />
              <stop offset="18%" stopColor="#dce4e4" />
              <stop offset="48%" stopColor="#f9fbfb" />
              <stop offset="72%" stopColor="#a9b4b5" />
              <stop offset="100%" stopColor="#4c5557" />
            </linearGradient>
            <linearGradient id="sfruDark" x1="0" x2="1">
              <stop offset="0%" stopColor="#313938" />
              <stop offset="45%" stopColor="#7a8583" />
              <stop offset="100%" stopColor="#293130" />
            </linearGradient>
            <clipPath id="sfruClip">
              <path d="M73 18 H111 V58 C131 68 148 93 148 126 V282 C148 300 136 310 119 312 H65 C48 310 36 300 36 282 V126 C36 93 53 68 73 58 Z" />
            </clipPath>
          </defs>
          <path
            d="M73 18 H111 V58 C131 68 148 93 148 126 V282 C148 300 136 310 119 312 H65 C48 310 36 300 36 282 V126 C36 93 53 68 73 58 Z"
            fill="url(#sfruBody)"
            stroke="#323b3d"
            strokeWidth="3"
          />
          <g clipPath="url(#sfruClip)">
            <rect x="36" y="170" width="112" height="126" fill="url(#sfruDark)" opacity="0.72" />
            <rect x="52" y="74" width="8" height="216" fill="#ffffff" opacity="0.42" />
            <rect x="70" y="72" width="5" height="228" fill="#ffffff" opacity="0.26" />
            <rect x="104" y="70" width="7" height="226" fill="#ffffff" opacity="0.38" />
            <rect x="124" y="92" width="4" height="192" fill="#ffffff" opacity="0.2" />
            <path d="M39 183 C67 166 113 198 148 176" fill="none" stroke="#eef2f1" strokeWidth="5" opacity="0.58" />
            <path d="M37 205 C74 185 110 221 149 197" fill="none" stroke="#242b2c" strokeWidth="6" opacity="0.42" />
            <path d="M37 223 C72 202 112 238 149 216" fill="none" stroke="#f7faf9" strokeWidth="5" opacity="0.48" />
            <path d="M37 241 C74 220 113 254 149 234" fill="none" stroke="#222829" strokeWidth="6" opacity="0.42" />
            <path d="M38 260 C73 238 112 272 148 252" fill="none" stroke="#eef2f1" strokeWidth="5" opacity="0.42" />
            <ellipse cx="92" cy="291" rx="45" ry="15" fill="#222928" opacity="0.52" />
            <path d="M58 287 C70 274 82 279 92 292 C103 279 116 274 128 287" fill="none" stroke="#dce4e2" strokeWidth="4" opacity="0.45" />
          </g>
          <g fill="none" stroke="#1f2729" strokeWidth="3">
            <path d="M72 22 H112" />
            <path d="M70 31 H114" />
            <path d="M70 40 H114" />
            <path d="M72 50 H112" />
          </g>
          <ellipse cx="92" cy="65" rx="29" ry="7" fill="#1f2729" opacity="0.28" />
          <path d="M58 105 C75 97 108 98 126 106" fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.38" />
          <path d="M54 135 H130" fill="none" stroke="#1f2729" strokeWidth="4" opacity="0.22" />
          <path d="M61 145 H123" fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.34" />
        </svg>
      ) : (
        <svg viewBox="0 0 184 320" role="img">
          <defs>
            <linearGradient id={`bottleFill-${format.id}`} x1="0" x2="1">
              <stop offset="0%" stopColor="#f9fcfd" />
              <stop offset="48%" stopColor="#dbeff0" />
              <stop offset="100%" stopColor="#f8fbfb" />
            </linearGradient>
          </defs>
          <path d={outline} fill={`url(#bottleFill-${format.id})`} stroke={format.accent} strokeWidth="4" />
          <path
            d={`M ${bodyX + 13} ${bodyTop + 48} H ${bodyX + format.body - 13} V ${bodyTop + 122} H ${bodyX + 13} Z`}
            fill="none"
            stroke={format.accent}
            strokeDasharray="7 7"
            strokeWidth="3"
            opacity="0.5"
          />
          <line x1={bodyX + 14} x2={bodyX + format.body - 14} y1={bottom - 34} y2={bottom - 34} stroke={format.accent} strokeWidth="3" opacity="0.45" />
          <line x1={bodyX + 14} x2={bodyX + format.body - 14} y1={bodyTop + 22} y2={bodyTop + 22} stroke={format.accent} strokeWidth="3" opacity="0.35" />
        </svg>
      )}
      <div>
        <strong>{formatLabel}</strong>
        <span>{format.subtitle}</span>
      </div>
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  disabled = false,
  noResultsText = 'Sin resultados',
  className = '',
}) {
  const containerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listStyle, setListStyle] = useState({});
  const normalizedOptions = useMemo(() => (options ?? []).map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: option.label }
  )).filter((option) => option.value !== undefined && option.label), [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return normalizedOptions;
    }

    return normalizedOptions.filter((option) => matchesFormatSearch(option.label, cleanQuery));
  }, [normalizedOptions, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedOption?.label ?? value ?? '');
    }
  }, [isOpen, selectedOption?.label, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const updateListPosition = () => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const availableHeight = Math.max(160, window.innerHeight - rect.bottom - 14);
    setListStyle({
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.min(320, availableHeight)}px`,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    updateListPosition();
    window.addEventListener('resize', updateListPosition);
    window.addEventListener('scroll', updateListPosition, true);

    return () => {
      window.removeEventListener('resize', updateListPosition);
      window.removeEventListener('scroll', updateListPosition, true);
    };
  }, [isOpen]);

  const selectOption = (option) => {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((currentIndex) => Math.min(currentIndex + 1, Math.max(filteredOptions.length - 1, 0)));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
    }

    if (event.key === 'Enter') {
      if (isOpen && filteredOptions[activeIndex]) {
        event.preventDefault();
        selectOption(filteredOptions[activeIndex]);
      }
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery(selectedOption?.label ?? value ?? '');
    }
  };

  const listbox = isOpen && !disabled && typeof document !== 'undefined' ? createPortal(
    <div className="searchable-select-list searchable-select-list-portal" style={listStyle} role="listbox">
      {filteredOptions.length === 0 ? (
        <div className="searchable-select-empty">{noResultsText}</div>
      ) : filteredOptions.map((option, index) => (
        <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={`searchable-select-option ${option.value === value ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`}
          key={option.value}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            selectOption(option);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className={`searchable-select ${className}`} ref={containerRef}>
      <input
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(event) => {
          updateListPosition();
          setIsOpen(true);
          event.target.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          updateListPosition();
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
            setQuery(selectedOption?.label ?? '');
          }, 120);
        }}
      />
      {listbox}
    </div>
  );
}

function SpecificationDigitizer({
  records,
  setRecords,
  onNavigate,
  bottleFormats,
  productionFormats = [],
  formatsReady,
  formatsError,
  onSaveTechnicalFormat,
}) {
  const [date, setDate] = useState(getToday);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [moldCount, setMoldCount] = useState('1');
  const [moldMeasurements, setMoldMeasurements] = useState(() => createMoldMeasurementDrafts(null, 1));
  const [certificateDetails, setCertificateDetails] = useState(emptyCertificateDetails);
  const [message, setMessage] = useState('');
  const [isSpecificationBuilderOpen, setIsSpecificationBuilderOpen] = useState(false);
  const [specificationFormatId, setSpecificationFormatId] = useState('');
  const [specificationSampleCount, setSpecificationSampleCount] = useState('3');
  const [specificationSamples, setSpecificationSamples] = useState(() => ensureSpecificationSampleCount([], 3));
  const [specificationMessage, setSpecificationMessage] = useState('');
  const [isSavingSpecification, setIsSavingSpecification] = useState(false);

  const availableBottleFormats = useMemo(
    () => getUnifiedTechnicalFormats(bottleFormats, productionFormats),
    [bottleFormats, productionFormats],
  );
  const pendingSpecificationFormats = useMemo(
    () => availableBottleFormats.filter((format) => !hasTechnicalSpecs(format)),
    [availableBottleFormats],
  );
  const selectedFormat = useMemo(
    () => availableBottleFormats.find((format) => format.id === selectedFormatId) ?? null,
    [availableBottleFormats, selectedFormatId],
  );
  const specificationFormat = useMemo(
    () => pendingSpecificationFormats.find((format) => format.id === specificationFormatId) ?? null,
    [pendingSpecificationFormats, specificationFormatId],
  );
  const selectedFormatLabel = selectedFormat ? getCanonicalFormatLabel(selectedFormat, productionFormats) : '';
  const pendingSpecificationOptions = useMemo(() => pendingSpecificationFormats.map((format) => ({
    value: format.id,
    label: getCanonicalFormatLabel(format, productionFormats),
  })), [pendingSpecificationFormats, productionFormats]);
  const bottleFormatOptions = useMemo(() => availableBottleFormats.map((format) => ({
    value: format.id,
    label: getCanonicalFormatLabel(format, productionFormats),
  })), [availableBottleFormats, productionFormats]);

  const hasMeasurements = moldMeasurements.some((column) => hasAnyMeasurement(column.measurements));
  const evaluationsByMold = useMemo(
    () => moldMeasurements.map((column) => buildEvaluations(column.measurements, selectedFormat)),
    [moldMeasurements, selectedFormat],
  );
  const validationSummary = useMemo(
    () => evaluationsByMold.reduce((summary, evaluations) => {
      const moldSummary = summarizeEvaluations(evaluations);

      return {
        ok: summary.ok + moldSummary.ok,
        bad: summary.bad + moldSummary.bad,
      };
    }, { ok: 0, bad: 0 }),
    [evaluationsByMold],
  );

  const openSpecificationBuilder = (targetFormat = null) => {
    setIsSpecificationBuilderOpen(true);

    if (targetFormat?.id && pendingSpecificationFormats.some((format) => format.id === targetFormat.id)) {
      setSpecificationFormatId(targetFormat.id);
    }

    window.setTimeout(() => {
      document.getElementById('nueva-especificacion-tecnica')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  };

  const updateFormat = (nextFormatId) => {
    setSelectedFormatId(nextFormatId);
    const nextFormat = availableBottleFormats.find((format) => format.id === nextFormatId);
    setMoldCount('1');
    setMoldMeasurements(createMoldMeasurementDrafts(nextFormat, 1));
    setMessage('');
  };

  const updateMoldCount = (value) => {
    const cleanValue = value.replace(/\D/g, '');
    const nextCount = Math.min(24, Math.max(1, Number(cleanValue) || 1));

    setMoldCount(cleanValue ? String(nextCount) : '');
    setMoldMeasurements((currentDrafts) => createMoldMeasurementDrafts(selectedFormat, nextCount, currentDrafts));
    setMessage('');
  };

  const updateMeasurement = (moldIndex, field, value) => {
    setMoldMeasurements((currentDrafts) => currentDrafts.map((draft, index) => (
      index === moldIndex
        ? { ...draft, measurements: { ...draft.measurements, [field]: value } }
        : draft
    )));
    setMessage('');
  };

  const updateCertificateDetail = (field, value) => {
    setCertificateDetails((current) => ({ ...current, [field]: value }));
    setMessage('');
  };

  const updateSpecificationFormat = (nextFormatId) => {
    setSpecificationFormatId(nextFormatId);
    setSpecificationMessage('');
  };

  const updateSpecificationSampleCount = (value) => {
    const cleanValue = value.replace(/\D/g, '');
    const nextCount = Math.min(20, Math.max(0, Number(cleanValue) || 0));

    setSpecificationSampleCount(cleanValue ? String(nextCount) : '');
    setSpecificationSamples((currentSamples) => ensureSpecificationSampleCount(currentSamples, nextCount));
    setSpecificationMessage('');
  };

  const updateSpecificationSample = (sampleIndex, fieldKey, value) => {
    setSpecificationSamples((currentSamples) => currentSamples.map((sample, index) => (
      index === sampleIndex ? { ...sample, [fieldKey]: value } : sample
    )));
    setSpecificationMessage('');
  };

  const resetSpecificationBuilder = () => {
    setSpecificationFormatId('');
    setSpecificationFormatSearch('');
    setSpecificationSampleCount('3');
    setSpecificationSamples(ensureSpecificationSampleCount([], 3));
  };

  const saveSpecificationFromSamples = async () => {
    if (!specificationFormat) {
      setSpecificationMessage('Seleccione un formato pendiente.');
      return;
    }

    const sampleCount = Number(specificationSampleCount);

    if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
      setSpecificationMessage('Ingrese el numero de muestras.');
      return;
    }

    const missingField = technicalSpecificationSampleFields.find((field) => (
      specificationSamples.some((sample) => String(sample[field.key] ?? '').trim() === '')
    ));

    if (missingField) {
      setSpecificationMessage(`Complete todas las muestras de ${missingField.label}.`);
      return;
    }

    const invalidField = technicalSpecificationSampleFields.find((field) => (
      specificationSamples.some((sample) => !Number.isFinite(Number(String(sample[field.key] ?? '').replace(',', '.'))))
    ));

    if (invalidField) {
      setSpecificationMessage(`Revise los datos de ${invalidField.label}.`);
      return;
    }

    const specs = buildSpecsFromSamples(specificationSamples);

    if (Object.keys(specs).length === 0) {
      setSpecificationMessage('No hay mediciones validas para crear la ficha tecnica.');
      return;
    }

    setIsSavingSpecification(true);

    try {
      const isPlaceholder = specificationFormat.isTechnicalPlaceholder;
      const result = await onSaveTechnicalFormat(isPlaceholder ? null : specificationFormat, {
        name: getCanonicalFormatLabel(specificationFormat, productionFormats),
        moldsText: specificationFormat.molds?.join(', ') || 'Molde 1',
        specs,
        productionFormatId: specificationFormat.productionFormatId || '',
      });

      if (!result.ok) {
        setSpecificationMessage(result.message ?? 'No se pudo guardar la especificacion tecnica.');
        return;
      }

      resetSpecificationBuilder();
      setIsSpecificationBuilderOpen(false);
      setSpecificationMessage('Especificacion tecnica guardada con rangos minimo y maximo.');
      setMessage('La ficha tecnica ya esta disponible para validar este formato.');
    } catch (error) {
      setSpecificationMessage(`No se pudo guardar la especificacion tecnica: ${error.message}`);
    } finally {
      setIsSavingSpecification(false);
    }
  };

  const resetForm = () => {
    setDate(getToday());
    setSelectedFormatId('');
    setFormatSearch('');
    setSelectedMachine('');
    setMoldCount('1');
    setMoldMeasurements(createMoldMeasurementDrafts(null, 1));
    setCertificateDetails(emptyCertificateDetails);
    setMessage('');
  };

  const saveRecord = () => {
    if (!selectedFormat) {
      setMessage('No hay formatos tecnicos cargados.');
      return;
    }

    if (!selectedMachine) {
      setMessage('Seleccione la maquina antes de guardar.');
      return;
    }

    const selectedMoldCount = Number(moldCount);

    if (!Number.isInteger(selectedMoldCount) || selectedMoldCount <= 0) {
      setMessage('Ingrese cuantos moldes se registraran.');
      return;
    }

    if (!hasMeasurements) {
      setMessage('Ingrese al menos una medicion para guardar.');
      return;
    }

    const incompleteMold = moldMeasurements.find((column) => !hasAnyMeasurement(column.measurements));

    if (incompleteMold) {
      setMessage(`Ingrese al menos una medicion para ${incompleteMold.mold}.`);
      return;
    }

    const createdAt = new Date().toISOString();
    const entries = moldMeasurements.map((column, index) => {
      const evaluations = evaluationsByMold[index] ?? buildEvaluations(column.measurements, selectedFormat);
      const moldSummary = summarizeEvaluations(evaluations);

      return {
        id: crypto.randomUUID(),
        mold: column.mold,
        machine: selectedMachine,
        measurements: column.measurements,
        certificateDetails,
        evaluations,
        status: moldSummary.bad > 0 ? 'Fuera de tolerancia' : 'Conforme',
        createdAt,
      };
    });

    const groupKey = getGroupKey(date, selectedFormat.id);

    setRecords((currentRecords) => {
      const existingGroup = currentRecords.find((record) => record.id === groupKey);

      if (!existingGroup) {
        return [
          {
            id: groupKey,
            date,
            formatId: selectedFormat.id,
            formatName: selectedFormatLabel,
            certificateDetails,
            entries,
            status: getGroupStatus(entries),
            createdAt,
            updatedAt: createdAt,
          },
          ...currentRecords,
        ];
      }

      return currentRecords.map((record) => {
        if (record.id !== groupKey) {
          return record;
        }

        const nextEntries = [...entries, ...record.entries];

        return {
          ...record,
          formatName: selectedFormatLabel,
          certificateDetails: mergeCertificateDetails(record.certificateDetails, certificateDetails),
          entries: nextEntries,
          status: getGroupStatus(nextEntries),
          updatedAt: createdAt,
        };
      });
    });
    setMoldCount('1');
    setMoldMeasurements(createMoldMeasurementDrafts(selectedFormat, 1));
    setSelectedMachine('');
    setMessage(`Registro guardado con ${entries.length} molde(s).`);
  };

  if (!formatsReady) {
    return (
      <section className="digitizer-section" id="especificaciones-tecnicas">
        <div className="section-heading">
          <div>
            <span>Registro dimensional</span>
            <h2>Especificaciones tecnicas</h2>
          </div>
        </div>
        <div className="mold-placeholder">Cargando formatos tecnicos.</div>
      </section>
    );
  }

  if (availableBottleFormats.length === 0) {
    return (
      <section className="digitizer-section" id="especificaciones-tecnicas">
        <div className="section-heading">
          <div>
            <span>Registro dimensional</span>
            <h2>Especificaciones tecnicas</h2>
          </div>
        </div>
        <div className="mold-placeholder">
          {formatsError || 'No hay formatos tecnicos cargados en Supabase.'}
        </div>
      </section>
    );
  }

  return (
    <section className="digitizer-section" id="especificaciones-tecnicas">
      <div className="section-heading">
        <div>
          <span>Registro dimensional</span>
          <h2>Especificaciones tecnicas</h2>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="primary-action"
            onClick={() => openSpecificationBuilder()}
          >
            Agregar especificacion tecnica
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigate('base-datos')}>Ver base de datos</button>
          <button type="button" className="secondary-action" onClick={resetForm}>Limpiar</button>
        </div>
      </div>

      {isSpecificationBuilderOpen && (
        <article className="technical-spec-builder" id="nueva-especificacion-tecnica">
          <div className="spec-builder-heading">
            <div>
              <span>Nueva ficha tecnica</span>
              <h3>Calcular rangos por muestras</h3>
            </div>
            <strong>{pendingSpecificationFormats.length} pendientes</strong>
          </div>

          <div className="spec-builder-controls">
            <label className="field">
              <span>Formato pendiente</span>
              <SearchableSelect
                value={specificationFormatId}
                onChange={updateSpecificationFormat}
                options={pendingSpecificationOptions}
                placeholder="Seleccionar formato pendiente"
                noResultsText="Sin formatos pendientes"
              />
            </label>

            <label className="field">
              <span>Numero de muestras</span>
              <input
                type="number"
                min="1"
                max="20"
                value={specificationSampleCount}
                onChange={(event) => updateSpecificationSampleCount(event.target.value)}
                placeholder="Ej. 5"
              />
            </label>
          </div>

          {specificationFormat && specificationSamples.length > 0 ? (
            <div
              className="spec-sample-table"
              style={{ '--sample-columns': specificationSamples.length }}
              aria-label="Muestras para especificacion tecnica"
            >
              <div className="spec-sample-header">
                <span>Variable</span>
                {specificationSamples.map((_, index) => (
                  <span key={`sample-heading-${index}`}>Muestra {index + 1}</span>
                ))}
              </div>
              {technicalSpecificationSampleGroups.map((group) => {
                return (
                  <div className="spec-sample-group" key={group.title}>
                    <strong>{group.title}</strong>
                    {group.fields.map((field) => (
                      <div className="spec-sample-row" key={field.key}>
                        <span>{field.label}</span>
                        {specificationSamples.map((sample, sampleIndex) => (
                          <input
                            key={`${field.key}-${sampleIndex}`}
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={sample[field.key] ?? ''}
                            onChange={(event) => updateSpecificationSample(sampleIndex, field.key, event.target.value)}
                            placeholder="0.00"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mold-placeholder">
              Seleccione un formato pendiente y defina el numero de muestras.
            </div>
          )}

          <div className="save-row">
            <button
              type="button"
              className="primary-action"
              onClick={saveSpecificationFromSamples}
              disabled={isSavingSpecification || !specificationFormat}
            >
              {isSavingSpecification ? 'Guardando' : 'Guardar especificacion tecnica'}
            </button>
            <button type="button" className="secondary-action" onClick={resetSpecificationBuilder}>Limpiar muestras</button>
            {specificationMessage && <span>{specificationMessage}</span>}
          </div>
        </article>
      )}

      <div className="digitizer-layout">
        <form className="digitizer-form">
          {formatsError && (
            <strong className="visual-sync-warning">
              No se pudieron cargar todas las fichas tecnicas, pero se muestran los formatos disponibles de controles visuales.
            </strong>
          )}
          <div className="form-grid">
            <label className="field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>

            <label className="field">
              <span>Formato de botella</span>
              <SearchableSelect
                value={selectedFormatId}
                onChange={updateFormat}
                options={bottleFormatOptions}
                placeholder="Nombre / color / volumen / gramaje / guion"
              />
              {selectedFormat?.isTechnicalPlaceholder && (
                <>
                  <strong className="visual-sync-warning">
                    Este formato todavia no tiene especificacion tecnica.
                  </strong>
                  <button type="button" className="secondary-action" onClick={() => openSpecificationBuilder(selectedFormat)}>
                    Agregar especificacion tecnica
                  </button>
                </>
              )}
            </label>

            <label className="field">
              <span>Maquina</span>
              <select value={selectedMachine} onChange={(event) => setSelectedMachine(event.target.value)}>
                <option value="">Seleccionar maquina</option>
                {machines.map((machine) => (
                  <option key={machine} value={machine}>{machine}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Cantidad de moldes</span>
              <input
                type="number"
                min="1"
                max="24"
                value={moldCount}
                onChange={(event) => updateMoldCount(event.target.value)}
                disabled={!selectedFormat}
                placeholder="Ej. 3"
              />
            </label>
          </div>

          <div className="certificate-details-grid">
            <label className="field">
              <span>Lote</span>
              <input
                type="text"
                value={certificateDetails.lote}
                onChange={(event) => updateCertificateDetail('lote', event.target.value)}
                placeholder="Ej. L-001"
              />
            </label>

            <label className="field">
              <span>Orden de produccion</span>
              <input
                type="text"
                value={certificateDetails.ordenProduccion}
                onChange={(event) => updateCertificateDetail('ordenProduccion', event.target.value)}
                placeholder="Ej. OP-2026"
              />
            </label>

            <label className="field certificate-details-full">
              <span>Resina utilizada</span>
              <select
                value={certificateDetails.resinaUtilizada}
                onChange={(event) => updateCertificateDetail('resinaUtilizada', event.target.value)}
              >
                <option value="">Seleccionar receta</option>
                {resinRecipes.map((recipe) => (
                  <option key={recipe} value={recipe}>{recipe}</option>
                ))}
              </select>
            </label>
          </div>

          {selectedFormat ? (
            <div
              className="measurement-table multi-mold-measurement-table"
              style={{ '--mold-columns': moldMeasurements.length }}
              aria-label="Mediciones de botella por molde"
            >
              <div className="mold-measurement-header">
                <span>Variable</span>
                {moldMeasurements.map((column, index) => (
                  <span key={`${column.mold}-${index}`}>{column.mold}</span>
                ))}
              </div>
              {measurementGroups.map((group) => (
                <div className="measurement-group" key={group.title}>
                  <div className="measurement-title">{group.title}</div>
                  {group.fields.map((field) => (
                    <div className="measurement-row multi-mold-row" key={field.key}>
                      <span>
                        <b>{field.label}</b>
                        {evaluationsByMold[0]?.[field.key]?.spec && (
                          <small>
                            Min {evaluationsByMold[0][field.key].spec.min} / Max {evaluationsByMold[0][field.key].spec.max}
                          </small>
                        )}
                      </span>
                      {moldMeasurements.map((column, moldIndex) => {
                        const evaluation = evaluationsByMold[moldIndex]?.[field.key] ?? { status: 'pending', spec: null };
                        const value = column.measurements[field.key] ?? '';

                        return (
                          <label className={`mold-measurement-cell status-${evaluation.status}`} key={`${column.mold}-${field.key}-${moldIndex}`}>
                            <input
                              type={field.type === 'text' ? 'text' : 'number'}
                              inputMode={field.type === 'text' ? undefined : 'decimal'}
                              step={field.type === 'text' ? undefined : '0.01'}
                              placeholder={field.placeholder ?? '0.00'}
                              value={value}
                              onChange={(event) => updateMeasurement(moldIndex, field.key, event.target.value)}
                            />
                            {evaluation.spec && value !== '' && (
                              <strong className={`validation-badge ${evaluation.status}`}>
                                {getValidationLabel(evaluation.status)}
                              </strong>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="mold-placeholder">
              Seleccione un formato de botella.
            </div>
          )}

          <div className="save-row">
            <button type="button" className="primary-action" onClick={saveRecord}>Guardar registro</button>
            {message && <span>{message}</span>}
          </div>
        </form>

        <aside className="bottle-panel">
          {selectedFormat ? <BottlePreview format={selectedFormat} label={selectedFormatLabel} /> : (
            <div className="mold-placeholder">Nombre / color / volumen / gramaje / guion</div>
          )}
          <div className="selection-summary">
            <span>Moldes a registrar</span>
            <strong>{selectedFormat ? moldMeasurements.map((column) => column.mold).join(', ') : 'Pendiente'}</strong>
          </div>
          <div className="selection-summary">
            <span>Maquina seleccionada</span>
            <strong>{selectedMachine || 'Pendiente'}</strong>
          </div>
          <div className="selection-summary validation-summary">
            <span>Estado de mediciones</span>
            <strong>{validationSummary.bad > 0 ? 'Revisar datos' : 'Dentro de tolerancia'}</strong>
            <div>
              <b>{validationSummary.ok} bien</b>
              <b>{validationSummary.bad} mal</b>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function getVisualRoundKey(date, cycleNumber) {
  return `${date}:${cycleNumber}`;
}

function VisualControls({
  controlSessions,
  setControlSessions,
  responsible,
  setResponsible,
  closedRounds,
  setClosedRounds,
  authUser,
  bottleFormats = [],
  productionFormats = [],
  syncNotice = '',
  canDeleteRecords = false,
  onAudit,
  onSaveDailyReport,
}) {
  const [selectedMachine, setSelectedMachine] = useState('');
  const [productionFormat, setProductionFormat] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [cameraTarget, setCameraTarget] = useState('');
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState(null);
  const [visualSaveError, setVisualSaveError] = useState('');
  const userId = authUser?.userId;

  const today = getToday();
  const todaySessions = controlSessions.filter((session) => session.date === today);
  const activeSession = todaySessions.find((session) => (
    !session.endedAt
    && session.status !== VISUAL_SESSION_STATUS_NO_PRODUCTION
    && (!session.userId || session.userId === userId)
  ));
  const latestStoredCycle = Math.max(1, ...todaySessions.map((session) => Number(session.cycleNumber ?? 1)));
  const latestCycleSessions = todaySessions.filter((session) => Number(session.cycleNumber ?? 1) === latestStoredCycle);
  const latestCycleMachines = new Set(latestCycleSessions.map((session) => session.machine));
  const latestCycleIsComplete = machines.every((machine) => latestCycleMachines.has(machine));
  const latestCycleIsClosed = closedRounds.includes(getVisualRoundKey(today, latestStoredCycle));
  const currentCycleNumber = activeSession?.cycleNumber ?? (latestCycleIsComplete && latestCycleIsClosed ? latestStoredCycle + 1 : latestStoredCycle);
  const currentCycleSessions = todaySessions.filter((session) => Number(session.cycleNumber ?? 1) === currentCycleNumber);
  const todayRoundGroups = groupVisualSessionsByRound(todaySessions);
  const completedMachines = new Set(currentCycleSessions.map((session) => session.machine));
  const pendingMachines = machines.filter((machine) => !completedMachines.has(machine));
  const cycleCompletedCount = completedMachines.size;
  const reportDate = activeSession?.date ?? today;
  const activeReviewCount = activeSession?.reviews?.length ?? 0;
  const controlProgress = `${activeReviewCount}/${MIN_VISUAL_CONTROLS_PER_SHIFT}`;
  const cycleProgress = `${cycleCompletedCount}/${machines.length}`;
  const roundIsComplete = !activeSession && currentCycleSessions.length > 0 && pendingMachines.length === 0;
  const roundCanStart = Boolean(responsible);
  const previousCycleNumber = useRef(currentCycleNumber);
  const availableProductionFormats = useMemo(() => {
    return getUnifiedFormatOptions(bottleFormats, productionFormats).map((format) => format.label);
  }, [bottleFormats, productionFormats]);

  useEffect(() => {
    if (previousCycleNumber.current === currentCycleNumber) {
      return;
    }

    previousCycleNumber.current = currentCycleNumber;
    setSelectedMachine('');
    setProductionFormat('');
    setOperatorName('');
  }, [currentCycleNumber]);

  const persistSessionEnd = async (sessionId, endedAt) => {
    if (!userId || !sessionId) {
      return false;
    }

    const { error } = await supabase
      .from('visual_control_sessions')
      .update({ ended_at: endedAt, updated_at: endedAt })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) {
      console.error('No se pudo finalizar el control en Supabase:', error);
      setVisualSaveError('No se pudo finalizar el control en Supabase.');
      return false;
    }

    setVisualSaveError('');
    return true;
  };

  const deleteVisualSession = async (session) => {
    if (!session?.id) {
      return;
    }

    if (!canDeleteRecords) {
      setVisualSaveError('Solo un administrador puede borrar registros visuales.');
      return;
    }

    const confirmed = window.confirm(`Borrar el registro de ${session.machine} de la ronda ${session.cycleNumber ?? 1}?`);

    if (!confirmed) {
      return;
    }

    if (userId) {
      await supabase
        .from('visual_control_reviews')
        .delete()
        .eq('session_id', session.id);

      const { error } = await supabase
        .from('visual_control_sessions')
        .delete()
        .eq('id', session.id);

      if (error) {
        console.error('No se pudo borrar el registro visual en Supabase:', error);
        setVisualSaveError(`No se pudo borrar el registro: ${error.message}`);
        return;
      }

      const { data: remainingSession, error: verificationError } = await supabase
        .from('visual_control_sessions')
        .select('id')
        .eq('id', session.id)
        .maybeSingle();

      if (verificationError) {
        console.error('No se pudo verificar el borrado visual en Supabase:', verificationError);
        setVisualSaveError('No se pudo verificar si Supabase borro el registro.');
        return;
      }

      if (remainingSession) {
        setVisualSaveError('Supabase no permitio borrar el registro. Ejecute el SQL actualizado de permisos.');
        return;
      }
    }

    const deletedIds = addDeletedVisualSessionId(session.id);
    setControlSessions((currentSessions) => currentSessions.filter((currentSession) => !deletedIds.includes(currentSession.id)));
    setClosedRounds((currentRounds) => currentRounds.filter((roundKey) => roundKey !== getVisualRoundKey(session.date, session.cycleNumber ?? 1)));

    if (activeSession?.id === session.id) {
      setSelectedMachine('');
      setCameraTarget('');
    }

    setVisualSaveError('');
    onAudit?.({
      action: 'Elimino control visual',
      area: 'Controles visuales',
      target: session.machine,
      detail: `${session.date} / Ronda ${session.cycleNumber ?? 1}`,
      metadata: { sessionId: session.id },
    });
  };

  const persistSession = async (session) => {
    if (!userId || !session?.id) {
      return false;
    }

    const { error } = await supabase
      .from('visual_control_sessions')
      .upsert(getVisualSessionPayload(session, userId), { onConflict: 'id' });

    if (error) {
      console.error('No se pudo guardar la sesion de control en Supabase:', error);
      setVisualSaveError('No se pudo guardar la ronda en Supabase. Revise que el SQL de permisos y columnas este ejecutado.');
      return false;
    }

    setVisualSaveError('');
    return true;
  };

  const persistReview = async (sessionId, review) => {
    if (!userId || !sessionId || !review?.id) {
      return;
    }

    const { error, warning } = await upsertVisualReview(review, sessionId, userId);

    if (error) {
      console.error('No se pudo guardar la revision en Supabase:', error);
      setVisualSaveError(`No se pudo guardar la revision en Supabase: ${error.message ?? 'error desconocido'}`);
      return false;
    }

    if (warning) {
      setVisualSaveError(warning);
      return true;
    }

    setVisualSaveError('');
    return true;
  };

  const startMachineControl = async (machine) => {
    if (!machine || !roundCanStart || completedMachines.has(machine) || activeSession?.machine === machine) {
      setSelectedMachine(machine);
      return;
    }

    const now = new Date().toISOString();
    const firstReview = createVisualReview();
    const newSession = {
      id: crypto.randomUUID(),
      userId,
      responsible,
      machine,
      productionFormat: productionFormat.trim(),
      operatorName: operatorName.trim(),
      cycleNumber: currentCycleNumber,
      status: VISUAL_SESSION_STATUS_CONTROLLED,
      skipReason: '',
      date: today,
      startedAt: now,
      endedAt: '',
      reviews: [firstReview],
    };

    if (userId) {
      if (activeSession?.id) {
        persistSessionEnd(activeSession.id, now);
      }

      const sessionSaved = await persistSession(newSession);

      if (sessionSaved) {
        persistReview(newSession.id, firstReview);
      }
    }

    setControlSessions((currentSessions) => [
      newSession,
      ...currentSessions.map((session) => (
        session.endedAt ? session : { ...session, endedAt: now }
      )),
    ]);
    setSelectedMachine(machine);
    setProductionFormat('');
    setOperatorName('');
  };

  const markMachineWithoutProduction = async (machine) => {
    if (!machine || !roundCanStart || completedMachines.has(machine) || activeSession) {
      return;
    }

    const now = new Date().toISOString();
    const skippedSession = {
      id: crypto.randomUUID(),
      userId,
      responsible,
      machine,
      productionFormat: productionFormat.trim(),
      operatorName: operatorName.trim(),
      cycleNumber: currentCycleNumber,
      status: VISUAL_SESSION_STATUS_NO_PRODUCTION,
      skipReason: VISUAL_NO_PRODUCTION_REASON,
      date: today,
      startedAt: now,
      endedAt: now,
      reviews: [],
    };

    await persistSession(skippedSession);

    setControlSessions((currentSessions) => [skippedSession, ...currentSessions]);
    setSelectedMachine('');
    setProductionFormat('');
    setOperatorName('');
  };

  const finishRound = async () => {
    if (!roundIsComplete) {
      return;
    }

    const roundKey = getVisualRoundKey(today, currentCycleNumber);
    setClosedRounds((currentRounds) => (
      currentRounds.includes(roundKey) ? currentRounds : [...currentRounds, roundKey]
    ));
    setResponsible('');
    setSelectedMachine('');
    setProductionFormat('');
    setOperatorName('');
    setCameraTarget('');

    if (Number(currentCycleNumber) === VISUAL_REPORT_PROMPT_ROUND && onSaveDailyReport) {
      const shouldSaveReport = window.confirm('Ya se terminaron las 4 rondas. Desea guardar el reporte del dia?');

      if (!shouldSaveReport) {
        return;
      }

      const saved = await onSaveDailyReport();
      setVisualSaveError(saved ? 'Reporte diario guardado.' : 'No se pudo guardar el reporte diario.');
    }
  };

  const updateReview = (reviewId, values) => {
    if (!activeSession) {
      return;
    }

    const reviewToSave = activeSession.reviews.find((review) => review.id === reviewId);
    const updatedReview = reviewToSave ? { ...reviewToSave, ...values } : null;

    setControlSessions((currentSessions) =>
      currentSessions.map((session) => (
        session.id === activeSession.id
          ? {
              ...session,
              reviews: session.reviews.map((review) => (
                review.id === reviewId ? { ...review, ...values } : review
              )),
            }
          : session
      )),
    );

    if (updatedReview) {
      persistReview(activeSession.id, updatedReview);
    }
  };

  const selectVisualDefectCategory = (reviewId, defect) => {
    const review = activeSession?.reviews.find((item) => item.id === reviewId);

    if (!review) {
      return;
    }

    const defects = review.defects.includes(defect) ? [] : [defect];

    updateReview(reviewId, { defects });
  };

  const toggleReviewListValue = (reviewId, field, value) => {
    const review = activeSession?.reviews.find((item) => item.id === reviewId);

    if (!review) {
      return;
    }

    const currentValues = review[field] ?? [];
    const values = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    updateReview(reviewId, { [field]: values });
  };

  const getPhotoUpdate = (review, target, photoName, photoDataUrl, photoPath = '') => {
    const isBagPhoto = target === 'bag';
    const names = normalizePhotoList(isBagPhoto ? review.bagPhotoName : review.photoName, isBagPhoto ? review.bagPhotoNames : review.photoNames);
    const paths = normalizePhotoList(isBagPhoto ? review.bagPhotoPath : review.photoPath, isBagPhoto ? review.bagPhotoPaths : review.photoPaths);
    const dataUrls = normalizePhotoList(isBagPhoto ? review.bagPhotoDataUrl : review.photoDataUrl, isBagPhoto ? review.bagPhotoDataUrls : review.photoDataUrls);

    if (dataUrls.length >= MAX_REVIEW_PHOTOS) {
      return {};
    }

    const nextNames = [...names, photoName].slice(0, MAX_REVIEW_PHOTOS);
    const nextPaths = [...paths, photoPath].slice(0, MAX_REVIEW_PHOTOS);
    const nextDataUrls = [...dataUrls, photoDataUrl].slice(0, MAX_REVIEW_PHOTOS);

    return isBagPhoto
      ? {
          bagPhotoName: nextNames[0] ?? '',
          bagPhotoPath: nextPaths[0] ?? '',
          bagPhotoDataUrl: nextDataUrls[0] ?? '',
          bagPhotoNames: nextNames,
          bagPhotoPaths: nextPaths,
          bagPhotoDataUrls: nextDataUrls,
        }
      : {
          photoName: nextNames[0] ?? '',
          photoPath: nextPaths[0] ?? '',
          photoDataUrl: nextDataUrls[0] ?? '',
          photoNames: nextNames,
          photoPaths: nextPaths,
          photoDataUrls: nextDataUrls,
        };
  };

  const removeReviewPhoto = (reviewId, target, photoIndex) => {
    const review = activeSession?.reviews.find((item) => item.id === reviewId);

    if (!review) {
      return;
    }

    const isBagPhoto = target === 'bag';
    const names = normalizePhotoList(isBagPhoto ? review.bagPhotoName : review.photoName, isBagPhoto ? review.bagPhotoNames : review.photoNames)
      .filter((_, index) => index !== photoIndex);
    const paths = normalizePhotoList(isBagPhoto ? review.bagPhotoPath : review.photoPath, isBagPhoto ? review.bagPhotoPaths : review.photoPaths)
      .filter((_, index) => index !== photoIndex);
    const dataUrls = normalizePhotoList(isBagPhoto ? review.bagPhotoDataUrl : review.photoDataUrl, isBagPhoto ? review.bagPhotoDataUrls : review.photoDataUrls)
      .filter((_, index) => index !== photoIndex);

    updateReview(reviewId, isBagPhoto
      ? {
          bagPhotoName: names[0] ?? '',
          bagPhotoPath: paths[0] ?? '',
          bagPhotoDataUrl: dataUrls[0] ?? '',
          bagPhotoNames: names,
          bagPhotoPaths: paths,
          bagPhotoDataUrls: dataUrls,
        }
      : {
          photoName: names[0] ?? '',
          photoPath: paths[0] ?? '',
          photoDataUrl: dataUrls[0] ?? '',
          photoNames: names,
          photoPaths: paths,
          photoDataUrls: dataUrls,
        });
  };

  const updateReviewPhoto = (reviewId, file, target = 'visual') => {
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      const photoDataUrl = String(reader.result);
      const photoPath = await uploadDefectPhoto(userId, photoDataUrl, file.name);
      const review = activeSession?.reviews.find((item) => item.id === reviewId);

      if (review) {
        updateReview(reviewId, getPhotoUpdate(review, target, file.name, photoDataUrl, photoPath));
      }
    };

    reader.readAsDataURL(file);
  };

  const saveCapturedPhoto = async (reviewId, dataUrl, target = 'visual') => {
    const photoName = `foto-${target}-${new Date().toISOString()}.jpg`;
    const photoPath = await uploadDefectPhoto(userId, dataUrl, photoName);
    const review = activeSession?.reviews.find((item) => item.id === reviewId);

    if (review) {
      updateReview(reviewId, getPhotoUpdate(review, target, photoName, dataUrl, photoPath));
    }
  };

  const addReviewToActiveSession = () => {
    if (!activeSession) {
      return;
    }

    const newReview = createVisualReview();

    setControlSessions((currentSessions) =>
      currentSessions.map((session) => (
        session.id === activeSession.id
          ? { ...session, reviews: [newReview, ...session.reviews] }
          : session
      )),
    );

    persistReview(activeSession.id, newReview);
  };

  const finishActiveControl = () => {
    const now = new Date().toISOString();

    if (activeSession?.id) {
      persistSessionEnd(activeSession.id, now);
    }

    setControlSessions((currentSessions) =>
      currentSessions.map((session) => (
        session.endedAt ? session : { ...session, endedAt: now }
      )),
    );
    setSelectedMachine('');
  };

  return (
    <section className="visual-controls-section" id="controles-visuales">
      <div className="section-heading">
        <div>
          <span>Inspeccion visual</span>
          <h2>Controles visuales</h2>
        </div>
        <strong className="record-count">Fecha {reportDate} / Ronda {currentCycleNumber} / Maquinas {cycleProgress}</strong>
      </div>
      {(syncNotice || visualSaveError) && (
        <strong className="visual-sync-warning">{visualSaveError || syncNotice}</strong>
      )}

      <div className="visual-control-layout">
        <div className="visual-control-setup">
          <label className="field">
            <span>Responsable de la ronda</span>
            <select
              value={responsible}
              onChange={(event) => setResponsible(event.target.value)}
            >
              <option value="">Seleccionar responsable</option>
              {visualResponsibleOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <label className="field visual-machine-picker">
            <span>Maquina pendiente</span>
            <select
              value={selectedMachine}
              onChange={(event) => setSelectedMachine(event.target.value)}
              disabled={!roundCanStart || Boolean(activeSession) || pendingMachines.length === 0}
            >
              <option value="">{roundCanStart ? 'Seleccionar maquina' : 'Primero seleccione responsable'}</option>
              {pendingMachines.map((machine) => (
                <option key={machine} value={machine}>{machine}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Formato en produccion</span>
            <SearchableSelect
              value={productionFormat}
              onChange={setProductionFormat}
              options={availableProductionFormats}
              placeholder="Seleccionar formato"
              disabled={!roundCanStart || Boolean(activeSession)}
            />
          </label>

          <label className="field">
            <span>Operador</span>
            <select
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
              disabled={!roundCanStart || Boolean(activeSession)}
            >
              <option value="">Seleccionar operador</option>
              {operatorOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>

          <div className="visual-machine-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => startMachineControl(selectedMachine)}
              disabled={!roundCanStart || !selectedMachine || Boolean(activeSession)}
            >
              Iniciar control
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => markMachineWithoutProduction(selectedMachine)}
              disabled={!roundCanStart || !selectedMachine || Boolean(activeSession)}
            >
              No esta produciendo
            </button>
          </div>
        </div>

        <div className="visual-cycle-panel">
          <div>
            <span>Ronda actual</span>
            <strong>Ronda {currentCycleNumber}</strong>
          </div>
          <div>
            <span>Completadas</span>
            <strong>{cycleProgress}</strong>
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{pendingMachines.length}</strong>
          </div>
          <div>
            <span>Responsable</span>
            <strong>{responsible || 'Pendiente'}</strong>
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={finishRound}
            disabled={!roundIsComplete}
          >
            Terminar ronda
          </button>
        </div>

        <div className="visual-session-panel">
          {activeSession ? (
            <>
              <div className="visual-session-heading">
                <div>
                  <span>Maquina en control</span>
                  <strong>{activeSession.machine}</strong>
                </div>
                <div>
                  <span>Hora inicio</span>
                  <strong>{formatControlTime(activeSession.startedAt)}</strong>
                </div>
                <div>
                  <span>Formato</span>
                  <strong>{activeSession.productionFormat || 'Sin dato'}</strong>
                </div>
                <div>
                  <span>Operador</span>
                  <strong>{activeSession.operatorName || 'Sin dato'}</strong>
                </div>
                <div>
                  <span>Revisiones</span>
                  <strong>{controlProgress}</strong>
                </div>
              </div>

              <div className="visual-review-list">
                {activeSession.reviews.map((review, index) => (
                  <article className="visual-review-card" key={review.id}>
                    <div className="visual-review-heading">
                      <strong>Revision {activeSession.reviews.length - index}</strong>
                      <span>{formatControlTime(review.checkedAt)}</span>
                    </div>

                    <div className="visual-review-grid">
                      <div className="visual-check">
                        <span>Defectos visuales</span>
                        <div className="check-button-row">
                          <button
                            type="button"
                            className={`check-button ${review.defectStatus === 'Conforme' ? 'active' : ''}`}
                            onClick={() => updateReview(review.id, {
                              defectStatus: 'Conforme',
                              defects: [],
                              otherDefect: '',
                              photoName: '',
                              photoPath: '',
                              photoDataUrl: '',
                              photoNames: [],
                              photoPaths: [],
                              photoDataUrls: [],
                            })}
                          >
                            Conforme
                          </button>
                          <button
                            type="button"
                            className={`check-button ${review.defectStatus === 'No conforme' ? 'active bad' : ''}`}
                            onClick={() => updateReview(review.id, { defectStatus: 'No conforme', defectComment: '' })}
                          >
                            No conforme
                          </button>
                        </div>

                        {review.defectStatus === 'Conforme' && (
                          <label className="visual-comment-field">
                            <span>Comentario opcional</span>
                            <textarea
                              value={review.defectComment}
                              onChange={(event) => updateReview(review.id, { defectComment: event.target.value })}
                              placeholder="Observaciones del control visual"
                            />
                          </label>
                        )}

                        {review.defectStatus === 'No conforme' && (
                          <div className="defect-evidence">
                            <div className="defect-category-row">
                              {visualDefectCategories.map((defect) => (
                                <button
                                  key={defect}
                                  type="button"
                                  className={`check-button ${review.defects.includes(defect) ? 'active bad' : ''}`}
                                  onClick={() => selectVisualDefectCategory(review.id, defect)}
                                >
                                  {defect}
                                </button>
                              ))}
                            </div>

                            {review.defects.length > 0 && (
                              <label className="other-defect-field">
                                <span>Defecto encontrado</span>
                                <textarea
                                  value={review.otherDefect}
                                  onChange={(event) => updateReview(review.id, { otherDefect: event.target.value })}
                                  placeholder="Escribir el defecto observado"
                                />
                              </label>
                            )}

                            <label className="photo-capture-field">
                              <span>Foto del defecto</span>
                              <button
                                type="button"
                                className="secondary-action"
                                onClick={() => setCameraTarget(`${review.id}:visual`)}
                                disabled={getReviewVisualPhotoUrls(review).length >= MAX_REVIEW_PHOTOS}
                              >
                                Abrir camara
                              </button>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                disabled={getReviewVisualPhotoUrls(review).length >= MAX_REVIEW_PHOTOS}
                                onChange={(event) => updateReviewPhoto(review.id, event.target.files?.[0], 'visual')}
                              />
                            </label>

                            {cameraTarget === `${review.id}:visual` && (
                              <CameraCapture
                                onCapture={(dataUrl) => saveCapturedPhoto(review.id, dataUrl, 'visual')}
                                onClose={() => setCameraTarget('')}
                              />
                            )}

                            {getReviewVisualPhotoUrls(review).length > 0 && (
                              <div className="defect-photo-preview">
                                {getReviewVisualPhotoUrls(review).map((photoUrl, photoIndex) => (
                                  <figure key={`${review.id}-visual-${photoIndex}`}>
                                    <button
                                      type="button"
                                      className="photo-thumb-button"
                                      onClick={() => setSelectedPhotoPreview({ src: photoUrl, label: `Defecto ${photoIndex + 1}` })}
                                    >
                                      <img src={photoUrl} alt={`Foto de defecto ${photoIndex + 1}`} />
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-action"
                                      onClick={() => removeReviewPhoto(review.id, 'visual', photoIndex)}
                                    >
                                      Quitar
                                    </button>
                                  </figure>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="visual-check">
                        <span>Distribucion del material</span>
                        <div className="check-button-row">
                          <button
                            type="button"
                            className={`check-button ${review.distribution === 'Conforme' ? 'active' : ''}`}
                            onClick={() => updateReview(review.id, {
                              distribution: 'Conforme',
                              materialZones: [],
                              materialOtherZone: '',
                            })}
                          >
                            Conforme
                          </button>
                          <button
                            type="button"
                            className={`check-button ${review.distribution === 'No conforme' ? 'active bad' : ''}`}
                            onClick={() => updateReview(review.id, { distribution: 'No conforme', distributionComment: '' })}
                          >
                            No conforme
                          </button>
                        </div>

                        {review.distribution === 'Conforme' && (
                          <label className="visual-comment-field">
                            <span>Comentario opcional</span>
                            <textarea
                              value={review.distributionComment}
                              onChange={(event) => updateReview(review.id, { distributionComment: event.target.value })}
                              placeholder="Observaciones de distribucion del material"
                            />
                          </label>
                        )}

                        {needsNonConformityDetails(review.distribution) && (
                          <div className="defect-evidence">
                            <strong className="detail-list-title">Zona de la botella</strong>
                            <div className="defect-list">
                              {materialDistributionZones.map((zone) => (
                                <label key={zone}>
                                  <input
                                    type="checkbox"
                                    checked={(review.materialZones ?? []).includes(zone)}
                                    onChange={() => toggleReviewListValue(review.id, 'materialZones', zone)}
                                  />
                                  <span>{zone}</span>
                                </label>
                              ))}
                            </div>

                            {(review.materialZones ?? []).includes('Otro') && (
                              <label className="other-defect-field">
                                <span>Detalle de otra zona</span>
                                <input
                                  type="text"
                                  value={review.materialOtherZone}
                                  onChange={(event) => updateReview(review.id, { materialOtherZone: event.target.value })}
                                  placeholder="Describir zona"
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="visual-check">
                        <span>Estado de bolsa</span>
                        <div className="check-button-row">
                          <button
                            type="button"
                            className={`check-button ${review.bagStatus === 'Conforme' ? 'active' : ''}`}
                            onClick={() => updateReview(review.id, {
                              bagStatus: 'Conforme',
                              bagDefects: [],
                              bagOtherDefect: '',
                              bagPhotoName: '',
                              bagPhotoPath: '',
                              bagPhotoDataUrl: '',
                              bagPhotoNames: [],
                              bagPhotoPaths: [],
                              bagPhotoDataUrls: [],
                            })}
                          >
                            Conforme
                          </button>
                          <button
                            type="button"
                            className={`check-button ${review.bagStatus === 'No conforme' ? 'active bad' : ''}`}
                            onClick={() => updateReview(review.id, { bagStatus: 'No conforme', bagComment: '' })}
                          >
                            No conforme
                          </button>
                        </div>

                        {review.bagStatus === 'Conforme' && (
                          <label className="visual-comment-field">
                            <span>Comentario opcional</span>
                            <textarea
                              value={review.bagComment}
                              onChange={(event) => updateReview(review.id, { bagComment: event.target.value })}
                              placeholder="Observaciones del estado de bolsa"
                            />
                          </label>
                        )}

                        {needsNonConformityDetails(review.bagStatus) && (
                          <div className="defect-evidence">
                            <strong className="detail-list-title">Defectos de bolsa</strong>
                            <div className="defect-list">
                              {bagDefectOptions.map((defect) => (
                                <label key={defect}>
                                  <input
                                    type="checkbox"
                                    checked={(review.bagDefects ?? []).includes(defect)}
                                    onChange={() => toggleReviewListValue(review.id, 'bagDefects', defect)}
                                  />
                                  <span>{defect}</span>
                                </label>
                              ))}
                            </div>

                            {(review.bagDefects ?? []).includes('Otro') && (
                              <label className="other-defect-field">
                                <span>Detalle de otro defecto</span>
                                <input
                                  type="text"
                                  value={review.bagOtherDefect}
                                  onChange={(event) => updateReview(review.id, { bagOtherDefect: event.target.value })}
                                  placeholder="Describir defecto de bolsa"
                                />
                              </label>
                            )}

                            <label className="photo-capture-field">
                              <span>Foto de la bolsa opcional</span>
                              <button
                                type="button"
                                className="secondary-action"
                                onClick={() => setCameraTarget(`${review.id}:bag`)}
                                disabled={getReviewBagPhotoUrls(review).length >= MAX_REVIEW_PHOTOS}
                              >
                                Abrir camara
                              </button>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                disabled={getReviewBagPhotoUrls(review).length >= MAX_REVIEW_PHOTOS}
                                onChange={(event) => updateReviewPhoto(review.id, event.target.files?.[0], 'bag')}
                              />
                            </label>

                            {cameraTarget === `${review.id}:bag` && (
                              <CameraCapture
                                onCapture={(dataUrl) => saveCapturedPhoto(review.id, dataUrl, 'bag')}
                                onClose={() => setCameraTarget('')}
                              />
                            )}

                            {getReviewBagPhotoUrls(review).length > 0 && (
                              <div className="defect-photo-preview">
                                {getReviewBagPhotoUrls(review).map((photoUrl, photoIndex) => (
                                  <figure key={`${review.id}-bag-${photoIndex}`}>
                                    <button
                                      type="button"
                                      className="photo-thumb-button"
                                      onClick={() => setSelectedPhotoPreview({ src: photoUrl, label: `Bolsa ${photoIndex + 1}` })}
                                    >
                                      <img src={photoUrl} alt={`Foto de bolsa ${photoIndex + 1}`} />
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-action"
                                      onClick={() => removeReviewPhoto(review.id, 'bag', photoIndex)}
                                    >
                                      Quitar
                                    </button>
                                  </figure>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="visual-control-end-actions">
                <button type="button" className="secondary-action" onClick={addReviewToActiveSession}>
                  Agregar revision
                </button>
                <button type="button" className="secondary-action" onClick={finishActiveControl}>
                  Finalizar
                </button>
              </div>
            </>
          ) : (
            <div className="mold-placeholder">
              {roundIsComplete
                ? 'La ronda esta completa. Presione Terminar ronda para guardar el cierre y empezar una nueva.'
                : 'Seleccione responsable y maquina para iniciar el control y registrar la hora.'}
            </div>
          )}
        </div>
      </div>

      {selectedPhotoPreview && (
        <div className="photo-lightbox" role="dialog" aria-modal="true">
          <div className="photo-lightbox-content">
            <div className="photo-lightbox-header">
              <strong>{selectedPhotoPreview.label}</strong>
              <button type="button" className="secondary-action" onClick={() => setSelectedPhotoPreview(null)}>
                Cerrar
              </button>
            </div>
            <img src={selectedPhotoPreview.src} alt={selectedPhotoPreview.label} />
          </div>
        </div>
      )}

      {currentCycleSessions.length > 0 && (
        <div className="visual-session-history">
          <div className="measurement-title">Registro de la ronda actual</div>
          {currentCycleSessions.map((session) => (
            <article
              className={`visual-session-row ${session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION ? 'no-production' : ''}`}
              key={session.id}
            >
              <strong>Ronda {session.cycleNumber ?? 1} / {session.machine}</strong>
              <span>{session.date}</span>
              <span>Formato {session.productionFormat || 'Sin dato'}</span>
              <span>Operador {session.operatorName || 'Sin dato'}</span>
              <span>{session.status ?? VISUAL_SESSION_STATUS_CONTROLLED}</span>
              <span>
                {session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION
                  ? (session.skipReason || VISUAL_NO_PRODUCTION_REASON)
                  : `${session.reviews?.length ?? 0}/${MIN_VISUAL_CONTROLS_PER_SHIFT} revisiones`}
              </span>
              <span>Inicio {formatControlTime(session.startedAt)}</span>
              <span>Fin {formatControlTime(session.endedAt)}</span>
            </article>
          ))}
        </div>
      )}

      {todayRoundGroups.length > 0 && (
        <div className="visual-daily-preview">
          <div className="measurement-title">Vista preliminar diaria</div>
          {todayRoundGroups.map((round) => {
            const roundHasActiveSession = round.sessions.some((session) => !session.endedAt && session.status !== VISUAL_SESSION_STATUS_NO_PRODUCTION);
            const roundStatus = roundHasActiveSession
              ? 'En curso'
              : round.sessions.length >= machines.length ? 'Completa' : 'En proceso';
            const roundResponsible = getRoundResponsible(round.sessions);
            const roundStartTime = formatControlTime([...round.sessions].map((session) => session.startedAt).filter(Boolean).sort()[0]);

            return (
              <article className="visual-round-preview-card" key={round.cycleNumber}>
                <div className="visual-round-preview-heading">
                  <strong>Ronda {round.cycleNumber}</strong>
                  <span>Responsable: {roundResponsible || 'Sin dato'}</span>
                  <span>Inicio: {roundStartTime || '-'}</span>
                  <span>{roundStatus}</span>
                  <b>{round.sessions.length}/{machines.length} maquinas</b>
                </div>
                <div className="visual-round-machine-list">
                  {round.sessions
                    .slice()
                    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
                    .map((session) => (
                      <div className="visual-round-machine-row" key={session.id}>
                        <strong>{session.machine}</strong>
                        <span>{session.responsible || 'Sin responsable'}</span>
                        <span>{getVisualSessionDisplayStatus(session)}</span>
                        <span>Inicio {formatControlTime(session.startedAt)} / Fin {formatControlTime(session.endedAt)}</span>
                        <span>{session.productionFormat || 'Sin formato'}</span>
                        <span>{session.operatorName || 'Sin operador'}</span>
                        <p>{getVisualFindingSummary(session)}</p>
                        <div className="visual-round-photo-strip">
                          {(session.reviews ?? []).flatMap(getReviewPhotoItems).slice(0, 4).map((photo, photoIndex) => (
                            <figure key={`${session.id}-${photo.label}-${photoIndex}`}>
                              <img src={photo.src} alt={`Foto ${photo.label}`} />
                              <figcaption>{photo.label}</figcaption>
                            </figure>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="danger-action visual-delete-record"
                          onClick={() => deleteVisualSession(session)}
                        >
                          Borrar registro
                        </button>
                      </div>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getEntriesByMold(entries) {
  return entries.reduce((groups, entry) => {
    const mold = entry.mold || 'Sin molde';
    return {
      ...groups,
      [mold]: [...(groups[mold] ?? []), entry],
    };
  }, {});
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return Number(number.toFixed(3)).toString();
}

function formatCertificateNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return number.toFixed(decimals);
}

function averageField(entries, fieldKey) {
  const values = entries
    .map((entry) => Number(entry.measurements?.[fieldKey]))
    .filter((value) => !Number.isNaN(value));

  if (values.length === 0) {
    return '';
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function productionAverageField(entries, fieldKey) {
  const entriesByMold = getEntriesByMold(entries);
  const moldAverages = Object.values(entriesByMold)
    .map((moldEntries) => averageField(moldEntries, fieldKey))
    .filter((value) => value !== '');

  if (moldAverages.length === 0) {
    return '';
  }

  return moldAverages.reduce((sum, value) => sum + value, 0) / moldAverages.length;
}

function productionTextField(entries, fieldKey) {
  return [
    ...new Set(
      entries
        .map((entry) => entry.measurements?.[fieldKey])
        .filter((value) => value !== undefined && value !== null && value !== ''),
    ),
  ].join(', ');
}

function getFormatVolumeMl(formatName) {
  const literMatch = formatName.match(/(\d+(?:[.,]\d+)?)\s*(?:LT|LTS|LITROS|L)\b/i);

  if (literMatch) {
    return Number(literMatch[1].replace(',', '.')) * 1000;
  }

  const ccMatch = formatName.match(/(\d+(?:[.,]\d+)?)\s*CC\b/i);

  if (ccMatch) {
    return Number(ccMatch[1].replace(',', '.'));
  }

  return '';
}

function getFormatMeta(formatName, firstEntry) {
  const gramsMatch = formatName.match(/(\d+(?:[.,]\d+)?)\s*GR/i);
  const finishMatch = formatName.match(/(\d+(?:[.,]\d+)?)\s*MM/i);
  const grams = gramsMatch ? `${gramsMatch[1].replace(',', '.')}g` : formatNumber(firstEntry?.measurements?.pesoVacia);
  const finish = finishMatch ? `${finishMatch[1].replace(',', '.')}mm` : '48mm';
  const color = formatName.includes('BLANCO') || formatName.includes('-BL-')
    ? 'BLANCO'
    : formatName.includes('VERDE') || formatName.includes('-VE')
      ? 'VERDE'
      : 'CRISTAL';

  return { finish, grams, color };
}

function getCertificateProductLabel(formatName) {
  const cleanFormat = formatName
    .replace(/ESPECIFICACI[ÓO]N\s+T[ÉE]CNICA/gi, '')
    .replace(/\(\s*[^)]*\s*\)/g, '')
    .replace(/\bBOTELLA\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*GR\b/gi, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `BOTELLA PET ${cleanFormat}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

const certificateRows = [
  {
    item: '1',
    title: 'VOLUMEN DE LLENADO',
    fieldKey: 'volumen',
    method: 'ITR-LAS-02',
    base: 'Probeta-Termometro Digital',
    equipment: 'Probeta-Termometro Digital',
    unit: 'ml',
    source: 'formatVolume',
  },
  {
    item: '2',
    title: 'PESO',
    fieldKey: 'pesoVacia',
    method: '',
    base: 'Balanza OHAUS',
    equipment: 'Balanza',
    unit: 'g',
  },
  {
    item: '3',
    title: 'ESPESORES',
    fieldKey: '',
    method: '',
    base: 'Medidor de espesores Magna Mike 8600',
    equipment: 'Medidor de espesores',
    unit: '',
    isSection: true,
  },
  {
    item: '',
    title: 'E-1 (1 cm alrededor del punto)',
    fieldKey: 'e1',
    method: 'ITR-LAS-05',
    base: 'Medidor de espesores Magna Mike 8600',
    equipment: 'Medidor de espesores',
    unit: 'mm',
  },
  {
    item: '',
    title: 'E-2 (Base)',
    fieldKey: 'e2',
    method: 'ITR-LAS-05',
    base: 'Medidor de espesores Magna Mike 8600',
    equipment: 'Medidor de espesores',
    unit: 'mm',
  },
  {
    item: '4',
    title: 'DIMENSIONES DE LA BOTELLA',
    fieldKey: '',
    method: 'ITR-LAS-03 / ITR-LAS-04',
    base: 'Medidor de Altura',
    equipment: 'Medidor de Altura',
    unit: '',
    isSection: true,
  },
  {
    item: '',
    title: 'Altura de la botella',
    fieldKey: 'alturaTotal',
    method: 'ITR-LAS-03',
    base: 'Medidor de Altura',
    equipment: 'Medidor de Altura',
    unit: 'mm',
  },
  {
    item: '',
    title: 'Diametro mayor inferior',
    fieldKey: 'diametroInferior',
    method: 'ITR-LAS-04',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: 'mm',
  },
  {
    item: '5',
    title: 'FINISHED',
    fieldKey: '',
    method: 'ITR-LAP-05',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: '',
    isSection: true,
  },
  {
    item: '',
    title: 'Diametro interno',
    fieldKey: 'diametroInterno',
    method: 'ITR-LAP-05',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: 'mm',
  },
  {
    item: '',
    title: 'Diametro externo',
    fieldKey: 'diametroExterno',
    method: 'ITR-LAP-05',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: 'mm',
  },
  {
    item: '',
    title: 'Diametro de rotura de banda',
    fieldKey: 'diametroRoturaBanda',
    method: 'ITR-LAP-05',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: 'mm',
  },
  {
    item: '',
    title: 'Diametro anilla de soporte',
    fieldKey: 'diametroAnillaSoporte',
    method: 'ITR-LAP-05',
    base: 'Calibrador digital Mitutoyo',
    equipment: 'Calibrador digital',
    unit: 'mm',
  },
  {
    item: '6',
    title: 'PRUEBA DE CAIDA',
    fieldKey: 'pruebaCaida',
    method: 'ITR-LAS-03',
    base: 'Verificacion visual',
    equipment: 'Prueba de caida libre',
    unit: '',
    valueType: 'text',
    specText: 'Sin fugas',
  },
];

function formatCertificateDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getCertificateCode(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return '00/00';
  }

  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
}

function getCertificateSpecText(spec, decimals = 2) {
  if (!spec) {
    return '-';
  }

  const min = Number(spec.min);
  const max = Number(spec.max);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return '-';
  }

  const target = Number.isFinite(Number(spec.target)) ? Number(spec.target) : (min + max) / 2;
  const tolerance = Math.max(Math.abs(target - min), Math.abs(max - target));

  return `${formatCertificateNumber(target, decimals)} ± ${formatCertificateNumber(tolerance, decimals)}`;
}

function getCertificateAverage(entries, fieldKey, decimals = 2) {
  return formatCertificateNumber(productionAverageField(entries, fieldKey), decimals);
}

function getCertificateSpec(firstEntry, fieldKey, decimals = 2) {
  return getCertificateSpecText(firstEntry.evaluations?.[fieldKey]?.spec, decimals);
}

function certificateLines(values) {
  return values.map((value) => `<span>${value}</span>`).join('');
}

const finishedCertificateSpecs = {
  diametroInterno: '41.15 ± 0.25',
  diametroExterno: '47.3 ± 0.2',
  diametroRoturaBanda: '48.3 ± 0.2',
  diametroAnillaSoporte: '51.54 ± 0.25',
};

function getFinishedCertificateSpec(firstEntry, fieldKey) {
  return finishedCertificateSpecs[fieldKey] ?? getCertificateSpec(firstEntry, fieldKey, 2);
}

function getFallTestCertificateValue(entries) {
  const text = productionTextField(entries, 'pruebaCaida').toUpperCase();

  if (!text) {
    return 'SI';
  }

  if (/\bNO\b|NO\s*CONFORME|FALLO|FALLA|RECHAZ/.test(text)) {
    return 'NO';
  }

  if (/SI|PASA|PASO|CONFORME|SIN\s*FUGA/.test(text)) {
    return 'SI';
  }

  if (/FUGA|FUGAS/.test(text)) {
    return 'NO';
  }

  return text;
}

function getCertificateHtml(record) {
  const firstEntry = record.entries[0] ?? {};
  const formatVolume = getFormatVolumeMl(record.formatName);
  const formatMeta = getFormatMeta(record.formatName, firstEntry);
  const certificateDetails = getRecordCertificateDetails(record);
  const productLabel = escapeHtml(getCertificateProductLabel(record.formatName));
  const finishGramsColor = `${formatMeta.finish || '-'} - ${formatMeta.grams || '-'} - ${formatMeta.color || '-'}`;
  const certificateCode = getCertificateCode(record.date);
  const printDate = formatCertificateDate(new Date());
  const fabricationDate = formatCertificateDate(record.date);
  const measuredVolume = productionAverageField(record.entries, 'volumen');
  const volumeAverage = measuredVolume !== ''
    ? formatCertificateNumber(measuredVolume, 2)
    : formatVolume
      ? formatCertificateNumber(formatVolume, 2)
      : '-';
  const volumeSpec = formatVolume ? `${formatCertificateNumber(formatVolume, 2)} ± 25.00` : '-';
  const fallTest = getFallTestCertificateValue(record.entries);
  const productionRows = `
    <tr>
      <td class="item-cell">1</td>
      <td class="analysis-cell"><strong>VOLUMEN DE LLENADO</strong></td>
      <td>ITR-LAS-02</td>
      <td>Probeta-Termometro Digital</td>
      <td>ml</td>
      <td class="result-cell">${escapeHtml(volumeAverage)}</td>
      <td>${escapeHtml(volumeSpec)}</td>
    </tr>
    <tr>
      <td class="item-cell">2</td>
      <td class="analysis-cell"><strong>PESO</strong></td>
      <td></td>
      <td>Balanza</td>
      <td>g</td>
      <td class="result-cell">${escapeHtml(getCertificateAverage(record.entries, 'pesoVacia', 2))}</td>
      <td>${escapeHtml(getCertificateSpec(firstEntry, 'pesoVacia', 2))}</td>
    </tr>
    <tr>
      <td class="item-cell">3</td>
      <td class="analysis-cell">
        <strong>ESPESORES</strong>
        <span>E-1 (1 cm alrededor del punto)</span>
        <span>E-2 (Base/petaloide)</span>
      </td>
      <td>ITR-LAS-05</td>
      <td>Medidor de espesores</td>
      <td class="cell-lines">${certificateLines(['mm', 'mm'])}</td>
      <td class="result-cell cell-lines">${certificateLines([
        escapeHtml(getCertificateAverage(record.entries, 'e1', 2)),
        escapeHtml(getCertificateAverage(record.entries, 'e2', 2)),
      ])}</td>
      <td class="cell-lines">${certificateLines([
        escapeHtml(getCertificateSpec(firstEntry, 'e1', 2)),
        escapeHtml(getCertificateSpec(firstEntry, 'e2', 2)),
      ])}</td>
    </tr>
    <tr>
      <td class="item-cell">4</td>
      <td class="analysis-cell">
        <strong>DIMENSIONES DE LA BOTELLA</strong>
        <span>Altura de la Botella</span>
        <span>Diametro mayor inferior</span>
      </td>
      <td class="cell-lines">${certificateLines(['ITR-LAS-03', 'ITR-LAS-04'])}</td>
      <td class="cell-lines">${certificateLines(['Medidor de Altura', 'Calibrador digital'])}</td>
      <td class="cell-lines">${certificateLines(['mm', 'mm'])}</td>
      <td class="result-cell cell-lines">${certificateLines([
        escapeHtml(getCertificateAverage(record.entries, 'alturaTotal', 2)),
        escapeHtml(getCertificateAverage(record.entries, 'diametroInferior', 2)),
      ])}</td>
      <td class="cell-lines">${certificateLines([
        escapeHtml(getCertificateSpec(firstEntry, 'alturaTotal', 2)),
        escapeHtml(getCertificateSpec(firstEntry, 'diametroInferior', 2)),
      ])}</td>
    </tr>
    <tr>
      <td class="item-cell">5</td>
      <td class="analysis-cell">
        <strong>FINISHED</strong>
        <span>Diametro interno</span>
        <span>Diametro externo</span>
        <span>Diametro rotura de banda</span>
        <span>Diametro anillo de soporte</span>
      </td>
      <td>ITR-LAP-05</td>
      <td>Calibrador Digital</td>
      <td class="cell-lines">${certificateLines(['mm', 'mm', 'mm', 'mm'])}</td>
      <td class="result-cell cell-lines">${certificateLines([
        escapeHtml(getCertificateAverage(record.entries, 'diametroInterno', 2)),
        escapeHtml(getCertificateAverage(record.entries, 'diametroExterno', 2)),
        escapeHtml(getCertificateAverage(record.entries, 'diametroRoturaBanda', 2)),
        escapeHtml(getCertificateAverage(record.entries, 'diametroAnillaSoporte', 2)),
      ])}</td>
      <td class="cell-lines">${certificateLines([
        escapeHtml(getFinishedCertificateSpec(firstEntry, 'diametroInterno')),
        escapeHtml(getFinishedCertificateSpec(firstEntry, 'diametroExterno')),
        escapeHtml(getFinishedCertificateSpec(firstEntry, 'diametroRoturaBanda')),
        escapeHtml(getFinishedCertificateSpec(firstEntry, 'diametroAnillaSoporte')),
      ])}</td>
    </tr>
    <tr>
      <td class="item-cell">6</td>
      <td class="analysis-cell"><strong>PRUEBA DE CAIDA</strong></td>
      <td>ITR-LAS-03</td>
      <td></td>
      <td>PASA/NO PASA</td>
      <td class="result-cell">${escapeHtml(fallTest)}</td>
      <td>PASA/NO PASA</td>
    </tr>
  `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Certificado de analisis de calidad</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: letter landscape; margin: 7mm; }
          body { margin: 0; padding: 8px 14px; color: #000; background: #eef2f4; font-family: Arial, sans-serif; }
          .preview-toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 10px; max-width: 816px; margin: 0 auto 8px; }
          .preview-toolbar button { min-height: 40px; border: 0; border-radius: 6px; padding: 0 14px; background: #087d7d; color: #fff; font-weight: 700; cursor: pointer; }
          .certificate { position: relative; width: 816px; min-height: 660px; margin: 0 auto; background: #fff; border: 1px solid #999; padding: 18px 14px 34px; }
          header { display: grid; grid-template-columns: 190px 1fr 78px; align-items: center; min-height: 70px; }
          .logo-box { display: flex; align-items: center; justify-content: center; }
          img { width: 125px; max-height: 56px; object-fit: contain; }
          .title-box { text-align: center; }
          h1 { margin: 0; font-size: 18px; letter-spacing: 0; text-transform: uppercase; }
          .code-blue { color: #001fb0; }
          .print-date-small { align-self: center; justify-self: end; font-size: 6px; }
          .meta-table { width: calc(100% - 76px); margin: 4px auto 8px; border-collapse: collapse; font-size: 13px; }
          .meta-table td { height: 25px; border: 1px solid #111; padding: 3px 5px; vertical-align: middle; }
          .meta-label { width: 25%; font-weight: 400; text-transform: uppercase; }
          .meta-value { text-align: center; font-weight: 700; }
          .analysis-block { width: 100%; page-break-inside: avoid; margin-top: 0; }
          .analysis-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
          .analysis-table col:nth-child(1) { width: 5%; }
          .analysis-table col:nth-child(2) { width: 24%; }
          .analysis-table col:nth-child(3) { width: 11.5%; }
          .analysis-table col:nth-child(4) { width: 22%; }
          .analysis-table col:nth-child(5) { width: 9.5%; }
          .analysis-table col:nth-child(6) { width: 9.5%; }
          .analysis-table col:nth-child(7) { width: 18.5%; }
          .analysis-table th { border: 1px solid #111; padding: 3px 4px; background: #e9e9e9; text-align: center; font-size: 11px; line-height: 1.05; text-transform: uppercase; }
          .analysis-table tbody td { min-height: 28px; border-left: 1px solid #111; border-right: 1px solid #111; border-top: 0; border-bottom: 0; padding: 4px 5px; vertical-align: middle; line-height: 1.25; }
          .analysis-table tbody tr:first-child td { border-top: 1px solid #111; }
          .analysis-table tbody tr:last-child td { border-bottom: 1px solid #111; }
          .item-cell,
          .analysis-table tbody td:nth-child(3),
          .analysis-table tbody td:nth-child(4),
          .analysis-table tbody td:nth-child(5),
          .analysis-table tbody td:nth-child(6),
          .analysis-table tbody td:nth-child(7) { text-align: center; }
          .analysis-cell strong { display: block; margin-bottom: 2px; font-weight: 800; }
          .analysis-cell span { display: block; }
          .cell-lines span { display: block; min-height: 18px; }
          .result-cell { color: #001fb0; font-weight: 800; }
          .food-contact, .validity, .packages, .recommendations { width: 100%; border-left: 1px solid #111; border-right: 1px solid #111; padding: 1px 4px; font-size: 12px; line-height: 1.1; }
          .food-contact { border-top: 0; font-weight: 800; text-transform: uppercase; }
          .validity { color: #0068c9; font-weight: 800; text-transform: uppercase; }
          .packages { font-weight: 400; }
          .recommendations { border-bottom: 0; text-transform: uppercase; }
          .recommendations h3 { margin: 1px 0 2px; font-size: 12px; text-transform: uppercase; }
          .recommendation-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; text-transform: none; }
          .recommendation-grid strong { display: block; font-size: 11px; }
          .recommendation-grid ul { margin: 1px 0 0; padding-left: 16px; font-size: 11px; line-height: 1.25; }
          .certificate-footer { position: absolute; left: 0; right: 0; bottom: 5px; display: grid; grid-template-columns: 1fr auto; align-items: end; padding: 0 10px; font-size: 9px; }
          .footer-address { text-align: center; }
          .footer-date { font-size: 13px; }
          @media print {
            body { padding: 0; background: #fff; }
            .preview-toolbar { display: none; }
            .certificate { border: 0; }
          }
        </style>
      </head>
      <body>
        <div class="preview-toolbar">
          <button onclick="window.print()">Imprimir / Guardar PDF</button>
        </div>
        <main class="certificate">
          <header>
            <div class="logo-box">
              <img src="/logos/logo-empacar.png" alt="Empacar" />
            </div>
            <div class="title-box">
              <h1>Certificado de analisis de calidad <span class="code-blue">${escapeHtml(certificateCode)}</span></h1>
            </div>
            <div class="print-date-small">${escapeHtml(printDate)}</div>
          </header>
          <table class="meta-table">
            <tr>
              <td class="meta-label">Producto:</td>
              <td class="meta-value">BOTELLAS PET</td>
              <td class="meta-label">Finish - Gramaje - Color:</td>
              <td class="meta-value">${escapeHtml(finishGramsColor)}</td>
            </tr>
            <tr>
              <td class="meta-label">Fecha de fabricacion:</td>
              <td class="meta-value">${escapeHtml(fabricationDate)}</td>
              <td class="meta-label">Orden de produccion:</td>
              <td class="meta-value">${escapeHtml(certificateDetails.ordenProduccion || 'Sin dato')}</td>
            </tr>
            <tr>
              <td class="meta-label">Resina utilizada:</td>
              <td class="meta-value" colspan="3">${escapeHtml(certificateDetails.resinaUtilizada || 'Sin dato')}</td>
            </tr>
          </table>
          <section class="analysis-block">
            <table class="analysis-table">
              <colgroup>
                <col /><col /><col /><col /><col /><col /><col />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Analisis</th>
                  <th>Metodo de<br />prueba</th>
                  <th>Equipo de medicion</th>
                  <th>Unidad</th>
                  <th>Promedio</th>
                  <th>Especificacion</th>
                </tr>
              </thead>
              <tbody>${productionRows}</tbody>
            </table>
          </section>
          <div class="food-contact">Producto apto para contacto con alimentos</div>
          <div class="validity">Certificado valido para ${productLabel}</div>
          <div class="packages">Paquetes: Pallet de madera, Separadores de Carton corrugado, Film o plastico de baja densidad, fleje plastico.</div>
          <section class="recommendations">
            <h3>Recomendaciones de almacenamiento</h3>
            <div class="recommendation-grid">
              <div>
                <strong>Consideraciones en empaques palletizados</strong>
                <ul>
                  <li>Apile los pallet en forma recta y superpuesta.</li>
                  <li>Almacene bajo techo, lugar limpio y seco.</li>
                  <li>Evite cambios bruscos de humedad ambiental.</li>
                  <li>Temperatura de almacenamiento menor a 35 °C.</li>
                </ul>
              </div>
              <div>
                <strong>Consideraciones en empaques embolsados</strong>
                <ul>
                  <li>Apile las bolsas en forma recta y superpuesta.</li>
                  <li>Almacene bajo techo, lugar limpio y seco.</li>
                  <li>Evite cambios bruscos de humedad ambiental.</li>
                  <li>Temperatura de almacenamiento menor a 35 °C.</li>
                </ul>
              </div>
            </div>
          </section>
          <footer class="certificate-footer">
            <div class="footer-address">Av. Elias Meneses - Telefono: 44322537 - Cochabamba - Bolivia - www.empacar.com.bo</div>
            <div class="footer-date">${escapeHtml(printDate)}</div>
          </footer>
        </main>
      </body>
    </html>
  `;
}

function printQualityCertificate(record) {
  const certificateWindow = window.open('', '_blank', 'width=1100,height=800');

  if (!certificateWindow) {
    return;
  }

  certificateWindow.document.write(getCertificateHtml(record));
  certificateWindow.document.close();
  certificateWindow.focus();
}

function getVisualControlReportHtml(sessions, responsible, { enableSave = false } = {}) {
  const generatedAt = new Date().toLocaleString('es-BO');
  const chronologicalSessions = [...sessions].reverse();
  const reportResponsible = responsible || getRoundResponsible(sessions);
  const totalReviews = sessions.reduce((sum, session) => sum + (session.reviews?.length ?? 0), 0);
  const controlledSessions = sessions.filter((session) => session.status !== VISUAL_SESSION_STATUS_NO_PRODUCTION);
  const requiredReviews = controlledSessions.length * MIN_VISUAL_CONTROLS_PER_SHIFT;
  const controlProgress = `${totalReviews}/${requiredReviews || MIN_VISUAL_CONTROLS_PER_SHIFT}`;
  const getReviewReportFindings = (review) => {
    const findings = [];

    if (review.defectStatus === 'No conforme') {
      findings.push(`Visual: ${getReviewDefectSummary(review)}`);
    } else if (review.defectComment) {
      findings.push(`Visual conforme: ${review.defectComment}`);
    }

    if (needsNonConformityDetails(review.distribution)) {
      findings.push(`Material: ${getMaterialZoneSummary(review)}`);
    } else if (review.distributionComment) {
      findings.push(`Material conforme: ${review.distributionComment}`);
    }

    if (needsNonConformityDetails(review.bagStatus)) {
      findings.push(`Bolsa: ${getBagDefectSummary(review)}`);
    } else if (review.bagComment) {
      findings.push(`Bolsa conforme: ${review.bagComment}`);
    }

    return findings;
  };
  const getSessionReportState = (session) => {
    if (session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION) {
      return { label: 'Sin produccion', className: 'state-paused' };
    }

    if (hasVisualNonConformity(session)) {
      return { label: 'Revisar', className: 'state-alert' };
    }

    if (!session.endedAt) {
      return { label: 'En curso', className: 'state-pending' };
    }

    return { label: (session.reviews?.length ?? 0) > 0 ? 'Conforme' : 'Revisado', className: 'state-ok' };
  };
  const getSessionReportObservation = (session) => {
    if (session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION) {
      return session.skipReason || VISUAL_NO_PRODUCTION_REASON;
    }

    const findings = (session.reviews ?? []).flatMap(getReviewReportFindings);

    if (findings.length > 0) {
      return findings.slice(0, 3).join(' | ');
    }

    return 'Sin novedad registrada.';
  };
  const reportRounds = Array.from(
    { length: Math.max(5, ...chronologicalSessions.map((session) => Number(session.cycleNumber ?? 1))) },
    (_, index) => index + 1,
  );
  const getUniqueSessionValues = (machineSessions, field) => uniqueNonEmpty(machineSessions.map((session) => session[field])).join(' / ') || '-';
  const getMachineTimeRange = (machineSessions) => {
    const starts = machineSessions.map((session) => session.startedAt).filter(Boolean).sort();
    const ends = machineSessions.map((session) => session.endedAt).filter(Boolean).sort();

    return `${formatControlTime(starts[0]) || '-'} - ${formatControlTime(ends[ends.length - 1]) || '-'}`;
  };
  const detailSections = chronologicalSessions
    .filter((session) => (
      (session.reviews ?? []).some((review) => (
        getReviewReportFindings(review).some((finding) => !finding.includes('conforme:'))
        || getReviewPhotoItems(review).length > 0
      ))
    ))
    .map((session) => {
      const sessionState = getSessionReportState(session);
      const relevantReviews = [...(session.reviews ?? [])].reverse().filter((review) => (
        getReviewReportFindings(review).some((finding) => !finding.includes('conforme:'))
        || getReviewPhotoItems(review).length > 0
      ));
      const reviewCards = relevantReviews.map((review, index) => `
          <div class="review-card compact-review">
            <div class="review-heading">
              <strong>Hallazgo ${index + 1}</strong>
              <span>${escapeHtml(formatControlTime(review.checkedAt))}</span>
            </div>
            <p>${escapeHtml(getReviewReportFindings(review).join(' | ') || 'Registro con foto adjunta.')}</p>
            ${getReviewPhotoItems(review).length > 0 ? `
              <div class="photo-row">
                ${getReviewPhotoItems(review).map((photo) => `
                  <figure>
                    <img class="defect-report-photo" src="${escapeHtml(photo.src)}" alt="Foto ${escapeHtml(photo.label)}" />
                    <figcaption>${escapeHtml(photo.label)}</figcaption>
                  </figure>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('');

      return `
        <section class="session-detail">
          <div class="session-detail-heading">
            <strong>Ronda ${escapeHtml(session.cycleNumber ?? 1)} / ${escapeHtml(session.machine)}</strong>
            <span class="state-pill ${sessionState.className}">${escapeHtml(sessionState.label)}</span>
          </div>
          <div class="session-meta">
            <div><span>Formato</span><strong>${escapeHtml(session.productionFormat || '-')}</strong></div>
            <div><span>Operador</span><strong>${escapeHtml(session.operatorName || '-')}</strong></div>
            <div><span>Inicio</span><strong>${escapeHtml(formatControlTime(session.startedAt))}</strong></div>
            <div><span>Fin</span><strong>${escapeHtml(formatControlTime(session.endedAt))}</strong></div>
            <div><span>Revisiones</span><strong>${escapeHtml(session.reviews?.length ?? 0)}/${session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION ? '-' : MIN_VISUAL_CONTROLS_PER_SHIFT}</strong></div>
          </div>
          <div class="review-list">${reviewCards}</div>
        </section>
      `;
    })
    .join('');
  const machineSummaryBlocks = machines
    .map((machine) => {
      const machineSessions = chronologicalSessions
        .filter((session) => session.machine === machine)
        .sort((a, b) => Number(a.cycleNumber ?? 1) - Number(b.cycleNumber ?? 1));

      if (machineSessions.length === 0) {
        return `
          <tbody class="machine-block">
            <tr><th colspan="${reportRounds.length}" class="machine-title">${escapeHtml(machine)}</th></tr>
            <tr><td colspan="${reportRounds.length}" class="machine-data">Sin controles registrados en la jornada.</td></tr>
            <tr>${reportRounds.map((roundNumber) => `<td class="round-cell round-empty"><strong>R${roundNumber}</strong><small>-</small></td>`).join('')}</tr>
          </tbody>
        `;
      }

      return `
        <tbody class="machine-block">
          <tr><th colspan="${reportRounds.length}" class="machine-title">${escapeHtml(machine)}</th></tr>
          <tr>
            <td colspan="${reportRounds.length}" class="machine-data">
              <span><b>Responsable:</b> ${escapeHtml(getUniqueSessionValues(machineSessions, 'responsible'))}</span>
              <span><b>Horario:</b> ${escapeHtml(getMachineTimeRange(machineSessions))}</span>
              <span><b>Formato:</b> ${escapeHtml(getUniqueSessionValues(machineSessions, 'productionFormat'))}</span>
              <span><b>Operador:</b> ${escapeHtml(getUniqueSessionValues(machineSessions, 'operatorName'))}</span>
            </td>
          </tr>
          <tr>
            ${reportRounds.map((roundNumber) => {
              const session = machineSessions.find((currentSession) => Number(currentSession.cycleNumber ?? 1) === roundNumber);

              if (!session) {
                return `<td class="round-cell round-empty"><strong>R${roundNumber}</strong><small>-</small></td>`;
              }

              const sessionState = getSessionReportState(session);
              const observation = getSessionReportObservation(session);
              const shouldShowObservation = ['state-alert', 'state-paused'].includes(sessionState.className);
              const startTime = formatControlTime(session.startedAt) || '-';

              return `
                <td class="round-cell ${sessionState.className}">
                  <strong>R${roundNumber}: ${escapeHtml(sessionState.label)}</strong>
                  <small><b>Inicio:</b> ${escapeHtml(startTime)}<br>${shouldShowObservation ? escapeHtml(observation) : 'Sin novedad'}</small>
                </td>
              `;
            }).join('')}
          </tr>
        </tbody>
      `;
    })
    .join('');
  const detailContent = detailSections || '<div class="compact-note"><strong>Sin defectos reportados</strong><p>No se registraron hallazgos ni fotos de defecto en la jornada.</p></div>';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte de controles visuales</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111; background: #eef2f4; }
          .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; max-width: 1120px; margin: 0 auto 14px; }
          button { min-height: 40px; border: 0; border-radius: 6px; padding: 0 14px; background: #087d7d; color: #fff; font-weight: 700; cursor: pointer; }
          .secondary-button { background: #2457a6; }
          .save-status { display: grid; place-items: center; color: #2457a6; font-size: 12px; font-weight: 700; }
          main { max-width: 1120px; margin: 0 auto; padding: 18px; border: 1px solid #111; background: #fff; }
          header { display: grid; grid-template-columns: 160px 1fr 190px; align-items: stretch; border: 1px solid #111; }
          header img { width: 140px; max-height: 64px; object-fit: contain; padding: 10px; }
          header h1 { display: grid; place-items: center; margin: 0; padding: 12px; border-left: 1px solid #111; border-right: 1px solid #111; text-align: center; font-size: 20px; text-transform: uppercase; }
          .report-code-box { display: grid; }
          .report-code-box div { display: grid; place-items: center; min-height: 28px; border-bottom: 1px solid #111; padding: 4px 6px; text-align: center; font-size: 11px; }
          .report-code-box div:last-child { border-bottom: 0; }
          .meta { display: grid; grid-template-columns: repeat(2, 1fr); border-left: 1px solid #111; }
          .meta div { border-right: 1px solid #111; border-bottom: 1px solid #111; padding: 8px; font-size: 12px; }
          .meta span { display: block; font-weight: 700; text-transform: uppercase; }
          table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 16px; font-size: 10px; }
          th, td { border: 1px solid #111; padding: 6px; text-align: center; vertical-align: middle; }
          th { background: #e9eef0; text-transform: uppercase; font-size: 10px; }
          td { overflow-wrap: anywhere; }
          .machine-block { break-inside: avoid; }
          .machine-block::after { content: ""; display: table-row; height: 8px; }
          .machine-title { background: #dfe8eb; color: #111; font-size: 12px; letter-spacing: 0; }
          .machine-data { padding: 7px 8px; background: #f7fafb; text-align: left; }
          .machine-data span { display: inline-block; margin-right: 14px; line-height: 1.45; }
          .round-cell { height: 62px; }
          .round-cell strong { display: block; font-size: 10px; text-transform: uppercase; }
          .round-cell small { display: block; margin-top: 4px; font-size: 9px; line-height: 1.25; text-align: left; }
          .round-empty { color: #8a969b; background: #f4f6f7; }
          .state-pill { display: inline-grid; place-items: center; min-width: 68px; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
          .state-ok { background: #e7f5ec; color: #176b47; }
          .state-alert { background: #fff0ee; color: #9c3329; }
          .state-pending { background: #fff8e8; color: #7a5a12; }
          .state-paused { background: #eef2f4; color: #44545b; }
          .detail-title { margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; }
          .session-detail { break-inside: avoid; margin-top: 10px; border: 1px solid #111; }
          .session-detail-heading { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #111; background: #e9eef0; }
          .session-detail-heading strong { text-transform: uppercase; }
          .session-detail-heading span { font-size: 11px; font-weight: 700; }
          .session-meta { display: grid; grid-template-columns: 1.4fr 1fr 0.7fr 0.7fr 0.7fr; border-bottom: 1px solid #111; }
          .session-meta div { min-height: 42px; padding: 6px 8px; border-right: 1px solid #111; }
          .session-meta div:last-child { border-right: 0; }
          .session-meta span { display: block; margin-bottom: 3px; color: #3f4e55; font-size: 9px; font-weight: 700; text-transform: uppercase; }
          .session-meta strong { font-size: 11px; overflow-wrap: anywhere; }
          .review-list { display: grid; gap: 8px; padding: 8px; }
          .review-card { border: 1px solid #c7d1d5; }
          .compact-note { padding: 9px 10px; border: 1px solid #c7d1d5; background: #f7fafb; }
          .compact-note.no-production { background: #fff8e8; }
          .compact-note strong { font-size: 11px; text-transform: uppercase; }
          .compact-note p,
          .review-card p { margin: 4px 0 0; font-size: 10px; line-height: 1.35; overflow-wrap: anywhere; }
          .review-card small { display: block; margin-top: 4px; color: #3f4e55; font-size: 10px; line-height: 1.35; overflow-wrap: anywhere; }
          .review-heading { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 6px 8px; border-bottom: 1px solid #c7d1d5; background: #f7fafb; font-size: 11px; }
          .compact-review p { padding: 0 8px 8px; }
          .photo-row { display: flex; gap: 10px; padding: 8px; border-top: 1px solid #c7d1d5; }
          figure { margin: 0; }
          figcaption { margin-top: 3px; font-size: 9px; text-align: center; color: #3f4e55; }
          .defect-report-photo { width: 96px; height: 96px; object-fit: cover; border: 1px solid #111; }
          @media print {
            body { padding: 0; background: #fff; }
            .toolbar { display: none; }
            main { border: 0; }
            .session-detail { page-break-inside: avoid; }
          }
          @media (max-width: 760px) {
            body { padding: 12px; }
            header { grid-template-columns: 1fr; }
            header h1 { border: 0; border-top: 1px solid #111; border-bottom: 1px solid #111; }
            .meta,
            .session-meta { grid-template-columns: 1fr; }
            .session-meta div { border-right: 0; border-bottom: 1px solid #c7d1d5; }
            .session-meta div:last-child { border-bottom: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          ${enableSave ? '<span id="save-status" class="save-status"></span><button class="secondary-button" onclick="saveReport()">Guardar reporte</button>' : ''}
          <button onclick="window.print()">Imprimir / Guardar PDF</button>
        </div>
        <main>
          <header>
            <img src="/logos/logo-empacar.png" alt="Empacar" />
            <h1>Reporte de controles visuales</h1>
            <div class="report-code-box">
              <div>${escapeHtml(VISUAL_CONTROL_CODE)}</div>
              <div>Fecha de emision: ${escapeHtml(getToday())}</div>
              <div>Pagina 1 de 1</div>
            </div>
          </header>
          <section class="meta">
            <div><span>Generado</span><strong>${escapeHtml(generatedAt)}</strong></div>
            <div><span>Responsable de la ronda</span><strong>${escapeHtml(reportResponsible || 'Sin dato')}</strong></div>
            <div><span>Revisiones registradas</span><strong>${escapeHtml(controlProgress)}</strong></div>
            <div><span>Minimo esperado por turno</span><strong>${MIN_VISUAL_CONTROLS_PER_SHIFT}</strong></div>
          </section>
          <table class="summary-table">
            ${machineSummaryBlocks}
          </table>
          <h2 class="detail-title">Detalle solo de defectos / fotos</h2>
          ${detailContent}
        </main>
        ${enableSave ? `
          <script>
            function saveReport() {
              var status = document.getElementById('save-status');
              if (!window.opener) {
                if (status) status.textContent = 'No se encontro la pagina principal.';
                return;
              }

              window.opener.postMessage({ type: 'PETNOVA_SAVE_VISUAL_REPORT' }, '*');
              if (status) status.textContent = 'Guardando...';
            }

            window.addEventListener('message', function(event) {
              if (!event.data || event.data.type !== 'PETNOVA_VISUAL_REPORT_SAVED') {
                return;
              }

              var status = document.getElementById('save-status');
              if (status) status.textContent = event.data.ok ? 'Reporte guardado.' : 'No se pudo guardar.';
            });
          </script>
        ` : ''}
      </body>
    </html>
  `;
}

function printVisualControlReport(sessions, responsible, options = {}) {
  if (sessions.length === 0) {
    window.alert('Todavia no hay controles visuales de hoy para reportar.');
    return;
  }

  const reportWindow = window.open('', '_blank', 'width=1100,height=800');

  if (!reportWindow) {
    return;
  }

  reportWindow.document.write(getVisualControlReportHtml(sessions, responsible, options));
  reportWindow.document.close();
  reportWindow.focus();
}

function FormatManagementView({
  bottleFormats = [],
  productionFormats = [],
  masterFormats: externalMasterFormats = [],
  onMasterFormatsChange,
  onSaveProductionFormat,
  onDeleteFormat,
}) {
  const [newFormatLabel, setNewFormatLabel] = useState('');
  const [newFormatPhoto, setNewFormatPhoto] = useState(null);
  const [productionDrafts, setProductionDrafts] = useState({});
  const [formatTechnicalLinks, setFormatTechnicalLinks] = useState({});
  const [productionListSearch, setProductionListSearch] = useState('');
  const [message, setMessage] = useState('');
  const [formatNotification, setFormatNotification] = useState(null);
  const notificationTimerRef = useRef(null);
  const [editingFormatId, setEditingFormatId] = useState('');
  const [savingId, setSavingId] = useState('');
  const [localMasterFormats, setLocalMasterFormats] = useState([]);
  const masterFormats = onMasterFormatsChange ? externalMasterFormats : localMasterFormats;
  const setMasterFormats = onMasterFormatsChange ?? setLocalMasterFormats;
  const [masterSearch, setMasterSearch] = useState('');
  const [masterDrafts, setMasterDrafts] = useState({});
  const [masterNewDraft, setMasterNewDraft] = useState({
    saiCode: '',
    label: '',
    volume: '',
    gramaje: '',
    color: 'CRISTAL',
    packageQuantity: '',
    client: '',
    resin: 'JADE CZ 328A',
  });
  const [masterPhotoById, setMasterPhotoById] = useState({});
  const [editingMasterId, setEditingMasterId] = useState('');
  const [masterLoading, setMasterLoading] = useState(false);

  const getProductionDraft = (format) => productionDrafts[format.id] ?? {
    label: format.label,
  };
  const getMasterDraft = (format) => masterDrafts[format.id] ?? {
    saiCode: format.saiCode,
    label: format.label,
    volume: format.volume,
    gramaje: format.gramaje,
    color: format.color,
    packageQuantity: format.packageQuantity,
    client: format.client,
    resin: format.resin,
    imagePath: format.imagePath,
    subtitle: format.subtitle,
    accent: format.accent,
    height: format.height,
    shoulder: format.shoulder,
    body: format.body,
    molds: format.molds,
    specs: format.specs,
    legacyProductionFormatId: format.legacyProductionFormatId,
    legacyBottleFormatId: format.legacyBottleFormatId,
  };
  const unifiedProductionFormats = useMemo(() => {
    return uniqueProductionFormatsByIdentity(productionFormats);
  }, [productionFormats]);
  const filteredProductionFormats = unifiedProductionFormats.filter((format) => matchesFormatSearch(format.label, productionListSearch));
  const filteredMasterFormats = masterFormats.filter((format) => (
    matchesFormatSearch([
      format.saiCode,
      format.label,
      format.volume,
      format.gramaje,
      format.color,
      format.client,
      format.resin,
    ].filter(Boolean).join(' '), masterSearch)
  ));
  const pendingMasterFormats = masterFormats.filter((format) => format.needsSaiCode);

  const refreshMasterFormats = async () => {
    setMasterLoading(true);
    setMessage('');

    try {
      const formats = await loadMasterFormatsFromSupabase();
      setMasterFormats(formats);
    } catch (error) {
      setMessage(`No se pudo cargar la tabla unica formats: ${error.message}`);
    } finally {
      setMasterLoading(false);
    }
  };

  useEffect(() => {
    refreshMasterFormats();
  }, []);

  useEffect(() => {
    setFormatTechnicalLinks((currentLinks) => {
      const nextLinks = { ...currentLinks };

      unifiedProductionFormats.forEach((format) => {
        if (format.id && format.technicalFormatId) {
          nextLinks[format.id] = format.technicalFormatId;
        }
      });

      return nextLinks;
    });
  }, [unifiedProductionFormats]);

  const getLinkedTechnicalFormat = (format) => {
    const linkedTechnicalId = formatTechnicalLinks[format.id] || format.technicalFormatId;
    const linkedProductionId = format.productionFormatId || format.id;
    const comparableLabel = getFormatIdentityKey(format.label);

    return format.technicalFormat
      || bottleFormats.find((technicalFormat) => technicalFormat.id === linkedTechnicalId)
      || bottleFormats.find((technicalFormat) => technicalFormat.productionFormatId && technicalFormat.productionFormatId === linkedProductionId)
      || bottleFormats.find((technicalFormat) => getFormatIdentityKey(getCanonicalFormatLabel(technicalFormat, productionFormats)) === comparableLabel)
      || null;
  };

  const updateProductionDraft = (formatId, values) => {
    const format = unifiedProductionFormats.find((currentFormat) => currentFormat.id === formatId);

    setProductionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [formatId]: {
        label: format?.label ?? '',
        ...(currentDrafts[formatId] ?? {}),
        ...values,
      },
    }));
    setMessage('');
  };

  const updateMasterNewDraft = (field, value) => {
    setMasterNewDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setMessage('');
  };

  const updateMasterDraft = (formatId, values) => {
    const format = masterFormats.find((currentFormat) => currentFormat.id === formatId);

    setMasterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [formatId]: {
        ...getMasterDraft(format),
        ...(currentDrafts[formatId] ?? {}),
        ...values,
      },
    }));
    setMessage('');
  };

  const updateMasterSpecDraft = (formatId, fieldKey, limitKey, value) => {
    const format = masterFormats.find((currentFormat) => currentFormat.id === formatId);
    const currentDraft = masterDrafts[formatId] ?? getMasterDraft(format);

    setMasterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [formatId]: {
        ...currentDraft,
        specs: {
          ...(currentDraft.specs ?? {}),
          [fieldKey]: {
            ...(currentDraft.specs?.[fieldKey] ?? {}),
            [limitKey]: value,
          },
        },
      },
    }));
    setMessage('');
  };

  const startEditingMasterFormat = (format) => {
    setEditingMasterId(format.id);
    setMasterDrafts((currentDrafts) => ({
      ...currentDrafts,
      [format.id]: getMasterDraft(format),
    }));
    setMessage('');
  };

  const cancelEditingMasterFormat = (formatId) => {
    setEditingMasterId('');
    setMasterDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[formatId];
      return nextDrafts;
    });
    setMasterPhotoById((currentPhotos) => {
      const nextPhotos = { ...currentPhotos };
      delete nextPhotos[formatId];
      return nextPhotos;
    });
  };

  const addMasterFormat = async () => {
    setSavingId('new-master-format');
    setMessage('');

    try {
      const result = await saveMasterFormatToSupabase(masterNewDraft);

      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo guardar el formato unico.');
        return;
      }

      setMasterFormats((currentFormats) => [
        result.format,
        ...currentFormats.filter((format) => format.id !== result.format.id),
      ].sort((a, b) => Number(b.needsSaiCode) - Number(a.needsSaiCode) || a.label.localeCompare(b.label)));
      setMasterNewDraft({
        saiCode: '',
        label: '',
        volume: '',
        gramaje: '',
        color: 'CRISTAL',
        packageQuantity: '',
        client: '',
        resin: 'JADE CZ 328A',
      });
      setMessage('Formato agregado a la tabla unica.');
    } catch (error) {
      setMessage(`No se pudo guardar el formato unico: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  const saveMasterDraft = async (format) => {
    const draft = getMasterDraft(format);
    setSavingId(`master-${format.id}`);
    setMessage('');

    try {
      const result = await saveMasterFormatToSupabase(draft, masterPhotoById[format.id] ?? null, format.id);

      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo actualizar el formato unico.');
        return;
      }

      setMasterFormats((currentFormats) => [
        result.format,
        ...currentFormats.filter((currentFormat) => currentFormat.id !== format.id && currentFormat.id !== result.format.id),
      ].sort((a, b) => Number(b.needsSaiCode) - Number(a.needsSaiCode) || a.label.localeCompare(b.label)));
      cancelEditingMasterFormat(format.id);
      setMessage('Formato unico actualizado.');
    } catch (error) {
      setMessage(`No se pudo actualizar el formato unico: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  const deleteMasterFormat = async (format) => {
    const shouldDelete = window.confirm(`Desea borrar el formato ${format.saiCode} / ${format.label} de la tabla unica?`);

    if (!shouldDelete) {
      return;
    }

    setSavingId(`delete-master-${format.id}`);
    setMessage('');

    try {
      const result = await deleteMasterFormatFromSupabase(format.id);

      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo borrar el formato unico.');
        return;
      }

      setMasterFormats((currentFormats) => currentFormats.filter((currentFormat) => currentFormat.id !== format.id));
      cancelEditingMasterFormat(format.id);
      setMessage('Formato borrado de la tabla unica.');
    } catch (error) {
      setMessage(`No se pudo borrar el formato unico: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  const startEditingFormat = (format) => {
    setEditingFormatId(format.id);
    setProductionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [format.id]: {
        label: format.label,
      },
    }));
    setMessage('');
  };

  const cancelEditingFormat = (formatId) => {
    setEditingFormatId('');
    setProductionDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[formatId];
      return nextDrafts;
    });
  };

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    window.clearTimeout(notificationTimerRef.current);
    const isSuccessMessage = /agregado|actualizado|disponible|guardado|borrado|eliminado|elimino|fusion/i.test(message);
    setFormatNotification({
      id: crypto.randomUUID(),
      message,
      type: isSuccessMessage ? 'success' : 'error',
    });

    notificationTimerRef.current = window.setTimeout(() => {
      setFormatNotification(null);
    }, 4600);

    return () => window.clearTimeout(notificationTimerRef.current);
  }, [message]);

  const addNewUnifiedFormat = async () => {
    setSavingId('new-unified-format');
    setMessage('');

    try {
      const cleanName = newFormatLabel.trim();

      if (!cleanName) {
        setMessage('Escriba el nombre del formato.');
        return;
      }

      const productionResult = await onSaveProductionFormat(cleanName, newFormatPhoto);

      if (!productionResult.ok) {
        setMessage(productionResult.message ?? 'No se pudo guardar el formato.');
        return;
      }

      if (productionResult.duplicate) {
        setNewFormatLabel('');
        setNewFormatPhoto(null);
        setMessage(productionResult.message ?? 'Ese formato ya existe. No se creo otro registro.');
        return;
      }

      setNewFormatLabel('');
      setNewFormatPhoto(null);
      setMessage('Formato agregado a la lista maestra. La especificacion tecnica se enlazara despues.');
    } catch (error) {
      setMessage(`No se pudo guardar el formato: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  const saveProductionDraft = async (format) => {
    const draft = {
      ...getProductionDraft(format),
      label: getProductionDraft(format).label || format.label,
    };
    const cleanDraftLabel = String(draft.label ?? '').trim().replace(/\s+/g, ' ');
    setSavingId(format.id);
    setMessage('');

    try {
      if (!cleanDraftLabel) {
        setMessage('El nombre del formato no puede quedar vacio.');
        return;
      }

      const targetProductionId = format.productionFormatId
        || format.id;
      const result = await onSaveProductionFormat(cleanDraftLabel, null, targetProductionId);

      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo actualizar el formato.');
        return;
      }

      setProductionDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[format.id];
        return nextDrafts;
      });
      setEditingFormatId('');
      setMessage(result.message ?? 'Formato actualizado.');
    } catch (error) {
      setMessage(`No se pudo actualizar el formato: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  const deleteFormat = async (format) => {
    const linkedTechnicalFormat = getLinkedTechnicalFormat(format);
    const hasSpecification = hasTechnicalSpecs(linkedTechnicalFormat);
    const shouldDelete = window.confirm(
      hasSpecification
        ? 'Este formato tiene una especificacion tecnica detectada. Solo se borrara el nombre maestro, no la ficha tecnica. Desea continuar?'
        : 'Desea borrar este nombre de formato?',
    );

    if (!shouldDelete) {
      return;
    }

    setSavingId(`delete-${format.id}`);
    setMessage('');

    try {
      const result = await onDeleteFormat({
        ...format,
        technicalFormatId: '',
        technicalFormat: null,
      });

      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo borrar el formato.');
        return;
      }

      setProductionDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[format.id];
        return nextDrafts;
      });
      setFormatTechnicalLinks((currentLinks) => {
        const nextLinks = { ...currentLinks };
        delete nextLinks[format.id];
        return nextLinks;
      });
      setMessage('Formato borrado.');
    } catch (error) {
      setMessage(`No se pudo borrar el formato: ${error.message}`);
    } finally {
      setSavingId('');
    }
  };

  return (
    <section className="database-section">
      <div className="section-heading">
        <div>
          <span>Control de calidad</span>
          <h2>Administrar formatos</h2>
        </div>
        <strong className="record-count">{masterFormats.length || unifiedProductionFormats.length} formatos</strong>
      </div>

      <article className="format-admin-panel format-admin-panel-wide">
        <div className="format-admin-list-heading">
          <h3>Tabla unica Supabase</h3>
          <strong>{pendingMasterFormats.length} pendientes de codigo SAI</strong>
        </div>
        <div className="format-master-add-grid">
          <label className="field">
            <span>Codigo SAI</span>
            <input
              type="text"
              value={masterNewDraft.saiCode}
              onChange={(event) => updateMasterNewDraft('saiCode', event.target.value)}
              placeholder="Ej. 14590"
            />
          </label>
          <label className="field field-wide">
            <span>Formato</span>
            <input
              type="text"
              value={masterNewDraft.label}
              onChange={(event) => updateMasterNewDraft('label', event.target.value)}
              placeholder="Nombre completo del formato"
            />
          </label>
          <label className="field">
            <span>Volumen</span>
            <input type="text" value={masterNewDraft.volume} onChange={(event) => updateMasterNewDraft('volume', event.target.value)} />
          </label>
          <label className="field">
            <span>Gramaje</span>
            <input type="text" value={masterNewDraft.gramaje} onChange={(event) => updateMasterNewDraft('gramaje', event.target.value)} />
          </label>
          <label className="field">
            <span>Color</span>
            <input type="text" value={masterNewDraft.color} onChange={(event) => updateMasterNewDraft('color', event.target.value)} />
          </label>
          <label className="field">
            <span>Cantidad</span>
            <input type="text" value={masterNewDraft.packageQuantity} onChange={(event) => updateMasterNewDraft('packageQuantity', event.target.value)} />
          </label>
          <label className="field">
            <span>Cliente</span>
            <input type="text" value={masterNewDraft.client} onChange={(event) => updateMasterNewDraft('client', event.target.value)} />
          </label>
          <label className="field">
            <span>Resina</span>
            <select value={masterNewDraft.resin} onChange={(event) => updateMasterNewDraft('resin', event.target.value)}>
              <option value="">Seleccionar</option>
              {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="primary-action"
            onClick={addMasterFormat}
            disabled={savingId === 'new-master-format'}
          >
            {savingId === 'new-master-format' ? 'Guardando' : 'Agregar a tabla unica'}
          </button>
        </div>

        <div className="format-master-toolbar">
          <label className="field">
            <span>Buscar en tabla unica</span>
            <input
              type="search"
              value={masterSearch}
              onChange={(event) => setMasterSearch(event.target.value)}
              placeholder="Codigo, formato, cliente, resina"
            />
          </label>
          <button type="button" className="secondary-action" onClick={refreshMasterFormats} disabled={masterLoading}>
            {masterLoading ? 'Cargando' : 'Actualizar tabla'}
          </button>
        </div>

        <div className="format-master-table-wrap">
          <table className="format-master-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Codigo SAI</th>
                <th>Formato</th>
                <th>Volumen</th>
                <th>Gramaje</th>
                <th>Color</th>
                <th>Cantidad</th>
                <th>Cliente</th>
                <th>Resina</th>
                <th>Foto</th>
                <th>Especificacion</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {masterFormats.length === 0 ? (
                <tr><td colSpan="12">Ejecute el SQL de tabla unica o presione actualizar.</td></tr>
              ) : filteredMasterFormats.length === 0 ? (
                <tr><td colSpan="12">Sin resultados.</td></tr>
              ) : filteredMasterFormats.map((format) => {
                const isEditing = editingMasterId === format.id;
                const draft = getMasterDraft(format);
                const hasSpecification = hasTechnicalSpecs(format);

                return (
                  <Fragment key={format.id}>
                    <tr className={format.needsSaiCode ? 'format-master-pending' : ''}>
                      <td>{format.needsSaiCode ? 'Falta SAI' : 'OK'}</td>
                      <td>
                        {isEditing ? (
                          <input type="text" value={draft.saiCode} onChange={(event) => updateMasterDraft(format.id, { saiCode: event.target.value })} />
                        ) : format.saiCode}
                      </td>
                      <td className="format-master-name-cell">
                        {isEditing ? (
                          <input type="text" value={draft.label} onChange={(event) => updateMasterDraft(format.id, { label: event.target.value })} />
                        ) : format.label}
                      </td>
                      <td>{isEditing ? <input type="text" value={draft.volume} onChange={(event) => updateMasterDraft(format.id, { volume: event.target.value })} /> : format.volume || '-'}</td>
                      <td>{isEditing ? <input type="text" value={draft.gramaje} onChange={(event) => updateMasterDraft(format.id, { gramaje: event.target.value })} /> : format.gramaje || '-'}</td>
                      <td>{isEditing ? <input type="text" value={draft.color} onChange={(event) => updateMasterDraft(format.id, { color: event.target.value })} /> : format.color || '-'}</td>
                      <td>{isEditing ? <input type="text" value={draft.packageQuantity} onChange={(event) => updateMasterDraft(format.id, { packageQuantity: event.target.value })} /> : format.packageQuantity || '-'}</td>
                      <td>{isEditing ? <input type="text" value={draft.client} onChange={(event) => updateMasterDraft(format.id, { client: event.target.value })} /> : format.client || '-'}</td>
                      <td>
                        {isEditing ? (
                          <select value={draft.resin} onChange={(event) => updateMasterDraft(format.id, { resin: event.target.value })}>
                            <option value="">Seleccionar</option>
                            {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
                          </select>
                        ) : format.resin || '-'}
                      </td>
                      <td>
                        {format.imageSrc ? <img className="format-master-thumb" src={format.imageSrc} alt={format.label} /> : 'Sin foto'}
                        {isEditing && (
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => setMasterPhotoById((currentPhotos) => ({
                              ...currentPhotos,
                              [format.id]: event.target.files?.[0] ?? null,
                            }))}
                          />
                        )}
                      </td>
                      <td>{hasSpecification ? 'Completa' : 'Pendiente'}</td>
                      <td>
                        {isEditing ? (
                          <div className="format-master-actions">
                            <button type="button" className="secondary-action" onClick={() => saveMasterDraft(format)} disabled={savingId === `master-${format.id}`}>Guardar</button>
                            <button type="button" className="secondary-action" onClick={() => cancelEditingMasterFormat(format.id)}>Cancelar</button>
                          </div>
                        ) : (
                          <div className="format-master-actions">
                            <button type="button" className="secondary-action" onClick={() => startEditingMasterFormat(format)}>Editar</button>
                            <button type="button" className="danger-action" onClick={() => deleteMasterFormat(format)} disabled={savingId === `delete-master-${format.id}`}>Borrar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="format-master-spec-row">
                        <td colSpan="12">
                          <div className="format-master-spec-editor">
                            <div className="format-master-spec-heading">
                              <strong>Especificacion tecnica</strong>
                              <span>Ingrese minimo y maximo. Deje vacio lo que no aplique.</span>
                            </div>
                            <div className="format-master-spec-grid">
                              {measurementFields.filter((field) => field.type !== 'text').map((field) => (
                                <div className="format-master-spec-field" key={field.key}>
                                  <span>{field.label}</span>
                                  <label>
                                    Min
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={draft.specs?.[field.key]?.min ?? ''}
                                      onChange={(event) => updateMasterSpecDraft(format.id, field.key, 'min', event.target.value)}
                                    />
                                  </label>
                                  <label>
                                    Max
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={draft.specs?.[field.key]?.max ?? ''}
                                      onChange={(event) => updateMasterSpecDraft(format.id, field.key, 'max', event.target.value)}
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <div className="format-admin-layout">
        <article className="format-admin-panel format-admin-panel-wide">
          <h3>Nuevo formato</h3>
          <div className="format-admin-form">
            <label className="field">
              <span>Nombre del formato</span>
              <input
                type="text"
                value={newFormatLabel}
                onChange={(event) => setNewFormatLabel(event.target.value)}
                placeholder="Ej. 600cc Cristal-100 Bebidas S.A 22g"
              />
            </label>
            <label className="field">
              <span>Foto referencial</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setNewFormatPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="primary-action"
              onClick={addNewUnifiedFormat}
              disabled={savingId === 'new-unified-format'}
            >
              {savingId === 'new-unified-format' ? 'Guardando' : 'Agregar formato'}
            </button>
          </div>
        </article>

        <article className="format-admin-panel">
          <div className="format-admin-list-heading">
            <h3>Lista unica de formatos</h3>
            <strong>{filteredProductionFormats.length} visibles / {unifiedProductionFormats.length} total</strong>
          </div>
          <label className="field">
            <span>Buscar formato</span>
            <input
              type="search"
              value={productionListSearch}
              onChange={(event) => setProductionListSearch(event.target.value)}
              placeholder="Escriba para filtrar"
            />
          </label>
          <div className="format-admin-list">
            {unifiedProductionFormats.length === 0 ? (
              <div className="empty-database">Sin formatos agregados.</div>
            ) : filteredProductionFormats.length === 0 ? (
              <div className="empty-database">Sin resultados.</div>
            ) : filteredProductionFormats.map((format) => {
              const draft = getProductionDraft(format);
              const previewSrc = format.imageSrc;
              const linkedTechnicalFormat = getLinkedTechnicalFormat(format);
              const hasSpecification = hasTechnicalSpecs(linkedTechnicalFormat);
              const isEditing = editingFormatId === format.id;

              return (
                <div className="format-admin-row" key={format.id}>
                  <div className="format-admin-photo">
                    {previewSrc ? <img src={previewSrc} alt={format.label} /> : <span>Sin foto</span>}
                  </div>
                  <div className={`format-spec-status ${hasSpecification ? 'ready' : 'pending'}`}>
                    <span>Especificacion tecnica</span>
                    <strong>{hasSpecification ? 'Detectada' : 'Pendiente de enlace'}</strong>
                  </div>
                  {isEditing ? (
                    <label className="field">
                      <span>Nombre</span>
                      <input
                        type="text"
                        value={draft.label}
                        onChange={(event) => updateProductionDraft(format.id, { label: event.target.value })}
                      />
                    </label>
                  ) : (
                    <div className="format-name-readonly">
                      <span>Nombre</span>
                      <strong>{format.label}</strong>
                    </div>
                  )}
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => saveProductionDraft(format)}
                        disabled={savingId === format.id}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => cancelEditingFormat(format.id)}
                        disabled={savingId === format.id}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => startEditingFormat(format)}
                    >
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => deleteFormat(format)}
                    disabled={savingId === `delete-${format.id}`}
                  >
                    Borrar
                  </button>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      {formatNotification && (
        <div className={`toast-notification toast-${formatNotification.type}`} role="status" aria-live="polite">
          <span className="toast-icon" aria-hidden="true">{formatNotification.type === 'error' ? '!' : 'OK'}</span>
          <div>
            <strong>{formatNotification.type === 'error' ? 'No se pudo guardar' : 'Cambio guardado'}</strong>
            <p>{formatNotification.message}</p>
          </div>
          <button type="button" aria-label="Cerrar notificacion" onClick={() => setFormatNotification(null)}>x</button>
          <span className="toast-progress" aria-hidden="true" />
        </div>
      )}
    </section>
  );
}

function getDefectPhotoRecords(sessions) {
  return sessions.flatMap((session) => (
    (session.reviews ?? []).flatMap((review, reviewIndex) => (
      getReviewPhotoItems(review).map((photo) => ({
        id: `${session.id}-${review.id}-${photo.target}-${photo.index}`,
        session,
        review,
        reviewNumber: (session.reviews?.length ?? 0) - reviewIndex,
        photo,
      }))
    ))
  ));
}

function getNewQualityDefectPhotoRecords() {
  const inspectionRecords = loadNewQualityInspectionRecords();
  const testsRecords = loadNewQualityTestsRecords();
  const inspectionBySaiCode = new Map(
    inspectionRecords
      .filter((record) => record.saiCode)
      .map((record) => [normalizeSaiCode(record.saiCode), record]),
  );

  const mapQualityRecordPhotos = (record, sourceLabel) => {
    const linkedInspection = inspectionBySaiCode.get(normalizeSaiCode(record.saiCode)) ?? record;
    const photoContext = {
      date: record.productionDate || linkedInspection.productionDate || getToday(),
      responsible: linkedInspection.qualityAuxiliary || linkedInspection.operator || 'Sin dato',
      format: [
        linkedInspection.client,
        linkedInspection.volume,
        linkedInspection.gramColor,
      ].filter(Boolean).join(' / ') || record.saiCode || 'Sin formato',
      summary: [
        record.saiCode ? `Codigo SAI: ${record.saiCode}` : '',
        linkedInspection.bottleOp ? `OP botella: ${linkedInspection.bottleOp}` : '',
        linkedInspection.resin ? `Resina: ${linkedInspection.resin}` : '',
        linkedInspection.operator ? `Operador: ${linkedInspection.operator}` : '',
      ].filter(Boolean).join(' | ') || 'Evidencia registrada en control de calidad.',
    };

    return normalizeNewQualityEvidencePhotos(record.evidencePhotos).map((photo, photoIndex) => ({
      id: `${sourceLabel}-${record.id}-${photo.id || photoIndex}`,
      foundAt: photo.takenAt || record.updatedAt || record.createdAt || new Date().toISOString(),
      title: `${sourceLabel} - ${photo.label}`,
      subtitle: `${photoContext.date} / ${record.saiCode || 'Sin codigo SAI'}`,
      dateLabel: `Encontrado: ${formatControlDate(photo.takenAt, photoContext.date)} - ${formatControlTime(photo.takenAt)}`,
      responsible: photoContext.responsible,
      format: photoContext.format,
      summary: photoContext.summary,
      photo: {
        src: photo.dataUrl,
        label: `${photo.label} / ${sourceLabel}`,
      },
    })).filter((item) => item.photo.src);
  };

  return [
    ...inspectionRecords.flatMap((record) => mapQualityRecordPhotos(record, 'Nuevo registro')),
    ...testsRecords.flatMap((record) => mapQualityRecordPhotos(record, 'Pruebas')),
  ];
}

function FoundDefectsView({ sessions }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const photoRecords = [
    ...getDefectPhotoRecords(sessions).map(({ id, session, review, reviewNumber, photo }) => ({
      id,
      foundAt: review.checkedAt,
      title: session.machine,
      subtitle: `${session.date} / Ronda ${session.cycleNumber ?? 1} / Revision ${reviewNumber}`,
      dateLabel: `Encontrado: ${formatControlDate(review.checkedAt, session.date)} - ${formatControlTime(review.checkedAt)}`,
      responsible: session.responsible || 'Sin dato',
      format: session.productionFormat || 'Sin dato',
      summary: getVisualFindingSummary({ ...session, reviews: [review] }),
      photo,
    })),
    ...getNewQualityDefectPhotoRecords(),
  ].sort((a, b) => new Date(b.foundAt) - new Date(a.foundAt));

  return (
    <section className="found-defects-section">
      <div className="section-heading">
        <div>
          <span>Galeria de evidencia</span>
          <h2>Defectos encontrados</h2>
        </div>
        <strong className="record-count">{photoRecords.length} fotos</strong>
      </div>

      {photoRecords.length === 0 ? (
        <div className="mold-placeholder">No hay registros con fotos cargadas.</div>
      ) : (
        <div className="found-defects-grid">
          {photoRecords.map(({ id, title, subtitle, dateLabel, responsible, format, summary, photo }) => (
            <article className="found-defect-card" key={id}>
              <button
                type="button"
                className="found-defect-photo"
                onClick={() => setSelectedPhoto({ src: photo.src, label: `${photo.label} / ${title}` })}
              >
                <img src={photo.src} alt={`${photo.label} ${title}`} />
              </button>
              <div>
                <strong>{title}</strong>
                <span>{subtitle}</span>
                <span className="found-defect-datetime">{dateLabel}</span>
                <span>Responsable: {responsible}</span>
                <span>Formato: {format}</span>
                <p>{summary}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true">
          <div className="photo-lightbox-content">
            <div className="photo-lightbox-header">
              <strong>{selectedPhoto.label}</strong>
              <button type="button" className="secondary-action" onClick={() => setSelectedPhoto(null)}>
                Cerrar
              </button>
            </div>
            <img src={selectedPhoto.src} alt={selectedPhoto.label} />
          </div>
        </div>
      )}
    </section>
  );
}

function VisualControlsDatabaseView({
  sessions,
  setSessions,
  authUser,
  bottleFormats = [],
  productionFormats = [],
  onAudit,
}) {
  const [filters, setFilters] = useState({
    date: '',
    machine: '',
    responsible: '',
    status: '',
    search: '',
  });
  const [expandedDate, setExpandedDate] = useState('');
  const [expandedRoundKey, setExpandedRoundKey] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const formatOptions = useMemo(() => (
    getUnifiedFormatOptions(bottleFormats, productionFormats).map((format) => format.label)
  ), [bottleFormats, productionFormats]);
  const updateFilter = (field, value) => {
    setFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  };
  const clearFilters = () => {
    setFilters({ date: '', machine: '', responsible: '', status: '', search: '' });
  };
  const createEditDraft = (session) => ({
    date: session.date || getToday(),
    machine: session.machine || '',
    responsible: session.responsible || '',
    productionFormat: session.productionFormat || '',
    operatorName: session.operatorName || '',
    cycleNumber: String(session.cycleNumber ?? 1),
    status: session.status || VISUAL_SESSION_STATUS_CONTROLLED,
    skipReason: session.skipReason || '',
    startedAt: toDatetimeLocalValue(session.startedAt),
    endedAt: toDatetimeLocalValue(session.endedAt),
    reviews: (session.reviews ?? []).map((review) => ({
      ...review,
      checkedAt: toDatetimeLocalValue(review.checkedAt),
      defectStatus: review.defectStatus || 'Conforme',
      defectComment: review.defectComment || '',
      defects: review.defects ?? [],
      otherDefect: review.otherDefect || '',
      distribution: review.distribution || 'Pendiente',
      distributionComment: review.distributionComment || '',
      materialZones: review.materialZones ?? [],
      materialOtherZone: review.materialOtherZone || '',
      bagStatus: review.bagStatus || 'Pendiente',
      bagComment: review.bagComment || '',
      bagDefects: review.bagDefects ?? [],
      bagOtherDefect: review.bagOtherDefect || '',
    })),
  });
  const startEditingSession = (session) => {
    setEditingSessionId(session.id);
    setEditDraft(createEditDraft(session));
    setEditMessage('');
  };
  const cancelEditingSession = () => {
    setEditingSessionId('');
    setEditDraft(null);
    setEditMessage('');
  };
  const updateEditDraft = (field, value) => {
    setEditDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setEditMessage('');
  };
  const updateEditReview = (reviewId, values) => {
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      reviews: (currentDraft?.reviews ?? []).map((review) => (
        review.id === reviewId ? { ...review, ...values } : review
      )),
    }));
    setEditMessage('');
  };
  const toggleEditReviewListValue = (reviewId, field, value) => {
    const review = editDraft?.reviews?.find((item) => item.id === reviewId);
    const currentValues = review?.[field] ?? [];
    const values = currentValues.includes(value)
      ? currentValues.filter((item) => item !== value)
      : [...currentValues, value];

    updateEditReview(reviewId, { [field]: values });
  };
  const saveEditedSession = async (session) => {
    if (!editDraft || !setSessions) {
      return;
    }

    if (!editDraft.date || !editDraft.machine || !editDraft.responsible) {
      setEditMessage('Complete fecha, maquina y responsable antes de guardar.');
      return;
    }

    const ownerUserId = session.userId || authUser?.userId || '';
    const updatedSession = normalizeVisualSession({
      ...session,
      date: editDraft.date,
      machine: editDraft.machine,
      responsible: editDraft.responsible,
      productionFormat: editDraft.productionFormat,
      operatorName: editDraft.operatorName,
      cycleNumber: Number(editDraft.cycleNumber) || 1,
      status: editDraft.status,
      skipReason: editDraft.status === VISUAL_SESSION_STATUS_NO_PRODUCTION
        ? (editDraft.skipReason || VISUAL_NO_PRODUCTION_REASON)
        : '',
      startedAt: fromDatetimeLocalValue(editDraft.startedAt) || session.startedAt,
      endedAt: fromDatetimeLocalValue(editDraft.endedAt),
      updatedAt: new Date().toISOString(),
      reviews: (editDraft.reviews ?? []).map((review) => ({
        ...review,
        checkedAt: fromDatetimeLocalValue(review.checkedAt) || review.checkedAt || new Date().toISOString(),
      })),
    });

    if (supabaseConfigReady && ownerUserId) {
      const { error: sessionError } = await supabase
        .from('visual_control_sessions')
        .upsert(getVisualSessionPayload(updatedSession, ownerUserId), { onConflict: 'id' });

      if (sessionError) {
        setEditMessage(`No se pudo actualizar la inspeccion en Supabase: ${sessionError.message}`);
        return;
      }

      for (const review of updatedSession.reviews ?? []) {
        const { error: reviewError } = await upsertVisualReview(review, updatedSession.id, ownerUserId);

        if (reviewError) {
          setEditMessage(`No se pudo actualizar una revision en Supabase: ${reviewError.message}`);
          return;
        }
      }
    }

    setSessions((currentSessions) => currentSessions.map((currentSession) => (
      currentSession.id === updatedSession.id ? updatedSession : currentSession
    )));
    setEditingSessionId('');
    setEditDraft(null);
    setEditMessage('Inspeccion actualizada.');
    onAudit?.({
      action: 'Edito inspeccion visual',
      area: 'Controles visuales',
      target: updatedSession.machine,
      detail: `${updatedSession.date} / Ronda ${updatedSession.cycleNumber}`,
      metadata: { sessionId: updatedSession.id },
    });
  };
  const hasFilters = Object.values(filters).some(Boolean);
  const filteredSessions = sessions.filter((session) => {
    const status = getVisualSessionDisplayStatus(session);
    const searchText = filters.search.trim().toLowerCase();
    const searchableSession = [
      session.date,
      session.machine,
      session.responsible,
      session.productionFormat,
      session.operatorName,
      status,
      getVisualFindingSummary(session),
      ...(session.reviews ?? []).flatMap((review) => [
        review.defectStatus,
        getReviewDefectSummary(review),
        review.defectComment,
        review.distribution,
        getMaterialZoneSummary(review),
        review.distributionComment,
        review.bagStatus,
        getBagDefectSummary(review),
        review.bagComment,
      ]),
    ].join(' ').toLowerCase();

    return (!filters.date || session.date === filters.date)
      && (!filters.machine || session.machine === filters.machine)
      && (!filters.responsible || session.responsible === filters.responsible)
      && (!filters.status || status === filters.status)
      && (!searchText || searchableSession.includes(searchText));
  });
  const orderedSessions = [...filteredSessions].sort((a, b) => (
    new Date(b.startedAt || b.date).getTime() - new Date(a.startedAt || a.date).getTime()
  ));
  const groupedByDate = orderedSessions.reduce((dateGroups, session) => {
    const date = session.date || 'Sin fecha';
    const cycleNumber = Number(session.cycleNumber ?? 1);
    const roundKey = `${date}:${cycleNumber}`;
    const existingDateGroup = dateGroups[date] ?? { date, sessions: [], rounds: {} };
    const existingRound = existingDateGroup.rounds[roundKey] ?? { key: roundKey, cycleNumber, sessions: [] };

    return {
      ...dateGroups,
      [date]: {
        ...existingDateGroup,
        sessions: [...existingDateGroup.sessions, session],
        rounds: {
          ...existingDateGroup.rounds,
          [roundKey]: {
            ...existingRound,
            sessions: [...existingRound.sessions, session],
          },
        },
      },
    };
  }, {});
  const dateGroups = Object.values(groupedByDate)
    .map((dateGroup) => ({
      ...dateGroup,
      rounds: Object.values(dateGroup.rounds)
        .map((round) => ({
          ...round,
          sessions: [...round.sessions].sort((a, b) => new Date(a.startedAt || a.date) - new Date(b.startedAt || b.date)),
        }))
        .sort((a, b) => b.cycleNumber - a.cycleNumber),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const uniqueDates = uniqueNonEmpty(sessions.map((session) => session.date)).sort().reverse();
  const uniqueResponsibles = uniqueNonEmpty(sessions.map((session) => session.responsible)).sort();
  const statusOptions = uniqueNonEmpty(sessions.map(getVisualSessionDisplayStatus)).sort();
  const getGroupSummary = (groupSessions) => {
    const alertCount = groupSessions.filter(hasVisualNonConformity).length;
    const noProductionCount = groupSessions.filter((session) => session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION).length;
    const photoCount = groupSessions.reduce((sum, session) => sum + (session.reviews ?? []).flatMap(getReviewPhotoItems).length, 0);

    return `${groupSessions.length} registros / ${alertCount} con novedad / ${noProductionCount} sin produccion / ${photoCount} fotos`;
  };
  const renderEditSessionForm = (session) => {
    if (!editDraft) {
      return null;
    }

    return (
      <div className="visual-database-edit-panel">
        <div className="visual-database-edit-grid">
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={editDraft.date} onChange={(event) => updateEditDraft('date', event.target.value)} />
          </label>
          <label className="field">
            <span>Ronda</span>
            <input type="number" min="1" value={editDraft.cycleNumber} onChange={(event) => updateEditDraft('cycleNumber', event.target.value)} />
          </label>
          <label className="field">
            <span>Maquina</span>
            <select value={editDraft.machine} onChange={(event) => updateEditDraft('machine', event.target.value)}>
              <option value="">Seleccionar</option>
              {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Responsable</span>
            <select value={editDraft.responsible} onChange={(event) => updateEditDraft('responsible', event.target.value)}>
              <option value="">Seleccionar</option>
              {visualResponsibleOptions.map((responsibleOption) => (
                <option key={responsibleOption} value={responsibleOption}>{responsibleOption}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Inicio</span>
            <input type="datetime-local" value={editDraft.startedAt} onChange={(event) => updateEditDraft('startedAt', event.target.value)} />
          </label>
          <label className="field">
            <span>Fin</span>
            <input type="datetime-local" value={editDraft.endedAt} onChange={(event) => updateEditDraft('endedAt', event.target.value)} />
          </label>
          <label className="field">
            <span>Estado</span>
            <select value={editDraft.status} onChange={(event) => updateEditDraft('status', event.target.value)}>
              <option value={VISUAL_SESSION_STATUS_CONTROLLED}>Controlado</option>
              <option value={VISUAL_SESSION_STATUS_NO_PRODUCTION}>Sin produccion</option>
            </select>
          </label>
          <label className="field">
            <span>Operador</span>
            <select value={editDraft.operatorName} onChange={(event) => updateEditDraft('operatorName', event.target.value)}>
              <option value="">Sin dato</option>
              {operatorOptions.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </select>
          </label>
          <label className="field field-wide">
            <span>Formato</span>
            <SearchableSelect
              value={editDraft.productionFormat}
              onChange={(value) => updateEditDraft('productionFormat', value)}
              options={formatOptions}
              placeholder="Seleccionar formato"
            />
          </label>
          {editDraft.status === VISUAL_SESSION_STATUS_NO_PRODUCTION && (
            <label className="field field-wide">
              <span>Motivo sin produccion</span>
              <textarea value={editDraft.skipReason} onChange={(event) => updateEditDraft('skipReason', event.target.value)} />
            </label>
          )}
        </div>

        {editDraft.status !== VISUAL_SESSION_STATUS_NO_PRODUCTION && editDraft.reviews.length > 0 && (
          <div className="visual-database-edit-reviews">
            {editDraft.reviews.map((review, index) => (
              <article className="visual-database-edit-review" key={review.id}>
                <div className="visual-database-review-heading">
                  <strong>Revision {index + 1}</strong>
                  <input
                    type="datetime-local"
                    value={review.checkedAt}
                    onChange={(event) => updateEditReview(review.id, { checkedAt: event.target.value })}
                  />
                </div>
                <div className="visual-database-edit-review-grid">
                  <div className="visual-check">
                    <span>Defectos visuales</span>
                    <select
                      value={review.defectStatus}
                      onChange={(event) => updateEditReview(review.id, {
                        defectStatus: event.target.value,
                        defects: event.target.value === 'Conforme' ? [] : review.defects,
                        otherDefect: event.target.value === 'Conforme' ? '' : review.otherDefect,
                      })}
                    >
                      <option value="Conforme">Conforme</option>
                      <option value="No conforme">No conforme</option>
                    </select>
                    {review.defectStatus === 'Conforme' ? (
                      <textarea value={review.defectComment} onChange={(event) => updateEditReview(review.id, { defectComment: event.target.value })} placeholder="Comentario opcional" />
                    ) : (
                      <>
                        <div className="defect-category-row">
                          {visualDefectCategories.map((defect) => (
                            <button
                              type="button"
                              className={`check-button ${review.defects?.includes(defect) ? 'active bad' : ''}`}
                              key={defect}
                              onClick={() => updateEditReview(review.id, { defects: review.defects?.includes(defect) ? [] : [defect] })}
                            >
                              {defect}
                            </button>
                          ))}
                        </div>
                        <textarea value={review.otherDefect} onChange={(event) => updateEditReview(review.id, { otherDefect: event.target.value })} placeholder="Defecto encontrado" />
                      </>
                    )}
                  </div>

                  <div className="visual-check">
                    <span>Distribucion del material</span>
                    <select
                      value={review.distribution}
                      onChange={(event) => updateEditReview(review.id, {
                        distribution: event.target.value,
                        materialZones: event.target.value === 'Conforme' ? [] : review.materialZones,
                        materialOtherZone: event.target.value === 'Conforme' ? '' : review.materialOtherZone,
                      })}
                    >
                      <option value="Conforme">Conforme</option>
                      <option value="No conforme">No conforme</option>
                      <option value="Pendiente">Pendiente</option>
                    </select>
                    {needsNonConformityDetails(review.distribution) ? (
                      <>
                        <div className="defect-list">
                          {materialDistributionZones.map((zone) => (
                            <label key={zone}>
                              <input
                                type="checkbox"
                                checked={(review.materialZones ?? []).includes(zone)}
                                onChange={() => toggleEditReviewListValue(review.id, 'materialZones', zone)}
                              />
                              <span>{zone}</span>
                            </label>
                          ))}
                        </div>
                        <input value={review.materialOtherZone} onChange={(event) => updateEditReview(review.id, { materialOtherZone: event.target.value })} placeholder="Otra zona" />
                      </>
                    ) : (
                      <textarea value={review.distributionComment} onChange={(event) => updateEditReview(review.id, { distributionComment: event.target.value })} placeholder="Comentario opcional" />
                    )}
                  </div>

                  <div className="visual-check">
                    <span>Estado de bolsa</span>
                    <select
                      value={review.bagStatus}
                      onChange={(event) => updateEditReview(review.id, {
                        bagStatus: event.target.value,
                        bagDefects: event.target.value === 'Conforme' ? [] : review.bagDefects,
                        bagOtherDefect: event.target.value === 'Conforme' ? '' : review.bagOtherDefect,
                      })}
                    >
                      <option value="Conforme">Conforme</option>
                      <option value="No conforme">No conforme</option>
                      <option value="Pendiente">Pendiente</option>
                    </select>
                    {needsNonConformityDetails(review.bagStatus) ? (
                      <>
                        <div className="defect-list">
                          {bagDefectOptions.map((defect) => (
                            <label key={defect}>
                              <input
                                type="checkbox"
                                checked={(review.bagDefects ?? []).includes(defect)}
                                onChange={() => toggleEditReviewListValue(review.id, 'bagDefects', defect)}
                              />
                              <span>{defect}</span>
                            </label>
                          ))}
                        </div>
                        <input value={review.bagOtherDefect} onChange={(event) => updateEditReview(review.id, { bagOtherDefect: event.target.value })} placeholder="Otro defecto" />
                      </>
                    ) : (
                      <textarea value={review.bagComment} onChange={(event) => updateEditReview(review.id, { bagComment: event.target.value })} placeholder="Comentario opcional" />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="visual-database-edit-actions">
          <button type="button" className="primary-action" onClick={() => saveEditedSession(session)}>
            Guardar cambios
          </button>
          <button type="button" className="secondary-action" onClick={cancelEditingSession}>
            Cancelar
          </button>
          {editMessage && <span>{editMessage}</span>}
        </div>
      </div>
    );
  };
  const renderSessionDetail = (session) => {
    if (session.status === VISUAL_SESSION_STATUS_NO_PRODUCTION) {
      return (
        <div className="compact-note no-production">
          <strong>Sin produccion</strong>
          <p>{session.skipReason || VISUAL_NO_PRODUCTION_REASON}</p>
        </div>
      );
    }

    if ((session.reviews ?? []).length === 0) {
      return (
        <div className="compact-note">
          <strong>Sin revisiones registradas</strong>
          <p>La maquina fue abierta en la ronda, pero no tiene revisiones guardadas.</p>
        </div>
      );
    }

    return [...(session.reviews ?? [])].reverse().map((review, index) => (
      <article className="visual-database-review" key={review.id}>
        <div className="visual-database-review-heading">
          <strong>Revision {index + 1}</strong>
          <span>{formatControlDate(review.checkedAt, session.date)} / {formatControlTime(review.checkedAt)}</span>
        </div>
        <div className="visual-database-review-grid">
          <div>
            <span>Defectos visuales</span>
            <strong>{review.defectStatus}</strong>
            <p>{review.defectStatus === 'Conforme' ? (review.defectComment || 'Conforme') : getReviewDefectSummary(review)}</p>
          </div>
          <div>
            <span>Distribucion del material</span>
            <strong>{review.distribution}</strong>
            <p>{needsNonConformityDetails(review.distribution) ? getMaterialZoneSummary(review) : (review.distributionComment || 'Conforme')}</p>
          </div>
          <div>
            <span>Estado de bolsa</span>
            <strong>{review.bagStatus}</strong>
            <p>{needsNonConformityDetails(review.bagStatus) ? getBagDefectSummary(review) : (review.bagComment || 'Conforme')}</p>
          </div>
        </div>
        {getReviewPhotoItems(review).length > 0 && (
          <div className="visual-database-photo-strip">
            {getReviewPhotoItems(review).map((photo, photoIndex) => (
              <button
                type="button"
                key={`${review.id}-${photo.target}-${photoIndex}`}
                onClick={() => setSelectedPhoto({ src: photo.src, label: `${photo.label} / ${session.machine}` })}
              >
                <img src={photo.src} alt={photo.label} />
                <span>{photo.label}</span>
              </button>
            ))}
          </div>
        )}
      </article>
    ));
  };

  return (
    <section className="visual-database-section">
      <div className="section-heading">
        <div>
          <span>Base de datos</span>
          <h2>Registros de controles visuales</h2>
        </div>
        <strong className="record-count">{orderedSessions.length}/{sessions.length} registros</strong>
      </div>

      <div className="visual-database-filters">
        <label className="field">
          <span>Fecha</span>
          <select value={filters.date} onChange={(event) => updateFilter('date', event.target.value)}>
            <option value="">Todas</option>
            {uniqueDates.map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Maquina</span>
          <select value={filters.machine} onChange={(event) => updateFilter('machine', event.target.value)}>
            {operatorProductionMachineOptions.map((machine) => <option key={machine.value} value={machine.value}>{machine.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Responsable</span>
          <select value={filters.responsible} onChange={(event) => updateFilter('responsible', event.target.value)}>
            <option value="">Todos</option>
            {uniqueResponsibles.map((responsible) => <option key={responsible} value={responsible}>{responsible}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Estado</span>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">Todos</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="field field-wide">
          <span>Buscar</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Formato, operador, hallazgo, comentario..."
          />
        </label>
        <div className="visual-database-filter-actions">
          <button type="button" className="secondary-action" onClick={clearFilters} disabled={!hasFilters}>
            Limpiar filtros
          </button>
        </div>
      </div>

      {orderedSessions.length === 0 ? (
        <div className="mold-placeholder">No hay registros de controles visuales con esos filtros.</div>
      ) : (
        <div className="visual-database-list">
          {dateGroups.map((dateGroup) => {
            const dateIsExpanded = expandedDate === dateGroup.date;

            return (
              <article className="visual-database-date-card" key={dateGroup.date}>
                <button
                  type="button"
                  className="visual-database-date-header"
                  onClick={() => {
                    setExpandedDate(dateIsExpanded ? '' : dateGroup.date);
                    setExpandedRoundKey('');
                  }}
                >
                  <div>
                    <span>Fecha</span>
                    <strong>{dateGroup.date}</strong>
                  </div>
                  <span>{getGroupSummary(dateGroup.sessions)}</span>
                </button>

                {dateIsExpanded && (
                  <div className="visual-database-round-list">
                    {dateGroup.rounds.map((round) => {
                      const roundIsExpanded = expandedRoundKey === round.key;
                      const roundStart = formatControlTime(round.sessions.map((session) => session.startedAt).filter(Boolean).sort()[0]);
                      const sortedRoundEnds = round.sessions.map((session) => session.endedAt).filter(Boolean).sort();
                      const roundEnd = formatControlTime(sortedRoundEnds[sortedRoundEnds.length - 1]);

                      return (
                        <article className="visual-database-round-card" key={round.key}>
                          <button
                            type="button"
                            className="visual-database-round-header"
                            onClick={() => {
                              setExpandedRoundKey(roundIsExpanded ? '' : round.key);
                            }}
                          >
                            <div>
                              <span>Ronda</span>
                              <strong>Ronda {round.cycleNumber}</strong>
                            </div>
                            <div>
                              <span>Horario</span>
                              <strong>{roundStart || '-'} - {roundEnd || '-'}</strong>
                            </div>
                            <div>
                              <span>Resumen</span>
                              <strong>{getGroupSummary(round.sessions)}</strong>
                            </div>
                          </button>

                          {roundIsExpanded && (
                            <div className="visual-database-session-list">
                              {round.sessions.map((session) => {
                                const status = getVisualSessionDisplayStatus(session);
                                const photos = (session.reviews ?? []).flatMap(getReviewPhotoItems);
                                const isEditing = editingSessionId === session.id;

                                return (
                                  <article className={`visual-database-card ${hasVisualNonConformity(session) ? 'has-alert' : ''}`} key={session.id}>
                                    <div className="visual-database-card-header static">
                                      <div>
                                        <span>Maquina</span>
                                        <strong>{session.machine}</strong>
                                      </div>
                                      <div>
                                        <span>Hora</span>
                                        <strong>{formatControlTime(session.startedAt)} - {formatControlTime(session.endedAt)}</strong>
                                      </div>
                                      <div>
                                        <span>Estado</span>
                                        <strong>{status}</strong>
                                      </div>
                                      <div>
                                        <span>Revisiones</span>
                                        <strong>{session.reviews?.length ?? 0}</strong>
                                      </div>
                                      <div>
                                        <span>Fotos</span>
                                        <strong>{photos.length}</strong>
                                      </div>
                                    </div>

                                    <div className="visual-database-card-summary">
                                      <span>Responsable: {session.responsible || 'Sin dato'}</span>
                                      <span>Formato: {session.productionFormat || 'Sin dato'}</span>
                                      <span>Operador: {session.operatorName || 'Sin dato'}</span>
                                      <button
                                        type="button"
                                        className="secondary-action"
                                        onClick={() => (isEditing ? cancelEditingSession() : startEditingSession(session))}
                                      >
                                        {isEditing ? 'Cerrar edicion' : 'Editar'}
                                      </button>
                                    </div>
                                    {!isEditing && <p>{getVisualFindingSummary(session)}</p>}

                                    <div className="visual-database-detail">
                                      {isEditing ? renderEditSessionForm(session) : renderSessionDetail(session)}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true">
          <div className="photo-lightbox-content">
            <div className="photo-lightbox-header">
              <strong>{selectedPhoto.label}</strong>
              <button type="button" className="secondary-action" onClick={() => setSelectedPhoto(null)}>
                Cerrar
              </button>
            </div>
            <img src={selectedPhoto.src} alt={selectedPhoto.label} />
          </div>
        </div>
      )}
    </section>
  );
}

function SavedReportsView({ reports, onOpen }) {
  const orderedReports = [...reports].sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

  return (
    <section className="saved-reports-section">
      <div className="section-heading">
        <div>
          <span>Archivo historico</span>
          <h2>Reportes guardados</h2>
        </div>
        <strong className="record-count">{orderedReports.length} reportes</strong>
      </div>

      {orderedReports.length === 0 ? (
        <div className="mold-placeholder">Todavia no hay reportes guardados.</div>
      ) : (
        <div className="saved-report-list">
          {orderedReports.map((report) => (
            <article className="saved-report-card" key={report.id}>
              <div>
                <strong>{report.title}</strong>
                <span>{report.reportDate} / {new Date(report.generatedAt).toLocaleString('es-BO')}</span>
                <span>Responsable: {report.responsible || 'Sin dato'}</span>
                <span>{report.sessionCount} maquinas / {report.reviewCount} revisiones</span>
              </div>
              <button type="button" className="primary-action" onClick={() => onOpen(report)}>
                Ver reporte
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function createEmptyOperatorProductionDraft() {
  return {
    date: getToday(),
    machine: machines[0],
    shift: '',
    operatorName: '',
    startTime: '',
    endTime: '',
    format: '',
    saiCode: '',
    opBot: '',
    goodBottles: '',
    usedTotal: '',
    balance: '',
    opPerBox: '',
    resinPerBox: '',
    boxNumber: '',
    fromNumber: '',
    toNumber: '',
    totalBags: '',
  };
}

function OperatorProductionRegister({ records, setRecords, productionFormats = [], bottleFormats = [] }) {
  const [draft, setDraft] = useState(createEmptyOperatorProductionDraft);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [filters, setFilters] = useState({
    date: '',
    machine: operatorProductionMachineOptions[0].value,
    operatorName: '',
    format: '',
    resinPerBox: '',
    search: '',
  });
  const [message, setMessage] = useState('');
  const formatOptions = useMemo(() => {
    return getUnifiedFormatOptions(bottleFormats, productionFormats).map((format) => format.label);
  }, [bottleFormats, productionFormats]);
  const filteredRecords = records.filter((record) => {
    const searchText = filters.search.trim().toLowerCase();
    const searchableRecord = [
      record.date,
      record.machine,
      record.operatorName,
      record.startTime,
      record.endTime,
      record.format,
      record.opBot,
      record.goodBottles,
      record.usedTotal,
      getOperatorWasteValue(record) || record.wasteBottlesAndPreforms,
      record.balance,
      record.opPerBox,
      record.resinPerBox,
      record.boxNumber,
      record.fromNumber,
      record.toNumber,
      record.totalBags,
    ].join(' ').toLowerCase();

    return (!filters.date || record.date === filters.date)
      && (!filters.machine || record.machine === filters.machine)
      && (!filters.operatorName || record.operatorName === filters.operatorName)
      && (!filters.format || record.format === filters.format)
      && (!filters.resinPerBox || record.resinPerBox === filters.resinPerBox)
      && (!searchText || searchableRecord.includes(searchText));
  });
  const orderedRecords = [...filteredRecords].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const machinePagerOptions = operatorProductionMachineOptions.map((machine) => machine.value);
  const currentMachineIndex = Math.max(0, machinePagerOptions.indexOf(filters.machine));
  const activeMachine = operatorProductionMachineOptions.find((machine) => machine.value === filters.machine) || operatorProductionMachineOptions[0];
  const activeMachineLabel = activeMachine.label;
  const activeMachineCount = filters.machine
    ? records.filter((record) => record.machine === filters.machine).length
    : records.length;

  const getPreviousMachineRecord = (candidate) => [...records]
    .filter((record) => record.machine === candidate.machine)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] ?? null;

  const getSuggestedOperatorBot = (candidate) => {
    const previous = getPreviousMachineRecord(candidate);

    if (!previous) {
      return candidate.opBot || '';
    }

    const hasReferenceFields = Boolean(candidate.format || candidate.saiCode || candidate.resinPerBox);
    if (!hasReferenceFields) {
      return previous.opBot || '';
    }

    const sameReference = previous.format === candidate.format
      && previous.saiCode === candidate.saiCode
      && previous.resinPerBox === candidate.resinPerBox;

    return sameReference ? previous.opBot || '' : incrementOperatorBot(previous.opBot, candidate.machine, candidate.date);
  };

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => {
      const nextDraft = { ...currentDraft, [field]: value };

      if (['machine', 'format', 'saiCode', 'resinPerBox', 'date'].includes(field)) {
        nextDraft.opBot = getSuggestedOperatorBot(nextDraft);
      }

      if (field === 'fromNumber' || field === 'toNumber') {
        nextDraft.totalBags = getOperatorTotalBags(nextDraft);
      }

      return nextDraft;
    });
    setMessage('');
  };

  const updateFilter = (field, value) => {
    setFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  };

  const moveMachineFilter = (direction) => {
    const nextIndex = (currentMachineIndex + direction + machinePagerOptions.length) % machinePagerOptions.length;
    updateFilter('machine', machinePagerOptions[nextIndex]);
  };

  const clearFilters = () => {
    setFilters({
      date: '',
      machine: operatorProductionMachineOptions[0].value,
      operatorName: '',
      format: '',
      resinPerBox: '',
      search: '',
    });
  };

  const openEntryForm = () => {
    const entryDraft = {
      ...createEmptyOperatorProductionDraft(),
      machine: filters.machine || operatorProductionMachineOptions[0].value,
    };
    setDraft({ ...entryDraft, opBot: getSuggestedOperatorBot(entryDraft) });
    setShowEntryForm(true);
    setMessage('');
  };

  const saveRecord = (event) => {
    event.preventDefault();

    if (!draft.operatorName || !draft.machine || !draft.format) {
      setMessage('Complete operario, maquina y formato antes de guardar.');
      return;
    }

    const record = normalizeOperatorProductionRecord({
      ...draft,
      wasteBottlesAndPreforms: getOperatorWasteValue(draft),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setRecords((currentRecords) => [record, ...currentRecords]);
    setDraft({ ...createEmptyOperatorProductionDraft(), machine: record.machine });
    setShowEntryForm(false);
    setMessage('Registro guardado.');
  };

  const deleteRecord = (recordId) => {
    const shouldDelete = window.confirm('Desea eliminar este registro de operador?');

    if (!shouldDelete) {
      return;
    }

    setRecords((currentRecords) => currentRecords.filter((record) => record.id !== recordId));
    setMessage('Registro eliminado.');
  };

  return (
    <section className="operator-register-section">
      <header className="operator-sheet-header">
        <div className="operator-sheet-logo">
          <img src="/logos/logo-empacar.png" alt="EMPACAR" />
        </div>
        <div className="operator-sheet-title">
          <strong>PLANILLA DE CONTROL</strong>
          <span>REGISTRO DIARIO DE PRODUCCION 2026</span>
        </div>
        <div className="operator-sheet-meta">
          <strong>REG-PRS-CB-03-Rev.0</strong>
          <span>EMISION: 14/02/2022</span>
          <span>PAGINA 1 de 1</span>
        </div>
        <div className="operator-sheet-machine">
          <button type="button" className="machine-arrow" onClick={() => moveMachineFilter(-1)} aria-label="Maquina anterior">&#x2039;</button>
          <h1>{activeMachineLabel}</h1>
          <button type="button" className="machine-arrow" onClick={() => moveMachineFilter(1)} aria-label="Maquina siguiente">&#x203A;</button>
          <small>{orderedRecords.length} registros en esta planilla</small>
        </div>
      </header>

      {showEntryForm && (
      <form className="operator-register-form" onSubmit={saveRecord}>
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
        </label>
        <label className="field">
          <span>Maquina</span>
          <select value={draft.machine} onChange={(event) => updateDraft('machine', event.target.value)}>
            {operatorProductionMachineOptions.map((machine) => <option key={machine.value} value={machine.value}>{machine.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Operario</span>
          <select value={draft.operatorName} onChange={(event) => updateDraft('operatorName', event.target.value)}>
            <option value="">Seleccione</option>
            {operatorOptions.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Hora inicio</span>
          <input type="time" value={draft.startTime} onChange={(event) => updateDraft('startTime', event.target.value)} />
        </label>
        <label className="field">
          <span>Hora final</span>
          <input type="time" value={draft.endTime} onChange={(event) => updateDraft('endTime', event.target.value)} />
        </label>
        <label className="field field-wide">
          <span>Formato</span>
          <SearchableSelect
            value={draft.format}
            onChange={(value) => updateDraft('format', value)}
            options={formatOptions}
            placeholder="Seleccione"
          />
        </label>
        <label className="field">
          <span>OP Bot</span>
          <input value={draft.opBot} onChange={(event) => updateDraft('opBot', event.target.value)} />
        </label>
        <label className="field">
          <span>Botellas aptas</span>
          <input type="number" min="0" value={draft.goodBottles} onChange={(event) => updateDraft('goodBottles', event.target.value)} />
        </label>
        <label className="field">
          <span>Total usadas</span>
          <input type="number" min="0" value={draft.usedTotal} onChange={(event) => updateDraft('usedTotal', event.target.value)} />
        </label>
        <label className="field">
          <span>Bot. y pr desperdicio</span>
          <input value={getOperatorWasteValue(draft)} readOnly placeholder="Automatico" />
        </label>
        <label className="field">
          <span>Saldo</span>
          <input value={draft.balance} onChange={(event) => updateDraft('balance', event.target.value)} />
        </label>
        <label className="field">
          <span>OP/Caja</span>
          <input value={draft.opPerBox} onChange={(event) => updateDraft('opPerBox', event.target.value)} />
        </label>
        <label className="field">
          <span>Resina/Caja</span>
          <select value={draft.resinPerBox} onChange={(event) => updateDraft('resinPerBox', event.target.value)}>
            <option value="">Seleccione</option>
            {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
          </select>
        </label>
        <label className="field">
          <span>N Caja</span>
          <input value={draft.boxNumber} onChange={(event) => updateDraft('boxNumber', event.target.value)} />
        </label>
        <label className="field">
          <span>Del #</span>
          <input value={draft.fromNumber} onChange={(event) => updateDraft('fromNumber', event.target.value)} />
        </label>
        <label className="field">
          <span>Al #</span>
          <input value={draft.toNumber} onChange={(event) => updateDraft('toNumber', event.target.value)} />
        </label>
        <label className="field">
          <span>Total bolsas</span>
          <input type="number" min="0" value={draft.totalBags} onChange={(event) => updateDraft('totalBags', event.target.value)} />
        </label>
        <div className="operator-register-actions">
          <button type="submit" className="primary-action">Guardar registro</button>
          {message && <span>{message}</span>}
        </div>
      </form>
      )}

      <div className="operator-sheet-wrap">
        <table className="operator-sheet-table">
          <thead>
            <tr className="operator-sheet-group-row">
              <th colSpan="3">SOPLADORA</th>
              <th colSpan="2">HORARIO</th>
              <th colSpan="14"></th>
            </tr>
            <tr>
              <th>TURNO</th>
              <th>Fecha</th>
              <th>Operario</th>
              <th>Hora inicio</th>
              <th>Hora final</th>
              <th>Formato</th>
              <th>Codigo botella</th>
              <th>OP Bot</th>
              <th>Botellas aptas</th>
              <th>Total usadas</th>
              <th>Bot. y pr desperdicio</th>
              <th>Saldo</th>
              <th>OP/Caja</th>
              <th>Resina/Caja</th>
              <th>N Caja</th>
              <th>Del #</th>
              <th>Al #</th>
              <th>Total bolsas</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {orderedRecords.length === 0 ? (
              <tr>
                <td colSpan="19">Todavia no hay registros guardados.</td>
              </tr>
            ) : orderedRecords.map((record, index) => (
              <tr key={record.id}>
                <td>{record.shift}</td>
                <td>{record.date}</td>
                <td>{record.operatorName}</td>
                <td>{record.startTime}</td>
                <td>{record.endTime}</td>
                <td>{record.format}</td>
                <td>{record.saiCode}</td>
                <td>{record.opBot}</td>
                <td>{record.goodBottles}</td>
                <td>{record.usedTotal}</td>
                <td>{getOperatorWasteValue(record) || record.wasteBottlesAndPreforms}</td>
                <td>{record.balance}</td>
                <td>{record.opPerBox}</td>
                <td>{record.resinPerBox}</td>
                <td>{record.boxNumber}</td>
                <td>{record.fromNumber}</td>
                <td>{record.toNumber}</td>
                <td>{getOperatorTotalBags(record) || record.totalBags}</td>
                <td>
                  <button type="button" className="danger-action" onClick={() => deleteRecord(record.id)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {showEntryForm && (
              <tr className="operator-entry-row">
                <td>
                  <select className="operator-inline-input" value={draft.shift} onChange={(event) => updateDraft('shift', event.target.value)}>
                    <option value="">Turno</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </td>
                <td><input className="operator-inline-input" type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} /></td>
                <td>
                  <select className="operator-inline-input" value={draft.operatorName} onChange={(event) => updateDraft('operatorName', event.target.value)}>
                    <option value="">Seleccione</option>
                    {operatorOptions.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                  </select>
                </td>
                <td><input className="operator-inline-input" type="time" value={draft.startTime} onChange={(event) => updateDraft('startTime', event.target.value)} /></td>
                <td><input className="operator-inline-input" type="time" value={draft.endTime} onChange={(event) => updateDraft('endTime', event.target.value)} /></td>
                <td>
                  <SearchableSelect
                    value={draft.format}
                    onChange={(value) => updateDraft('format', value)}
                    options={formatOptions}
                    placeholder="Formato"
                  />
                </td>
                <td><input className="operator-inline-input" value={draft.saiCode} onChange={(event) => updateDraft('saiCode', event.target.value)} placeholder="SAI" /></td>
                <td><input className="operator-inline-input" value={draft.opBot} readOnly={Boolean(getPreviousMachineRecord(draft))} onChange={(event) => updateDraft('opBot', event.target.value)} /></td>
                <td><input className="operator-inline-input" type="number" min="0" value={draft.goodBottles} onChange={(event) => updateDraft('goodBottles', event.target.value)} /></td>
                <td><input className="operator-inline-input" type="number" min="0" value={draft.usedTotal} onChange={(event) => updateDraft('usedTotal', event.target.value)} /></td>
                <td><input className="operator-inline-input" value={getOperatorWasteValue(draft)} readOnly /></td>
                <td><input className="operator-inline-input" value={draft.balance} onChange={(event) => updateDraft('balance', event.target.value)} /></td>
                <td><input className="operator-inline-input" value={draft.opPerBox} onChange={(event) => updateDraft('opPerBox', event.target.value)} /></td>
                <td>
                  <select className="operator-inline-input" value={draft.resinPerBox} onChange={(event) => updateDraft('resinPerBox', event.target.value)}>
                    <option value="">Seleccione</option>
                    {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
                  </select>
                </td>
                <td><input className="operator-inline-input" value={draft.boxNumber} onChange={(event) => updateDraft('boxNumber', event.target.value)} /></td>
                <td><input className="operator-inline-input" value={draft.fromNumber} onChange={(event) => updateDraft('fromNumber', event.target.value)} /></td>
                <td><input className="operator-inline-input" value={draft.toNumber} onChange={(event) => updateDraft('toNumber', event.target.value)} /></td>
                <td><input className="operator-inline-input" type="number" min="0" value={getOperatorTotalBags(draft) || draft.totalBags} readOnly /></td>
                <td>
                  <button type="button" className="primary-action operator-inline-save" onClick={() => saveRecord({ preventDefault: () => {} })}>
                    Guardar
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="operator-entry-toggle">
        <button type="button" className="primary-action" onClick={showEntryForm ? () => setShowEntryForm(false) : openEntryForm}>
          {showEntryForm ? 'Ocultar registro' : 'Realizar registro'}
        </button>
        <span>Agregue una nueva fila para la planilla seleccionada.</span>
      </div>
    </section>
  );
}

function printGeneralReport(viewTitle, records) {
  const reportWindow = window.open('', '_blank', 'width=900,height=700');

  if (!reportWindow) {
    return;
  }

  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte ${escapeHtml(viewTitle)}</title>
        <style>
          body { margin: 0; padding: 28px; font-family: Arial, sans-serif; color: #111; }
          button { min-height: 40px; border: 0; border-radius: 6px; padding: 0 14px; background: #087d7d; color: #fff; font-weight: 700; cursor: pointer; }
          main { max-width: 900px; margin: 18px auto; border: 1px solid #111; padding: 18px; }
          h1 { margin-top: 0; text-transform: uppercase; }
          p { font-size: 14px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Imprimir / Guardar PDF</button>
        <main>
          <h1>${escapeHtml(viewTitle)}</h1>
          <p>Generado: ${escapeHtml(new Date().toLocaleString('es-BO'))}</p>
          <p>Registros dimensionales guardados: ${records.length}</p>
        </main>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
}

function DatabaseView({ records, onDelete, onDeleteEntry }) {
  const [openRecordId, setOpenRecordId] = useState('');

  const toggleRecord = (recordId) => {
    setOpenRecordId((currentId) => (currentId === recordId ? '' : recordId));
  };

  return (
    <section className="database-section" id="base-datos">
      <div className="section-heading">
        <div>
          <span>Base de datos local</span>
          <h2>Registros guardados</h2>
        </div>
        <strong className="record-count">{records.length} registros</strong>
      </div>

      {records.length === 0 ? (
        <div className="empty-database">Todavia no hay registros guardados.</div>
      ) : (
        <div className="database-list">
          {records.map((record) => (
            <article className="database-record" key={record.id}>
              <div className="record-main">
                <button
                  type="button"
                  className="record-toggle"
                  onClick={() => toggleRecord(record.id)}
                  aria-expanded={openRecordId === record.id}
                >
                  <span className="toggle-icon">{openRecordId === record.id ? '−' : '+'}</span>
                  <span className="record-heading">
                    <span>{record.date}</span>
                    <strong>{record.formatName}</strong>
                    <small>Molde {record.mold} / Maquina {record.machine ?? 'Sin dato'}</small>
                  </span>
                </button>
                <div className="record-summary">
                  <span>{record.date}</span>
                  <small>{record.mold} · {record.machine ?? 'Sin dato'}</small>
                </div>
                <span className={`record-status ${record.status === 'Conforme' ? 'ok' : 'bad'}`}>
                  {record.status ?? 'Sin evaluar'}
                </span>
                <button type="button" className="danger-action" onClick={() => onDelete(record.id)}>Eliminar</button>
              </div>

              {openRecordId === record.id && (
                <div className="record-measurements">
                  {measurementFields.map((field) => (
                    <div className={`record-measurement ${record.evaluations?.[field.key]?.status ?? 'pending'}`} key={field.key}>
                      <span>{field.label}</span>
                      <strong>{record.measurements[field.key] || '-'}</strong>
                      {record.evaluations?.[field.key]?.spec && (
                        <small>
                          {getValidationLabel(record.evaluations[field.key].status)}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupedDatabaseView({ records, onDelete, onDeleteEntry, canDelete = false }) {
  const [openRecordId, setOpenRecordId] = useState('');

  const toggleRecord = (recordId) => {
    setOpenRecordId((currentId) => (currentId === recordId ? '' : recordId));
  };

  return (
    <section className="database-section" id="base-datos">
      <div className="section-heading">
        <div>
          <span>Base de datos local</span>
          <h2>Registros guardados</h2>
        </div>
        <strong className="record-count">{records.length} registros agrupados</strong>
      </div>

      {records.length === 0 ? (
        <div className="empty-database">Todavia no hay registros guardados.</div>
      ) : (
        <div className="database-list">
          {records.map((record) => {
            const entriesByMold = getEntriesByMold(record.entries);
            const moldList = Object.keys(entriesByMold).join(', ');
            const machineList = [...new Set(record.entries.map((entry) => entry.machine).filter(Boolean))].join(', ');

            return (
              <article className="database-record" key={record.id}>
                <div className="record-main grouped">
                  <button
                    type="button"
                    className="record-toggle"
                    onClick={() => toggleRecord(record.id)}
                    aria-expanded={openRecordId === record.id}
                  >
                    <span className="toggle-icon">{openRecordId === record.id ? '-' : '+'}</span>
                    <span className="record-heading">
                      <span>{record.date}</span>
                      <strong>{record.formatName}</strong>
                      <small>{record.entries.length} medicion(es) / Moldes {moldList}</small>
                    </span>
                  </button>
                  <div className="record-summary">
                    <span>Maquina(s)</span>
                    <small>{machineList || 'Sin dato'}</small>
                  </div>
                  <span className={`record-status ${record.status === 'Conforme' ? 'ok' : 'bad'}`}>
                    {record.status ?? 'Sin evaluar'}
                  </span>
                  <button type="button" className="secondary-action certificate-action" onClick={() => printQualityCertificate(record)}>
                    Certificado
                  </button>
                  {canDelete && (
                    <button type="button" className="danger-action" onClick={() => onDelete(record.id)}>Eliminar</button>
                  )}
                </div>

                {openRecordId === record.id && (
                  <div className="mold-record-list">
                    {Object.entries(entriesByMold).map(([mold, entries]) => (
                      <section className="mold-record-group" key={mold}>
                        <div className="mold-record-heading">
                          <div>
                            <span>Molde</span>
                            <strong>{mold}</strong>
                          </div>
                          <small>{entries.length} medicion(es)</small>
                        </div>

                        {entries.map((entry) => (
                          <article className="mold-entry" key={entry.id}>
                            <div className="mold-entry-heading">
                              <span>{entry.machine ?? 'Sin maquina'}</span>
                              <span>{new Date(entry.createdAt).toLocaleString('es-BO')}</span>
                              <strong className={`record-status ${entry.status === 'Conforme' ? 'ok' : 'bad'}`}>{entry.status}</strong>
                              {canDelete && (
                                <button type="button" className="danger-action" onClick={() => onDeleteEntry(record.id, entry.id)}>
                                  Eliminar medicion
                                </button>
                              )}
                            </div>
                            <div className="record-measurements">
                              {measurementFields.map((field) => (
                                <div className={`record-measurement ${entry.evaluations?.[field.key]?.status ?? 'pending'}`} key={field.key}>
                                  <span>{field.label}</span>
                                  <strong>{entry.measurements[field.key] || '-'}</strong>
                                  {entry.evaluations?.[field.key]?.spec && (
                                    <small>
                                      {getValidationLabel(entry.evaluations[field.key].status)}
                                    </small>
                                  )}
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </section>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AccessDeniedView({ title = 'Acceso restringido', text = 'No tienes permisos para abrir este apartado.' }) {
  return (
    <section className="database-section access-denied-section">
      <div className="section-heading">
        <div>
          <span>Permisos</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="empty-database">{text}</div>
    </section>
  );
}

function AuditLogView({ logs }) {
  const [search, setSearch] = useState('');
  const filteredLogs = logs.filter((log) => (
    matchesFormatSearch(`${log.action} ${log.area} ${log.target} ${log.detail} ${log.username} ${log.displayName} ${getAuditClientSummary(log)} ${getAuditClientDetails(log)}`, search)
  ));

  return (
    <section className="audit-section">
      <div className="section-heading">
        <div>
          <span>Actividad</span>
          <h2>Registro de actividades</h2>
        </div>
        <strong className="record-count">{filteredLogs.length} evento(s)</strong>
      </div>

      <label className="field audit-search">
        <span>Buscar evento</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Usuario, area, accion o detalle"
        />
      </label>

      {filteredLogs.length === 0 ? (
        <div className="empty-database">Todavia no hay actividades para mostrar.</div>
      ) : (
        <div className="audit-list">
          {filteredLogs.map((log) => (
            <article className="audit-card" key={log.id}>
              <div className="audit-card-main">
                <div>
                  <span>{log.area || 'Sistema'}</span>
                  <strong>{log.action || 'Actividad registrada'}</strong>
                  {log.detail && <p>{log.detail}</p>}
                </div>
                <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString('es-BO')}</time>
              </div>
              <div className="audit-meta">
                <small>{formatDisplayName(log.displayName || log.username)}</small>
                <small>{userRoleLabels[log.role] ?? log.role}</small>
                {log.target && <small>{log.target}</small>}
                <small>{getAuditClientSummary(log)}</small>
                {getAuditClientDetails(log) && <small>{getAuditClientDetails(log)}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function buildPetnovaAiContext({
  records,
  visualControlSessions,
  savedVisualReports,
  operatorProductionRecords = [],
  bottleFormats,
  productionFormats,
  qualityManagement,
  currentView,
  authUser,
}) {
  const today = getToday();
  const todaySessions = visualControlSessions.filter((session) => session.date === today);
  const newQualityInspectionRecords = loadNewQualityInspectionRecords()
    .sort((a, b) => new Date(b.productionDate || b.updatedAt || 0).getTime() - new Date(a.productionDate || a.updatedAt || 0).getTime());
  const newQualityTestsRecords = loadNewQualityTestsRecords()
    .sort((a, b) => new Date(b.productionDate || b.updatedAt || 0).getTime() - new Date(a.productionDate || a.updatedAt || 0).getTime());
  const newQualityDates = Array.from(new Set([
    ...newQualityInspectionRecords.map((record) => record.productionDate).filter(Boolean),
    ...newQualityTestsRecords.map((record) => record.productionDate).filter(Boolean),
  ])).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const recentSessions = [...visualControlSessions]
    .sort((a, b) => new Date(b.startedAt || b.date).getTime() - new Date(a.startedAt || a.date).getTime())
    .slice(0, 35)
    .map((session) => ({
      date: session.date,
      machine: session.machine,
      responsible: session.responsible,
      status: session.status,
      cycleNumber: session.cycleNumber,
      productionFormat: session.productionFormat,
      operatorName: session.operatorName,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      reviewCount: session.reviews?.length ?? 0,
      finding: getVisualFindingSummary(session),
      photoCount: (session.reviews ?? []).reduce((sum, review) => (
        sum
        + normalizePhotoList(review.photoPath, review.photoPaths).length
        + normalizePhotoList(review.bagPhotoPath, review.bagPhotoPaths).length
      ), 0),
    }));
  const formatLabels = getUnifiedFormatOptions(bottleFormats, productionFormats).map((format) => format.label);

  return {
    generatedAt: new Date().toISOString(),
    currentView,
    user: {
      name: authUser?.displayName ?? '',
      role: userRoleLabels[authUser?.role] ?? authUser?.role ?? '',
    },
    summary: {
      today,
      visualSessionsToday: todaySessions.length,
      visualSessionsTotal: visualControlSessions.length,
      dimensionalRecordCount: records.length,
      savedVisualReportCount: savedVisualReports.length,
      productionFormatCount: productionFormats.length,
      technicalFormatCount: bottleFormats.length,
      complaintCount: qualityManagement.complaints?.length ?? 0,
      documentCount: qualityManagement.documents?.length ?? 0,
      correctiveActionCount: qualityManagement.correctiveActions?.length ?? 0,
      operatorProductionRecordCount: operatorProductionRecords.length,
      newQualityInspectionRecordCount: newQualityInspectionRecords.length,
      newQualityTestsRecordCount: newQualityTestsRecords.length,
      newQualityRecordDates: newQualityDates.slice(0, 80),
    },
    operatorProductionRecords: operatorProductionRecords.slice(0, 40).map((record) => ({
      date: record.date,
      machine: record.machine,
      operatorName: record.operatorName,
      startTime: record.startTime,
      endTime: record.endTime,
      format: record.format,
      opBot: record.opBot,
      goodBottles: record.goodBottles,
      usedTotal: record.usedTotal,
      wasteBottlesAndPreforms: getOperatorWasteValue(record) || record.wasteBottlesAndPreforms,
      balance: record.balance,
      totalBags: record.totalBags,
    })),
    recentVisualControls: recentSessions,
    recentDimensionalRecords: records.slice(0, 25).map((record) => ({
      date: record.date,
      formatName: record.formatName,
      status: record.status,
      entries: record.entries?.length ?? 0,
      machines: [...new Set((record.entries ?? []).map((entry) => entry.machine).filter(Boolean))],
      molds: [...new Set((record.entries ?? []).map((entry) => entry.mold).filter(Boolean))],
    })),
    savedReports: savedVisualReports.slice(0, 15).map((report) => ({
      date: report.reportDate,
      responsible: report.responsible,
      sessions: report.sessionCount,
      reviews: report.reviewCount,
      generatedAt: report.generatedAt,
    })),
    newQualityInspectionRecords: newQualityInspectionRecords.slice(0, 80).map((record) => ({
      date: record.productionDate,
      machine: record.machine,
      saiCode: record.saiCode,
      opBottle: record.opBottle,
      opPreform: record.opPreform,
      format: record.format,
      volume: record.volume,
      client: record.client,
      resin: record.resin,
      shift: record.shift,
      operator: record.operator,
      qualityAuxiliary: record.qualityAuxiliary,
      packageFrom: record.packageFrom,
      packageTo: record.packageTo,
      totalProducedPackages: record.totalProducedPackages,
      totalProducedBottles: record.totalProducedBottles,
      createdBy: record.createdBy,
      updatedAt: record.updatedAt,
      evidencePhotoCount: normalizeNewQualityEvidencePhotos(record.evidencePhotos).length,
    })),
    newQualityTestsRecords: newQualityTestsRecords.slice(0, 80).map((record) => ({
      date: record.productionDate,
      saiCode: record.saiCode,
      stressCracking: record.stressCracking?.result,
      fallTest: record.fallTest?.result,
      fallTestObservation: record.fallTest?.observation,
      defectiveBottles: record.defectiveBottles,
      defectivePreforms: record.defectivePreforms,
      shiftComments: record.shiftComments,
      createdBy: record.createdBy,
      updatedAt: record.updatedAt,
      evidencePhotoCount: normalizeNewQualityEvidencePhotos(record.evidencePhotos).length,
    })),
    formats: Array.from(new Set(formatLabels.filter(Boolean))).slice(0, 120),
    complaints: (qualityManagement.complaints ?? []).slice(0, 30).map((claim) => ({
      code: claim.code,
      date: claim.date,
      customer: claim.customer,
      product: claim.product,
      severity: claim.severity,
      status: claim.status,
      owner: claim.owner,
      description: claim.description,
    })),
    correctiveActions: (qualityManagement.correctiveActions ?? []).slice(0, 30).map((action) => ({
      claimId: action.claimId,
      action: action.action,
      responsible: action.responsible,
      dueDate: action.dueDate,
      status: action.status,
    })),
  };
}

function AiRobotIcon() {
  return (
    <svg className="ai-robot-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M31 6h2v8h-2z" />
      <circle cx="32" cy="6" r="4" />
      <path d="M18 18h28c6 0 10 4 10 10v13c0 6-4 10-10 10H18c-6 0-10-4-10-10V28c0-6 4-10 10-10Z" />
      <path className="ai-robot-face-cut" d="M17 25h30c3 0 5 2 5 5v8c0 3-2 5-5 5H17c-3 0-5-2-5-5v-8c0-3 2-5 5-5Z" />
      <circle className="ai-robot-glow" cx="24" cy="34" r="5" />
      <path className="ai-robot-glow" d="M40 29c5 0 8 3 8 5s-3 5-8 5c-3 0-5-2-5-5s2-5 5-5Z" />
      <path className="ai-robot-line" d="M25 47h14l-3 8h-8l-3-8Z" />
      <path className="ai-robot-line" d="M24 39c4 3 12 3 16 0" />
      <path className="ai-robot-ear" d="M8 32H3v8h5" />
      <path className="ai-robot-ear" d="M56 32h5v8h-5" />
    </svg>
  );
}

function AiWindowIcon({ minimized }) {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      {minimized ? (
        <path d="M5 12h14" />
      ) : (
        <>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 5h10v10" />
        </>
      )}
    </svg>
  );
}

function AiCloseIcon() {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function AiSendIcon() {
  return (
    <svg className="ai-action-svg ai-send-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 20 5l-7 16-2-7-7-2Z" />
      <path d="M20 5 11 14" />
    </svg>
  );
}

function AiAttachIcon() {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 12.5 14.8 5.7a4 4 0 0 1 5.7 5.7l-8.2 8.2a6 6 0 0 1-8.5-8.5l8.6-8.6" />
    </svg>
  );
}

function AiPdfIcon() {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 16h6M9 12h4" />
    </svg>
  );
}

function AiExcelIcon() {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16M4 15h16M9 5v14M15 5v14" />
    </svg>
  );
}

function AiTrashIcon() {
  return (
    <svg className="ai-action-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M10 11v6M14 11v6M8 7l1 13h6l1-13M10 7V4h4v3" />
    </svg>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getAiExportRows(dataContext) {
  const visualRows = (dataContext.recentVisualControls ?? []).map((session) => ({
    area: 'Controles visuales',
    fecha: session.date ?? '',
    referencia: session.machine ?? '',
    detalle: `Ronda ${session.cycleNumber ?? ''} / ${session.status ?? ''}`,
    resultado: session.finding ?? '',
  }));
  const dimensionalRows = (dataContext.recentDimensionalRecords ?? []).map((record) => ({
    area: 'Especificaciones tecnicas',
    fecha: record.date ?? '',
    referencia: record.formatName ?? '',
    detalle: `${record.entries ?? 0} medicion(es)`,
    resultado: record.status ?? '',
  }));
  const complaintRows = (dataContext.complaints ?? []).map((claim) => ({
    area: 'Reclamos',
    fecha: claim.date ?? '',
    referencia: claim.code || claim.customer || '',
    detalle: claim.product ?? '',
    resultado: `${claim.severity ?? ''} / ${claim.status ?? ''}`,
  }));
  const newQualityInspectionRows = (dataContext.newQualityInspectionRecords ?? []).map((record) => ({
    area: 'Nuevo registro - Calidad',
    fecha: record.date ?? '',
    referencia: record.saiCode || record.format || '',
    detalle: `${record.machine ?? ''} / ${record.client ?? ''} / ${record.operator ?? ''}`,
    resultado: `Emp. ${record.totalProducedPackages || '-'} / Bot. ${record.totalProducedBottles || '-'}`,
  }));
  const newQualityTestsRows = (dataContext.newQualityTestsRecords ?? []).map((record) => ({
    area: 'Pruebas - Calidad',
    fecha: record.date ?? '',
    referencia: record.saiCode ?? '',
    detalle: `Stress ${record.stressCracking || '-'} / Caida ${record.fallTest || '-'}`,
    resultado: record.shiftComments || record.fallTestObservation || '',
  }));

  return [...visualRows, ...dimensionalRows, ...newQualityInspectionRows, ...newQualityTestsRows, ...complaintRows];
}

async function exportAiContextToExcel(dataContext) {
  const rows = getAiExportRows(dataContext);
  const texto = (fn) => (row) => ({ value: fn(row) ?? '', type: String });
  const columns = [
    { header: 'Area', cell: texto((row) => row.area) },
    { header: 'Fecha', cell: texto((row) => row.fecha) },
    { header: 'Referencia', cell: texto((row) => row.referencia) },
    { header: 'Detalle', cell: texto((row) => row.detalle) },
    { header: 'Resultado', cell: texto((row) => row.resultado) },
  ];

  await writeXlsxFile(rows, { columns, sheet: 'PETnova' }).toFile(`petnova-resumen-${getToday()}.xlsx`);
}

function exportAiContextToPdf(dataContext) {
  const rows = getAiExportRows(dataContext);
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  document.setFontSize(16);
  document.text('Resumen PETnova', 40, 42);
  document.setFontSize(10);
  document.text(`Generado: ${new Date().toLocaleString('es-BO')}`, 40, 60);

  autoTable(document, {
    startY: 78,
    head: [['Area', 'Fecha', 'Referencia', 'Detalle', 'Resultado']],
    body: rows.map((row) => [row.area, row.fecha, row.referencia, row.detalle, row.resultado]),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [8, 125, 125] },
  });

  document.save(`petnova-resumen-${getToday()}.pdf`);
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

async function readPdfFile(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 20); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageTexts.push(textContent.items.map((item) => item.str).join(' '));
  }

  return pageTexts.join('\n\n');
}

async function readExcelFile(file) {
  const rows = await readXlsxFile(file);

  return rows
    .slice(0, 150)
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))).join(' | '))
    .join('\n');
}

async function readAiAttachment(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type;

  if (extension === 'xlsx') {
    return readExcelFile(file);
  }

  if (extension === 'pdf' || type === 'application/pdf') {
    return readPdfFile(file);
  }

  if (['txt', 'csv', 'json', 'md'].includes(extension) || type.startsWith('text/')) {
    return readTextFile(file);
  }

  throw new Error('Formato no compatible. Use PDF, XLSX, TXT, CSV o JSON.');
}

const aiChartColors = ['#0b7f7c', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#16a34a', '#0891b2', '#be123c'];
const aiChartSeriesLabels = {
  good: 'Produccion',
  aptas: 'Produccion',
  production: 'Produccion',
  waste: 'Merma',
  merma: 'Merma',
  defect: 'Defecto',
  defects: 'Defectos',
};

function formatAiChartNumber(value) {
  return new Intl.NumberFormat('es-BO', {
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeAiChartPayload(payload) {
  const chart = payload?.chart ?? payload;
  const rawData = Array.isArray(chart?.data) ? chart.data : [];
  const data = rawData
    .slice(0, 12)
    .map((point, index) => {
      const label = String(point.label ?? point.name ?? point.x ?? `Dato ${index + 1}`).trim();
      const value = Number(point.value ?? point.y ?? point.total ?? point.amount);
      const rawSeries = String(point.series ?? point.category ?? point.group ?? point.type ?? '').trim();
      const series = aiChartSeriesLabels[rawSeries.toLowerCase()] ?? rawSeries;

      return {
        label: (series ? `${label} - ${series}` : label).slice(0, 54),
        series,
        value,
      };
    })
    .filter((point) => point.label && Number.isFinite(point.value));

  if (data.length === 0) {
    return null;
  }

  const type = ['bar', 'line', 'pie'].includes(chart?.type) ? chart.type : 'bar';

  return {
    type,
    title: String(chart?.title ?? 'Grafica PETnova').slice(0, 90),
    xLabel: String(chart?.xLabel ?? '').slice(0, 45),
    yLabel: String(chart?.yLabel ?? '').slice(0, 45),
    data,
  };
}

function parseAiChartBlock(chartText) {
  try {
    return normalizeAiChartPayload(JSON.parse(chartText));
  } catch {
    return null;
  }
}

function getAiMessageParts(content) {
  const text = String(content ?? '');
  const chartBlockRegex = /```(?:chart|grafica|graph|json)\s*([\s\S]*?)```/gi;
  const parts = [];
  let lastIndex = 0;
  let match = chartBlockRegex.exec(text);

  while (match) {
    const before = text.slice(lastIndex, match.index).trim();
    const chart = parseAiChartBlock(match[1]);

    if (before) {
      parts.push({ type: 'text', text: before });
    }

    if (chart) {
      parts.push({ type: 'chart', chart });
    } else {
      parts.push({ type: 'text', text: match[0].trim() });
    }

    lastIndex = match.index + match[0].length;
    match = chartBlockRegex.exec(text);
  }

  const after = text.slice(lastIndex).trim();

  if (after) {
    parts.push({ type: 'text', text: after });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text }];
}

function AiBarChart({ chart }) {
  const maxValue = Math.max(...chart.data.map((point) => Math.abs(point.value)), 1);

  return (
    <div className="ai-chart-bars">
      {chart.data.map((point, index) => (
        <div className="ai-chart-row" key={`${point.label}-${index}`}>
          <span className="ai-chart-label">{point.label}</span>
          <span className="ai-chart-track">
            <span
              className="ai-chart-fill"
              style={{
                width: `${Math.max((Math.abs(point.value) / maxValue) * 100, 3)}%`,
                backgroundColor: aiChartColors[index % aiChartColors.length],
              }}
            />
          </span>
          <strong>{formatAiChartNumber(point.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function AiLineChart({ chart }) {
  const width = 320;
  const height = 150;
  const paddingX = 20;
  const paddingY = 18;
  const values = chart.data.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const points = chart.data.map((point, index) => {
    const x = paddingX + ((width - paddingX * 2) * index) / Math.max(chart.data.length - 1, 1);
    const y = height - paddingY - ((point.value - minValue) / range) * (height - paddingY * 2);

    return { ...point, x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="ai-chart-line-wrap">
      <svg className="ai-chart-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} />
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} />
        <polyline points={polyline} />
        {points.map((point, index) => (
          <circle key={`${point.label}-${index}`} cx={point.x} cy={point.y} r="4" />
        ))}
      </svg>
      <div className="ai-chart-legend compact">
        {chart.data.map((point, index) => (
          <span key={`${point.label}-${index}`}>
            <i style={{ backgroundColor: aiChartColors[index % aiChartColors.length] }} />
            {point.label}: {formatAiChartNumber(point.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AiPieChart({ chart }) {
  const positiveData = chart.data
    .map((point) => ({ ...point, value: Math.max(point.value, 0) }))
    .filter((point) => point.value > 0);
  const total = positiveData.reduce((sum, point) => sum + point.value, 0);

  if (total <= 0) {
    return <AiBarChart chart={{ ...chart, type: 'bar' }} />;
  }

  let currentDegrees = 0;
  const gradient = positiveData
    .map((point, index) => {
      const start = currentDegrees;
      const end = currentDegrees + (point.value / total) * 360;
      currentDegrees = end;

      return `${aiChartColors[index % aiChartColors.length]} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div className="ai-chart-pie-wrap">
      <span className="ai-chart-pie" style={{ background: `conic-gradient(${gradient})` }} />
      <div className="ai-chart-legend">
        {positiveData.map((point, index) => (
          <span key={`${point.label}-${index}`}>
            <i style={{ backgroundColor: aiChartColors[index % aiChartColors.length] }} />
            {point.label}: {formatAiChartNumber(point.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function AiChart({ chart }) {
  return (
    <div className={`ai-chart-card ${chart.type}`}>
      <div className="ai-chart-title">
        <strong>{chart.title}</strong>
        {(chart.xLabel || chart.yLabel) && <small>{[chart.xLabel, chart.yLabel].filter(Boolean).join(' / ')}</small>}
      </div>
      {chart.type === 'line' && <AiLineChart chart={chart} />}
      {chart.type === 'pie' && <AiPieChart chart={chart} />}
      {chart.type === 'bar' && <AiBarChart chart={chart} />}
    </div>
  );
}

function PetnovaAiAssistant({ dataContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hola, soy la IA de PETnova. Puedo ayudarte a revisar rondas, defectos, formatos, reclamos y reportes cargados en la pagina.',
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isOpen]);

  const chatDataContext = useMemo(() => ({
    ...dataContext,
    attachedFiles: attachedFiles.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      content: file.content.slice(0, 12000),
    })),
  }), [dataContext, attachedFiles]);

  const attachFiles = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    setError('');

    try {
      const parsedFiles = await Promise.all(files.slice(0, 4).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || file.name.split('.').pop()?.toUpperCase() || 'Archivo',
        size: file.size,
        content: await readAiAttachment(file),
      })));

      setAttachedFiles((currentFiles) => [...currentFiles, ...parsedFiles].slice(-6));
      setMessages((currentMessages) => [...currentMessages, {
        role: 'assistant',
        content: `Archivo(s) cargado(s): ${parsedFiles.map((file) => file.name).join(', ')}. Ya puedo usarlos como contexto.`,
      }]);
    } catch (fileError) {
      setError(fileError.message);
    }
  };

  const removeAttachedFile = (fileId) => {
    setAttachedFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId));
  };

  const exportToPdf = () => {
    try {
      exportAiContextToPdf(chatDataContext);
    } catch (exportError) {
      setError(`No se pudo generar el PDF: ${exportError.message}`);
    }
  };

  const exportToExcel = async () => {
    try {
      await exportAiContextToExcel(chatDataContext);
    } catch (exportError) {
      setError(`No se pudo generar el Excel: ${exportError.message}`);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const question = input.trim();

    if (!question || isThinking) {
      return;
    }

    const nextMessages = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setIsThinking(true);

    try {
      const response = await fetch('/api/petnova-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.slice(-10),
          dataContext: chatDataContext,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'No se pudo responder en este momento.');
      }

      setMessages((currentMessages) => [...currentMessages, {
        role: 'assistant',
        content: data.answer ?? 'No pude generar una respuesta.',
      }]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsThinking(false);
    }
  };

  const handleChatInputKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    sendMessage(event);
  };

  if (!isOpen) {
    return (
      <button type="button" className="ai-bubble-button" onClick={() => setIsOpen(true)} aria-label="Abrir IA PETnova">
        <AiRobotIcon />
      </button>
    );
  }

  return (
    <section className={`ai-chat-panel ${isMaximized ? 'maximized' : ''}`} aria-label="IA PETnova">
      <header className="ai-chat-header">
        <div>
          <span>Asistente IA</span>
          <strong>PETnova</strong>
        </div>
        <div className="ai-chat-tools">
          <button
            type="button"
            className="ai-icon-button"
            aria-label="Exportar resumen en PDF"
            title="Exportar PDF"
            onClick={exportToPdf}
          >
            <AiPdfIcon />
          </button>
          <button
            type="button"
            className="ai-icon-button"
            aria-label="Exportar resumen en Excel"
            title="Exportar Excel"
            onClick={exportToExcel}
          >
            <AiExcelIcon />
          </button>
          <button
            type="button"
            className="ai-icon-button"
            aria-label={isMaximized ? 'Minimizar chat' : 'Maximizar chat'}
            title={isMaximized ? 'Minimizar' : 'Maximizar'}
            onClick={() => setIsMaximized((value) => !value)}
          >
            <AiWindowIcon minimized={isMaximized} />
          </button>
          <button
            type="button"
            className="ai-icon-button"
            aria-label="Cerrar chat"
            title="Cerrar"
            onClick={() => setIsOpen(false)}
          >
            <AiCloseIcon />
          </button>
        </div>
      </header>

      {attachedFiles.length > 0 && (
        <div className="ai-attachment-list">
          {attachedFiles.map((file) => (
            <span key={file.id}>
              {file.name}
              <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => removeAttachedFile(file.id)}>
                <AiTrashIcon />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="ai-chat-messages">
        {messages.map((message, index) => (
          <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
            {getAiMessageParts(message.content).map((part, partIndex) => (
              part.type === 'chart' ? (
                <AiChart chart={part.chart} key={`chart-${partIndex}`} />
              ) : (
                <p key={`text-${partIndex}`}>{part.text}</p>
              )
            ))}
          </article>
        ))}
        {isThinking && (
          <article className="ai-message assistant">
            <p>Revisando informacion...</p>
          </article>
        )}
        <span ref={messagesEndRef} />
      </div>

      {error && <strong className="ai-chat-error">{error}</strong>}

      <form className="ai-chat-form" onSubmit={sendMessage}>
        <label className="ai-attach-button" title="Adjuntar archivo">
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.txt,.csv,.json,.md,application/pdf,text/*"
            onChange={attachFiles}
          />
          <AiAttachIcon />
        </label>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleChatInputKeyDown}
          placeholder="Pregunta sobre controles, defectos, formatos o reportes..."
          rows={2}
        />
        <button
          type="submit"
          className="ai-send-button"
          aria-label="Enviar mensaje"
          title="Enviar"
          disabled={isThinking || !input.trim()}
        >
          <AiSendIcon />
        </button>
      </form>
    </section>
  );
}

function NavButton({ active, children, onClick }) {
  return (
    <button type="button" className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function NavGroup({ title, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`nav-group ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        className="nav-group-summary"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{title}</span>
      </button>
      <div className="nav-group-panel">
        <div className="nav-group-content">
          {children}
        </div>
      </div>
    </div>
  );
}

function getDashboardAverage(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function DashboardMetricCard({ metricKey, metric, active, onSelect }) {
  const currentValue = metric.values.at(-1);
  const previousValue = metric.values.at(-2);
  const delta = currentValue - previousValue;

  return (
    <button
      type="button"
      className={`metric-card dashboard-metric-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(metricKey)}
      style={{ '--metric-color': metric.color }}
    >
      <span>{metric.label}</span>
      <strong>{currentValue}{metric.unit}</strong>
      <small>{delta >= 0 ? '+' : ''}{delta} vs. ayer / Prom. {getDashboardAverage(metric.values)}{metric.unit}</small>
    </button>
  );
}

function DashboardBarChart({ metric, selectedIndex, onSelect, days }) {
  const labels = days ?? dashboardDays;
  const maxValue = Math.max(...metric.values, 100);

  return (
    <div className="dashboard-bars" role="list" aria-label={`Grafica de ${metric.label}`}>
      {metric.values.map((value, index) => (
        <button
          type="button"
          className={`dashboard-bar ${selectedIndex === index ? 'active' : ''}`}
          key={`${metric.label}-${labels[index]}`}
          onClick={() => onSelect(index)}
          style={{
            '--bar-height': `${Math.max(10, (value / maxValue) * 100)}%`,
            '--bar-color': metric.color,
          }}
        >
          <span>{value}{metric.unit}</span>
          <i aria-hidden="true" />
          <small>{labels[index]}</small>
        </button>
      ))}
    </div>
  );
}

function DashboardAreaCard({ item }) {
  return (
    <article className={`dashboard-area-card tone-${item.tone}`}>
      <div>
        <span>{item.area}</span>
        <strong>{item.value}%</strong>
      </div>
      <p>{item.detail}</p>
      <div className="dashboard-progress" aria-label={`${item.area} ${item.value}%`}>
        <span style={{ width: `${item.value}%` }} />
      </div>
    </article>
  );
}

function DashboardHorizontalChart({ items, valueLabel = '%' }) {
  return (
    <div className="dashboard-horizontal-chart">
      {items.map((item) => (
        <button type="button" className="dashboard-horizontal-row" key={item.label ?? item.item}>
          <span>{item.label ?? item.item}</span>
          <div>
            <i style={{ width: `${item.value}%` }} />
          </div>
          <strong>{item.value}{valueLabel}</strong>
          {item.detail && <small>{item.detail}</small>}
        </button>
      ))}
    </div>
  );
}

function DashboardDefectMixChart() {
  const total = dashboardDefectMix.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const slices = dashboardDefectMix.map((item) => {
    const start = cursor;
    const end = cursor + (item.value / total) * 100;
    cursor = end;
    return `${item.color} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="dashboard-defect-mix">
      <div className="dashboard-donut" style={{ background: `conic-gradient(${slices})` }}>
        <strong>{total}</strong>
        <span>controles</span>
      </div>
      <div className="dashboard-donut-legend">
        {dashboardDefectMix.map((item) => (
          <button type="button" key={item.label}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <strong>{item.value}%</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardShiftComplianceChart() {
  return (
    <div className="dashboard-shift-chart">
      {dashboardShiftCompliance.map((shift) => (
        <article key={shift.label}>
          <strong>{shift.label}</strong>
          <div>
            <span>Produccion</span>
            <i style={{ width: `${shift.production}%`, background: '#087d7d' }} />
            <b>{shift.production}%</b>
          </div>
          <div>
            <span>Calidad</span>
            <i style={{ width: `${shift.quality}%`, background: '#2457a6' }} />
            <b>{shift.quality}%</b>
          </div>
          <div>
            <span>Despacho</span>
            <i style={{ width: `${shift.dispatch}%`, background: '#3b8d5a' }} />
            <b>{shift.dispatch}%</b>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatDashboardNumber(value, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

function formatDashboardDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function DashboardPreformasTimeline({ items, totalBoxes }) {
  const maxValue = Math.max(totalBoxes, ...items.map((item) => item.accumulatedBoxes), 1);
  const points = items.map((item, index) => ({
    x: items.length <= 1 ? 0 : (index / (items.length - 1)) * 100,
    y: 100 - (item.accumulatedBoxes / maxValue) * 100,
    ...item,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const lastPoint = points.at(-1);

  return (
    <div className="preformas-timeline">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Consumo acumulado de cajas observadas">
        <path d="M0,100 L100,100" className="preformas-axis" />
        {path && <path d={path} className="preformas-line" />}
        {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="2.6" className="preformas-line-point" />}
      </svg>
      <div className="preformas-timeline-labels">
        <span>{formatDashboardDate(items[0]?.date)}</span>
        <strong>{formatDashboardNumber(lastPoint?.accumulatedBoxes ?? 0)} cajas acumuladas</strong>
        <span>{formatDashboardDate(lastPoint?.date)}</span>
      </div>
    </div>
  );
}

function DashboardPreformasBarList({ items, valueKey, labelKey = 'opCaja', suffix = '', selectedKey, onSelect }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);

  return (
    <div className="preformas-bar-list">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const itemKey = item[labelKey];
        return (
          <button
            type="button"
            className={`preformas-bar-row ${selectedKey === itemKey ? 'active' : ''}`}
            key={itemKey}
            onClick={() => onSelect?.(itemKey)}
          >
            <span>{itemKey}</span>
            <div>
              <i style={{ width: `${Math.max(4, (value / maxValue) * 100)}%` }} />
            </div>
            <strong>{formatDashboardNumber(value, suffix === '%' ? 2 : 0)}{suffix}</strong>
          </button>
        );
      })}
    </div>
  );
}

function DashboardPreformasSection() {
  const [selectedWasteOp, setSelectedWasteOp] = useState(preformasDashboardData.wasteByOpCaja[0]?.opCaja ?? '');
  const [selectedBoxesOp, setSelectedBoxesOp] = useState(preformasDashboardData.boxesByNCaja[0]?.opCaja ?? '');
  const selectedWaste = preformasDashboardData.wasteByOpCaja.find((item) => item.opCaja === selectedWasteOp) ?? preformasDashboardData.wasteByOpCaja[0];
  const selectedBoxes = preformasDashboardData.boxesByNCaja.find((item) => item.opCaja === selectedBoxesOp) ?? preformasDashboardData.boxesByNCaja[0];
  const inventory = preformasDashboardData.inventorySummary;
  const totals = preformasDashboardData.totals;

  return (
    <section className="preformas-dashboard-section" aria-label="Graficas de preformas sin movimiento">
      <div className="section-heading">
        <div>
          <span>Preformas sin movimiento</span>
          <h2>Consumo y merma desde Excel</h2>
        </div>
        <strong className="record-count">
          {formatDashboardDate(preformasDashboardData.period.from)} - {formatDashboardDate(preformasDashboardData.period.to)}
        </strong>
      </div>

      <div className="preformas-summary-grid">
        <article>
          <span>Cajas observadas iniciales</span>
          <strong>{formatDashboardNumber(inventory.initialBoxes)}</strong>
          <small>Desde inventario de preformas observadas</small>
        </article>
        <article>
          <span>Cajas consumidas</span>
          <strong>{formatDashboardNumber(inventory.consumedBoxes)}</strong>
          <small>{formatDashboardNumber(inventory.progress, 1)}% de avance</small>
        </article>
        <article>
          <span>Saldo observado</span>
          <strong>{formatDashboardNumber(inventory.remainingBoxes)}</strong>
          <small>Cajas pendientes por consumir</small>
        </article>
        <article>
          <span>Merma total</span>
          <strong>{formatDashboardNumber(totals.desperdicio)}</strong>
          <small>{formatDashboardNumber(totals.mermaPct, 2)}% sobre {formatDashboardNumber(totals.usadas)} usadas</small>
        </article>
      </div>

      <section className="dashboard-layout preformas-layout">
        <article className="panel preformas-panel">
          <div className="section-heading">
            <div>
              <span>Resumen</span>
              <h2>Consumo de preformas observadas</h2>
            </div>
          </div>
          <DashboardPreformasTimeline items={preformasDashboardData.dailyConsumption} totalBoxes={inventory.initialBoxes} />
          <div className="preformas-inventory-grid">
            {preformasDashboardData.observedInventory.map((item) => (
              <article key={item.opCaja}>
                <div>
                  <strong>{item.opCaja}</strong>
                  <span>{formatDashboardNumber(item.progress, 1)}%</span>
                </div>
                <p>{item.risk || 'Sin riesgo registrado'}</p>
                <div className="dashboard-progress">
                  <span style={{ width: `${Math.min(item.progress, 100)}%` }} />
                </div>
                <small>
                  {formatDashboardNumber(item.consumedBoxes)} consumidas / {formatDashboardNumber(item.remainingBoxes)} pendientes
                </small>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel preformas-panel">
          <div className="section-heading">
            <div>
              <span>Merma</span>
              <h2>Por OP/CAJA</h2>
            </div>
          </div>
          <DashboardPreformasBarList
            items={preformasDashboardData.wasteByOpCaja}
            valueKey="mermaPct"
            suffix="%"
            selectedKey={selectedWaste?.opCaja}
            onSelect={setSelectedWasteOp}
          />
          {selectedWaste && (
            <div className="preformas-detail-card">
              <strong>{selectedWaste.opCaja}</strong>
              <span>{formatDashboardNumber(selectedWaste.desperdicio)} unidades de merma</span>
              <small>{formatDashboardNumber(selectedWaste.boxes)} cajas | {formatDashboardNumber(selectedWaste.records)} registros</small>
            </div>
          )}
        </aside>
      </section>

      <section className="dashboard-layout preformas-layout lower">
        <article className="panel preformas-panel">
          <div className="section-heading">
            <div>
              <span>N CAJA</span>
              <h2>Cajas consumidas por OP/CAJA</h2>
            </div>
          </div>
          <DashboardPreformasBarList
            items={preformasDashboardData.boxesByNCaja}
            valueKey="boxes"
            selectedKey={selectedBoxes?.opCaja}
            onSelect={setSelectedBoxesOp}
          />
          {selectedBoxes && (
            <div className="preformas-detail-card">
              <strong>{selectedBoxes.opCaja}</strong>
              <span>{formatDashboardNumber(selectedBoxes.boxes)} cajas unicas consumidas</span>
              <small>Calculado desde la columna N CAJA</small>
            </div>
          )}
        </article>

        <aside className="panel preformas-panel">
          <div className="section-heading">
            <div>
              <span>Formatos</span>
              <h2>Mayor merma por formato</h2>
            </div>
          </div>
          <DashboardPreformasBarList
            items={preformasDashboardData.formatWaste.map((item) => ({
              ...item,
              label: item.format,
              value: item.desperdicio,
            }))}
            labelKey="label"
            valueKey="value"
          />
        </aside>
      </section>
    </section>
  );
}

function DashboardView() {
  const [selectedMetric, setSelectedMetric] = useState('production');
  const [selectedDayIndex, setSelectedDayIndex] = useState(dashboardDays.length - 1);

  // "Produccion por dia" real: cuanto se reporto de verdad (Reportes
  // diarios) contra cuanto tenia planificado Planificacion, ultimos 7 dias
  // terminando hoy -- se carga una vez al entrar al dashboard.
  const [produccionReal, setProduccionReal] = useState(null);
  const [produccionPorMaquina, setProduccionPorMaquina] = useState(null);
  useEffect(() => {
    const dias = dashboardUltimosDias(7);
    Promise.all([localApi.getPlanes(), localApi.getReportesDiarios()])
      .then(([planes, reportes]) => {
        setProduccionReal(dashboardCalcularProduccionReal(planes, reportes, dias));
        setProduccionPorMaquina(dashboardCalcularProduccionPorMaquina(planes, reportes, dias));
      })
      .catch(() => {
        setProduccionReal(dias.map((d) => ({ ...d, real: 0, planificado: 0, pct: 0 })));
        setProduccionPorMaquina([]);
      });
  }, []);

  const diasLabels = produccionReal ? produccionReal.map((d) => d.label) : dashboardDays;
  const kpis = produccionReal
    ? { ...dashboardKpis, production: { ...dashboardKpis.production, values: produccionReal.map((d) => d.pct) } }
    : dashboardKpis;
  const activeMetric = kpis[selectedMetric];
  const selectedDayLabel = diasLabels[selectedDayIndex];
  const selectedDayValue = activeMetric.values[selectedDayIndex];
  const selectedDayInfo = selectedMetric === 'production' ? produccionReal?.[selectedDayIndex] : null;

  return (
    <>
      <section className="dashboard-header-panel">
        <div>
          <span className="hero-kicker">Graficas por area</span>
          <h2>Panorama operativo de la planta</h2>
          <p>Indicadores visuales para produccion, calidad, almacen y mantenimiento con datos de referencia.</p>
        </div>
        <div className="dashboard-header-stats">
          <strong>9</strong>
          <span>maquinas monitoreadas</span>
          <strong>5</strong>
          <span>rondas objetivo</span>
          <strong>98%</strong>
          <span>calidad estimada</span>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Indicadores principales">
        {Object.entries(kpis).map(([metricKey, metric]) => (
          <DashboardMetricCard
            key={metricKey}
            metricKey={metricKey}
            metric={metric}
            active={selectedMetric === metricKey}
            onSelect={(nextMetric) => {
              setSelectedMetric(nextMetric);
              setSelectedDayIndex(dashboardDays.length - 1);
            }}
          />
        ))}
      </section>

      <section className="dashboard-layout">
        <article className="panel dashboard-chart-panel">
          <div className="section-heading">
            <div>
              <span>Indicador seleccionado</span>
              <h2>{activeMetric.label} por dia</h2>
            </div>
            <strong className="record-count">
              {selectedDayLabel}: {selectedDayValue}{activeMetric.unit}
              {selectedDayInfo && ` (${selectedDayInfo.real.toLocaleString()} / ${selectedDayInfo.planificado.toLocaleString()} u)`}
            </strong>
          </div>
          <DashboardBarChart metric={activeMetric} selectedIndex={selectedDayIndex} onSelect={setSelectedDayIndex} days={diasLabels} />
        </article>

        <aside className="panel dashboard-summary-panel">
          <div className="section-heading">
            <div>
              <span>Resumen mensual</span>
              <h2>Tendencia operativa</h2>
            </div>
          </div>
          <div className="dashboard-trend">
            {dashboardMonthlyTrend.map((item) => (
              <div key={item.month}>
                <span>{item.month}</span>
                <strong>{item.value}%</strong>
                <i style={{ height: `${item.value}%` }} />
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-layout lower">
        <article className="panel">
          <div className="section-heading">
            <div>
              <span>Estado por area</span>
              <h2>Comparativo de areas</h2>
            </div>
          </div>
          <div className="dashboard-area-grid">
            {dashboardAreaStatus.map((item) => (
              <DashboardAreaCard item={item} key={item.area} />
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <span>Prioridades</span>
              <h2>Alertas operativas</h2>
            </div>
          </div>
          <div className="dashboard-priority-list">
            {dashboardPriorities.map((item) => (
              <article key={item.title}>
                <span>{item.status}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-layout">
        <article className="panel">
          <div className="section-heading">
            <div>
              <span>Produccion por maquina</span>
              <h2>Rendimiento real (ultimos 7 dias)</h2>
            </div>
          </div>
          {produccionPorMaquina && produccionPorMaquina.length === 0 ? (
            <p className="etiquetas-empty">Sin reportes de produccion en los ultimos 7 dias.</p>
          ) : (
            <DashboardHorizontalChart items={produccionPorMaquina ?? dashboardMachineOutput} />
          )}
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <span>Calidad visual</span>
              <h2>Mezcla de defectos</h2>
            </div>
          </div>
          <DashboardDefectMixChart />
        </aside>
      </section>

      <section className="dashboard-layout">
        <article className="panel">
          <div className="section-heading">
            <div>
              <span>Turnos</span>
              <h2>Cumplimiento por turno</h2>
            </div>
          </div>
          <DashboardShiftComplianceChart />
        </article>

        <aside className="panel">
          <div className="section-heading">
            <div>
              <span>Almacen</span>
              <h2>Cobertura estimada</h2>
            </div>
          </div>
          <DashboardHorizontalChart
            items={dashboardWarehouseCoverage.map((item) => ({
              label: item.item,
              value: item.value,
              detail: `${item.days} dias`,
            }))}
          />
        </aside>
      </section>

      <DashboardPreformasSection />
    </>
  );
}

function AreaWorkspaceView({ area, items }) {
  return (
    <section className="control-grid">
      {items.map((item) => (
        <article className="control-card" key={item.title}>
          <span>{area}</span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </article>
      ))}
    </section>
  );
}

const newQualityInspectionPlanRows = [
  ['1', 'Inspeccion de variables y atributos', 'ITR-LAS-01', '4 vez en el turno'],
  ['2', 'Volumen de llenado', 'ITR-LAS-02', '1 vez en el turno'],
  ['3', 'Medicion de altura en Botellas', 'ITR-LAS-03', '2 veces en el turno'],
  ['4', 'Medicion de diametros, largo y ancho en Botellas', 'ITR-LAS-04', '2 veces en el turno'],
  ['5', 'Medicion de espesores', 'ITR-LAS-05', '2 veces en el turno'],
  ['6', 'Prueba de alcanfor', 'ITR-LAS-08', 'Cuando haya presencia de grasa'],
  ['7', 'Peso de la botella', 'ITR-LAS-09', '2 veces en el turno'],
  ['8', 'Verificacion de los diametros en la rosca', 'ITR-LAS-10', '2 veces en el turno'],
];
const newQualityVariableRows = [
  { key: 'cavities', label: 'Cavidades' },
  { key: 'emptyBottleWeight', label: 'Peso botella vacia (gr)', specKey: 'pesoVacia' },
  { key: 'bottleHeight', label: 'Altura de Botella (mm)', group: 'DIMENSIONES', specKey: 'alturaTotal' },
  { key: 'labelPanelHeight', label: 'Altura panel etiqueta (mm)', group: 'DIMENSIONES' },
  { key: 'upperDiameter', label: 'Diametro Superior (mm)', group: 'DIMENSIONES', specKey: 'diametroSuperior' },
  { key: 'lowerDiameter', label: 'Diametro Inferior (mm)', group: 'DIMENSIONES', specKey: 'diametroInferior' },
  { key: 'e1', label: 'E-1 (1 cm alrededor del punto)', group: 'ESPESORES', specKey: 'e1' },
  { key: 'e2', label: 'E-2 (Petaloide/Base)', group: 'ESPESORES', specKey: 'e2' },
  { key: 'e3', label: 'E-3 (Diametro inferior)', group: 'ESPESORES', specKey: 'e3' },
  { key: 'e4', label: 'E-4 (Diametro medio)', group: 'ESPESORES', specKey: 'e4' },
  { key: 'e5', label: 'E-5 (Diametro superior)', group: 'ESPESORES', specKey: 'e5' },
  { key: 'e6', label: 'E-6 (Curvatura hombro)', group: 'ESPESORES', specKey: 'e6' },
  { key: 'fillVolume', label: 'Volumen de llenado (ml)' },
  { key: 'supportRingVolume', label: 'Volumen anillo de soporte (ml)' },
  { key: 'overflowVolume', label: 'Volumen de rebalse (ml)' },
  { key: 'cappingMachine', label: 'Cabecera (mm)', specKey: 'alturaLlenado' },
  { key: 'concavity', label: 'Concavidad (mm)', specKey: 'concavidad' },
];
const newQualityThreadRows = [
  { key: 'pullerDiameter', label: 'Diametro de Pollera (A)' },
  { key: 'externalThreadDiameter', label: 'Diametro externo de la rosca (T)' },
  { key: 'threadChannelDiameter', label: 'Diam. canales de la rosca (E3-E3)' },
  { key: 'externalMouthDiameter', label: 'Diametro externo de boca (E1-E2)' },
  { key: 'totalThreadHeight', label: 'Altura total de la rosca (D)' },
];
const newQualityTemperatureRows = [
  { key: 'controlTime', label: 'Hora de control:' },
  { key: 'threadTemperature', label: 'Temperatura de la rosca (C)' },
  { key: 'lowerBodyDiameterTemperature', label: 'Temp. diametro inf. del cuerpo (C)' },
  { key: 'injectionPointTemperature', label: 'Temp. en el punto de inyeccion (C)' },
];
const newQualityProcessRows = [
  { key: 'controlTime', label: 'Hora de control' },
  { key: 'moldCoolingTemperature', label: 'Temp. Refrigeracion del molde' },
  { key: 'preformOvenTemperature', label: 'Temp. de preformas en el horno:' },
  { key: 'ambientTemperature', label: 'Temp. ambiente:' },
  { key: 'preblowAirPressure', label: 'Presion de aire de presoplado' },
  { key: 'blowAirPressure', label: 'Presion de aire de soplado' },
];
const newQualityVariableColumns = ['sample-1', 'sample-2', 'sample-3', 'sample-4'];
const newQualitySmallColumns = ['sample-1', 'sample-2', 'sample-3'];
const newQualityProcessColumns = ['sample-1', 'sample-2'];

function createEmptyNewQualityGrid(rows, columns) {
  return rows.reduce((grid, row) => ({
    ...grid,
    [row.key]: columns.reduce((values, column) => ({ ...values, [column]: '' }), {}),
  }), {});
}

function normalizeNewQualityGrid(grid = {}, rows, columns) {
  return rows.reduce((normalizedGrid, row) => ({
    ...normalizedGrid,
    [row.key]: columns.reduce((values, column) => ({
      ...values,
      [column]: grid?.[row.key]?.[column] ?? '',
    }), {}),
  }), {});
}

function cycleThreadCheckValue(value) {
  if (!value) return 'check';
  if (value === 'check' || value === '✓') return 'x';
  return '';
}

function getNewQualityPackageTotals(record = {}) {
  const start = Number.parseInt(record.packageFrom, 10);
  const end = Number.parseInt(record.packageTo, 10);
  const quantity = Number.parseInt(record.packageQuantity, 10);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { packages: '', bottles: '' };
  }

  const packages = end - start + 1;
  return {
    packages,
    bottles: Number.isFinite(quantity) ? packages * quantity : '',
  };
}

function createEmptyNewQualityInspectionDraft() {
  return {
    id: '',
    productionDate: getToday(),
    machine: machines[0],
    bottleOp: '',
    saiCode: '',
    volume: '',
    client: '',
    shift: '',
    packageType: '',
    packageQuantity: '',
    packageFrom: '',
    packageTo: '',
    totalPackages: '',
    totalBottles: '',
    operator: '',
    qualityAuxiliary: '',
    preformOp: '',
    preformIv: '',
    gramColor: '',
    resin: '',
    preformInspection: '',
    helper: '',
    variableControls: createEmptyNewQualityGrid(newQualityVariableRows, newQualityVariableColumns),
    threadChecks: createEmptyNewQualityGrid(newQualityThreadRows, newQualitySmallColumns),
    temperatureControls: createEmptyNewQualityGrid(newQualityTemperatureRows, newQualityProcessColumns),
    processControls: createEmptyNewQualityGrid(newQualityProcessRows, newQualityProcessColumns),
    waterHardness: {
      time: '',
      value: '',
    },
    odorInspection: '',
    oilGreaseVerification: '',
    evidencePhotos: [],
    userId: '',
    createdBy: '',
    editReason: '',
    changeHistory: [],
    createdAt: '',
    updatedAt: '',
  };
}

function normalizeNewQualityInspectionRecord(record = {}) {
  return {
    ...createEmptyNewQualityInspectionDraft(),
    ...record,
    id: record.id ?? '',
    productionDate: record.productionDate ?? getToday(),
    machine: record.machine ?? machines[0],
    variableControls: normalizeNewQualityGrid(record.variableControls, newQualityVariableRows, newQualityVariableColumns),
    threadChecks: normalizeNewQualityGrid(record.threadChecks, newQualityThreadRows, newQualitySmallColumns),
    temperatureControls: normalizeNewQualityGrid(record.temperatureControls, newQualityTemperatureRows, newQualityProcessColumns),
    processControls: normalizeNewQualityGrid(record.processControls, newQualityProcessRows, newQualityProcessColumns),
    waterHardness: {
      time: record.waterHardness?.time ?? '',
      value: record.waterHardness?.value ?? '',
    },
    odorInspection: record.odorInspection ?? '',
    oilGreaseVerification: record.oilGreaseVerification ?? '',
    evidencePhotos: normalizeNewQualityEvidencePhotos(record.evidencePhotos),
    userId: record.userId ?? '',
    createdBy: record.createdBy ?? '',
    status: record.status ?? QUALITY_RECORD_STATUS.PENDING,
    version: Number(record.version ?? 0),
    submittedBy: record.submittedBy ?? '',
    submittedByName: record.submittedByName ?? '',
    submittedAt: record.submittedAt ?? '',
    reviewedBy: record.reviewedBy ?? '',
    reviewedByName: record.reviewedByName ?? '',
    reviewedAt: record.reviewedAt ?? '',
    reviewComment: record.reviewComment ?? '',
    editReason: record.editReason ?? '',
    changeHistory: Array.isArray(record.changeHistory) ? record.changeHistory : [],
    createdAt: record.createdAt ?? '',
    updatedAt: record.updatedAt ?? '',
  };
}

function loadNewQualityInspectionRecords() {
  try {
    const storedRecords = window.localStorage.getItem(NEW_QUALITY_INSPECTION_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeNewQualityInspectionRecord)
      : [];
  } catch {
    return [];
  }
}

function saveNewQualityInspectionRecords(records) {
  window.localStorage.setItem(
    NEW_QUALITY_INSPECTION_STORAGE_KEY,
    JSON.stringify((records ?? []).map(normalizeNewQualityInspectionRecord)),
  );
}

function prepareNewQualityPayloadForSupabase(record) {
  const {
    status,
    version,
    submittedBy,
    submittedByName,
    submittedAt,
    reviewedBy,
    reviewedByName,
    reviewedAt,
    reviewComment,
    editReason,
    changeHistory,
    ...payloadRecord
  } = record;

  return {
    ...payloadRecord,
    evidencePhotos: normalizeNewQualityEvidencePhotos(record.evidencePhotos).map((photo) => ({
      ...photo,
      dataUrl: photo.path ? '' : photo.dataUrl,
    })),
  };
}

async function restoreNewQualityPayloadFromSupabase(payload = {}) {
  const photos = await Promise.all(
    normalizeNewQualityEvidencePhotos(payload.evidencePhotos).map(async (photo) => ({
      ...photo,
      dataUrl: photo.dataUrl || await getDefectPhotoUrl(photo.path),
    })),
  );

  return {
    ...payload,
    evidencePhotos: photos,
  };
}

async function loadNewQualityRecordsFromSupabase(recordType) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('new_quality_records')
    .select('*')
    .eq('record_type', recordType)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map(async (row) => {
    const payload = await restoreNewQualityPayloadFromSupabase(row.payload ?? {});

    return {
      ...payload,
      id: row.id,
      userId: row.user_id ?? payload.userId ?? '',
      createdBy: row.created_by ?? payload.createdBy ?? '',
      createdAt: row.created_at ?? payload.createdAt ?? '',
      updatedAt: row.updated_at ?? payload.updatedAt ?? '',
      status: row.status ?? QUALITY_RECORD_STATUS.PENDING,
      version: Number(row.version ?? 0),
      submittedBy: row.submitted_by ?? '',
      submittedByName: row.submitted_by_name ?? '',
      submittedAt: row.submitted_at ?? '',
      reviewedBy: row.reviewed_by ?? '',
      reviewedByName: row.reviewed_by_name ?? '',
      reviewedAt: row.reviewed_at ?? '',
      reviewComment: row.review_comment ?? '',
    };
  }));
}

async function submitQualityRecord(recordType, record, authUser, previousPayload = null) {
  if (!supabase || !authUser?.userId || !record?.id) {
    return { ok: false, message: 'Supabase no esta configurado o no hay usuario activo.' };
  }

  const payload = prepareNewQualityPayloadForSupabase(record);
  const changedFields = diffQualitySnapshots(
    previousPayload ? prepareNewQualityPayloadForSupabase(previousPayload) : {},
    payload,
  );
  const { data, error } = await supabase.rpc('submit_new_quality_record', {
    p_record_id: record.id,
    p_record_type: recordType,
    p_payload: payload,
    p_expected_version: Number(record.version ?? 0),
    p_created_by: authUser.displayName || authUser.username || '',
    p_reason: record.editReason || '',
    p_changed_fields: changedFields,
  });

  if (error) {
    console.error('No se pudo enviar el registro de calidad a Supabase:', error);
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const restoredPayload = await restoreNewQualityPayloadFromSupabase(row?.payload ?? payload);

  return {
    ok: true,
    record: {
      ...restoredPayload,
      id: row?.id ?? record.id,
      userId: row?.user_id ?? record.userId ?? authUser.userId,
      createdBy: row?.created_by ?? record.createdBy ?? authUser.displayName ?? '',
      createdAt: row?.created_at ?? record.createdAt ?? '',
      updatedAt: row?.updated_at ?? record.updatedAt ?? '',
      status: row?.status ?? QUALITY_RECORD_STATUS.PENDING,
      version: Number(row?.version ?? Math.max(1, Number(record.version ?? 0))),
      submittedBy: row?.submitted_by ?? authUser.userId,
      submittedByName: row?.submitted_by_name ?? authUser.displayName ?? '',
      submittedAt: row?.submitted_at ?? '',
      reviewedBy: row?.reviewed_by ?? '',
      reviewedByName: row?.reviewed_by_name ?? '',
      reviewedAt: row?.reviewed_at ?? '',
      reviewComment: row?.review_comment ?? '',
    },
  };
}

async function reviewQualityRecord(record, action, comment) {
  if (!supabase || !record?.id) {
    return { ok: false, message: 'Supabase no esta configurado.' };
  }

  const { data, error } = await supabase.rpc('review_new_quality_record', {
    p_record_id: record.id,
    p_action: action,
    p_comment: comment,
    p_expected_version: Number(record.version ?? 0),
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, record: Array.isArray(data) ? data[0] : data };
}

async function loadQualityRecordHistory(recordId) {
  if (!supabase || !recordId) {
    return { ok: false, message: 'Supabase no esta configurado.', events: [] };
  }

  const { data, error } = await supabase
    .from('new_quality_record_history')
    .select('*')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, message: error.message, events: [] };
  return { ok: true, events: data ?? [] };
}

async function loadAuthorizedQualityCertificateSource(inspection, tests) {
  if (!supabase || !inspection?.id || !tests?.id) {
    return { ok: false, message: 'No se encontraron ambos registros vinculados.' };
  }

  const { data, error } = await supabase.rpc('get_quality_certificate_source', {
    p_inspection_id: inspection.id,
    p_tests_id: tests.id,
    p_expected_inspection_version: Number(inspection.version ?? 0),
    p_expected_tests_version: Number(tests.version ?? 0),
  });

  if (error) return { ok: false, message: error.message };

  const inspectionRow = data?.inspection;
  const testsRow = data?.tests;
  const inspectionPayload = await restoreNewQualityPayloadFromSupabase(inspectionRow?.payload ?? {});
  const testsPayload = await restoreNewQualityPayloadFromSupabase(testsRow?.payload ?? {});

  return {
    ok: true,
    inspection: {
      ...inspectionPayload,
      id: inspectionRow.id,
      status: inspectionRow.status,
      version: Number(inspectionRow.version ?? 0),
    },
    tests: {
      ...testsPayload,
      id: testsRow.id,
      status: testsRow.status,
      version: Number(testsRow.version ?? 0),
    },
    technicalFormat: data?.technical_format ?? null,
  };
}

const qualityRecordStatusLabels = {
  [QUALITY_RECORD_STATUS.PENDING]: 'Pendiente de revision',
  [QUALITY_RECORD_STATUS.APPROVED]: 'Aprobado',
  [QUALITY_RECORD_STATUS.CORRECTION_REQUESTED]: 'Correccion solicitada',
  [QUALITY_RECORD_STATUS.REJECTED]: 'Rechazado',
  [QUALITY_RECORD_STATUS.APPROVED_MIGRATED]: 'Aprobado (anterior)',
};

function getQualityRecordStatusLabel(status) {
  return qualityRecordStatusLabels[status] ?? 'Pendiente de revision';
}

async function refreshSharedRecords(recordType, authUser, loadLocalRecords, normalizeRecord, setRecords, setMessage, getIsMounted = () => true) {
  if (!authUser?.userId) {
    setMessage?.('Ingrese con usuario para cargar registros compartidos.');
    return;
  }

  try {
    setMessage?.('Cargando registros compartidos...');
    const localRecords = loadLocalRecords();
    const remoteRecords = await loadNewQualityRecordsFromSupabase(recordType);

    if (!getIsMounted()) {
      return;
    }

    const remoteIds = new Set(remoteRecords.map((record) => record.id));
    const localDrafts = localRecords.filter((record) => record.id && !remoteIds.has(record.id));
    setRecords([...remoteRecords, ...localDrafts].map(normalizeRecord));
    setMessage?.(`Registros compartidos cargados: ${remoteRecords.length}.`);
  } catch (error) {
    console.error('No se pudieron cargar registros compartidos desde Supabase:', error);
    setMessage?.(`No se pudieron cargar registros compartidos: ${error.message}`);
  }
}

function NewQualityInspectionRecordView({
  sharedSaiCode = '',
  onSharedSaiCodeChange,
  authUser,
  bottleFormats = [],
  productionFormats = [],
  masterFormats = [],
  onAudit,
}) {
  const [draft, setDraft] = useState(createEmptyNewQualityInspectionDraft);
  const [records, setRecords] = useState(loadNewQualityInspectionRecords);
  const [showDatabase, setShowDatabase] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [reviewRecord, setReviewRecord] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [linkedTestRecords, setLinkedTestRecords] = useState(loadNewQualityTestsRecords);
  const newQualityFormatOptions = useMemo(() => getUnifiedFormatOptions(bottleFormats, productionFormats), [bottleFormats, productionFormats]);
  const selectedNewQualityTechnicalFormat = useMemo(() => {
    const reference = getSaiCodeReference(draft.saiCode, masterFormats);

    if (hasTechnicalSpecs(reference?.technicalFormat)) {
      return reference.technicalFormat;
    }

    const candidateLabels = [
      reference?.format,
      draft.format,
      [draft.volume, draft.client, draft.gramColor].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .map((label) => String(label).trim())
      .filter(Boolean);

    for (const label of candidateLabels) {
      const selectedLabelKey = getFormatIdentityKey(label);

      if (!selectedLabelKey) {
        continue;
      }

      const selectedOption = newQualityFormatOptions.find((format) => getFormatIdentityKey(format.label) === selectedLabelKey);
      const directTechnicalFormat = selectedOption?.technicalFormat
        || bottleFormats.find((format) => getFormatIdentityKey(getCanonicalFormatLabel(format, productionFormats)) === selectedLabelKey);

      if (hasTechnicalSpecs(directTechnicalFormat)) {
        return directTechnicalFormat;
      }

      if (isUnileverOla5LiterFormatLabel(label)) {
        const supabaseTechnicalFormat = bottleFormats.find((format) => (
          hasTechnicalSpecs(format)
          && formatIncludesUnileverOla5LiterReference(format, productionFormats)
        ));

        return supabaseTechnicalFormat || getFallbackTechnicalFormatForLabel(label);
      }

      if (directTechnicalFormat) {
        return directTechnicalFormat;
      }
    }

    return null;
  }, [bottleFormats, draft.client, draft.format, draft.gramColor, draft.saiCode, draft.volume, masterFormats, newQualityFormatOptions, productionFormats]);

  useEffect(() => {
    saveNewQualityInspectionRecords(records);
  }, [records]);

  useEffect(() => {
    if (!authUser?.userId) {
      return undefined;
    }

    let isMounted = true;

    refreshSharedRecords('inspection', authUser, loadNewQualityInspectionRecords, normalizeNewQualityInspectionRecord, setRecords, setSyncMessage, () => isMounted);
    loadNewQualityRecordsFromSupabase('tests')
      .then((remoteTests) => {
        if (isMounted) setLinkedTestRecords(remoteTests.map(normalizeNewQualityTestsRecord));
      })
      .catch((error) => console.error('No se pudieron cargar las pruebas vinculadas:', error));

    return () => {
      isMounted = false;
    };
  }, [authUser?.userId]);

  const refreshInspectionRecords = () => {
    refreshSharedRecords('inspection', authUser, loadNewQualityInspectionRecords, normalizeNewQualityInspectionRecord, setRecords, setSyncMessage);
    loadNewQualityRecordsFromSupabase('tests')
      .then((remoteTests) => setLinkedTestRecords(remoteTests.map(normalizeNewQualityTestsRecord)))
      .catch((error) => console.error('No se pudieron actualizar las pruebas vinculadas:', error));
  };

  const generateNewQualityCertificate = async (record) => {
    const linkedTests = findLinkedQualityTestsRecord(linkedTestRecords, record);
    const authorizedSource = await loadAuthorizedQualityCertificateSource(record, linkedTests);
    if (!authorizedSource.ok) {
      window.alert(`No se puede generar el certificado: ${authorizedSource.message}`);
      await refreshInspectionRecords();
      return;
    }

    const trustedInspection = normalizeNewQualityInspectionRecord(authorizedSource.inspection);
    const trustedTests = normalizeNewQualityTestsRecord(authorizedSource.tests);
    const reference = getSaiCodeReference(trustedInspection.saiCode, masterFormats);
    const technicalFormat = authorizedSource.technicalFormat ?? {};
    const validationErrors = validateQualityCertificateData(
      trustedInspection,
      trustedTests,
      technicalFormat,
    );
    if (validationErrors.length) {
      window.alert(`No se puede generar el certificado:\n- ${validationErrors.join('\n- ')}`);
      return;
    }

    const certificateRecord = buildCertificateRecordFromNewQuality(
      {
        ...trustedInspection,
        format: trustedInspection.format || reference?.format || technicalFormat.label || technicalFormat.name || '',
      },
      trustedTests,
      technicalFormat,
    );
    printQualityCertificate(certificateRecord);
  };

  const openHistory = async (record) => {
    setHistoryRecord(record);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    const result = await loadQualityRecordHistory(record.id);
    setHistoryLoading(false);
    if (!result.ok) {
      setHistoryError(result.message);
      return;
    }
    setHistoryEvents(result.events);
  };

  const openReview = (record) => {
    setReviewRecord(record);
    setReviewComment(record.reviewComment ?? '');
  };

  const submitReview = async (action) => {
    const cleanComment = reviewComment.trim();
    if (action !== QUALITY_RECORD_STATUS.APPROVED && !cleanComment) {
      window.alert('Ingrese un comentario para solicitar correccion o rechazar.');
      return;
    }

    setReviewBusy(true);
    const result = await reviewQualityRecord(reviewRecord, action, cleanComment);
    setReviewBusy(false);
    if (!result.ok) {
      window.alert(`No se pudo revisar el registro: ${result.message}`);
      return;
    }

    setReviewRecord(null);
    setReviewComment('');
    await refreshSharedRecords('inspection', authUser, loadNewQualityInspectionRecords, normalizeNewQualityInspectionRecord, setRecords, setSyncMessage);
  };

  useEffect(() => {
    const reference = getSaiCodeReference(sharedSaiCode, masterFormats);

    setDraft((currentDraft) => ({
      ...currentDraft,
      saiCode: sharedSaiCode,
      ...(reference ? {
        volume: getSaiVolume(reference),
        client: reference.client,
        packageQuantity: reference.quantity,
        gramColor: getSaiGramColor(reference),
        resin: reference.resin,
      } : {}),
    }));
  }, [masterFormats, sharedSaiCode]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const updateGridCell = (gridName, rowKey, columnKey, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [gridName]: {
        ...(currentDraft[gridName] ?? {}),
        [rowKey]: {
          ...(currentDraft[gridName]?.[rowKey] ?? {}),
          [columnKey]: value,
        },
      },
    }));
  };

  const updateBinaryCheck = (field, value, checked) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: checked ? value : '',
    }));
  };

  const updateSaiCode = (value) => {
    onSharedSaiCodeChange?.(value);
    const reference = getSaiCodeReference(value, masterFormats);

    setDraft((currentDraft) => ({
      ...currentDraft,
      saiCode: value,
      ...(reference ? {
        volume: getSaiVolume(reference),
        client: reference.client,
        packageQuantity: reference.quantity,
        gramColor: getSaiGramColor(reference),
        resin: reference.resin,
      } : {}),
    }));
  };

  const resetDraft = () => {
    setDraft({
      ...createEmptyNewQualityInspectionDraft(),
      saiCode: sharedSaiCode,
    });
  };

  const updatePackageField = (field, value) => {
    setDraft((currentDraft) => {
      const nextDraft = { ...currentDraft, [field]: value };
      const totals = getNewQualityPackageTotals(nextDraft);

      return {
        ...nextDraft,
        totalPackages: totals.packages === '' ? '' : String(totals.packages),
        totalBottles: totals.bottles === '' ? '' : String(totals.bottles),
      };
    });
  };

  const saveRecord = async () => {
    if (!draft.productionDate || !draft.saiCode) {
      window.alert('Ingrese fecha de produccion y Codigo SAI antes de guardar.');
      return;
    }

    const isEditingRecord = Boolean(draft.id);
    const editReason = (draft.editReason ?? '').trim();

    if (isEditingRecord && !editReason) {
      window.alert('Ingrese el motivo del cambio antes de actualizar el registro.');
      return;
    }

    if (isSubmitting) return;

    const previousRecord = isEditingRecord
      ? records.find((currentRecord) => currentRecord.id === draft.id) ?? null
      : null;
    const record = normalizeNewQualityInspectionRecord({
      ...draft,
      ...(() => {
        const totals = getNewQualityPackageTotals(draft);
        return {
          totalPackages: totals.packages === '' ? draft.totalPackages : String(totals.packages),
          totalBottles: totals.bottles === '' ? draft.totalBottles : String(totals.bottles),
        };
      })(),
      id: draft.id || crypto.randomUUID(),
      userId: draft.userId || authUser?.userId || '',
      createdBy: draft.createdBy || authUser?.displayName || authUser?.username || '',
      editReason,
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setIsSubmitting(true);
    const syncResult = await submitQualityRecord('inspection', record, authUser, previousRecord);
    setIsSubmitting(false);

    if (!syncResult.ok) {
      window.alert(`No se pudo mandar el registro: ${syncResult.message}`);
      return;
    }

    const savedRecord = normalizeNewQualityInspectionRecord(syncResult.record);
    setRecords((currentRecords) => (
      isEditingRecord
        ? currentRecords.map((currentRecord) => (currentRecord.id === savedRecord.id ? savedRecord : currentRecord))
        : [savedRecord, ...currentRecords]
    ));
    setSyncMessage(`Registro enviado para revision. Version ${savedRecord.version}.`);
    resetDraft();
    await onAudit?.({
      action: isEditingRecord ? 'Actualizo nuevo registro de calidad' : 'Registro nuevo control de calidad',
      area: 'Control de calidad',
      target: savedRecord.saiCode,
      detail: `${savedRecord.productionDate} / ${savedRecord.client || 'Sin cliente'}`,
      metadata: { recordId: savedRecord.id, version: savedRecord.version },
    });
  };

  const openRecord = (record) => {
    const normalizedRecord = normalizeNewQualityInspectionRecord(record);
    setDraft(normalizedRecord);
    onSharedSaiCodeChange?.(normalizedRecord.saiCode);
    setShowDatabase(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="new-quality-record-section">
      <article className="blower-sheet new-quality-sheet">
        <div className="blower-grid-bg" aria-hidden="true" />
        <header className="new-quality-header">
          <div className="blower-logo-block">
            <img src="/logos/logo-empacar.png" alt="EMPACAR" />
          </div>
          <h3>
            <span>REGISTRO DE INSPECCION DE EMPAQUE Y CONTROL DE ATRIBUTOS Y VARIABLES DE BOTELLAS PET - MAQUINA SOPLADORA</span>
            <label className="new-quality-header-machine" aria-label="Maquina sopladora">
              <select value={draft.machine} onChange={(event) => updateDraft('machine', event.target.value)}>
                {machines.map((machine) => <option key={machine} value={machine}>{machine.split('-').pop() || machine}</option>)}
              </select>
            </label>
          </h3>
          <div className="blower-code-block">
            <strong>REG-LAS-01</strong>
            <span>PAGINA: 1 de 2</span>
          </div>
        </header>

        <div className="new-quality-form-grid">
          <div className="new-quality-block">
            <div className="blower-block-title">DATOS DE PRODUCCION - BOTELLA</div>
            <div className="new-quality-fields">
              <label><span>Fecha produccion:</span><input type="date" value={draft.productionDate} onChange={(event) => updateDraft('productionDate', event.target.value)} /></label>
              <div className="new-quality-inline-checks new-quality-shift-checks">
                <span>Turno:</span>
                {['1er', '2do', '3ro'].map((shift) => (
                  <label key={shift}>
                    <input
                      type="checkbox"
                      checked={draft.shift === shift}
                      onChange={(event) => updateDraft('shift', event.target.checked ? shift : '')}
                    />
                    {shift}
                  </label>
                ))}
              </div>
              <label><span>OP-botella:</span><input type="text" value={draft.bottleOp} onChange={(event) => updateDraft('bottleOp', event.target.value)} /></label>
              <div className="new-quality-inline-checks">
                <span>Tipo empaque:</span>
                <label><input type="checkbox" checked={draft.packageType === 'Bolsa'} onChange={(event) => updateDraft('packageType', event.target.checked ? 'Bolsa' : '')} /> Bolsa</label>
                <label><input type="checkbox" checked={draft.packageType === 'Pallet'} onChange={(event) => updateDraft('packageType', event.target.checked ? 'Pallet' : '')} /> Pallet</label>
              </div>
              <label><span>Codigo SAI:</span><input type="text" value={draft.saiCode} onChange={(event) => updateSaiCode(event.target.value)} /></label>
              <label><span>Cantidad por empaque:</span><input type="number" min="0" value={draft.packageQuantity} onChange={(event) => updatePackageField('packageQuantity', event.target.value)} /><b>Unid.</b></label>
              <label><span>Volumen:</span><input type="text" value={draft.volume} onChange={(event) => updateDraft('volume', event.target.value)} /></label>
              <label><span>N° Empaque producido:</span><input type="text" value={draft.packageFrom} onChange={(event) => updateDraft('packageFrom', event.target.value)} placeholder="Del" /><input type="text" value={draft.packageTo} onChange={(event) => updateDraft('packageTo', event.target.value)} placeholder="al" /></label>
              <label><span>Cliente:</span><input type="text" value={draft.client} onChange={(event) => updateDraft('client', event.target.value)} /></label>
              <label><span>Total producido:</span><input type="number" min="0" value={getNewQualityPackageTotals(draft).packages || ''} readOnly placeholder="Emp." /><input type="number" min="0" value={getNewQualityPackageTotals(draft).bottles || ''} readOnly placeholder="Bot." /></label>
              <label><span>Operador:</span><select value={draft.operator} onChange={(event) => updateDraft('operator', event.target.value)}><option value="">Seleccionar</option>{operatorOptions.map((operator) => <option key={operator} value={operator}>{operator}</option>)}</select></label>
              <label><span>Auxiliar de Calidad:</span><input type="text" value={draft.qualityAuxiliary} onChange={(event) => updateDraft('qualityAuxiliary', event.target.value)} /></label>
            </div>
          </div>

          <div className="new-quality-block reference">
            <div className="blower-block-title">DATOS DE REFERENCIA</div>
            <div className="new-quality-fields compact">
              <label><span>OP-preforma:</span><input type="text" value={draft.preformOp} onChange={(event) => updateDraft('preformOp', event.target.value)} /></label>
              <label><span>Gramaje - Color:</span><input type="text" value={draft.gramColor} onChange={(event) => updateDraft('gramColor', event.target.value)} /></label>
              <label><span>Resina:</span><select value={draft.resin} onChange={(event) => updateDraft('resin', event.target.value)}><option value="">Seleccionar</option>{resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}</select></label>
              <div className="new-quality-inline-checks">
                <span>Inspeccion de preforma:</span>
                <label><input type="checkbox" checked={draft.preformInspection === 'Conforme'} onChange={(event) => updateDraft('preformInspection', event.target.checked ? 'Conforme' : '')} /> Con.</label>
                <label><input type="checkbox" checked={draft.preformInspection === 'No conforme'} onChange={(event) => updateDraft('preformInspection', event.target.checked ? 'No conforme' : '')} /> Ncon.</label>
              </div>
              <label><span>Ayudante:</span><input type="text" value={draft.helper} onChange={(event) => updateDraft('helper', event.target.value)} /></label>
            </div>
          </div>
        </div>

        <div className="new-quality-plan">
          <div className="new-quality-plan-title">PLAN DE INSPECCION DE ATRIBUTOS Y VARIABLES PARA BOTELLAS PET</div>
          <table>
            <thead>
              <tr><th>ITEM</th><th>PRUEBA DIARIA O DE RUTINA</th><th>INSTRUCTIVO</th><th>FRECUENCIA</th></tr>
            </thead>
            <tbody>
              {newQualityInspectionPlanRows.map(([item, test, instruction, frequency]) => (
                <tr key={item}><td>{item}</td><td>{test}</td><td>{instruction}</td><td>{frequency}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="new-quality-control-layout">
          <div className="new-quality-variable-panel">
            <div className="new-quality-table-title">CONTROL DE VARIABLE</div>
            {draft.saiCode && !hasTechnicalSpecs(selectedNewQualityTechnicalFormat) && (
              <div className="new-quality-spec-alert">
                Este Codigo SAI aun no tiene especificacion tecnica enlazada. Las tolerancias apareceran cuando exista ficha tecnica para ese formato.
              </div>
            )}
            <div className="new-quality-variable-grid">
              {newQualityVariableRows.map((row) => {
                const rowSpec = row.specKey ? selectedNewQualityTechnicalFormat?.specs?.[row.specKey] : null;
                const rowLimitText = getBlowerVariableLimitText(rowSpec);

                return (
                  <Fragment key={row.key}>
                    <div
                      className={`new-quality-row-label ${row.group ? 'grouped' : ''} ${
                        row.group && newQualityVariableRows.findIndex((groupRow) => groupRow.group === row.group) === newQualityVariableRows.findIndex((groupRow) => groupRow.key === row.key)
                          ? 'group-start'
                          : ''
                      }`}
                      style={row.group ? {
                        '--group-rows': newQualityVariableRows.filter((groupRow) => groupRow.group === row.group).length,
                      } : undefined}
                    >
                      {row.group && newQualityVariableRows.findIndex((groupRow) => groupRow.group === row.group) === newQualityVariableRows.findIndex((groupRow) => groupRow.key === row.key) && (
                        <span className="new-quality-side-label">{row.group}</span>
                      )}
                      <span>
                        {row.label}
                        {rowLimitText && <small>{rowLimitText}</small>}
                      </span>
                    </div>
                    {newQualityVariableColumns.map((column) => {
                      const value = draft.variableControls?.[row.key]?.[column] ?? '';
                      const status = getBlowerVariableLimitStatus(value, rowSpec);

                      return (
                        <input
                          key={`${row.key}-${column}`}
                          className={status !== 'pending' ? `validation-${status}` : ''}
                          type={rowSpec ? 'number' : 'text'}
                          step={rowSpec ? '0.01' : undefined}
                          inputMode={rowSpec ? 'decimal' : undefined}
                          value={value}
                          onChange={(event) => updateGridCell('variableControls', row.key, column, event.target.value)}
                          aria-label={`${row.label} ${column}`}
                          title={rowLimitText ? `${rowLimitText} - ${getValidationLabel(status)}` : undefined}
                        />
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>

            <div className="new-quality-presence-checks">
              <div className="new-quality-presence-title">INSPECCION DE OLOR EN LAS BOTELLAS</div>
              <label>Presencia <input type="checkbox" checked={draft.odorInspection === 'Presencia'} onChange={(event) => updateBinaryCheck('odorInspection', 'Presencia', event.target.checked)} /></label>
              <label>Ausencia <input type="checkbox" checked={draft.odorInspection === 'Ausencia'} onChange={(event) => updateBinaryCheck('odorInspection', 'Ausencia', event.target.checked)} /></label>
              <div className="new-quality-presence-title">VERIFICACION DE ACEITE Y GRASA EN LAS BOTELLAS</div>
              <label>Presencia <input type="checkbox" checked={draft.oilGreaseVerification === 'Presencia'} onChange={(event) => updateBinaryCheck('oilGreaseVerification', 'Presencia', event.target.checked)} /></label>
              <label>Ausencia <input type="checkbox" checked={draft.oilGreaseVerification === 'Ausencia'} onChange={(event) => updateBinaryCheck('oilGreaseVerification', 'Ausencia', event.target.checked)} /></label>
            </div>
          </div>

          <div className="new-quality-side-panel">
            <div className="new-quality-table-title">VERIFICACION DE LA ROSCA</div>
            <div className="new-quality-small-grid">
              {newQualityThreadRows.map((row) => (
                <Fragment key={row.key}>
                  <div className="new-quality-row-label">{row.label}</div>
                  {newQualitySmallColumns.map((column) => (
                    (() => {
                      const value = draft.threadChecks?.[row.key]?.[column];
                      const mark = value === true || value === 'x' ? 'x' : value === 'check' || value === '✓' ? 'check' : '';
                      return (
                        <button
                          key={`${row.key}-${column}`}
                          type="button"
                          className={`new-quality-table-check ${mark ? 'checked' : ''} ${mark ? `is-${mark}` : ''}`}
                          onClick={() => updateGridCell('threadChecks', row.key, column, cycleThreadCheckValue(mark))}
                          aria-label={`${row.label} ${column}`}
                          aria-pressed={Boolean(mark)}
                          title="Clic para alternar: ✓, X o vacío"
                        >
                          {mark === 'check' ? '✓' : mark === 'x' ? 'X' : ''}
                        </button>
                      );
                    })()
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="new-quality-table-title stacked">CONTROL DE TEMPERATURA DE BOTELLA A LA SALIDA DE MAQUINA DE PRODUCCION</div>
            <div className="new-quality-process-grid">
              {newQualityTemperatureRows.map((row) => (
                <Fragment key={row.key}>
                  <div className="new-quality-row-label">{row.label}</div>
                  {newQualityProcessColumns.map((column) => (
                    <input
                      key={`${row.key}-${column}`}
                      type={row.key === 'controlTime' ? 'time' : 'text'}
                      step={row.key === 'controlTime' ? 60 : undefined}
                      value={row.key === 'controlTime' ? normalizeTimeMinuteValue(draft.temperatureControls?.[row.key]?.[column]) : draft.temperatureControls?.[row.key]?.[column] ?? ''}
                      onChange={(event) => updateGridCell('temperatureControls', row.key, column, row.key === 'controlTime' ? normalizeTimeMinuteValue(event.target.value) : event.target.value)}
                      aria-label={`${row.label} ${column}`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="new-quality-table-title stacked">CONTROL DE VARIABLES DE PROCESO</div>
            <div className="new-quality-process-grid">
              {newQualityProcessRows.map((row) => (
                <Fragment key={row.key}>
                  <div className="new-quality-row-label">{row.label}</div>
                  {newQualityProcessColumns.map((column) => (
                    <input
                      key={`${row.key}-${column}`}
                      type={row.key === 'controlTime' ? 'time' : 'text'}
                      step={row.key === 'controlTime' ? 60 : undefined}
                      value={row.key === 'controlTime' ? normalizeTimeMinuteValue(draft.processControls?.[row.key]?.[column]) : draft.processControls?.[row.key]?.[column] ?? ''}
                      onChange={(event) => updateGridCell('processControls', row.key, column, row.key === 'controlTime' ? normalizeTimeMinuteValue(event.target.value) : event.target.value)}
                      aria-label={`${row.label} ${column}`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="new-quality-table-title stacked">DUREZA DE AGUA DE PROCESO</div>
            <div className="new-quality-hardness-grid">
              <label>Hora<input type="time" step="60" value={normalizeTimeMinuteValue(draft.waterHardness?.time)} onChange={(event) => updateDraft('waterHardness', { ...(draft.waterHardness ?? {}), time: normalizeTimeMinuteValue(event.target.value) })} /></label>
              <label>Dureza (ppm CaCO3)<input type="text" value={draft.waterHardness?.value ?? ''} onChange={(event) => updateDraft('waterHardness', { ...(draft.waterHardness ?? {}), value: event.target.value })} /></label>
            </div>
          </div>
        </div>

        {draft.id && (
          <label className="new-quality-edit-reason">
            <span>Motivo del cambio *</span>
            <textarea
              value={draft.editReason ?? ''}
              onChange={(event) => updateDraft('editReason', event.target.value)}
              placeholder="Describa por que se modifica este registro"
              required
            />
          </label>
        )}

        <div className="blower-actions">
          <button type="button" className="primary-action" onClick={saveRecord} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : draft.id ? 'Mandar correccion' : 'Mandar registro'}
          </button>
          <button type="button" className="secondary-action" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
          <button type="button" className="secondary-action" onClick={() => setShowDatabase((currentValue) => !currentValue)}>
            {showDatabase ? 'Ocultar base de datos' : `Ver base de datos (${records.length})`}
          </button>
          <button type="button" className="secondary-action" onClick={refreshInspectionRecords}>Actualizar compartidos</button>
          <button type="button" className="secondary-action" onClick={resetDraft}>Limpiar</button>
          <NewQualityEvidenceCapture
            photos={draft.evidencePhotos}
            onChange={(photos) => updateDraft('evidencePhotos', photos)}
            userId={authUser?.userId ?? ''}
            sections={[{ key: 'nuevo-registro', label: 'Nuevo registro' }]}
            compact
          />
        </div>
        {syncMessage && <p className="equipment-demo-note">{syncMessage}</p>}
      </article>

      {showDatabase && (
        <article className="blower-record-list">
          <div className="section-heading">
            <div><span>Registros guardados</span><h2>Base de datos nuevo registro</h2></div>
            <strong className="record-count">{records.length} registros</strong>
          </div>
          <div className="blower-excel-table-wrap">
            <table className="blower-excel-table">
              <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Maquina</th><th>Codigo SAI</th><th>Cliente</th><th>Volumen</th><th>Gramaje - Color</th><th>Resina</th><th>Turno</th><th>Estado</th><th>Historial</th><th>Accion</th></tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.productionDate || '-'}</td>
                    <td>{record.createdBy || '-'}</td>
                    <td>{record.machine || '-'}</td>
                    <td>{record.saiCode || '-'}</td>
                    <td>{record.client || '-'}</td>
                    <td>{record.volume || '-'}</td>
                    <td>{record.gramColor || '-'}</td>
                    <td>{record.resin || '-'}</td>
                    <td>{record.shift || '-'}</td>
                    <td>
                      <span className={`quality-record-status status-${record.status || QUALITY_RECORD_STATUS.PENDING}`}>
                        {getQualityRecordStatusLabel(record.status)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="secondary-action certificate-action" onClick={() => openHistory(record)}>
                        Ver cambios
                      </button>
                    </td>
                    <td>
                      <div className="quality-record-row-actions">
                        <button type="button" className="secondary-action certificate-action" onClick={() => openRecord(record)}>Abrir</button>
                        {canReviewQualityRecord(authUser) && record.status === QUALITY_RECORD_STATUS.PENDING && (
                          <button type="button" className="secondary-action certificate-action" onClick={() => openReview(record)}>Revisar</button>
                        )}
                        {(() => {
                          const linkedTests = findLinkedQualityTestsRecord(linkedTestRecords, record);
                          const enabled = canGenerateQualityCertificate(authUser, record, linkedTests);
                          const title = !canReviewQualityRecord(authUser)
                            ? 'Su rol no permite generar certificados'
                            : ![QUALITY_RECORD_STATUS.APPROVED, QUALITY_RECORD_STATUS.APPROVED_MIGRATED].includes(record.status)
                              ? 'Primero debe aprobarse el Nuevo registro'
                              : !linkedTests
                                ? 'Falta el registro vinculado de Pruebas'
                                : ![QUALITY_RECORD_STATUS.APPROVED, QUALITY_RECORD_STATUS.APPROVED_MIGRATED].includes(linkedTests.status)
                                  ? 'El registro vinculado de Pruebas aun no esta aprobado'
                                  : 'Generar certificado de calidad';

                          return (
                            <button
                              type="button"
                              className="secondary-action certificate-action"
                              disabled={!enabled}
                              title={title}
                              onClick={() => generateNewQualityCertificate(record)}
                            >
                              Generar certificado
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
      <QualityRecordHistoryDialog
        record={historyRecord}
        events={historyEvents}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryRecord(null)}
      />
      <QualityRecordReviewDialog
        record={reviewRecord}
        comment={reviewComment}
        busy={reviewBusy}
        onCommentChange={setReviewComment}
        onReview={submitReview}
        onClose={() => {
          if (!reviewBusy) {
            setReviewRecord(null);
            setReviewComment('');
          }
        }}
      />
    </section>
  );
}

const newQualityStressSupplyRows = [
  { key: 'sodiumBicarbonate', label: 'Bicarbonato de sodio', unit: 'gr.' },
  { key: 'citricAcid', label: 'Acido Citrico', unit: 'gr.' },
  { key: 'sodiumHydroxide', label: 'Hidroxido de sodio', unit: 'gr.' },
  { key: 'distilledWater', label: 'Agua destilada', unit: 'lts.' },
  { key: 'water', label: 'Agua', unit: 'ml.' },
  { key: 'paperTowel', label: 'Papel toalla', unit: 'cm.' },
  { key: 'co2Pressure', label: 'Presion de CO2', unit: 'psi' },
];
const newQualityDefectLevels = [
  { key: 'critical', label: 'CRITICOS' },
  { key: 'major', label: 'MAYOR' },
  { key: 'minor', label: 'MENOR' },
];
const newQualityPackageRows = Array.from({ length: 4 }, (_, index) => index + 1);
const newQualityPackageCheckColumns = [
  'fichaPresencia',
  'fichaAusencia',
  'palletBueno',
  'palletAceptable',
  'palletMalo',
  'separadorBueno',
  'separadorAceptable',
  'separadorMalo',
  'bolsaBueno',
  'bolsaAceptable',
  'bolsaMalo',
  'flejado2',
  'flejado3',
  'flejado4',
  'voboAceptado',
  'voboObservado',
  'voboRechazado',
];
const newQualityInspectionEvidenceSections = [
  { key: 'control-variable', label: 'Control de variable' },
  { key: 'verificacion-rosca', label: 'Verificacion de la rosca' },
  { key: 'temperatura-botella', label: 'Temperatura de botella' },
  { key: 'variables-proceso', label: 'Variables de proceso' },
  { key: 'olor-aceite-grasa', label: 'Olor / aceite y grasa' },
];
const newQualityTestsEvidenceSections = [
  { key: 'stress-cracking', label: 'Prueba de stress cracking' },
  { key: 'prueba-caida', label: 'Prueba de caida' },
  { key: 'defectos-visuales', label: 'Inspeccion visual defectos' },
  { key: 'empaque', label: 'Inspeccion de empaque' },
  { key: 'comentarios-turno', label: 'Comentarios de turno' },
];

function createEmptyNewQualityTestsDraft() {
  return {
    id: '',
    saiCode: '',
    productionDate: getToday(),
    machine: machines[0],
    stressCracking: {
      result: '',
      observations: '',
      supplies: newQualityStressSupplyRows.reduce((supplies, row) => ({ ...supplies, [row.key]: '' }), {}),
      comments: '',
    },
    fallTest: {
      result: '',
      observations: '',
    },
    visualDefects: {
      critical: '',
      major: '',
      minor: '',
    },
    packageInspection: newQualityPackageRows.map((item) => ({
      item,
      packageNumber: '',
      checks: newQualityPackageCheckColumns.reduce((checks, column) => ({ ...checks, [column]: false }), {}),
    })),
    defectiveBottles: '',
    defectivePreforms: '',
    shiftComments: '',
    qualitySealSignature: '',
    evidencePhotos: [],
    userId: '',
    createdBy: '',
    editReason: '',
    changeHistory: [],
    createdAt: '',
    updatedAt: '',
  };
}

function normalizeNewQualityTestsRecord(record = {}) {
  const emptyDraft = createEmptyNewQualityTestsDraft();

  return {
    ...emptyDraft,
    ...record,
    id: record.id ?? '',
    saiCode: record.saiCode ?? '',
    productionDate: record.productionDate ?? getToday(),
    machine: record.machine ?? machines[0],
    stressCracking: {
      ...emptyDraft.stressCracking,
      ...(record.stressCracking ?? {}),
      supplies: {
        ...emptyDraft.stressCracking.supplies,
        ...(record.stressCracking?.supplies ?? {}),
      },
    },
    fallTest: {
      ...emptyDraft.fallTest,
      ...(record.fallTest ?? {}),
    },
    visualDefects: {
      ...emptyDraft.visualDefects,
      ...(record.visualDefects ?? {}),
    },
    packageInspection: newQualityPackageRows.map((item, index) => {
      const currentRow = record.packageInspection?.[index] ?? {};

      return {
        item,
        packageNumber: currentRow.packageNumber ?? '',
        checks: newQualityPackageCheckColumns.reduce((checks, column) => ({
          ...checks,
          [column]: Boolean(currentRow.checks?.[column]),
        }), {}),
      };
    }),
    defectiveBottles: record.defectiveBottles ?? '',
    defectivePreforms: record.defectivePreforms ?? '',
    shiftComments: record.shiftComments ?? '',
    qualitySealSignature: record.qualitySealSignature ?? '',
    evidencePhotos: normalizeNewQualityEvidencePhotos(record.evidencePhotos),
    userId: record.userId ?? '',
    createdBy: record.createdBy ?? '',
    status: record.status ?? QUALITY_RECORD_STATUS.PENDING,
    version: Number(record.version ?? 0),
    submittedBy: record.submittedBy ?? '',
    submittedByName: record.submittedByName ?? '',
    submittedAt: record.submittedAt ?? '',
    reviewedBy: record.reviewedBy ?? '',
    reviewedByName: record.reviewedByName ?? '',
    reviewedAt: record.reviewedAt ?? '',
    reviewComment: record.reviewComment ?? '',
    editReason: record.editReason ?? '',
    changeHistory: Array.isArray(record.changeHistory) ? record.changeHistory : [],
    createdAt: record.createdAt ?? '',
    updatedAt: record.updatedAt ?? '',
  };
}

function loadNewQualityTestsRecords() {
  try {
    const storedRecords = window.localStorage.getItem(NEW_QUALITY_TESTS_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeNewQualityTestsRecord)
      : [];
  } catch {
    return [];
  }
}

function saveNewQualityTestsRecords(records) {
  window.localStorage.setItem(
    NEW_QUALITY_TESTS_STORAGE_KEY,
    JSON.stringify((records ?? []).map(normalizeNewQualityTestsRecord)),
  );
}

function NewQualityTestsRecordView({ sharedSaiCode = '', onSharedSaiCodeChange, authUser, onAudit }) {
  const [draft, setDraft] = useState(createEmptyNewQualityTestsDraft);
  const [records, setRecords] = useState(loadNewQualityTestsRecords);
  const [showDatabase, setShowDatabase] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [reviewRecord, setReviewRecord] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    saveNewQualityTestsRecords(records);
  }, [records]);

  useEffect(() => {
    if (!authUser?.userId) {
      return undefined;
    }

    let isMounted = true;

    refreshSharedRecords('tests', authUser, loadNewQualityTestsRecords, normalizeNewQualityTestsRecord, setRecords, setSyncMessage, () => isMounted);

    return () => {
      isMounted = false;
    };
  }, [authUser?.userId]);

  const refreshTestRecords = () => {
    refreshSharedRecords('tests', authUser, loadNewQualityTestsRecords, normalizeNewQualityTestsRecord, setRecords, setSyncMessage);
  };

  const openHistory = async (record) => {
    setHistoryRecord(record);
    setHistoryEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    const result = await loadQualityRecordHistory(record.id);
    setHistoryLoading(false);
    if (!result.ok) {
      setHistoryError(result.message);
      return;
    }
    setHistoryEvents(result.events);
  };

  const openReview = (record) => {
    setReviewRecord(record);
    setReviewComment(record.reviewComment ?? '');
  };

  const submitReview = async (action) => {
    const cleanComment = reviewComment.trim();
    if (action !== QUALITY_RECORD_STATUS.APPROVED && !cleanComment) {
      window.alert('Ingrese un comentario para solicitar correccion o rechazar.');
      return;
    }

    setReviewBusy(true);
    const result = await reviewQualityRecord(reviewRecord, action, cleanComment);
    setReviewBusy(false);
    if (!result.ok) {
      window.alert(`No se pudo revisar el registro: ${result.message}`);
      return;
    }

    setReviewRecord(null);
    setReviewComment('');
    await refreshSharedRecords('tests', authUser, loadNewQualityTestsRecords, normalizeNewQualityTestsRecord, setRecords, setSyncMessage);
  };

  useEffect(() => {
    const linkedRecord = loadNewQualityInspectionRecords()
      .find((record) => normalizeSaiCode(record.saiCode) === normalizeSaiCode(sharedSaiCode));

    setDraft((currentDraft) => ({
      ...currentDraft,
      saiCode: sharedSaiCode,
      productionDate: linkedRecord?.productionDate || currentDraft.productionDate || getToday(),
      machine: linkedRecord?.machine || currentDraft.machine,
    }));
  }, [sharedSaiCode]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const updateStress = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      stressCracking: {
        ...currentDraft.stressCracking,
        [field]: value,
      },
    }));
  };

  const updateStressSupply = (key, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      stressCracking: {
        ...currentDraft.stressCracking,
        supplies: {
          ...currentDraft.stressCracking.supplies,
          [key]: value,
        },
      },
    }));
  };

  const updateFallTest = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      fallTest: {
        ...currentDraft.fallTest,
        [field]: value,
      },
    }));
  };

  const updateVisualDefect = (levelKey, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      visualDefects: {
        ...currentDraft.visualDefects,
        [levelKey]: value,
      },
    }));
  };

  const updatePackageInspectionRow = (rowIndex, field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      packageInspection: currentDraft.packageInspection.map((row, index) => (
        index === rowIndex ? { ...row, [field]: value } : row
      )),
    }));
  };

  const togglePackageInspectionCheck = (rowIndex, column) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      packageInspection: currentDraft.packageInspection.map((row, index) => (
        index === rowIndex
          ? {
              ...row,
              checks: {
                ...row.checks,
                [column]: !row.checks[column],
              },
            }
          : row
      )),
    }));
  };

  const resetDraft = () => {
    setDraft({
      ...createEmptyNewQualityTestsDraft(),
      saiCode: sharedSaiCode,
    });
  };

  const saveRecord = async () => {
    if (!draft.saiCode) {
      window.alert('Primero seleccione o ingrese el Codigo SAI en Nuevo registro.');
      return;
    }

    const isEditingRecord = Boolean(draft.id);
    const editReason = (draft.editReason ?? '').trim();

    if (isEditingRecord && !editReason) {
      window.alert('Ingrese el motivo del cambio antes de actualizar el registro.');
      return;
    }

    if (isSubmitting) return;

    const previousRecord = isEditingRecord
      ? records.find((currentRecord) => currentRecord.id === draft.id) ?? null
      : null;
    const record = normalizeNewQualityTestsRecord({
      ...draft,
      id: draft.id || crypto.randomUUID(),
      userId: draft.userId || authUser?.userId || '',
      createdBy: draft.createdBy || authUser?.displayName || authUser?.username || '',
      editReason,
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setIsSubmitting(true);
    const syncResult = await submitQualityRecord('tests', record, authUser, previousRecord);
    setIsSubmitting(false);

    if (!syncResult.ok) {
      window.alert(`No se pudo mandar el registro: ${syncResult.message}`);
      return;
    }

    const savedRecord = normalizeNewQualityTestsRecord(syncResult.record);
    setRecords((currentRecords) => (
      isEditingRecord
        ? currentRecords.map((currentRecord) => (currentRecord.id === savedRecord.id ? savedRecord : currentRecord))
        : [savedRecord, ...currentRecords]
    ));
    setSyncMessage(`Registro enviado para revision. Version ${savedRecord.version}.`);
    resetDraft();
    await onAudit?.({
      action: isEditingRecord ? 'Actualizo pruebas nuevo registro calidad' : 'Registro pruebas nuevo control de calidad',
      area: 'Control de calidad',
      target: savedRecord.saiCode,
      detail: `${savedRecord.productionDate} / Stress ${savedRecord.stressCracking.result || 'Sin dato'} / Caida ${savedRecord.fallTest.result || 'Sin dato'}`,
      metadata: { recordId: savedRecord.id, version: savedRecord.version },
    });
  };

  const openRecord = (record) => {
    const normalizedRecord = normalizeNewQualityTestsRecord(record);
    setDraft(normalizedRecord);
    onSharedSaiCodeChange?.(normalizedRecord.saiCode);
    setShowDatabase(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="new-quality-record-section">
      <article className="blower-sheet new-quality-sheet">
        <div className="blower-grid-bg" aria-hidden="true" />
        <header className="new-quality-header">
          <div className="blower-logo-block">
            <img src="/logos/logo-empacar.png" alt="EMPACAR" />
          </div>
          <h3>
            <span>REGISTRO DE INSPECCION DE EMPAQUE Y CONTROL DE ATRIBUTOS Y VARIABLES DE BOTELLAS PET - MAQUINA SOPLADORA</span>
            <label className="new-quality-header-machine" aria-label="Maquina sopladora">
              <select value={draft.machine} onChange={(event) => updateDraft('machine', event.target.value)}>
                {machines.map((machine) => <option key={machine} value={machine}>{machine.split('-').pop() || machine}</option>)}
              </select>
            </label>
          </h3>
          <div className="blower-code-block">
            <strong>REG-LAS-01</strong>
            <span>PAGINA: 1 de 2</span>
          </div>
        </header>

        <div className="new-quality-test-section">
          <div className="new-quality-table-title">PRUEBA DE STRESS CRACKING</div>
          <div className="new-quality-stress-grid">
            <label className="new-quality-test-check">
              APLICA
              <input type="checkbox" checked={draft.stressCracking.result === 'Aplica'} onChange={(event) => updateStress('result', event.target.checked ? 'Aplica' : '')} />
            </label>
            <label className="new-quality-test-check">
              NO APLICA
              <input type="checkbox" checked={draft.stressCracking.result === 'No aplica'} onChange={(event) => updateStress('result', event.target.checked ? 'No aplica' : '')} />
            </label>
            <label className="new-quality-test-obs">
              <span>OBS</span>
              <textarea value={draft.stressCracking.observations} onChange={(event) => updateStress('observations', event.target.value)} />
            </label>
            <div className="new-quality-supplies">
              <strong>CANT. DE INSUMOS UTILIZADOS</strong>
              {newQualityStressSupplyRows.map((row) => (
                <Fragment key={row.key}>
                  <span>{row.label}</span>
                  <input type="text" value={draft.stressCracking.supplies?.[row.key] ?? ''} onChange={(event) => updateStressSupply(row.key, event.target.value)} />
                  <b>{row.unit}</b>
                </Fragment>
              ))}
            </div>
            <label className="new-quality-test-comments">
              <strong>COMENTARIOS</strong>
              <textarea value={draft.stressCracking.comments} onChange={(event) => updateStress('comments', event.target.value)} />
            </label>
          </div>
        </div>

        <div className="new-quality-test-section">
          <div className="new-quality-table-title">PRUEBA DE CAIDA</div>
          <div className="new-quality-fall-grid">
            <label className="new-quality-test-check">
              APLICA
              <input type="checkbox" checked={draft.fallTest.result === 'Aplica'} onChange={(event) => updateFallTest('result', event.target.checked ? 'Aplica' : '')} />
            </label>
            <label className="new-quality-test-check">
              NO APLICA
              <input type="checkbox" checked={draft.fallTest.result === 'No aplica'} onChange={(event) => updateFallTest('result', event.target.checked ? 'No aplica' : '')} />
            </label>
            <label className="new-quality-test-obs">
              <span>OBS</span>
              <textarea
                value={draft.fallTest.observations}
                onChange={(event) => updateFallTest('observations', event.target.value)}
                placeholder="Escribir observaciones"
              />
            </label>
          </div>
        </div>

        <div className="new-quality-visual-defects">
          <div className="new-quality-table-title">INSPECCION VISUAL (DEFECTOS)</div>
          {newQualityDefectLevels.map((level) => (
            <Fragment key={level.key}>
              <div className="new-quality-defect-label">{level.label}</div>
              <textarea
                value={draft.visualDefects?.[level.key] ?? ''}
                onChange={(event) => updateVisualDefect(level.key, event.target.value)}
                aria-label={`Defectos ${level.label}`}
              />
            </Fragment>
          ))}
        </div>

        <div className="new-quality-package-table-wrap">
          <table className="new-quality-package-table">
            <thead>
              <tr>
                <th rowSpan="2" className="vertical-heading">ITEM</th>
                <th rowSpan="2">N° EMPAQUE</th>
                <th colSpan="2">FICHA DE ID.</th>
                <th colSpan="3">PALLET DE MADERA</th>
                <th colSpan="3">SEPARADORES DE CARTON CORRUGADO</th>
                <th colSpan="3">BOLSA PLASTICA O FILL</th>
                <th colSpan="3">FLEJADO EXTERNO</th>
                <th colSpan="3">VoBo</th>
              </tr>
              <tr>
                <th className="vertical-heading">PRESENCIA</th>
                <th className="vertical-heading">AUSENCIA</th>
                <th className="vertical-heading">BUENO</th>
                <th className="vertical-heading">ACEPTABLE</th>
                <th className="vertical-heading">MALO</th>
                <th className="vertical-heading">BUENO</th>
                <th className="vertical-heading">ACEPTABLE</th>
                <th className="vertical-heading">MALO</th>
                <th className="vertical-heading">BUENO</th>
                <th className="vertical-heading">ACEPTABLE</th>
                <th className="vertical-heading">MALO</th>
                <th className="vertical-heading">2 UNID.</th>
                <th className="vertical-heading">3 UNID.</th>
                <th className="vertical-heading">4 UNID.</th>
                <th className="vertical-heading">ACEPTADO</th>
                <th className="vertical-heading">OBSERVADO</th>
                <th className="vertical-heading">RECHAZADO</th>
              </tr>
            </thead>
            <tbody>
              {draft.packageInspection.map((row, rowIndex) => (
                <tr key={row.item}>
                  <td>{row.item}</td>
                  <td><input type="text" value={row.packageNumber} onChange={(event) => updatePackageInspectionRow(rowIndex, 'packageNumber', event.target.value)} /></td>
                  {newQualityPackageCheckColumns.map((column) => (
                    <td key={`${row.item}-${column}`}>
                      <button
                        type="button"
                        className={`new-quality-table-check ${row.checks?.[column] ? 'checked' : ''}`}
                        onClick={() => togglePackageInspectionCheck(rowIndex, column)}
                        aria-label={`${column} item ${row.item}`}
                        aria-pressed={Boolean(row.checks?.[column])}
                      >
                        {row.checks?.[column] ? '✓' : ''}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="new-quality-defective-summary">
          <label>BOTELLAS DEFECTUOSAS:<input type="number" min="0" value={draft.defectiveBottles} onChange={(event) => updateDraft('defectiveBottles', event.target.value)} /><span>unidades</span></label>
          <label>PREFORMAS DEFECTUOSAS:<input type="number" min="0" value={draft.defectivePreforms} onChange={(event) => updateDraft('defectivePreforms', event.target.value)} /><span>unidades</span></label>
        </div>

        <div className="new-quality-shift-comments">
          <div className="new-quality-table-title">COMENTARIOS DE TURNO</div>
          <textarea
            value={draft.shiftComments}
            onChange={(event) => updateDraft('shiftComments', event.target.value)}
            aria-label="Comentarios de turno"
          />
          <div className="new-quality-quality-signature">
            <DigitalSignaturePad
              label="Sello/Firma de calidad"
              value={draft.qualitySealSignature}
              onChange={(value) => updateDraft('qualitySealSignature', value)}
              className="new-quality-signature-pad"
            />
          </div>
        </div>

        {draft.id && (
          <label className="new-quality-edit-reason">
            <span>Motivo del cambio *</span>
            <textarea
              value={draft.editReason ?? ''}
              onChange={(event) => updateDraft('editReason', event.target.value)}
              placeholder="Describa por que se modifica este registro"
              required
            />
          </label>
        )}

        <div className="blower-actions">
          <button type="button" className="primary-action" onClick={saveRecord} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : draft.id ? 'Mandar correccion' : 'Mandar registro'}
          </button>
          <button type="button" className="secondary-action" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
          <button type="button" className="secondary-action" onClick={() => setShowDatabase((currentValue) => !currentValue)}>
            {showDatabase ? 'Ocultar base de datos' : `Ver base de datos (${records.length})`}
          </button>
          <button type="button" className="secondary-action" onClick={refreshTestRecords}>Actualizar compartidos</button>
          <button type="button" className="secondary-action" onClick={resetDraft}>Limpiar</button>
          <NewQualityEvidenceCapture
            photos={draft.evidencePhotos}
            onChange={(photos) => updateDraft('evidencePhotos', photos)}
            userId={authUser?.userId ?? ''}
            sections={[{ key: 'pruebas', label: 'Pruebas' }]}
            compact
          />
        </div>
        {syncMessage && <p className="equipment-demo-note">{syncMessage}</p>}
      </article>

      {showDatabase && (
        <article className="blower-record-list">
          <div className="section-heading">
            <div><span>Registros guardados</span><h2>Base de datos pruebas</h2></div>
            <strong className="record-count">{records.length} registros</strong>
          </div>
          <div className="blower-excel-table-wrap">
            <table className="blower-excel-table">
              <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Maquina</th><th>Codigo SAI</th><th>Stress cracking</th><th>Prueba caida</th><th>Comentarios</th><th>Estado</th><th>Historial</th><th>Accion</th></tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.productionDate || '-'}</td>
                    <td>{record.createdBy || '-'}</td>
                    <td>{record.machine || '-'}</td>
                    <td>{record.saiCode || '-'}</td>
                    <td>{record.stressCracking.result || '-'}</td>
                    <td>{record.fallTest.result || '-'}</td>
                    <td className="wide-cell">{record.stressCracking.comments || record.stressCracking.observations || record.fallTest.observations || '-'}</td>
                    <td>
                      <span className={`quality-record-status status-${record.status || QUALITY_RECORD_STATUS.PENDING}`}>
                        {getQualityRecordStatusLabel(record.status)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="secondary-action certificate-action" onClick={() => openHistory(record)}>
                        Ver cambios
                      </button>
                    </td>
                    <td>
                      <div className="quality-record-row-actions">
                        <button type="button" className="secondary-action certificate-action" onClick={() => openRecord(record)}>Abrir</button>
                        {canReviewQualityRecord(authUser) && record.status === QUALITY_RECORD_STATUS.PENDING && (
                          <button type="button" className="secondary-action certificate-action" onClick={() => openReview(record)}>Revisar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
      <QualityRecordHistoryDialog
        record={historyRecord}
        events={historyEvents}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryRecord(null)}
      />
      <QualityRecordReviewDialog
        record={reviewRecord}
        comment={reviewComment}
        busy={reviewBusy}
        onCommentChange={setReviewComment}
        onReview={submitReview}
        onClose={() => {
          if (!reviewBusy) {
            setReviewRecord(null);
            setReviewComment('');
          }
        }}
      />
    </section>
  );
}

function BlowerVariableControlView({ records, setRecords, productionFormats = [], bottleFormats = [], masterFormats = [], authUser, onAudit }) {
  const [activeSheet, setActiveSheet] = useState('attributes');
  const [draft, setDraft] = useState(() => normalizeBlowerVariableRecord({ id: '', createdAt: '', updatedAt: '' }));
  const [variableDraft, setVariableDraft] = useState(() => createEmptyBlowerProcessVariableDraft());
  const [processVariableRecords, setProcessVariableRecords] = useState(loadBlowerProcessVariableRecords);
  const [showProcessDatabase, setShowProcessDatabase] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);
  const [databaseFilters, setDatabaseFilters] = useState({ dateFrom: '', dateTo: '', machine: '', format: '', search: '' });
  const [processDatabaseFilters, setProcessDatabaseFilters] = useState({ dateFrom: '', dateTo: '', machine: '', format: '', search: '' });
  const formatOptions = useMemo(() => getUnifiedFormatOptions(bottleFormats, productionFormats), [bottleFormats, productionFormats]);
  const filteredRecords = useMemo(() => {
    const cleanSearch = databaseFilters.search.trim().toLowerCase();

    return records
      .map(normalizeBlowerVariableRecord)
      .filter((record) => {
        const searchableText = [
          record.saiCode,
          record.productionDate,
          record.client,
          record.bottleOp,
          record.packageType,
          record.packageQuantity,
          record.format,
          record.machine,
          record.preformOp,
          record.gramColor,
          record.resin,
          ...blowerShiftKeys.flatMap((shiftKey) => {
            const shift = normalizeBlowerShift(record.shifts?.[shiftKey]);
            return [shift.qualityAuxiliary, shift.operator, shift.packageFrom, shift.packageTo];
          }),
        ].join(' ').toLowerCase();

        return (!databaseFilters.dateFrom || record.productionDate >= databaseFilters.dateFrom)
          && (!databaseFilters.dateTo || record.productionDate <= databaseFilters.dateTo)
          && (!databaseFilters.machine || record.machine === databaseFilters.machine)
          && (!databaseFilters.format || record.format === databaseFilters.format)
          && (!cleanSearch || searchableText.includes(cleanSearch));
      });
  }, [databaseFilters, records]);
  const savedFormatOptions = useMemo(() => (
    Array.from(new Set(records.map((record) => record.format).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [records]);
  const savedProcessFormatOptions = useMemo(() => (
    Array.from(new Set(processVariableRecords.map((record) => record.format).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [processVariableRecords]);
  const filteredProcessVariableRecords = useMemo(() => {
    const cleanSearch = processDatabaseFilters.search.trim().toLowerCase();

    return processVariableRecords
      .map(normalizeBlowerProcessVariableRecord)
      .filter((record) => {
        const searchableText = [
          record.saiCode,
          record.recordDate,
          record.machine,
          record.format,
          record.responsible,
          record.waterHardnessTime,
          record.waterHardnessValue,
          record.comments.first,
          record.comments.second,
          getFirstFilledBlowerGridValue(record.threadDiameters, blowerThreadDiameterRows, blowerThreadColumnKeys),
          getFirstFilledBlowerGridValue(record.bottleTemperatures, blowerBottleTemperatureRows, blowerTemperatureColumnKeys),
          getFirstFilledBlowerGridValue(record.processVariables, blowerProcessVariableRows, blowerProcessColumnKeys),
        ].join(' ').toLowerCase();

        return (!processDatabaseFilters.dateFrom || record.recordDate >= processDatabaseFilters.dateFrom)
          && (!processDatabaseFilters.dateTo || record.recordDate <= processDatabaseFilters.dateTo)
          && (!processDatabaseFilters.machine || record.machine === processDatabaseFilters.machine)
          && (!processDatabaseFilters.format || record.format === processDatabaseFilters.format)
          && (!cleanSearch || searchableText.includes(cleanSearch));
      });
  }, [processDatabaseFilters, processVariableRecords]);
  const attributeContext = useMemo(() => ({
    saiCode: draft.saiCode || '',
    recordDate: draft.productionDate || getToday(),
    machine: draft.machine || machines[0],
    format: draft.format || '',
    responsible: [
      draft.shifts?.first?.qualityAuxiliary,
      draft.shifts?.second?.qualityAuxiliary,
      draft.shifts?.third?.qualityAuxiliary,
    ].filter(Boolean).join(' / '),
  }), [draft.format, draft.machine, draft.productionDate, draft.saiCode, draft.shifts]);
  const selectedProcessTechnicalFormat = useMemo(() => {
    const reference = getSaiCodeReference(attributeContext.saiCode, masterFormats);

    if (hasTechnicalSpecs(reference?.technicalFormat)) {
      return reference.technicalFormat;
    }

    const selectedLabelKey = getFormatIdentityKey(attributeContext.format);

    if (!selectedLabelKey) {
      return null;
    }

    const selectedOption = formatOptions.find((format) => getFormatIdentityKey(format.label) === selectedLabelKey);
    const directTechnicalFormat = selectedOption?.technicalFormat
      || bottleFormats.find((format) => getFormatIdentityKey(getCanonicalFormatLabel(format, productionFormats)) === selectedLabelKey);

    if (hasTechnicalSpecs(directTechnicalFormat)) {
      return directTechnicalFormat;
    }

    if (isUnileverOla5LiterFormatLabel(attributeContext.format)) {
      const supabaseTechnicalFormat = bottleFormats.find((format) => (
        hasTechnicalSpecs(format)
        && formatIncludesUnileverOla5LiterReference(format, productionFormats)
      ));

      return supabaseTechnicalFormat || getFallbackTechnicalFormatForLabel(attributeContext.format);
    }

    return directTechnicalFormat
      || null;
  }, [attributeContext.format, attributeContext.saiCode, bottleFormats, formatOptions, masterFormats, productionFormats]);
  const safeVariableDraft = useMemo(() => normalizeBlowerProcessVariableRecord(variableDraft), [variableDraft]);

  useEffect(() => {
    saveBlowerProcessVariableRecords(processVariableRecords);
  }, [processVariableRecords]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const updateAttributePackageType = (option, checked) => {
    setDraft((currentDraft) => {
      const currentOptions = String(currentDraft.packageType ?? '')
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);
      const optionSet = new Set(currentOptions);

      if (checked) {
        optionSet.add(option);
      } else {
        optionSet.delete(option);
      }

      return {
        ...currentDraft,
        packageType: Array.from(optionSet).join(' / '),
      };
    });
  };

  const updateDatabaseFilter = (field, value) => {
    setDatabaseFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  };

  const clearDatabaseFilters = () => {
    setDatabaseFilters({ dateFrom: '', dateTo: '', machine: '', format: '', search: '' });
  };

  const updateVariableMeasurement = (rowKey, shiftKey, sampleIndex, value) => {
    const emptyMeasurements = createEmptyBlowerVariableMeasurements();

    setVariableDraft((currentDraft) => ({
      ...currentDraft,
      measurements: {
        ...emptyMeasurements,
        ...(currentDraft.measurements ?? {}),
        [rowKey]: {
          ...(currentDraft.measurements?.[rowKey] ?? emptyMeasurements[rowKey]),
          [shiftKey]: (currentDraft.measurements?.[rowKey]?.[shiftKey] ?? ['', '']).map((currentValue, index) => (
            index === sampleIndex ? value : currentValue
          )),
        },
      },
    }));
  };

  const clearVariableMeasurements = () => {
    setVariableDraft(createEmptyBlowerProcessVariableDraft());
  };

  const updateVariableDraft = (field, value) => {
    setVariableDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const updateSharedSaiCode = (value) => {
    const reference = getSaiCodeReference(value, masterFormats);

    setDraft((currentDraft) => ({
      ...currentDraft,
      saiCode: value,
      ...(reference ? {
        client: reference.client,
        format: reference.format,
        packageQuantity: reference.quantity,
        packageBag: reference.quantity,
        gramColor: getSaiGramColor(reference),
        resin: reference.resin,
      } : {}),
    }));
    setVariableDraft((currentDraft) => ({
      ...currentDraft,
      saiCode: value,
      ...(reference ? {
        format: reference.format,
      } : {}),
    }));
  };

  const updateProcessDatabaseFilter = (field, value) => {
    setProcessDatabaseFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  };

  const clearProcessDatabaseFilters = () => {
    setProcessDatabaseFilters({ dateFrom: '', dateTo: '', machine: '', format: '', search: '' });
  };

  const updateVariableGridValue = (gridName, rowKey, columnKey, value) => {
    setVariableDraft((currentDraft) => ({
      ...currentDraft,
      [gridName]: {
        ...(currentDraft[gridName] ?? {}),
        [rowKey]: {
          ...(currentDraft[gridName]?.[rowKey] ?? {}),
          [columnKey]: value,
        },
      },
    }));
  };

  const updateVariableComment = (shiftKey, value) => {
    setVariableDraft((currentDraft) => ({
      ...currentDraft,
      comments: {
        ...(currentDraft.comments ?? {}),
        [shiftKey]: value,
      },
    }));
  };

  const updateVariableSignature = (shiftKey, value) => {
    setVariableDraft((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...(currentDraft.signatures ?? {}),
        [shiftKey]: value,
      },
    }));
  };

  const handleVariableCellKeyDown = (event) => {
    const moves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];

    if (!move) {
      return;
    }

    const currentTarget = event.currentTarget;
    const section = currentTarget.dataset.blowerVariableNav;
    const row = Number(currentTarget.dataset.blowerVariableRow);
    const column = Number(currentTarget.dataset.blowerVariableCol);

    if (!section || Number.isNaN(row) || Number.isNaN(column)) {
      return;
    }

    const nextInput = document.querySelector(
      `[data-blower-variable-nav="${section}"][data-blower-variable-row="${row + move[0]}"][data-blower-variable-col="${column + move[1]}"]`,
    );

    if (nextInput) {
      event.preventDefault();
      nextInput.focus();
      nextInput.select?.();
    }
  };

  const updateShiftDraft = (shiftKey, field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      shifts: {
        ...currentDraft.shifts,
        [shiftKey]: {
          ...normalizeBlowerShift(currentDraft.shifts?.[shiftKey]),
          [field]: value,
        },
      },
    }));
  };

  const updateVisualInspectionHeader = (column, value) => {
    setDraft((currentDraft) => {
      const visualInspection = normalizeBlowerVisualInspection(currentDraft.visualInspection);
      const packagePalletNumbers = {
        ...visualInspection.packagePalletNumbers,
        [column]: value,
      };

      return {
        ...currentDraft,
        visualInspection: {
          ...visualInspection,
          packagePalletNumber: packagePalletNumbers[blowerVisualInspectionColumns[0]] ?? '',
          packagePalletNumbers,
        },
      };
    });
  };

  const updateVisualInspectionCell = (defectKey, column, value) => {
    setDraft((currentDraft) => {
      const visualInspection = normalizeBlowerVisualInspection(currentDraft.visualInspection);

      return {
        ...currentDraft,
        visualInspection: {
          ...visualInspection,
          entries: {
            ...visualInspection.entries,
            [defectKey]: {
              ...visualInspection.entries[defectKey],
              [column]: Boolean(value),
            },
          },
        },
      };
    });
  };

  const updateVisualInspectionOtherText = (defectKey, value) => {
    setDraft((currentDraft) => {
      const visualInspection = normalizeBlowerVisualInspection(currentDraft.visualInspection);

      return {
        ...currentDraft,
        visualInspection: {
          ...visualInspection,
          otherTexts: {
            ...visualInspection.otherTexts,
            [defectKey]: value,
          },
        },
      };
    });
  };

  const updatePresenceCheck = (rowKey, shiftKey, field, checked) => {
    setDraft((currentDraft) => {
      const presenceChecks = normalizeBlowerPresenceChecks(currentDraft.presenceChecks);

      return {
        ...currentDraft,
        presenceChecks: {
          ...presenceChecks,
          [rowKey]: {
            ...presenceChecks[rowKey],
            [shiftKey]: {
              presence: field === 'presence' ? checked : checked ? false : presenceChecks[rowKey][shiftKey].presence,
              absence: field === 'absence' ? checked : checked ? false : presenceChecks[rowKey][shiftKey].absence,
            },
          },
        },
      };
    });
  };

  const clearDraft = () => {
    setDraft(normalizeBlowerVariableRecord({ id: '', createdAt: '', updatedAt: '' }));
  };

  const openAttributeRecord = (record) => {
    setDraft(normalizeBlowerVariableRecord(record));
    setActiveSheet('attributes');
    setShowDatabase(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProcessVariableRecord = (record) => {
    const normalizedRecord = normalizeBlowerProcessVariableRecord(record);

    setVariableDraft(normalizedRecord);
    setDraft((currentDraft) => normalizeBlowerVariableRecord({
      ...currentDraft,
      saiCode: normalizedRecord.saiCode || currentDraft.saiCode,
      productionDate: normalizedRecord.recordDate || currentDraft.productionDate,
      machine: normalizedRecord.machine || currentDraft.machine,
      format: normalizedRecord.format || currentDraft.format,
    }));
    setActiveSheet('variable');
    setShowProcessDatabase(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveRecord = async () => {
    if (!draft.productionDate || !draft.format || !draft.machine) {
      window.alert('Ingrese fecha de produccion, formato y maquina.');
      return;
    }

    const isEditingRecord = Boolean(draft.id);
    const record = normalizeBlowerVariableRecord({
      ...draft,
      id: draft.id || crypto.randomUUID(),
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setRecords((currentRecords) => (
      isEditingRecord
        ? currentRecords.map((currentRecord) => (currentRecord.id === record.id ? record : currentRecord))
        : [record, ...currentRecords]
    ));
    clearDraft();
    await onAudit?.({
      action: isEditingRecord ? 'Actualizo registro control variables sopladora' : 'Registro control variables sopladora',
      area: 'Control de calidad',
      target: record.machine,
      detail: `${record.productionDate} / ${record.format}`,
      metadata: { recordId: record.id },
    });
  };

  const printCurrentDocument = () => {
    printBlowerVariableDocument(normalizeBlowerVariableRecord({
      ...draft,
      id: draft.id || 'preview',
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const exportBlowerDatabase = async () => {
    if (filteredRecords.length === 0) {
      window.alert('No hay registros para exportar con los filtros actuales.');
      return;
    }

    const texto = (fn) => (record) => ({ value: fn(record) ?? '', type: String });
    const columns = [
      { header: 'Fecha', cell: texto((record) => record.productionDate) },
      { header: 'Codigo SAI', cell: texto((record) => record.saiCode) },
      { header: 'Maquina', cell: texto((record) => record.machine) },
      { header: 'Formato', width: 34, cell: texto((record) => record.format) },
      { header: 'Cliente', cell: texto((record) => record.client) },
      { header: 'OP botella', cell: texto((record) => record.bottleOp) },
      { header: 'Tipo empaque', cell: texto((record) => record.packageType) },
      { header: 'Cant. empaque', cell: texto((record) => record.packageQuantity) },
      { header: 'Paquete bolsa', cell: texto((record) => record.packageBag) },
      { header: 'Pallet', cell: texto((record) => record.pallet) },
      { header: 'OP preforma', cell: texto((record) => record.preformOp) },
      { header: 'Gramaje - Color', cell: texto((record) => record.gramColor) },
      { header: 'Resina', cell: texto((record) => record.resin) },
      ...blowerShiftKeys.flatMap((shiftKey) => [
        { header: `${blowerShiftLabels[shiftKey]} auxiliar`, cell: texto((record) => record.shifts?.[shiftKey]?.qualityAuxiliary ?? '') },
        { header: `${blowerShiftLabels[shiftKey]} operador`, cell: texto((record) => record.shifts?.[shiftKey]?.operator ?? '') },
        { header: `${blowerShiftLabels[shiftKey]} empaque`, cell: texto((record) => {
          const shift = normalizeBlowerShift(record.shifts?.[shiftKey]);
          return `Del ${shift.packageFrom || '-'} al ${shift.packageTo || '-'}`;
        }) },
      ]),
      ...blowerPresenceCheckRows.map((row) => ({
        header: row.label,
        cell: texto((record) => blowerShiftKeys.map((shiftKey) => `${blowerShiftLabels[shiftKey]} ${getBlowerPresenceCheckText(record, row.key, shiftKey)}`).join(' / ')),
      })),
    ];

    await writeXlsxFile(filteredRecords, { columns }).toFile(`registro-control-variables-${getToday()}.xlsx`);
  };

  const saveProcessVariableRecord = async () => {
    if (!attributeContext.recordDate || !attributeContext.machine) {
      window.alert('Ingrese fecha y maquina en la pestana Atributos antes de guardar variable.');
      return;
    }

    const isEditingRecord = Boolean(variableDraft.id);
    const record = normalizeBlowerProcessVariableRecord({
      ...variableDraft,
      saiCode: attributeContext.saiCode,
      recordDate: attributeContext.recordDate,
      machine: attributeContext.machine,
      format: attributeContext.format,
      responsible: attributeContext.responsible,
      id: variableDraft.id || crypto.randomUUID(),
      createdAt: variableDraft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setProcessVariableRecords((currentRecords) => (
      isEditingRecord
        ? currentRecords.map((currentRecord) => (currentRecord.id === record.id ? record : currentRecord))
        : [record, ...currentRecords]
    ));
    clearVariableMeasurements();
    await onAudit?.({
      action: isEditingRecord ? 'Actualizo registro control de variable sopladora' : 'Registro control de variable sopladora',
      area: 'Control de calidad',
      target: record.machine,
      detail: `${record.recordDate} / ${record.format || 'Sin formato'}`,
      metadata: { recordId: record.id },
    });
  };

  const exportProcessVariableDatabase = async () => {
    if (filteredProcessVariableRecords.length === 0) {
      window.alert('No hay registros variables para exportar con los filtros actuales.');
      return;
    }

    const texto = (fn) => (record) => ({ value: fn(record) ?? '', type: String });
    const columns = [
      { header: 'Fecha', cell: texto((record) => record.recordDate) },
      { header: 'Codigo SAI', cell: texto((record) => record.saiCode) },
      { header: 'Maquina', cell: texto((record) => record.machine) },
      { header: 'Formato', width: 34, cell: texto((record) => record.format) },
      { header: 'Responsable', cell: texto((record) => record.responsible) },
      ...blowerVariableMeasurementRows.flatMap((row) => (
        blowerShiftKeys.flatMap((shiftKey) => [0, 1].map((sampleIndex) => ({
          header: `${row.label} ${blowerShiftLabels[shiftKey]} M${sampleIndex + 1}`,
          cell: texto((record) => record.measurements?.[row.key]?.[shiftKey]?.[sampleIndex] ?? ''),
        })))
      )),
      ...blowerThreadDiameterRows.flatMap((row) => (
        blowerThreadColumnKeys.map((column, index) => ({
          header: `${row.label} ${index + 1}`,
          cell: texto((record) => record.threadDiameters?.[row.key]?.[column] ?? ''),
        }))
      )),
      ...blowerBottleTemperatureRows.flatMap((row) => (
        blowerTemperatureColumnKeys.map((column, index) => ({
          header: `${row.label} ${index + 1}`,
          cell: texto((record) => record.bottleTemperatures?.[row.key]?.[column] ?? ''),
        }))
      )),
      ...blowerProcessVariableRows.flatMap((row) => (
        blowerProcessColumnKeys.map((column, index) => ({
          header: `${row.label} ${index + 1}`,
          cell: texto((record) => record.processVariables?.[row.key]?.[column] ?? ''),
        }))
      )),
      { header: 'Hora dureza agua', cell: texto((record) => record.waterHardnessTime) },
      { header: 'Dureza ppm CaCO3', cell: texto((record) => record.waterHardnessValue) },
      { header: 'Comentarios 1T', width: 38, cell: texto((record) => record.comments?.first ?? '') },
      { header: 'Comentarios 2T', width: 38, cell: texto((record) => record.comments?.second ?? '') },
      { header: 'Firma 1T', cell: texto((record) => (record.signatures?.first ? 'Firmado' : 'Pendiente')) },
      { header: 'Firma 2T', cell: texto((record) => (record.signatures?.second ? 'Firmado' : 'Pendiente')) },
    ];

    await writeXlsxFile(filteredProcessVariableRecords, { columns }).toFile(`registro-variable-sopladora-${getToday()}.xlsx`);
  };

  return (
    <section className="blower-control-section">
      <div className="blower-subtabs-row">
        <div className="blower-subtabs" role="tablist" aria-label="Tipo de registro">
          <button
            type="button"
            role="tab"
            aria-selected={activeSheet === 'attributes'}
            className={activeSheet === 'attributes' ? 'active' : ''}
            onClick={() => setActiveSheet('attributes')}
          >
            Atributos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSheet === 'variable'}
            className={activeSheet === 'variable' ? 'active' : ''}
            onClick={() => setActiveSheet('variable')}
          >
            Variable
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSheet === 'finished'}
            className={activeSheet === 'finished' ? 'active' : ''}
            onClick={() => setActiveSheet('finished')}
          >
            Producto terminado
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSheet === 'new'}
            className={activeSheet === 'new' ? 'active' : ''}
            onClick={() => setActiveSheet('new')}
          >
            Nuevo registro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSheet === 'tests'}
            className={activeSheet === 'tests' ? 'active' : ''}
            onClick={() => setActiveSheet('tests')}
          >
            Pruebas
          </button>
        </div>
        <label className="blower-sai-code-field">
          <span>Codigo SAI</span>
          <input
            type="text"
            value={draft.saiCode ?? ''}
            onChange={(event) => updateSharedSaiCode(event.target.value)}
            placeholder="Ej. SAI-0000"
          />
        </label>
      </div>

      {activeSheet === 'tests' ? (
        <NewQualityTestsRecordView
          sharedSaiCode={draft.saiCode ?? ''}
          onSharedSaiCodeChange={updateSharedSaiCode}
          authUser={authUser}
          onAudit={onAudit}
        />
      ) : activeSheet === 'new' ? (
        <NewQualityInspectionRecordView
          sharedSaiCode={draft.saiCode ?? ''}
          onSharedSaiCodeChange={updateSharedSaiCode}
          authUser={authUser}
          bottleFormats={bottleFormats}
          productionFormats={productionFormats}
          masterFormats={masterFormats}
          onAudit={onAudit}
        />
      ) : activeSheet === 'attributes' ? (
      <article className="blower-sheet">
        <div className="blower-grid-bg" aria-hidden="true" />
        <header className="blower-sheet-header">
          <div className="blower-logo-block">
            <img src="/logos/logo-empacar.png" alt="EMPACAR" />
          </div>
          <h3>Registro de control variables - atributos de botellas PET maquina sopladora</h3>
          <div className="blower-code-block">
            <strong>REG-LAS-01-Rev.02</strong>
            <span>REVISION: 05-04-2018</span>
            <span>PAGINA 1 de 4</span>
          </div>
        </header>

        <div className="blower-form-grid">
          <div className="blower-form-block production">
            <div className="blower-block-title">DATOS DE PRODUCCION - BOTELLA</div>
            <div className="blower-two-column">
              <label><span>Fecha produccion:</span><input type="date" value={draft.productionDate} onChange={(event) => updateDraft('productionDate', event.target.value)} /></label>
              <label><span>Cliente:</span><input type="text" value={draft.client} onChange={(event) => updateDraft('client', event.target.value)} /></label>
              <label><span>OP-botella:</span><input type="text" value={draft.bottleOp} onChange={(event) => updateDraft('bottleOp', event.target.value)} /></label>
              <div className="blower-package-row">
                <span>Tipo empaque:</span>
                <label className="blower-package-check">
                  <input
                    type="checkbox"
                    checked={String(draft.packageType ?? '').includes('Paquete (bolsa)')}
                    onChange={(event) => updateAttributePackageType('Paquete (bolsa)', event.target.checked)}
                  />
                  Paquete (bolsa)
                </label>
                <label className="blower-package-check">
                  <input
                    type="checkbox"
                    checked={String(draft.packageType ?? '').includes('Pallet')}
                    onChange={(event) => updateAttributePackageType('Pallet', event.target.checked)}
                  />
                  Pallet
                </label>
              </div>
              <div className="blower-format-row">
                <span>Formato:</span>
                <SearchableSelect
                  value={draft.format}
                  options={formatOptions.map((format) => ({ value: format.label, label: format.label }))}
                  onChange={(value) => updateDraft('format', value)}
                  placeholder="Seleccionar formato"
                />
              </div>
              <div className="blower-quantity-row">
                <span>Paquete (bolsa)</span>
                <input type="number" min="0" value={draft.packageBag} onChange={(event) => updateDraft('packageBag', event.target.value)} />
                <b>Unid.</b>
              </div>
              <label><span>Maquina:</span><select value={draft.machine} onChange={(event) => updateDraft('machine', event.target.value)}>{machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}</select></label>
              <div className="blower-quantity-row">
                <span>Pallet</span>
                <input type="number" min="0" value={draft.pallet} onChange={(event) => updateDraft('pallet', event.target.value)} />
                <b>Unid.</b>
              </div>
            </div>
          </div>

          <div className="blower-form-block reference">
            <div className="blower-block-title">DATOS DE REFERENCIA</div>
            <label><span>OP-preforma:</span><input type="text" value={draft.preformOp} onChange={(event) => updateDraft('preformOp', event.target.value)} /></label>
            <label><span>Gramaje - Color:</span><input type="text" value={draft.gramColor} onChange={(event) => updateDraft('gramColor', event.target.value)} /></label>
            <label>
              <span>Resina:</span>
              <select value={draft.resin} onChange={(event) => updateDraft('resin', event.target.value)}>
                <option value="">Seleccionar resina</option>
                {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="blower-shift-table" aria-label="Datos por turno">
          <div className="blower-shift-label-spacer" />
          {blowerShiftKeys.map((shiftKey) => (
            <div className="blower-shift-title" key={shiftKey}>{blowerShiftLabels[shiftKey]}</div>
          ))}

          <div className="blower-shift-row-label">Auxiliar de Calidad:</div>
          {blowerShiftKeys.map((shiftKey) => (
            <input
              key={`${shiftKey}-qualityAuxiliary`}
              type="text"
              value={draft.shifts?.[shiftKey]?.qualityAuxiliary ?? ''}
              onChange={(event) => updateShiftDraft(shiftKey, 'qualityAuxiliary', event.target.value)}
            />
          ))}

          <div className="blower-shift-row-label">Operador:</div>
          {blowerShiftKeys.map((shiftKey) => (
            <select
              key={`${shiftKey}-operator`}
              value={draft.shifts?.[shiftKey]?.operator ?? ''}
              onChange={(event) => updateShiftDraft(shiftKey, 'operator', event.target.value)}
            >
              <option value="">Seleccionar operador</option>
              {operatorOptions.map((operator) => (
                <option key={operator} value={operator}>{operator}</option>
              ))}
            </select>
          ))}

          <div className="blower-shift-row-label">N° Empaque producido</div>
          {blowerShiftKeys.map((shiftKey) => (
            <div className="blower-shift-package-range" key={`${shiftKey}-package-range`}>
              <span>Del</span>
              <input
                type="text"
                value={draft.shifts?.[shiftKey]?.packageFrom ?? ''}
                onChange={(event) => updateShiftDraft(shiftKey, 'packageFrom', event.target.value)}
              />
              <span>al</span>
              <input
                type="text"
                value={draft.shifts?.[shiftKey]?.packageTo ?? ''}
                onChange={(event) => updateShiftDraft(shiftKey, 'packageTo', event.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="blower-visual-inspection">
          <div className="blower-visual-title">INSPECCION VISUAL</div>
          <div className="blower-visual-top-row">
            <span># DE BOLSA/PALLET</span>
            {blowerVisualInspectionColumns.map((column, index) => (
              <input
                key={`package-${column}`}
                type="text"
                aria-label={`Bolsa o pallet ${index + 1}`}
                value={normalizeBlowerVisualInspection(draft.visualInspection).packagePalletNumbers?.[column] ?? ''}
                onChange={(event) => updateVisualInspectionHeader(column, event.target.value)}
              />
            ))}
          </div>
          <div className="blower-defect-table">
            <div className="blower-defect-side-label">DEFECTOS</div>
            <div className="blower-defect-content">
              {blowerVisualDefectGroups.map((group) => (
                <div className="blower-defect-group" key={group.key}>
                  <div className="blower-defect-group-title">{group.title}</div>
                  {group.defects.map((defect) => {
                    const defectKey = getBlowerVisualDefectKey(group.key, defect);

                    return (
                      <div className="blower-defect-row" key={defectKey}>
                        <span className={defect === 'Otros' ? 'blower-defect-other-label' : ''}>
                          {defect}
                          {defect === 'Otros' && (
                            <input
                              type="text"
                              value={draft.visualInspection?.otherTexts?.[defectKey] ?? ''}
                              onChange={(event) => updateVisualInspectionOtherText(defectKey, event.target.value)}
                              placeholder="Especificar"
                              aria-label={`Especificar otros defectos ${group.title}`}
                            />
                          )}
                        </span>
                        {blowerVisualInspectionColumns.map((column) => (
                          <button
                            key={`${defectKey}-${column}`}
                            type="button"
                            className={`blower-defect-check ${draft.visualInspection?.entries?.[defectKey]?.[column] ? 'checked' : ''}`}
                            onClick={() => updateVisualInspectionCell(defectKey, column, !draft.visualInspection?.entries?.[defectKey]?.[column])}
                            aria-label={`${defect} ${column}`}
                            aria-pressed={Boolean(draft.visualInspection?.entries?.[defectKey]?.[column])}
                          >
                            {draft.visualInspection?.entries?.[defectKey]?.[column] ? '✓' : ''}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="blower-presence-table" aria-label="Verificaciones finales">
          {blowerPresenceCheckRows.map((row) => (
            <div className="blower-presence-row" key={row.key}>
              <span>{row.label}</span>
              {blowerShiftKeys.map((shiftKey) => (
                <div className="blower-presence-options" key={`${row.key}-${shiftKey}`}>
                  <label>
                    Presencia
                    <input
                      type="checkbox"
                      checked={Boolean(draft.presenceChecks?.[row.key]?.[shiftKey]?.presence)}
                      onChange={(event) => updatePresenceCheck(row.key, shiftKey, 'presence', event.target.checked)}
                    />
                  </label>
                  <label>
                    Ausencia
                    <input
                      type="checkbox"
                      checked={Boolean(draft.presenceChecks?.[row.key]?.[shiftKey]?.absence)}
                      onChange={(event) => updatePresenceCheck(row.key, shiftKey, 'absence', event.target.checked)}
                    />
                  </label>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="blower-actions">
          <button type="button" className="primary-action" onClick={saveRecord}>{draft.id ? 'Actualizar documento' : 'Guardar documento'}</button>
          <button type="button" className="secondary-action" onClick={printCurrentDocument}>Imprimir / Guardar PDF</button>
          <button type="button" className="secondary-action" onClick={clearDraft}>Limpiar</button>
        </div>
      </article>
      ) : activeSheet === 'variable' ? (
      <article className="blower-sheet">
        <div className="blower-grid-bg" aria-hidden="true" />
        <header className="blower-sheet-header blower-variable-header">
          <div className="blower-logo-block">
            <img src="/logos/logo-empacar.png" alt="EMPACAR" />
          </div>
          <h3>Registro de control variables - atributos de botellas PET maquina sopladora</h3>
          <div className="blower-code-block">
            <strong>REG-LAS-01-Rev.02</strong>
            <span>REVISION: 05-04-2018</span>
            <span>PAGINA 1 de 2</span>
          </div>
        </header>

        {!attributeContext.format && (
          <div className="blower-variable-spec-alert">
            Seleccione el formato en la pestana Atributos para activar tolerancias en Control de variable.
          </div>
        )}
        {attributeContext.format && !hasTechnicalSpecs(selectedProcessTechnicalFormat) && (
          <div className="blower-variable-spec-alert">
            El formato seleccionado en Atributos aun no tiene especificacion tecnica enlazada. Las tolerancias apareceran cuando se registre su ficha tecnica.
          </div>
        )}

        <div className="blower-variable-table" aria-label="Control de variable">
          <div className="blower-variable-title">CONTROL DE VARIABLE</div>
          {blowerShiftKeys.map((shiftKey) => (
            <div className="blower-variable-shift-title" key={shiftKey}>{blowerShiftLabels[shiftKey]}</div>
          ))}

          {blowerVariableMeasurementRows.map((row, rowIndex) => {
            const previousRow = blowerVariableMeasurementRows[rowIndex - 1];
            const nextRow = blowerVariableMeasurementRows[rowIndex + 1];
            const startsDimensions = row.group === 'dimensions' && previousRow?.group !== 'dimensions';
            const startsThickness = row.group === 'thickness' && previousRow?.group !== 'thickness';
            const continuesGroupedSide = (row.group === 'dimensions' || row.group === 'thickness')
              && previousRow?.group === row.group;
            const endsGroupedSide = (row.group === 'dimensions' || row.group === 'thickness')
              && nextRow?.group !== row.group;
            const rowSpec = row.specKey ? selectedProcessTechnicalFormat?.specs?.[row.specKey] : null;
            const rowLimitText = getBlowerVariableLimitText(rowSpec);

            return (
              <Fragment key={row.key}>
                <div className={`blower-variable-label ${row.group === 'control' ? 'plain' : ''} ${continuesGroupedSide ? 'grouped-continuation' : ''} ${endsGroupedSide ? 'grouped-end' : ''}`}>
                  {startsDimensions && <span className="blower-variable-side-label dimensions">DIMENSIONES</span>}
                  {startsThickness && <span className="blower-variable-side-label thickness">ESPESORES</span>}
                  <span>
                    {row.label}
                    {rowLimitText && <small>{rowLimitText}</small>}
                  </span>
                </div>
                {blowerShiftKeys.map((shiftKey, shiftIndex) => (
                  <div className="blower-variable-cells" key={`${row.key}-${shiftKey}`}>
                    {[0, 1].map((sampleIndex) => {
                      const value = safeVariableDraft.measurements[row.key]?.[shiftKey]?.[sampleIndex] ?? '';
                      const status = getBlowerVariableLimitStatus(value, rowSpec);

                      return (
                        <input
                          key={`${row.key}-${shiftKey}-${sampleIndex}`}
                          className={status !== 'pending' ? `validation-${status}` : ''}
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={value}
                          onChange={(event) => updateVariableMeasurement(row.key, shiftKey, sampleIndex, event.target.value)}
                          onKeyDown={handleVariableCellKeyDown}
                          data-blower-variable-nav="measurements"
                          data-blower-variable-row={rowIndex}
                          data-blower-variable-col={(shiftIndex * 2) + sampleIndex}
                          aria-label={`${row.label} ${blowerShiftLabels[shiftKey]} muestra ${sampleIndex + 1}`}
                          title={rowLimitText ? `${rowLimitText} - ${getValidationLabel(status)}` : ''}
                        />
                      );
                    })}
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>

        <div className="blower-process-continuation">
          <div className="blower-process-section">
            <div className="blower-process-title">VERIFICACION DE DIAMETROS EN LA ROSCA - CON CALIBRE PASA-NO PASA (SI/NO)</div>
            <div className="blower-process-grid diameter-grid">
              {blowerThreadDiameterRows.map((row, rowIndex) => (
                <Fragment key={row.key}>
                  <div className="blower-process-label">{row.label}</div>
                  {blowerThreadColumnKeys.map((column, columnIndex) => (
                    <input
                      key={`${row.key}-${column}`}
                      type="text"
                      value={safeVariableDraft.threadDiameters[row.key]?.[column] ?? ''}
                      onChange={(event) => updateVariableGridValue('threadDiameters', row.key, column, event.target.value)}
                      onKeyDown={handleVariableCellKeyDown}
                      data-blower-variable-nav="threadDiameters"
                      data-blower-variable-row={rowIndex}
                      data-blower-variable-col={columnIndex}
                      aria-label={`${row.label} ${column}`}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="blower-process-section">
            <div className="blower-process-title">CONTROL DE TEMPERATURA DE BOTELLA A LA SALIDA DE MAQUINA DE PRODUCCION</div>
            <div className="blower-process-grid temperature-grid">
              {blowerBottleTemperatureRows.map((row, rowIndex) => (
                <Fragment key={row.key}>
                  <div className="blower-process-label">
                    {row.label}
                    {row.max && <small>Max {row.max}</small>}
                  </div>
                  {blowerTemperatureColumnKeys.map((column, columnIndex) => {
                    const value = row.key === 'controlTime'
                      ? normalizeTimeMinuteValue(safeVariableDraft.bottleTemperatures[row.key]?.[column])
                      : safeVariableDraft.bottleTemperatures[row.key]?.[column] ?? '';
                    const status = row.max ? getBlowerVariableLimitStatus(value, { max: row.max }) : 'pending';

                    return (
                      <input
                        key={`${row.key}-${column}`}
                        className={status !== 'pending' ? `validation-${status}` : ''}
                        type={row.key === 'controlTime' ? 'time' : 'number'}
                        step={row.key === 'controlTime' ? 60 : '0.01'}
                        value={value}
                        onChange={(event) => updateVariableGridValue(
                          'bottleTemperatures',
                          row.key,
                          column,
                          row.key === 'controlTime' ? normalizeTimeMinuteValue(event.target.value) : event.target.value,
                        )}
                        onKeyDown={handleVariableCellKeyDown}
                        data-blower-variable-nav="bottleTemperatures"
                        data-blower-variable-row={rowIndex}
                        data-blower-variable-col={columnIndex}
                        aria-label={`${row.label} ${column}`}
                        title={row.max ? `Max ${row.max} - ${getValidationLabel(status)}` : ''}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className="blower-process-note">
              <b>Nota:</b>
              <span>Temperatura de la rosca max. 50C</span>
              <span>Temperatura en el punto de inyeccion max. 60C</span>
            </div>
          </div>

          <div className="blower-process-section">
            <div className="blower-process-title">CONTROL DE VARIABLES DE PROCESO</div>
            <div className="blower-process-split">
              <div className="blower-process-grid process-grid">
                {blowerProcessVariableRows.map((row, rowIndex) => (
                  <Fragment key={row.key}>
                    <div className="blower-process-label">{row.label}</div>
                    {blowerProcessColumnKeys.map((column, columnIndex) => {
                      const value = row.key === 'controlTime'
                        ? normalizeTimeMinuteValue(safeVariableDraft.processVariables[row.key]?.[column])
                        : safeVariableDraft.processVariables[row.key]?.[column] ?? '';

                      return (
                        <input
                          key={`${row.key}-${column}`}
                          type={row.key === 'controlTime' ? 'time' : 'number'}
                          step={row.key === 'controlTime' ? 60 : '0.01'}
                          value={value}
                          onChange={(event) => updateVariableGridValue(
                            'processVariables',
                            row.key,
                            column,
                            row.key === 'controlTime' ? normalizeTimeMinuteValue(event.target.value) : event.target.value,
                          )}
                          onKeyDown={handleVariableCellKeyDown}
                          data-blower-variable-nav="processVariables"
                          data-blower-variable-row={rowIndex}
                          data-blower-variable-col={columnIndex}
                          aria-label={`${row.label} ${column}`}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <div className="blower-process-note compact">
                <b>Nota:</b>
                <span>Temperatura del agua refrigerante entre 8 y 14C.</span>
                <span>Presion PRESOPLADO segun formato.</span>
                <span>Presion SOPLADO segun equipo y formato.</span>
              </div>
            </div>
            <div className="blower-hardness-row">
              <strong>DUREZA DE AGUA DE PROCESO</strong>
              <label>Hora:<input type="time" step="60" value={normalizeTimeMinuteValue(safeVariableDraft.waterHardnessTime)} onChange={(event) => updateVariableDraft('waterHardnessTime', normalizeTimeMinuteValue(event.target.value))} onKeyDown={handleVariableCellKeyDown} data-blower-variable-nav="waterHardness" data-blower-variable-row={0} data-blower-variable-col={0} /></label>
              <label>Dureza (ppm CaCO3) =<input type="number" step="0.01" value={safeVariableDraft.waterHardnessValue} onChange={(event) => updateVariableDraft('waterHardnessValue', event.target.value)} onKeyDown={handleVariableCellKeyDown} data-blower-variable-nav="waterHardness" data-blower-variable-row={0} data-blower-variable-col={1} /></label>
            </div>
          </div>

          <div className="blower-process-section">
            <div className="blower-process-title">COMENTARIOS DE TURNO</div>
            <div className="blower-comment-grid">
              {blowerCommentShiftKeys.map((shiftKey) => (
                <Fragment key={shiftKey}>
                  <strong>{shiftKey === 'first' ? '1T' : '2T'}</strong>
                  <textarea
                    value={safeVariableDraft.comments[shiftKey] ?? ''}
                    onChange={(event) => updateVariableComment(shiftKey, event.target.value)}
                    aria-label={`Comentarios ${shiftKey === 'first' ? 'primer' : 'segundo'} turno`}
                  />
                  <DigitalSignaturePad
                    label={`Firma ${shiftKey === 'first' ? '1T' : '2T'}`}
                    value={safeVariableDraft.signatures?.[shiftKey] ?? ''}
                    onChange={(value) => updateVariableSignature(shiftKey, value)}
                    className="blower-comment-signature"
                  />
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="blower-actions">
          <button type="button" className="primary-action" onClick={saveProcessVariableRecord}>{variableDraft.id ? 'Actualizar variable' : 'Guardar variable'}</button>
          <button type="button" className="secondary-action" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
          <button type="button" className="secondary-action" onClick={clearVariableMeasurements}>Limpiar variable</button>
        </div>
      </article>
      ) : (
        <FinishedPackageInspectionView
          productionFormats={productionFormats}
          bottleFormats={bottleFormats}
          masterFormats={masterFormats}
          sharedSaiCode={draft.saiCode ?? ''}
          onSharedSaiCodeChange={updateSharedSaiCode}
          onAudit={onAudit}
        />
      )}

      {activeSheet === 'attributes' && (
      <>
        <div className="blower-database-toggle">
        <button type="button" className="secondary-action" onClick={() => setShowDatabase((currentValue) => !currentValue)}>
          {showDatabase ? 'Ocultar base de datos' : `Ver base de datos (${records.length})`}
        </button>
        </div>

        {showDatabase && (
      <article className="blower-record-list">
        <div className="section-heading">
          <div>
            <span>Registros guardados</span>
            <h2>Base de datos del registro</h2>
          </div>
          <strong className="record-count">{filteredRecords.length}/{records.length} visibles</strong>
        </div>

        <div className="blower-database-filters">
          <label className="field"><span>Desde</span><input type="date" value={databaseFilters.dateFrom} onChange={(event) => updateDatabaseFilter('dateFrom', event.target.value)} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={databaseFilters.dateTo} onChange={(event) => updateDatabaseFilter('dateTo', event.target.value)} /></label>
          <label className="field">
            <span>Maquina</span>
            <select value={databaseFilters.machine} onChange={(event) => updateDatabaseFilter('machine', event.target.value)}>
              <option value="">Todas</option>
              {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Formato</span>
            <select value={databaseFilters.format} onChange={(event) => updateDatabaseFilter('format', event.target.value)}>
              <option value="">Todos</option>
              {savedFormatOptions.map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </label>
          <label className="field field-wide"><span>Buscar</span><input type="search" value={databaseFilters.search} onChange={(event) => updateDatabaseFilter('search', event.target.value)} placeholder="Cliente, OP, resina, operador..." /></label>
          <div className="blower-database-filter-actions">
            <button type="button" className="secondary-action" onClick={clearDatabaseFilters}>Limpiar filtros</button>
            <button type="button" className="primary-action" onClick={exportBlowerDatabase}>Exportar Excel</button>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="mold-placeholder">Aun no hay registros guardados.</div>
        ) : filteredRecords.length === 0 ? (
          <div className="mold-placeholder">No hay registros con esos filtros.</div>
        ) : (
          <div className="blower-excel-table-wrap">
            <table className="blower-excel-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Codigo SAI</th>
                  <th>Maquina</th>
                  <th>Formato</th>
                  <th>Cliente</th>
                  <th>OP botella</th>
                  <th>Tipo empaque</th>
                  <th>Cant.</th>
                  <th>Paquete bolsa</th>
                  <th>Pallet</th>
                  <th>OP preforma</th>
                  <th>Gramaje - Color</th>
                  <th>Resina</th>
                  {blowerShiftKeys.map((shiftKey) => <th key={`${shiftKey}-operator`}>{blowerShiftLabels[shiftKey]} operador</th>)}
                  {blowerPresenceCheckRows.map((row) => <th key={row.key}>{row.label}</th>)}
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{record.productionDate || '-'}</td>
                    <td>{record.saiCode || '-'}</td>
                    <td>{record.machine || '-'}</td>
                    <td className="wide-cell">{record.format || '-'}</td>
                    <td>{record.client || '-'}</td>
                    <td>{record.bottleOp || '-'}</td>
                    <td>{record.packageType || '-'}</td>
                    <td>{record.packageQuantity || '-'}</td>
                    <td>{record.packageBag || '-'}</td>
                    <td>{record.pallet || '-'}</td>
                    <td>{record.preformOp || '-'}</td>
                    <td>{record.gramColor || '-'}</td>
                    <td>{record.resin || '-'}</td>
                    {blowerShiftKeys.map((shiftKey) => {
                      const shift = normalizeBlowerShift(record.shifts?.[shiftKey]);

                      return (
                        <td key={`${record.id}-${shiftKey}`}>
                          <b>{shift.operator || '-'}</b>
                          <small>{shift.qualityAuxiliary || '-'}</small>
                          <small>Emp. {shift.packageFrom || '-'} al {shift.packageTo || '-'}</small>
                        </td>
                      );
                    })}
                    {blowerPresenceCheckRows.map((row) => (
                      <td key={`${record.id}-${row.key}`}>
                        {blowerShiftKeys.map((shiftKey) => (
                          <small key={`${record.id}-${row.key}-${shiftKey}`}>{blowerShiftLabels[shiftKey]} {getBlowerPresenceCheckText(record, row.key, shiftKey)}</small>
                        ))}
                      </td>
                    ))}
                    <td>
                      <button type="button" className="secondary-action certificate-action" onClick={() => openAttributeRecord(record)}>
                        Abrir / editar
                      </button>
                      <button type="button" className="secondary-action certificate-action" onClick={() => printBlowerVariableDocument(record)}>
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
        )}
      </>
      )}

      {activeSheet === 'variable' && (
      <>
        <div className="blower-database-toggle">
          <button type="button" className="secondary-action" onClick={() => setShowProcessDatabase((currentValue) => !currentValue)}>
            {showProcessDatabase ? 'Ocultar base de datos variable' : `Ver base de datos variable (${processVariableRecords.length})`}
          </button>
        </div>

        {showProcessDatabase && (
        <article className="blower-record-list">
          <div className="section-heading">
            <div>
              <span>Registros guardados</span>
              <h2>Base de datos variable</h2>
            </div>
            <strong className="record-count">{filteredProcessVariableRecords.length}/{processVariableRecords.length} visibles</strong>
          </div>

          <div className="blower-database-filters">
            <label className="field"><span>Desde</span><input type="date" value={processDatabaseFilters.dateFrom} onChange={(event) => updateProcessDatabaseFilter('dateFrom', event.target.value)} /></label>
            <label className="field"><span>Hasta</span><input type="date" value={processDatabaseFilters.dateTo} onChange={(event) => updateProcessDatabaseFilter('dateTo', event.target.value)} /></label>
            <label className="field">
              <span>Maquina</span>
              <select value={processDatabaseFilters.machine} onChange={(event) => updateProcessDatabaseFilter('machine', event.target.value)}>
                <option value="">Todas</option>
                {machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Formato</span>
              <select value={processDatabaseFilters.format} onChange={(event) => updateProcessDatabaseFilter('format', event.target.value)}>
                <option value="">Todos</option>
                {savedProcessFormatOptions.map((format) => <option key={format} value={format}>{format}</option>)}
              </select>
            </label>
            <label className="field field-wide"><span>Buscar</span><input type="search" value={processDatabaseFilters.search} onChange={(event) => updateProcessDatabaseFilter('search', event.target.value)} placeholder="Responsable, formato, comentarios..." /></label>
            <div className="blower-database-filter-actions">
              <button type="button" className="secondary-action" onClick={clearProcessDatabaseFilters}>Limpiar filtros</button>
              <button type="button" className="primary-action" onClick={exportProcessVariableDatabase}>Exportar Excel</button>
            </div>
          </div>

          {processVariableRecords.length === 0 ? (
            <div className="mold-placeholder">Aun no hay registros variables guardados.</div>
          ) : filteredProcessVariableRecords.length === 0 ? (
            <div className="mold-placeholder">No hay registros variables con esos filtros.</div>
          ) : (
            <div className="blower-excel-table-wrap">
              <table className="blower-excel-table blower-variable-database-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Codigo SAI</th>
                    <th>Maquina</th>
                    <th>Formato</th>
                    <th>Responsable</th>
                    <th>Primer peso</th>
                    <th>Primera rosca</th>
                    <th>Primera temperatura</th>
                    <th>Proceso</th>
                    <th>Dureza agua</th>
                    <th>Comentarios</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProcessVariableRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{record.recordDate || '-'}</td>
                      <td>{record.saiCode || '-'}</td>
                      <td>{record.machine || '-'}</td>
                      <td className="wide-cell">{record.format || '-'}</td>
                      <td>{record.responsible || '-'}</td>
                      <td>{record.measurements.emptyBottleWeight?.first?.[0] || '-'}</td>
                      <td>{getFirstFilledBlowerGridValue(record.threadDiameters, blowerThreadDiameterRows, blowerThreadColumnKeys) || '-'}</td>
                      <td>{getFirstFilledBlowerGridValue(record.bottleTemperatures, blowerBottleTemperatureRows, blowerTemperatureColumnKeys) || '-'}</td>
                      <td>{getFirstFilledBlowerGridValue(record.processVariables, blowerProcessVariableRows, blowerProcessColumnKeys) || '-'}</td>
                      <td>{record.waterHardnessValue ? `${record.waterHardnessValue} ppm` : '-'}{record.waterHardnessTime ? <small>{record.waterHardnessTime}</small> : null}</td>
                      <td className="wide-cell">
                        <b>1T</b>
                        <small>{record.comments.first || '-'}</small>
                        <b>2T</b>
                        <small>{record.comments.second || '-'}</small>
                      </td>
                      <td>
                        <button type="button" className="secondary-action certificate-action" onClick={() => openProcessVariableRecord(record)}>
                          Abrir / editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
        )}
      </>
      )}
    </section>
  );
}

const finishedPackageInspectionRows = Array.from({ length: 13 }, (_, index) => index + 1);
const finishedPackageCheckColumns = [
  'fichaPresencia',
  'fichaAusencia',
  'fichaBueno',
  'palletAceptable',
  'palletMalo',
  'separadorBueno',
  'separadorAceptable',
  'separadorMalo',
  'soporteBueno',
  'soporteAceptable',
  'soporteMalo',
  'bolsaBueno',
  'bolsaAceptable',
  'bolsaMalo',
  'flejado2',
  'flejado4',
  'voboAceptado',
  'voboObsEnvase',
  'voboRechazado',
];

function createEmptyFinishedPackageInspectionDraft() {
  return {
    id: '',
    saiCode: '',
    productionDate: getToday(),
    client: '',
    bottleOp: '',
    packageType: '',
    format: '',
    shift: '',
    qualityAuxiliary: '',
    preformOp: '',
    gramColor: '',
    resin: '',
    operator: '',
    rows: finishedPackageInspectionRows.map((item) => ({
      item,
      packageNumber: '',
      packageQuantity: '',
      checks: finishedPackageCheckColumns.reduce((checks, column) => ({ ...checks, [column]: false }), {}),
    })),
    footer: {
      palletPackageNumber: '',
      palletQuantity: '',
      separatorPackageNumber: '',
      separatorQuantity: '',
      bagPackageNumber: '',
      bagQuantity: '',
    },
    observations: '',
    signatureDataUrl: '',
    createdAt: '',
    updatedAt: '',
  };
}

function normalizeFinishedPackageInspectionRecord(record = {}) {
  const emptyDraft = createEmptyFinishedPackageInspectionDraft();
  const rows = finishedPackageInspectionRows.map((item, index) => {
    const currentRow = record.rows?.[index] ?? {};

    return {
      item,
      packageNumber: currentRow.packageNumber ?? '',
      packageQuantity: currentRow.packageQuantity ?? '',
      checks: finishedPackageCheckColumns.reduce((checks, column) => ({
        ...checks,
        [column]: Boolean(currentRow.checks?.[column]),
      }), {}),
    };
  });

  return {
    ...emptyDraft,
    ...record,
    id: record.id ?? '',
    rows,
    footer: {
      ...emptyDraft.footer,
      ...(record.footer ?? {}),
    },
    createdAt: record.createdAt ?? '',
    updatedAt: record.updatedAt ?? '',
  };
}

function loadFinishedPackageInspectionRecords() {
  try {
    const storedRecords = window.localStorage.getItem(FINISHED_PACKAGE_INSPECTION_STORAGE_KEY);
    const parsedRecords = storedRecords ? JSON.parse(storedRecords) : [];

    return Array.isArray(parsedRecords)
      ? parsedRecords.map(normalizeFinishedPackageInspectionRecord)
      : [];
  } catch {
    return [];
  }
}

function saveFinishedPackageInspectionRecords(records) {
  window.localStorage.setItem(
    FINISHED_PACKAGE_INSPECTION_STORAGE_KEY,
    JSON.stringify((records ?? []).map(normalizeFinishedPackageInspectionRecord)),
  );
}

function getFinishedPackageInspectionStatus(row) {
  const checkedCount = Object.values(row?.checks ?? {}).filter(Boolean).length;

  if (!row?.packageNumber && !row?.packageQuantity && checkedCount === 0) {
    return '';
  }

  return checkedCount > 0 ? `${checkedCount} control(es)` : 'Sin checks';
}

function FinishedPackageInspectionView({ productionFormats = [], bottleFormats = [], masterFormats = [], sharedSaiCode = '', onSharedSaiCodeChange, onAudit }) {
  const [draft, setDraft] = useState(createEmptyFinishedPackageInspectionDraft);
  const [records, setRecords] = useState(loadFinishedPackageInspectionRecords);
  const [showDatabase, setShowDatabase] = useState(false);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', format: '', search: '' });
  const formatOptions = useMemo(() => (
    getUnifiedFormatOptions(bottleFormats, productionFormats).map((format) => format.label)
  ), [bottleFormats, productionFormats]);
  const savedFormatOptions = useMemo(() => (
    Array.from(new Set(records.map((record) => record.format).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [records]);
  const filteredRecords = useMemo(() => {
    const cleanSearch = filters.search.trim().toLowerCase();

    return records
      .map(normalizeFinishedPackageInspectionRecord)
      .filter((record) => {
        const searchableText = [
          record.productionDate,
          record.saiCode,
          record.client,
          record.bottleOp,
          record.format,
          record.shift,
          record.qualityAuxiliary,
          record.preformOp,
          record.gramColor,
          record.resin,
          record.operator,
          record.observations,
        ].join(' ').toLowerCase();

        return (!filters.dateFrom || record.productionDate >= filters.dateFrom)
          && (!filters.dateTo || record.productionDate <= filters.dateTo)
          && (!filters.format || record.format === filters.format)
          && (!cleanSearch || searchableText.includes(cleanSearch));
      });
  }, [filters, records]);

  useEffect(() => {
    saveFinishedPackageInspectionRecords(records);
  }, [records]);

  useEffect(() => {
    const reference = getSaiCodeReference(sharedSaiCode, masterFormats);

    setDraft((currentDraft) => (
      sharedSaiCode === currentDraft.saiCode && !reference
        ? currentDraft
        : {
            ...currentDraft,
            saiCode: sharedSaiCode,
            ...(reference ? {
              client: reference.client,
              format: reference.format,
              gramColor: getSaiGramColor(reference),
              resin: reference.resin,
            } : {}),
          }
    ));
  }, [masterFormats, sharedSaiCode]);

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const updateFooter = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      footer: {
        ...currentDraft.footer,
        [field]: value,
      },
    }));
  };

  const updateFilter = (field, value) => {
    setFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  };

  const updateRow = (rowIndex, field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      rows: currentDraft.rows.map((row, index) => (
        index === rowIndex ? { ...row, [field]: value } : row
      )),
    }));
  };

  const toggleRowCheck = (rowIndex, column) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      rows: currentDraft.rows.map((row, index) => (
        index === rowIndex
          ? {
              ...row,
              checks: {
                ...row.checks,
                [column]: !row.checks[column],
              },
            }
          : row
      )),
    }));
  };

  const resetDraft = () => {
    setDraft({
      ...createEmptyFinishedPackageInspectionDraft(),
      saiCode: sharedSaiCode,
    });
  };

  const saveRecord = async () => {
    if (!draft.productionDate || !draft.format) {
      window.alert('Ingrese fecha de produccion y formato antes de guardar.');
      return;
    }

    const isEditingRecord = Boolean(draft.id);
    const record = normalizeFinishedPackageInspectionRecord({
      ...draft,
      id: draft.id || crypto.randomUUID(),
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setRecords((currentRecords) => (
      isEditingRecord
        ? currentRecords.map((currentRecord) => (currentRecord.id === record.id ? record : currentRecord))
        : [record, ...currentRecords]
    ));
    resetDraft();
    await onAudit?.({
      action: isEditingRecord ? 'Actualizo inspeccion de empaque producto terminado' : 'Registro inspeccion de empaque producto terminado',
      area: 'Control de calidad',
      target: record.format,
      detail: `${record.productionDate} / ${record.operator || 'Sin operador'}`,
      metadata: { recordId: record.id },
    });
  };

  const openRecord = (record) => {
    const normalizedRecord = normalizeFinishedPackageInspectionRecord(record);
    setDraft(normalizedRecord);
    onSharedSaiCodeChange?.(normalizedRecord.saiCode ?? '');
    setShowDatabase(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportDatabase = async () => {
    if (filteredRecords.length === 0) {
      window.alert('No hay registros para exportar con los filtros actuales.');
      return;
    }

    const texto = (fn) => (record) => ({ value: fn(record) ?? '', type: String });
    const columns = [
      { header: 'Fecha', cell: texto((record) => record.productionDate) },
      { header: 'Codigo SAI', cell: texto((record) => record.saiCode) },
      { header: 'Formato', width: 34, cell: texto((record) => record.format) },
      { header: 'Cliente', cell: texto((record) => record.client) },
      { header: 'OP botella', cell: texto((record) => record.bottleOp) },
      { header: 'Tipo empaque', cell: texto((record) => record.packageType) },
      { header: 'Turno', cell: texto((record) => record.shift) },
      { header: 'Auxiliar calidad', cell: texto((record) => record.qualityAuxiliary) },
      { header: 'OP preforma', cell: texto((record) => record.preformOp) },
      { header: 'Gramaje - Color', cell: texto((record) => record.gramColor) },
      { header: 'Resina', cell: texto((record) => record.resin) },
      { header: 'Operador', cell: texto((record) => record.operator) },
      ...finishedPackageInspectionRows.flatMap((item, index) => [
        { header: `Item ${item} N empaque`, cell: texto((record) => record.rows?.[index]?.packageNumber ?? '') },
        { header: `Item ${item} cantidad`, cell: texto((record) => record.rows?.[index]?.packageQuantity ?? '') },
        { header: `Item ${item} estado`, cell: texto((record) => getFinishedPackageInspectionStatus(record.rows?.[index])) },
      ]),
      { header: 'Observaciones', width: 42, cell: texto((record) => record.observations) },
      { header: 'Firma Aux. Calidad', cell: texto((record) => (record.signatureDataUrl ? 'Firmado' : 'Pendiente')) },
    ];

    await writeXlsxFile(filteredRecords, { columns }).toFile(`inspeccion-empaque-producto-terminado-${getToday()}.xlsx`);
  };

  return (
    <section className="blower-control-section finished-package-section">
      <article className="blower-sheet finished-package-sheet">
        <div className="blower-grid-bg" aria-hidden="true" />
        <header className="blower-sheet-header finished-package-header">
          <div className="blower-logo-block">
            <img src="/logos/logo-empacar.png" alt="EMPACAR" />
          </div>
          <h3>Inspeccion de empaque producto terminado sopladora</h3>
          <div className="blower-code-block">
            <strong>REG-LAS-03-Rev.03</strong>
            <span>REVISION: 17-02-2021</span>
            <span>PAGINA 1 de 4</span>
          </div>
        </header>

        <div className="finished-package-form-grid">
          <div className="blower-form-block">
            <div className="blower-block-title">DATOS DE PRODUCCION - BOTELLA</div>
            <div className="finished-package-two-column">
              <label><span>Fecha produccion:</span><input type="date" value={draft.productionDate} onChange={(event) => updateDraft('productionDate', event.target.value)} /></label>
              <label><span>Cliente:</span><input type="text" value={draft.client} onChange={(event) => updateDraft('client', event.target.value)} /></label>
              <label><span>OP-botella:</span><input type="text" value={draft.bottleOp} onChange={(event) => updateDraft('bottleOp', event.target.value)} /></label>
              <label className="finished-package-type-row">
                <span>Tipo empaque:</span>
                <label><input type="checkbox" checked={draft.packageType === 'Paquete (bolsa)'} onChange={(event) => updateDraft('packageType', event.target.checked ? 'Paquete (bolsa)' : '')} /> Paquete (bolsa)</label>
                <label><input type="checkbox" checked={draft.packageType === 'Pallet'} onChange={(event) => updateDraft('packageType', event.target.checked ? 'Pallet' : '')} /> Pallet</label>
              </label>
              <label className="finished-package-format-row">
                <span>Formato:</span>
                <SearchableSelect
                  value={draft.format}
                  onChange={(value) => updateDraft('format', value)}
                  options={formatOptions}
                  placeholder="Seleccionar formato"
                />
              </label>
              <div className="finished-package-shift-row">
                <span>Turno:</span>
                {['1er', '2do', '3er'].map((shift) => (
                  <label key={shift}><input type="checkbox" checked={draft.shift === shift} onChange={(event) => updateDraft('shift', event.target.checked ? shift : '')} /> {shift}</label>
                ))}
              </div>
              <label className="finished-package-quality-row"><span>Auxiliar de Calidad:</span><input type="text" value={draft.qualityAuxiliary} onChange={(event) => updateDraft('qualityAuxiliary', event.target.value)} /></label>
            </div>
          </div>

          <div className="blower-form-block reference">
            <div className="blower-block-title">DATOS DE REFERENCIA</div>
            <label><span>OP-preforma:</span><input type="text" value={draft.preformOp} onChange={(event) => updateDraft('preformOp', event.target.value)} /></label>
            <label><span>Gramaje - Color:</span><input type="text" value={draft.gramColor} onChange={(event) => updateDraft('gramColor', event.target.value)} /></label>
            <label>
              <span>Resina:</span>
              <select value={draft.resin} onChange={(event) => updateDraft('resin', event.target.value)}>
                <option value="">Seleccionar</option>
                {resinBoxOptions.map((resin) => <option key={resin} value={resin}>{resin}</option>)}
              </select>
            </label>
            <label>
              <span>Operador:</span>
              <select value={draft.operator} onChange={(event) => updateDraft('operator', event.target.value)}>
                <option value="">Seleccionar</option>
                {operatorOptions.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="finished-package-table-wrap">
          <table className="finished-package-table">
            <thead>
              <tr>
                <th rowSpan="2" className="vertical-header">ITEM</th>
                <th rowSpan="2">N° EMPAQUE</th>
                <th rowSpan="2">CANTIDAD POR EMPAQUE (Unid)</th>
                <th colSpan="3">FICHA DE ID.</th>
                <th colSpan="2">PALLET DE MADERA</th>
                <th colSpan="3">SEPARADORES DE CARTON CORRUGADO</th>
                <th colSpan="3">SOPORTE SUPERIOR DE MADERA</th>
                <th colSpan="3">BOLSA PLASTICA O FILL</th>
                <th colSpan="2">FLEJADO EXTERNO</th>
                <th colSpan="3">VoBo</th>
              </tr>
              <tr>
                {['PRESENCIA', 'AUSENCIA', 'BUENO', 'ACEPTABLE', 'MALO', 'BUENO', 'ACEPTABLE', 'MALO', 'BUENO', 'ACEPTABLE', 'MALO', 'BUENO', 'ACEPTABLE', 'MALO', '2 unid.', '4 unid.', 'ACEPTADO', 'OBS ENVASE', 'RECHAZADO'].map((label) => (
                  <th key={label} className="vertical-header small">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row, rowIndex) => (
                <tr key={row.item}>
                  <td className="item-cell">{row.item}</td>
                  <td><input type="text" value={row.packageNumber} onChange={(event) => updateRow(rowIndex, 'packageNumber', event.target.value)} /></td>
                  <td><input type="number" min="0" value={row.packageQuantity} onChange={(event) => updateRow(rowIndex, 'packageQuantity', event.target.value)} /></td>
                  {finishedPackageCheckColumns.map((column) => (
                    <td key={column}>
                      <button
                        type="button"
                        className={`finished-package-check ${row.checks[column] ? 'checked' : ''}`}
                        onClick={() => toggleRowCheck(rowIndex, column)}
                        aria-pressed={row.checks[column]}
                        aria-label={`${row.item} ${column}`}
                      >
                        {row.checks[column] ? '✓' : ''}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="finished-package-footer-row">
                <td colSpan="2">N° de paquete</td>
                <td><input type="text" value={draft.footer.palletPackageNumber} onChange={(event) => updateFooter('palletPackageNumber', event.target.value)} /></td>
                <td colSpan="3">Cantidad (unid)</td>
                <td><input type="text" value={draft.footer.palletQuantity} onChange={(event) => updateFooter('palletQuantity', event.target.value)} /></td>
                <td colSpan="3">N° de paquete</td>
                <td><input type="text" value={draft.footer.separatorPackageNumber} onChange={(event) => updateFooter('separatorPackageNumber', event.target.value)} /></td>
                <td colSpan="3">Cantidad (unid)</td>
                <td><input type="text" value={draft.footer.separatorQuantity} onChange={(event) => updateFooter('separatorQuantity', event.target.value)} /></td>
                <td colSpan="3">N° de paquete</td>
                <td><input type="text" value={draft.footer.bagPackageNumber} onChange={(event) => updateFooter('bagPackageNumber', event.target.value)} /></td>
                <td colSpan="2">Cantidad (unid)</td>
                <td><input type="text" value={draft.footer.bagQuantity} onChange={(event) => updateFooter('bagQuantity', event.target.value)} /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="finished-package-observations">
          <label>
            <span>OBSERVACIONES:</span>
            <textarea value={draft.observations} onChange={(event) => updateDraft('observations', event.target.value)} rows={5} />
          </label>
          <DigitalSignaturePad
            label="Firma Aux. de Calidad"
            value={draft.signatureDataUrl}
            onChange={(value) => updateDraft('signatureDataUrl', value)}
            className="finished-package-signature"
          />
        </div>

        <div className="blower-actions">
          <button type="button" className="primary-action" onClick={saveRecord}>{draft.id ? 'Actualizar registro' : 'Guardar registro'}</button>
          <button type="button" className="secondary-action" onClick={() => setShowDatabase((currentValue) => !currentValue)}>
            {showDatabase ? 'Ocultar base de datos' : `Ver base de datos (${records.length})`}
          </button>
          <button type="button" className="secondary-action" onClick={resetDraft}>Limpiar registro</button>
        </div>
      </article>

      {showDatabase && (
        <article className="blower-record-list">
          <div className="section-heading">
            <div>
              <span>Registros guardados</span>
              <h2>Base de datos producto terminado</h2>
            </div>
            <strong className="record-count">{filteredRecords.length}/{records.length} visibles</strong>
          </div>

          <div className="blower-database-filters">
            <label className="field"><span>Desde</span><input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></label>
            <label className="field"><span>Hasta</span><input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></label>
            <label className="field">
              <span>Formato</span>
              <select value={filters.format} onChange={(event) => updateFilter('format', event.target.value)}>
                <option value="">Todos</option>
                {savedFormatOptions.map((format) => <option key={format} value={format}>{format}</option>)}
              </select>
            </label>
            <label className="field field-wide"><span>Buscar</span><input type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Cliente, operador, resina, OP..." /></label>
            <div className="blower-database-filter-actions">
              <button type="button" className="secondary-action" onClick={() => setFilters({ dateFrom: '', dateTo: '', format: '', search: '' })}>Limpiar filtros</button>
              <button type="button" className="primary-action" onClick={exportDatabase}>Exportar Excel</button>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="mold-placeholder">Aun no hay registros guardados.</div>
          ) : filteredRecords.length === 0 ? (
            <div className="mold-placeholder">No hay registros con esos filtros.</div>
          ) : (
            <div className="blower-excel-table-wrap">
              <table className="blower-excel-table finished-package-database-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Codigo SAI</th>
                    <th>Formato</th>
                    <th>Cliente</th>
                    <th>OP botella</th>
                    <th>Turno</th>
                    <th>Auxiliar</th>
                    <th>Operador</th>
                    <th>Resina</th>
                    <th>Items registrados</th>
                    <th>Observaciones</th>
                    <th>Firma</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const filledRows = record.rows.filter((row) => getFinishedPackageInspectionStatus(row));

                    return (
                      <tr key={record.id}>
                        <td>{record.productionDate || '-'}</td>
                        <td>{record.saiCode || '-'}</td>
                        <td className="wide-cell">{record.format || '-'}</td>
                        <td>{record.client || '-'}</td>
                        <td>{record.bottleOp || '-'}</td>
                        <td>{record.shift || '-'}</td>
                        <td>{record.qualityAuxiliary || '-'}</td>
                        <td>{record.operator || '-'}</td>
                        <td>{record.resin || '-'}</td>
                        <td>{filledRows.length > 0 ? filledRows.map((row) => `Item ${row.item}: ${getFinishedPackageInspectionStatus(row)}`).join(' / ') : '-'}</td>
                        <td className="wide-cell">{record.observations || '-'}</td>
                        <td>{record.signatureDataUrl ? 'Firmado' : 'Pendiente'}</td>
                        <td>
                          <button type="button" className="secondary-action certificate-action" onClick={() => openRecord(record)}>
                            Abrir / editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}
    </section>
  );
}

function createEmptyEquipmentDraft() {
  return {
    code: '',
    name: '',
    type: 'Calibrador digital',
    brand: '',
    model: '',
    serial: '',
    location: 'Laboratorio',
    responsible: '',
    frequencyMonths: '12',
    lastCalibrationDate: '',
    nextCalibrationDate: '',
    nextVerificationDate: '',
    nextMaintenanceDate: '',
    status: 'Activo',
    notes: '',
  };
}

function createEmptyCalibrationDraft(equipment) {
  const frequencyMonths = Number(equipment?.frequencyMonths ?? 12);

  return {
    date: getToday(),
    nextDate: addMonthsToDate(getToday(), Number.isFinite(frequencyMonths) ? frequencyMonths : 12),
    result: 'Conforme',
    certificateNumber: '',
    provider: '',
    notes: '',
    file: null,
  };
}

function createEmptyEquipmentDocumentDraft() {
  return {
    type: 'Ficha tecnica',
    title: '',
    issueDate: getToday(),
    expirationDate: '',
    notes: '',
    file: null,
  };
}

function readEquipmentCertificateFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve({ fileName: '', fileDataUrl: '' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, fileDataUrl: String(reader.result ?? '') });
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el certificado.'));
    reader.readAsDataURL(file);
  });
}

function MeasurementEquipmentView({ records, setRecords, onAudit }) {
  const [draft, setDraft] = useState(createEmptyEquipmentDraft);
  const [filters, setFilters] = useState({ status: '', type: '', search: '' });
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [calibrationDraft, setCalibrationDraft] = useState(() => createEmptyCalibrationDraft(null));
  const [documentDraft, setDocumentDraft] = useState(createEmptyEquipmentDocumentDraft);
  const [equipmentViewMode, setEquipmentViewMode] = useState('inventario');
  const [visibleScheduleMonth, setVisibleScheduleMonth] = useState(() => getMonthStartDate(getToday()));
  const [selectedScheduleDate, setSelectedScheduleDate] = useState('');
  const [message, setMessage] = useState('');
  const selectedEquipment = records.find((equipment) => equipment.id === selectedEquipmentId) ?? records[0] ?? null;
  const filteredRecords = records.filter((equipment) => {
    const state = getEquipmentCalibrationState(equipment);
    const searchText = filters.search.trim().toLowerCase();
    const searchableEquipment = [
      equipment.code,
      equipment.name,
      equipment.type,
      equipment.brand,
      equipment.model,
      equipment.serial,
      equipment.location,
      equipment.responsible,
      state.label,
    ].join(' ').toLowerCase();

    return (!filters.status || state.className === filters.status || equipment.status === filters.status)
      && (!filters.type || equipment.type === filters.type)
      && (!searchText || searchableEquipment.includes(searchText));
  });
  const metrics = {
    total: records.length,
    active: records.filter((equipment) => getEquipmentCalibrationState(equipment).className === 'ok').length,
    soon: records.filter((equipment) => getEquipmentCalibrationState(equipment).className === 'soon').length,
    expired: records.filter((equipment) => getEquipmentCalibrationState(equipment).className === 'expired').length,
    unavailable: records.filter((equipment) => ['out', 'calibration'].includes(getEquipmentCalibrationState(equipment).className)).length,
  };
  const realScheduleEvents = records.flatMap((equipment) => [
    equipment.nextCalibrationDate
      ? { id: `${equipment.id}-calibracion`, type: 'Calibracion', date: equipment.nextCalibrationDate, equipment }
      : null,
    equipment.nextVerificationDate
      ? { id: `${equipment.id}-verificacion`, type: 'Verificacion', date: equipment.nextVerificationDate, equipment }
      : null,
    equipment.nextMaintenanceDate
      ? { id: `${equipment.id}-mantenimiento`, type: 'Mantenimiento', date: equipment.nextMaintenanceDate, equipment }
      : null,
  ]).filter(Boolean);
  const projectedScheduleEvents = records.flatMap(createProjectedBalanceScheduleEvents);
  const realAndProjectedScheduleEvents = [...realScheduleEvents, ...projectedScheduleEvents];
  const scheduleEvents = (realAndProjectedScheduleEvents.length > 0 ? realAndProjectedScheduleEvents : createDemoEquipmentScheduleEvents())
    .map((event) => ({ ...event, daysUntil: getDaysUntil(event.date) }))
    .sort((a, b) => {
      const firstDate = new Date(`${a.date}T00:00:00`).getTime();
      const secondDate = new Date(`${b.date}T00:00:00`).getTime();
      return firstDate - secondDate;
    });
  const scheduleCalendar = buildEquipmentCalendarCells(scheduleEvents, visibleScheduleMonth);
  const visibleMonthPrefix = visibleScheduleMonth.slice(0, 7);
  const visibleMonthEvents = scheduleEvents.filter((event) => event.date?.startsWith(visibleMonthPrefix));
  const currentScheduleDate = selectedScheduleDate || visibleMonthEvents[0]?.date || visibleScheduleMonth;
  const selectedScheduleEvents = scheduleEvents.filter((event) => event.date === currentScheduleDate);
  const documentRecords = records
    .flatMap((equipment) => (equipment.documents ?? []).map((document) => ({ ...document, equipment })))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  useEffect(() => {
    if (selectedEquipment) {
      setSelectedEquipmentId(selectedEquipment.id);
      setCalibrationDraft(createEmptyCalibrationDraft(selectedEquipment));
      setDocumentDraft(createEmptyEquipmentDocumentDraft());
    }
  }, [selectedEquipment?.id]);

  const moveScheduleMonth = (months) => {
    const nextMonth = getMonthStartDate(addMonthsToDate(visibleScheduleMonth, months));
    setVisibleScheduleMonth(nextMonth);
    setSelectedScheduleDate(nextMonth);
  };

  const goToCurrentScheduleMonth = () => {
    const currentMonth = getMonthStartDate(getToday());
    setVisibleScheduleMonth(currentMonth);
    setSelectedScheduleDate(getToday());
  };

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => {
      const nextDraft = { ...currentDraft, [field]: value };

      if (field === 'lastCalibrationDate' || field === 'frequencyMonths') {
        nextDraft.nextCalibrationDate = addMonthsToDate(nextDraft.lastCalibrationDate, Number(nextDraft.frequencyMonths));
      }

      return nextDraft;
    });
    setMessage('');
  };

  const saveEquipment = () => {
    const cleanCode = draft.code.trim();
    const cleanName = draft.name.trim();

    if (!cleanCode || !cleanName) {
      setMessage('Ingrese codigo y nombre del equipo.');
      return;
    }

    if (records.some((equipment) => equipment.code.trim().toLowerCase() === cleanCode.toLowerCase())) {
      setMessage('Ya existe un equipo con ese codigo.');
      return;
    }

    const newEquipment = normalizeMeasurementEquipment({
      ...draft,
      code: cleanCode,
      name: cleanName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setRecords((currentRecords) => [newEquipment, ...currentRecords]);
    setSelectedEquipmentId(newEquipment.id);
    setDraft(createEmptyEquipmentDraft());
    setMessage('Equipo registrado.');
    onAudit?.({
      action: 'Registro equipo medicion',
      area: 'Equipos de medicion',
      target: newEquipment.code,
      detail: newEquipment.name,
    });
  };

  const updateEquipmentStatus = (equipmentId, status) => {
    setRecords((currentRecords) => currentRecords.map((equipment) => (
      equipment.id === equipmentId
        ? { ...equipment, status, updatedAt: new Date().toISOString() }
        : equipment
    )));
  };

  const updateCalibrationDraft = (field, value) => {
    setCalibrationDraft((currentDraft) => {
      const nextDraft = { ...currentDraft, [field]: value };

      if (field === 'date' && selectedEquipment) {
        nextDraft.nextDate = addMonthsToDate(value, Number(selectedEquipment.frequencyMonths));
      }

      return nextDraft;
    });
    setMessage('');
  };

  const updateDocumentDraft = (field, value) => {
    setDocumentDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setMessage('');
  };

  const saveCalibration = async () => {
    if (!selectedEquipment) {
      setMessage('Seleccione un equipo.');
      return;
    }

    if (!calibrationDraft.date || !calibrationDraft.nextDate) {
      setMessage('Ingrese fecha de calibracion y proxima calibracion.');
      return;
    }

    try {
      const fileData = await readEquipmentCertificateFile(calibrationDraft.file);
      const calibration = normalizeEquipmentCalibration({
        ...calibrationDraft,
        ...fileData,
      });

      setRecords((currentRecords) => currentRecords.map((equipment) => (
        equipment.id === selectedEquipment.id
          ? normalizeMeasurementEquipment({
              ...equipment,
              lastCalibrationDate: calibration.date,
              nextCalibrationDate: calibration.nextDate,
              status: calibration.result === 'No conforme' ? 'Fuera de servicio' : 'Activo',
              calibrations: [calibration, ...(equipment.calibrations ?? [])],
              updatedAt: new Date().toISOString(),
            })
          : equipment
      )));
      setCalibrationDraft(createEmptyCalibrationDraft({
        ...selectedEquipment,
        lastCalibrationDate: calibration.date,
        nextCalibrationDate: calibration.nextDate,
      }));
      setMessage('Calibracion registrada.');
      onAudit?.({
        action: 'Registro calibracion',
        area: 'Equipos de medicion',
        target: selectedEquipment.code,
        detail: `${calibration.date} / ${calibration.result}`,
      });
    } catch (error) {
      setMessage(`No se pudo guardar la calibracion: ${error.message}`);
    }
  };

  const saveEquipmentDocument = async () => {
    if (!selectedEquipment) {
      setMessage('Seleccione un equipo.');
      return;
    }

    if (!documentDraft.file) {
      setMessage('Seleccione un documento para subir.');
      return;
    }

    try {
      const fileData = await readEquipmentCertificateFile(documentDraft.file);
      const documentTitle = documentDraft.title.trim() || documentDraft.file.name;
      const document = normalizeEquipmentDocument({
        ...documentDraft,
        ...fileData,
        title: documentTitle,
      });

      setRecords((currentRecords) => currentRecords.map((equipment) => (
        equipment.id === selectedEquipment.id
          ? normalizeMeasurementEquipment({
              ...equipment,
              documents: [document, ...(equipment.documents ?? [])],
              updatedAt: new Date().toISOString(),
            })
          : equipment
      )));
      setDocumentDraft(createEmptyEquipmentDocumentDraft());
      setMessage('Documento guardado.');
      onAudit?.({
        action: 'Subio documento de equipo',
        area: 'Equipos de medicion',
        target: selectedEquipment.code,
        detail: `${document.type} / ${document.title}`,
      });
    } catch (error) {
      setMessage(`No se pudo guardar el documento: ${error.message}`);
    }
  };

  return (
    <section className="equipment-section">
      <div className="section-heading">
        <div>
          <span>Laboratorio</span>
          <h2>Gestion de equipos de medicion</h2>
        </div>
        <strong className="record-count">{records.length} equipos</strong>
      </div>

      <div className="equipment-metrics">
        <article><span>Total</span><strong>{metrics.total}</strong></article>
        <article><span>Vigentes</span><strong>{metrics.active}</strong></article>
        <article><span>Por vencer</span><strong>{metrics.soon}</strong></article>
        <article><span>Vencidos</span><strong>{metrics.expired}</strong></article>
        <article><span>No disponibles</span><strong>{metrics.unavailable}</strong></article>
      </div>

      {message && <strong className="format-admin-message">{message}</strong>}

      <div className="equipment-view-toggle" aria-label="Vista de equipos de medicion">
        <button type="button" className={equipmentViewMode === 'inventario' ? 'active' : ''} onClick={() => setEquipmentViewMode('inventario')}>
          Inventario
        </button>
        <button type="button" className={equipmentViewMode === 'documentacion' ? 'active' : ''} onClick={() => setEquipmentViewMode('documentacion')}>
          Documentacion
        </button>
        <button type="button" className={equipmentViewMode === 'cronograma' ? 'active' : ''} onClick={() => setEquipmentViewMode('cronograma')}>
          Cronograma
        </button>
      </div>

      {equipmentViewMode === 'cronograma' ? (
        <article className="equipment-schedule-panel">
          <div className="section-heading">
            <div>
              <span>Seguimiento</span>
              <h2>Proximas calibraciones, verificaciones y mantenimientos</h2>
            </div>
            <strong className="record-count">{scheduleEvents.length} eventos</strong>
          </div>
          {realAndProjectedScheduleEvents.length === 0 && (
            <p className="equipment-demo-note">Fechas de ejemplo para visualizar el cronograma; al registrar equipos se mostraran las fechas reales.</p>
          )}

          <div className="equipment-calendar-shell">
            <div className="equipment-calendar-heading">
              <div className="equipment-calendar-nav">
                <button type="button" className="secondary-action" onClick={() => moveScheduleMonth(-1)} aria-label="Mes anterior">
                  &lt;
                </button>
                <strong>{scheduleCalendar.title}</strong>
                <button type="button" className="secondary-action" onClick={() => moveScheduleMonth(1)} aria-label="Mes siguiente">
                  &gt;
                </button>
                <button type="button" className="secondary-action" onClick={goToCurrentScheduleMonth}>
                  Hoy
                </button>
              </div>
              <div className="equipment-calendar-legend">
                <span className="no-cumplido-event">No cumplido</span>
                <span className="en-proceso-event">En proceso</span>
                <span className="concluido-event">Concluido</span>
                <span className="reprogramado-event">Reprogramado</span>
                <span className="verification-event">Verificacion</span>
                <span className="calibration-event">Calibracion</span>
              </div>
            </div>
            <div className="equipment-calendar-weekdays">
              {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="equipment-calendar-grid">
              {scheduleCalendar.cells.map((cell) => (
                cell.empty ? (
                  <div className="equipment-calendar-cell empty" key={cell.id} />
                ) : (
                  <button
                    type="button"
                    className={`equipment-calendar-cell ${cell.isToday ? 'today' : ''} ${cell.date === currentScheduleDate ? 'selected' : ''}`}
                    key={cell.id}
                    onClick={() => setSelectedScheduleDate(cell.date)}
                    aria-label={`Ver eventos del ${cell.date}`}
                  >
                    <>
                      <time dateTime={cell.date}>{cell.day}</time>
                      <div className="equipment-calendar-events">
                        {cell.events.slice(0, 3).map((event) => (
                          <span className={getScheduleEventColorClass(event)} key={event.id}>
                            {event.equipment.code}
                          </span>
                        ))}
                        {cell.events.length > 3 && <small>+{cell.events.length - 3}</small>}
                      </div>
                    </>
                  </button>
                )
              ))}
            </div>
          </div>

          <div className="equipment-day-detail">
            <div className="equipment-day-detail-heading">
              <span>Detalle del dia</span>
              <strong>{currentScheduleDate}</strong>
            </div>
            {selectedScheduleEvents.length === 0 ? (
              <div className="mold-placeholder">No hay actividades programadas para este dia.</div>
            ) : (
              <div className="equipment-day-event-list">
                {selectedScheduleEvents.map((event) => {
                  const state = getScheduleEventState(event.daysUntil);
                  const colorClass = getScheduleEventColorClass(event).replace('-event', '');
                  const statusLabel = event.scheduleLabel || state.label;

                  return (
                    <article className={`equipment-day-event ${colorClass} ${state.className}`} key={`day-${event.id}`}>
                      <div>
                        <span>{getScheduleEventLabel(event)}</span>
                        <strong>{event.equipment.code} / {event.equipment.name}</strong>
                        <small>{event.equipment.type} / {event.equipment.location || 'Sin ubicacion'}</small>
                        <small>Responsable: {event.equipment.responsible || '-'}</small>
                        {event.isDemo && <small>Fecha de ejemplo</small>}
                        {event.isProjected && <small>Actividad proyectada</small>}
                      </div>
                      <b>{statusLabel}</b>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="equipment-schedule-grid">
            {scheduleEvents.length === 0 ? (
              <div className="mold-placeholder">No hay fechas programadas todavia.</div>
            ) : scheduleEvents.map((event) => {
              const state = getScheduleEventState(event.daysUntil);
              const colorClass = getScheduleEventColorClass(event).replace('-event', '');
              const statusLabel = event.scheduleLabel || state.label;

              return (
                <article className={`equipment-schedule-card ${colorClass} ${state.className}`} key={event.id}>
                  <div>
                    <span>{getScheduleEventLabel(event)}</span>
                    <strong>{event.equipment.code} / {event.equipment.name}</strong>
                    <small>{event.equipment.type} / {event.equipment.location || 'Sin ubicacion'}</small>
                    <small>Responsable: {event.equipment.responsible || '-'}</small>
                    {event.isDemo && <small>Fecha de ejemplo</small>}
                    {event.isProjected && <small>Actividad proyectada</small>}
                  </div>
                  <div className="equipment-schedule-date">
                    <time dateTime={event.date}>{event.date}</time>
                    <b>{statusLabel}</b>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      ) : equipmentViewMode === 'documentacion' ? (
        <article className="equipment-document-panel">
          <div className="section-heading">
            <div>
              <span>Respaldos</span>
              <h2>Documentacion de equipos</h2>
            </div>
            <strong className="record-count">{documentRecords.length} documentos</strong>
          </div>

          <div className="equipment-document-layout">
            <div className="equipment-document-form">
              <h3>Subir documento</h3>
              <label className="field">
                <span>Equipo</span>
                <select value={selectedEquipmentId} onChange={(event) => setSelectedEquipmentId(event.target.value)}>
                  {records.length === 0 ? (
                    <option value="">Sin equipos registrados</option>
                  ) : records.map((equipment) => (
                    <option key={equipment.id} value={equipment.id}>{equipment.code} / {equipment.name}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Tipo de documento</span><select value={documentDraft.type} onChange={(event) => updateDocumentDraft('type', event.target.value)}>{equipmentDocumentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className="field"><span>Titulo</span><input type="text" value={documentDraft.title} onChange={(event) => updateDocumentDraft('title', event.target.value)} placeholder="Certificado balanza 2026" /></label>
              <label className="field"><span>Fecha documento</span><input type="date" value={documentDraft.issueDate} onChange={(event) => updateDocumentDraft('issueDate', event.target.value)} /></label>
              <label className="field"><span>Vencimiento</span><input type="date" value={documentDraft.expirationDate} onChange={(event) => updateDocumentDraft('expirationDate', event.target.value)} /></label>
              <label className="field"><span>Archivo</span><input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(event) => updateDocumentDraft('file', event.target.files?.[0] ?? null)} /></label>
              <label className="field field-wide"><span>Observaciones</span><textarea value={documentDraft.notes} onChange={(event) => updateDocumentDraft('notes', event.target.value)} rows={3} /></label>
              <button type="button" className="primary-action" onClick={saveEquipmentDocument} disabled={!selectedEquipment}>
                Guardar documento
              </button>
            </div>

            <div className="equipment-document-list">
              <h3>Documentos guardados</h3>
              {documentRecords.length === 0 ? (
                <div className="mold-placeholder">Aun no hay documentacion guardada.</div>
              ) : documentRecords.map((document) => (
                <article className="equipment-document-card" key={document.id}>
                  <div>
                    <span>{document.type}</span>
                    <strong>{document.title || document.fileName}</strong>
                    <small>{document.equipment.code} / {document.equipment.name}</small>
                    <small>Fecha: {document.issueDate || '-'} {document.expirationDate ? `/ Vence: ${document.expirationDate}` : ''}</small>
                    {document.notes && <p>{document.notes}</p>}
                  </div>
                  {document.fileDataUrl && (
                    <a className="secondary-action" href={document.fileDataUrl} download={document.fileName || `${document.type}-${document.equipment.code}`}>
                      Abrir
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </article>
      ) : (
        <>
      <div className="equipment-layout">
        <article className="equipment-panel">
          <h3>Agregar equipo</h3>
          <div className="equipment-form-grid">
            <label className="field"><span>Codigo interno</span><input type="text" value={draft.code} onChange={(event) => updateDraft('code', event.target.value)} placeholder="EQ-CAL-001" /></label>
            <label className="field"><span>Nombre</span><input type="text" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Calibrador digital" /></label>
            <label className="field"><span>Tipo</span><select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)}>{equipmentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="field"><span>Marca</span><input type="text" value={draft.brand} onChange={(event) => updateDraft('brand', event.target.value)} /></label>
            <label className="field"><span>Modelo</span><input type="text" value={draft.model} onChange={(event) => updateDraft('model', event.target.value)} /></label>
            <label className="field"><span>Serie</span><input type="text" value={draft.serial} onChange={(event) => updateDraft('serial', event.target.value)} /></label>
            <label className="field"><span>Ubicacion</span><input type="text" value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} /></label>
            <label className="field"><span>Responsable</span><input type="text" value={draft.responsible} onChange={(event) => updateDraft('responsible', event.target.value)} /></label>
            <label className="field"><span>Frecuencia (meses)</span><input type="number" min="1" value={draft.frequencyMonths} onChange={(event) => updateDraft('frequencyMonths', event.target.value)} /></label>
            <label className="field"><span>Ultima calibracion</span><input type="date" value={draft.lastCalibrationDate} onChange={(event) => updateDraft('lastCalibrationDate', event.target.value)} /></label>
            <label className="field"><span>Proxima calibracion</span><input type="date" value={draft.nextCalibrationDate} onChange={(event) => updateDraft('nextCalibrationDate', event.target.value)} /></label>
            <label className="field"><span>Proxima verificacion</span><input type="date" value={draft.nextVerificationDate} onChange={(event) => updateDraft('nextVerificationDate', event.target.value)} /></label>
            <label className="field"><span>Proximo mantenimiento</span><input type="date" value={draft.nextMaintenanceDate} onChange={(event) => updateDraft('nextMaintenanceDate', event.target.value)} /></label>
            <label className="field"><span>Estado</span><select value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>{equipmentStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label className="field field-wide"><span>Observaciones</span><textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} rows={3} /></label>
            <button type="button" className="primary-action" onClick={saveEquipment}>Guardar equipo</button>
          </div>
        </article>

        <article className="equipment-panel">
          <h3>Inventario</h3>
          <div className="equipment-filter-grid">
            <label className="field"><span>Tipo</span><select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}><option value="">Todos</option>{equipmentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="field"><span>Estado</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos</option><option value="ok">Vigente</option><option value="soon">Por vencer</option><option value="expired">Vencido</option><option value="Fuera de servicio">Fuera de servicio</option><option value="En calibracion">En calibracion</option></select></label>
            <label className="field field-wide"><span>Buscar</span><input type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
          </div>
          <div className="equipment-list">
            {filteredRecords.length === 0 ? (
              <div className="mold-placeholder">No hay equipos registrados.</div>
            ) : filteredRecords.map((equipment) => {
              const state = getEquipmentCalibrationState(equipment);

              return (
                <button type="button" className={`equipment-list-item ${selectedEquipment?.id === equipment.id ? 'active' : ''}`} key={equipment.id} onClick={() => setSelectedEquipmentId(equipment.id)}>
                  <div>
                    <span>{equipment.code}</span>
                    <strong>{equipment.name}</strong>
                    <small>{equipment.type} / {equipment.location}</small>
                  </div>
                  <b className={`equipment-state ${state.className}`}>{state.label}</b>
                </button>
              );
            })}
          </div>
        </article>
      </div>

      {selectedEquipment && (
        <article className="equipment-detail-panel">
          <div className="equipment-detail-heading">
            <div>
              <span>{selectedEquipment.code}</span>
              <h3>{selectedEquipment.name}</h3>
              <p>{selectedEquipment.brand || 'Sin marca'} / {selectedEquipment.model || 'Sin modelo'} / Serie {selectedEquipment.serial || '-'}</p>
            </div>
            <label className="field">
              <span>Estado operativo</span>
              <select value={selectedEquipment.status} onChange={(event) => updateEquipmentStatus(selectedEquipment.id, event.target.value)}>
                {equipmentStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
          </div>

          <div className="equipment-detail-grid">
            <div><span>Ultima calibracion</span><strong>{selectedEquipment.lastCalibrationDate || '-'}</strong></div>
            <div><span>Proxima calibracion</span><strong>{selectedEquipment.nextCalibrationDate || '-'}</strong></div>
            <div><span>Proxima verificacion</span><strong>{selectedEquipment.nextVerificationDate || '-'}</strong></div>
            <div><span>Proximo mantenimiento</span><strong>{selectedEquipment.nextMaintenanceDate || '-'}</strong></div>
            <div><span>Frecuencia</span><strong>{selectedEquipment.frequencyMonths} meses</strong></div>
            <div><span>Responsable</span><strong>{selectedEquipment.responsible || '-'}</strong></div>
          </div>

          <div className="equipment-calibration-layout">
            <div className="equipment-calibration-form">
              <h3>Registrar calibracion</h3>
              <label className="field"><span>Fecha calibracion</span><input type="date" value={calibrationDraft.date} onChange={(event) => updateCalibrationDraft('date', event.target.value)} /></label>
              <label className="field"><span>Proxima calibracion</span><input type="date" value={calibrationDraft.nextDate} onChange={(event) => updateCalibrationDraft('nextDate', event.target.value)} /></label>
              <label className="field"><span>Resultado</span><select value={calibrationDraft.result} onChange={(event) => updateCalibrationDraft('result', event.target.value)}>{calibrationResultOptions.map((result) => <option key={result} value={result}>{result}</option>)}</select></label>
              <label className="field"><span>Nro. certificado</span><input type="text" value={calibrationDraft.certificateNumber} onChange={(event) => updateCalibrationDraft('certificateNumber', event.target.value)} /></label>
              <label className="field"><span>Proveedor / responsable</span><input type="text" value={calibrationDraft.provider} onChange={(event) => updateCalibrationDraft('provider', event.target.value)} /></label>
              <label className="field"><span>Certificado PDF o imagen</span><input type="file" accept="application/pdf,image/*" onChange={(event) => updateCalibrationDraft('file', event.target.files?.[0] ?? null)} /></label>
              <label className="field field-wide"><span>Observaciones</span><textarea value={calibrationDraft.notes} onChange={(event) => updateCalibrationDraft('notes', event.target.value)} rows={3} /></label>
              <button type="button" className="primary-action" onClick={saveCalibration}>Guardar calibracion</button>
            </div>

            <div className="equipment-calibration-history">
              <h3>Historial</h3>
              {(selectedEquipment.calibrations ?? []).length === 0 ? (
                <div className="mold-placeholder">Sin calibraciones registradas.</div>
              ) : selectedEquipment.calibrations.map((calibration) => (
                <article className="calibration-history-card" key={calibration.id}>
                  <div>
                    <strong>{calibration.date} / {calibration.result}</strong>
                    <span>Proxima: {calibration.nextDate || '-'}</span>
                    <span>Certificado: {calibration.certificateNumber || '-'}</span>
                    <span>{calibration.provider || 'Sin proveedor'}</span>
                    {calibration.notes && <p>{calibration.notes}</p>}
                  </div>
                  {calibration.fileDataUrl && (
                    <a className="secondary-action" href={calibration.fileDataUrl} download={calibration.fileName || `certificado-${selectedEquipment.code}.pdf`}>
                      Ver certificado
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </article>
      )}
        </>
      )}
    </section>
  );
}

function QualityClaimSelect({ complaints, value, onChange }) {
  return (
    <label className="field">
      <span>Reclamo</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Seleccione reclamo</option>
        {complaints.map((claim) => (
          <option value={claim.id} key={claim.id}>{getClaimLabel(claim)}</option>
        ))}
      </select>
    </label>
  );
}

function QualityComplaintsView({ qualityManagement, setQualityManagement }) {
  const { complaints } = qualityManagement;
  const [form, setForm] = useState({
    date: getToday(),
    customer: '',
    source: complaintSourceOptions[0],
    product: '',
    lot: '',
    description: '',
    severity: complaintSeverityOptions[0],
    owner: '',
  });
  const [importedClaim, setImportedClaim] = useState(null);
  const [importMessage, setImportMessage] = useState('');
  const [isImportingComplaint, setIsImportingComplaint] = useState(false);

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const applyClaimToForm = (claim) => {
    setForm({
      date: claim.date || getToday(),
      customer: claim.customer || '',
      source: claim.source || 'Correo / Excel',
      product: claim.product || claim.productCode || '',
      lot: claim.lot || '',
      description: claim.description || '',
      severity: claim.severity || complaintSeverityOptions[1],
      owner: claim.owner || 'Calidad',
    });
    setImportMessage('Datos importados al formulario. Puede revisarlos antes de registrar.');
  };

  const importComplaintExcel = async (file) => {
    if (!file) {
      return;
    }

    setIsImportingComplaint(true);
    setImportMessage('');

    try {
      const claim = await readQualityComplaintExcel(file);
      if (!claim.customer && !claim.description) {
        setImportMessage('No se pudo identificar cliente ni descripcion en el Excel.');
        setImportedClaim(null);
        return;
      }

      setImportedClaim(claim);
      applyClaimToForm(claim);
      setImportMessage(`Excel leido: ${claim.importedSheetName || 'primera hoja util'}. Revise la vista previa antes de guardar.`);
    } catch (error) {
      setImportedClaim(null);
      setImportMessage(`No se pudo leer el Excel: ${error.message}`);
    } finally {
      setIsImportingComplaint(false);
    }
  };

  const registerImportedComplaint = () => {
    if (!importedClaim) {
      return;
    }

    const claim = normalizeQualityClaim({
      ...importedClaim,
      code: importedClaim.code ? `REC-${new Date().getFullYear()}-${importedClaim.code}` : getClaimCode(complaints),
      updatedAt: new Date().toISOString(),
    });

    setQualityManagement((currentState) => ({
      ...currentState,
      complaints: [claim, ...currentState.complaints],
    }));
    setImportedClaim(null);
    setImportMessage('Reclamo importado y registrado correctamente.');
  };

  const submitComplaint = (event) => {
    event.preventDefault();

    if (!form.customer.trim() || !form.description.trim()) {
      window.alert('Ingrese al menos el cliente y la descripcion del reclamo.');
      return;
    }

    const claim = normalizeQualityClaim({
      ...form,
      code: getClaimCode(complaints),
      customer: form.customer.trim(),
      product: form.product.trim(),
      lot: form.lot.trim(),
      description: form.description.trim(),
      owner: form.owner.trim(),
    });

    setQualityManagement((currentState) => ({
      ...currentState,
      complaints: [claim, ...currentState.complaints],
    }));

    setForm({
      date: getToday(),
      customer: '',
      source: complaintSourceOptions[0],
      product: '',
      lot: '',
      description: '',
      severity: complaintSeverityOptions[0],
      owner: '',
    });
    setImportedClaim(null);
    setImportMessage('');
  };

  return (
    <section className="quality-management-section">
      <div className="section-heading">
        <div>
          <span>ISO 9001:2015 / 8.2.1 - 9.1.2</span>
          <h2>Reclamos</h2>
        </div>
        <strong className="record-count">{complaints.length} reclamos</strong>
      </div>

      <article className="quality-import-panel">
        <div>
          <span>Importacion desde formulario Excel</span>
          <strong>Recepcion de reclamo</strong>
          <p>Suba el formulario recibido por correo. Se leera la hoja del registro y se preparara el reclamo para revision.</p>
        </div>
        <label className="secondary-action file-action">
          {isImportingComplaint ? 'Leyendo Excel...' : 'Subir formulario Excel'}
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => importComplaintExcel(event.target.files?.[0])}
            disabled={isImportingComplaint}
          />
        </label>
        {importMessage && <small className="quality-import-message">{importMessage}</small>}
        {importedClaim && (
          <div className="quality-import-preview">
            <div><span>Correlativo</span><strong>{importedClaim.code || '-'}</strong></div>
            <div><span>Cliente</span><strong>{importedClaim.customer || '-'}</strong></div>
            <div><span>Fecha</span><strong>{importedClaim.date || '-'}</strong></div>
            <div><span>Producto/codigo</span><strong>{importedClaim.productCode || importedClaim.product || '-'}</strong></div>
            <div><span>Lote OP</span><strong>{importedClaim.lot || '-'}</strong></div>
            <div><span>Cantidad observada</span><strong>{importedClaim.observedQuantity || '-'}</strong></div>
            <div className="quality-import-wide"><span>Descripcion detectada</span><p>{importedClaim.description || '-'}</p></div>
            <button type="button" className="primary-action" onClick={registerImportedComplaint}>Registrar reclamo importado</button>
            <button type="button" className="secondary-action" onClick={() => applyClaimToForm(importedClaim)}>Revisar en formulario</button>
          </div>
        )}
      </article>

      <form className="quality-management-form" onSubmit={submitComplaint}>
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
        </label>
        <label className="field">
          <span>Cliente / origen</span>
          <input type="text" value={form.customer} onChange={(event) => updateForm('customer', event.target.value)} placeholder="Cliente o area que reporta" />
        </label>
        <label className="field">
          <span>Fuente</span>
          <select value={form.source} onChange={(event) => updateForm('source', event.target.value)}>
            {complaintSourceOptions.map((source) => <option value={source} key={source}>{source}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Producto / formato</span>
          <input type="text" value={form.product} onChange={(event) => updateForm('product', event.target.value)} placeholder="Formato observado" />
        </label>
        <label className="field">
          <span>Lote / orden</span>
          <input type="text" value={form.lot} onChange={(event) => updateForm('lot', event.target.value)} placeholder="Lote u orden de produccion" />
        </label>
        <label className="field">
          <span>Clasificacion</span>
          <select value={form.severity} onChange={(event) => updateForm('severity', event.target.value)}>
            {complaintSeverityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Responsable</span>
          <input type="text" value={form.owner} onChange={(event) => updateForm('owner', event.target.value)} placeholder="Responsable del reclamo" />
        </label>
        <label className="field quality-management-full">
          <span>Descripcion del reclamo</span>
          <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={4} />
        </label>
        <button type="submit" className="primary-action quality-management-full">Registrar reclamo</button>
      </form>

      <div className="quality-record-list">
        {complaints.length === 0 ? (
          <div className="empty-database">Todavia no hay reclamos registrados.</div>
        ) : complaints.map((claim) => (
          <article className="quality-record-card" key={claim.id}>
            <div>
              <span>{claim.code}</span>
              <strong>{claim.customer || 'Sin cliente'} / {claim.product || 'Sin producto'}</strong>
              <p>{claim.description}</p>
              {(claim.lot || claim.observedQuantity || claim.productCode || claim.importedFileName) && (
                <small>
                  {[
                    claim.lot ? `OP: ${claim.lot}` : '',
                    claim.productCode ? `Codigo producto: ${claim.productCode}` : '',
                    claim.observedQuantity ? `Observado: ${claim.observedQuantity}` : '',
                    claim.importedFileName ? `Importado: ${claim.importedFileName}` : '',
                  ].filter(Boolean).join(' | ')}
                </small>
              )}
            </div>
            <div className="quality-record-meta">
              <small>{claim.date}</small>
              <small>{claim.source}</small>
              <small>{claim.severity}</small>
              <small>{claim.status}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ComplaintFollowUpView({ qualityManagement, setQualityManagement }) {
  const { complaints, followUps } = qualityManagement;
  const [form, setForm] = useState({
    claimId: '',
    date: getToday(),
    responsible: '',
    status: complaintStatusOptions[1],
    observation: '',
    nextStep: '',
  });

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const submitFollowUp = (event) => {
    event.preventDefault();

    if (!form.claimId || !form.observation.trim()) {
      window.alert('Seleccione un reclamo y escriba la observacion de seguimiento.');
      return;
    }

    const followUp = normalizeComplaintFollowUp({
      ...form,
      responsible: form.responsible.trim(),
      observation: form.observation.trim(),
      nextStep: form.nextStep.trim(),
    });

    setQualityManagement((currentState) => ({
      ...currentState,
      complaints: currentState.complaints.map((claim) => (
        claim.id === followUp.claimId
          ? { ...claim, status: followUp.status, updatedAt: new Date().toISOString() }
          : claim
      )),
      followUps: [followUp, ...currentState.followUps],
    }));

    setForm({
      claimId: '',
      date: getToday(),
      responsible: '',
      status: complaintStatusOptions[1],
      observation: '',
      nextStep: '',
    });
  };

  return (
    <section className="quality-management-section">
      <div className="section-heading">
        <div>
          <span>ISO 9001:2015 / 9.1.2</span>
          <h2>Seguimiento a los reclamos</h2>
        </div>
        <strong className="record-count">{followUps.length} seguimientos</strong>
      </div>

      <form className="quality-management-form" onSubmit={submitFollowUp}>
        <QualityClaimSelect complaints={complaints} value={form.claimId} onChange={(value) => updateForm('claimId', value)} />
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
        </label>
        <label className="field">
          <span>Responsable</span>
          <input type="text" value={form.responsible} onChange={(event) => updateForm('responsible', event.target.value)} />
        </label>
        <label className="field">
          <span>Estado</span>
          <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
            {complaintStatusOptions.map((status) => <option value={status} key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field quality-management-full">
          <span>Observacion de seguimiento</span>
          <textarea value={form.observation} onChange={(event) => updateForm('observation', event.target.value)} rows={4} />
        </label>
        <label className="field quality-management-full">
          <span>Siguiente paso</span>
          <textarea value={form.nextStep} onChange={(event) => updateForm('nextStep', event.target.value)} rows={3} />
        </label>
        <button type="submit" className="primary-action quality-management-full" disabled={complaints.length === 0}>
          Registrar seguimiento
        </button>
      </form>

      <div className="quality-record-list">
        {followUps.length === 0 ? (
          <div className="empty-database">Todavia no hay seguimientos registrados.</div>
        ) : followUps.map((followUp) => {
          const claim = complaints.find((currentClaim) => currentClaim.id === followUp.claimId);

          return (
            <article className="quality-record-card" key={followUp.id}>
              <div>
                <span>{getClaimLabel(claim)}</span>
                <strong>{followUp.status}</strong>
                <p>{followUp.observation}</p>
                {followUp.nextStep && <p><b>Siguiente paso:</b> {followUp.nextStep}</p>}
              </div>
              <div className="quality-record-meta">
                <small>{followUp.date}</small>
                <small>{followUp.responsible || 'Sin responsable'}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CorrectiveActionsView({ qualityManagement, setQualityManagement }) {
  const { complaints, correctiveActions } = qualityManagement;
  const [form, setForm] = useState({
    claimId: '',
    date: getToday(),
    responsible: '',
    rootCause: '',
    action: '',
    dueDate: '',
    status: correctiveActionStatusOptions[0],
    effectiveness: '',
  });

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const submitAction = (event) => {
    event.preventDefault();

    if (!form.claimId || !form.rootCause.trim() || !form.action.trim()) {
      window.alert('Seleccione un reclamo, registre la causa raiz y la accion correctiva.');
      return;
    }

    const correctiveAction = normalizeCorrectiveAction({
      ...form,
      responsible: form.responsible.trim(),
      rootCause: form.rootCause.trim(),
      action: form.action.trim(),
      effectiveness: form.effectiveness.trim(),
    });

    setQualityManagement((currentState) => ({
      ...currentState,
      complaints: currentState.complaints.map((claim) => (
        claim.id === correctiveAction.claimId
          ? { ...claim, status: 'Accion correctiva', updatedAt: new Date().toISOString() }
          : claim
      )),
      correctiveActions: [correctiveAction, ...currentState.correctiveActions],
    }));

    setForm({
      claimId: '',
      date: getToday(),
      responsible: '',
      rootCause: '',
      action: '',
      dueDate: '',
      status: correctiveActionStatusOptions[0],
      effectiveness: '',
    });
  };

  return (
    <section className="quality-management-section">
      <div className="section-heading">
        <div>
          <span>ISO 9001:2015 / 10.2</span>
          <h2>Acciones correctivas</h2>
        </div>
        <strong className="record-count">{correctiveActions.length} acciones</strong>
      </div>

      <form className="quality-management-form" onSubmit={submitAction}>
        <QualityClaimSelect complaints={complaints} value={form.claimId} onChange={(value) => updateForm('claimId', value)} />
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
        </label>
        <label className="field">
          <span>Responsable</span>
          <input type="text" value={form.responsible} onChange={(event) => updateForm('responsible', event.target.value)} />
        </label>
        <label className="field">
          <span>Fecha compromiso</span>
          <input type="date" value={form.dueDate} onChange={(event) => updateForm('dueDate', event.target.value)} />
        </label>
        <label className="field">
          <span>Estado</span>
          <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
            {correctiveActionStatusOptions.map((status) => <option value={status} key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field quality-management-full">
          <span>Causa raiz</span>
          <textarea value={form.rootCause} onChange={(event) => updateForm('rootCause', event.target.value)} rows={3} />
        </label>
        <label className="field quality-management-full">
          <span>Accion correctiva</span>
          <textarea value={form.action} onChange={(event) => updateForm('action', event.target.value)} rows={4} />
        </label>
        <label className="field quality-management-full">
          <span>Verificacion de eficacia</span>
          <textarea value={form.effectiveness} onChange={(event) => updateForm('effectiveness', event.target.value)} rows={3} />
        </label>
        <button type="submit" className="primary-action quality-management-full" disabled={complaints.length === 0}>
          Registrar accion correctiva
        </button>
      </form>

      <div className="quality-record-list">
        {correctiveActions.length === 0 ? (
          <div className="empty-database">Todavia no hay acciones correctivas registradas.</div>
        ) : correctiveActions.map((correctiveAction) => {
          const claim = complaints.find((currentClaim) => currentClaim.id === correctiveAction.claimId);

          return (
            <article className="quality-record-card" key={correctiveAction.id}>
              <div>
                <span>{getClaimLabel(claim)}</span>
                <strong>{correctiveAction.status}</strong>
                <p><b>Causa:</b> {correctiveAction.rootCause}</p>
                <p><b>Accion:</b> {correctiveAction.action}</p>
                {correctiveAction.effectiveness && <p><b>Eficacia:</b> {correctiveAction.effectiveness}</p>}
              </div>
              <div className="quality-record-meta">
                <small>{correctiveAction.date}</small>
                <small>Compromiso: {correctiveAction.dueDate || '-'}</small>
                <small>{correctiveAction.responsible || 'Sin responsable'}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getDocumentFileBaseName(documentRecord) {
  const rawName = `${documentRecord.code || documentRecord.type || 'documento'}-${documentRecord.title || ''}`;
  return String(rawName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'documento-petnova';
}

function getPrintableDocumentStyles() {
  return `
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f4f6; color: #000; font-family: Arial, sans-serif; font-size: 10px; }
    .print-page { width: 8.5in; min-height: 11in; margin: 0 auto; background: #fff; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid #111; padding: 0.055in 0.065in; vertical-align: middle; color: #000; }
    p { margin: 0; line-height: 1.25; }
    .doc-logo { width: 3.7cm; height: 1.8cm; text-align: center; padding: 0.03in; }
    .doc-logo img { display: block; width: 3.45cm; height: 1.65cm; max-width: 3.45cm; max-height: 1.65cm; object-fit: contain; margin: 0 auto; }
    .doc-title { text-align: center; font-size: 13px; font-weight: 800; text-transform: uppercase; }
    .doc-subtitle { text-align: center; font-size: 11px; font-weight: 700; }
    .doc-meta { font-size: 10px; font-weight: 800; }
    .doc-meta span { display: inline-block; width: 0.64in; }
    .band { background: #d9e6f2; text-align: center; font-size: 11px; font-weight: 800; }
    .label { width: 1.3in; font-weight: 800; }
    .info td { min-height: 0.42in; font-size: 10.5px; }
    .activities th, .records th, .methods th, .generic-table th { background: #e9eef2; text-align: center; font-weight: 800; }
    .num { width: 0.42in; text-align: center; font-weight: 800; }
    .method { width: 0.72in; text-align: center; font-weight: 800; }
    .activities td { min-height: 0.27in; font-size: 10px; }
    .methods td { min-height: 0.62in; font-size: 10px; }
    .records th, .records td { font-size: 8px; text-align: center; }
    .footer td { height: 0.72in; text-align: center; font-size: 9px; vertical-align: top; }
    .footer p { margin-top: 0.28in; border-bottom: 1px solid #111; }
    .generic-meta { width: 1.62in; font-size: 10px; font-weight: 800; text-align: center; }
    .generic-fields .field-label { width: 1in; font-weight: 800; }
    .generic-section .section-label { width: 1.45in; font-weight: 800; }
    .generic-signatures td { height: 0.66in; font-size: 9px; font-weight: 800; vertical-align: top; }
    @media print { body { background: #fff; } .print-page { margin: 0; break-after: page; } }
  `;
}

function getPrintableDocumentBody(documentRecord) {
  const content = documentRecord.content ?? {};
  const copy = documentCreationCopy[documentRecord.type] ?? documentCreationCopy.Procedimiento;
  const steps = getDocumentLines(content.steps, ['Actividad pendiente de definir.']);
  const records = getDocumentLines(content.records, ['Registro pendiente de definir.']);
  const logoSrc = `${window.location.origin}/logos/logo-empacar.png`;

  if (documentRecord.type === 'Instructivo') {
    return `
      <main class="print-page">
        <table class="header">
          <tr>
            <td class="doc-logo" rowspan="3"><img src="${logoSrc}" alt="Empacar" width="130" height="62" style="width:3.45cm;height:1.65cm;max-width:3.45cm;max-height:1.65cm;"></td>
            <td class="doc-title">INSTRUCTIVO DE TRABAJO</td>
            <td class="doc-meta"><span>CODIGO:</span>${escapeHtml(documentRecord.code || 'ITR-XXX-00')}</td>
          </tr>
          <tr>
            <td class="doc-subtitle">${escapeHtml(documentRecord.title || 'Titulo del instructivo')}</td>
            <td class="doc-meta"><span>REVISION:</span>${escapeHtml(documentRecord.version || 'Rev.0')}</td>
          </tr>
          <tr>
            <td>&nbsp;</td>
            <td class="doc-meta"><span>PAGINA :</span>3</td>
          </tr>
        </table>
        <table class="info">
          <tr><td class="label">1. OBJETIVO:</td><td>${escapeHtml(content.objective || '-')}</td></tr>
          <tr><td class="label">2. RESPONSABLE:</td><td>${escapeHtml(content.responsibilities || documentRecord.owner || '-')}</td></tr>
          <tr><td class="label">3. FRECUENCIA:</td><td>${escapeHtml(content.scope || '-')}</td></tr>
        </table>
        <table class="activities">
          <tr><th class="band" colspan="3">ACTIVIDADES</th></tr>
          <tr><th class="num">No.</th><th>PASO</th><th class="method">METODO</th></tr>
          ${steps.slice(0, 6).map((step, index) => `
            <tr><td class="num">${index + 1}</td><td>${escapeHtml(step)}</td><td class="method">${index + 1}</td></tr>
          `).join('')}
        </table>
        <table class="methods">
          <tr><th class="band" colspan="2">METODOS</th></tr>
          ${steps.slice(0, 3).map((step, index) => `
            <tr><td class="num">${index + 1}</td><td>${escapeHtml(step)}</td></tr>
          `).join('')}
        </table>
        <table class="records">
          <tr><th class="band" colspan="9">CUADRO DE REGISTROS</th></tr>
          <tr>
            <th>Titulo</th><th>Codigo</th><th>Formato</th><th>Frecuencia llenado</th><th>Lugar de archivo</th><th>Responsable</th><th>Clasificacion</th><th>Tiempo de conservacion</th><th>Disposicion final</th>
          </tr>
          ${records.slice(0, 3).map((record) => `
            <tr>
              <td>${escapeHtml(record)}</td><td>${escapeHtml(documentRecord.code || '-')}</td><td>Digital</td><td>Segun uso</td><td>Sistema PETnova</td><td>${escapeHtml(documentRecord.owner || 'Calidad')}</td><td>Por fecha</td><td>Vigente</td><td>Segun disposicion</td>
            </tr>
          `).join('')}
        </table>
        <table class="footer">
          <tr>
            <td><b>ELABORADO POR:</b><p>${escapeHtml(documentRecord.owner || 'Responsable del proceso')}</p></td>
            <td><b>REVISADO POR:</b><p>Jefe de Sistema de Gestion</p></td>
            <td><b>APROBADO POR:</b><p>Gerencia / Responsable autorizado</p></td>
          </tr>
        </table>
      </main>
    `;
  }

  return `
    <main class="print-page">
      <table class="header">
        <tr>
          <td class="doc-logo"><img src="${logoSrc}" alt="Empacar" width="130" height="62" style="width:3.45cm;height:1.65cm;max-width:3.45cm;max-height:1.65cm;"></td>
          <td class="doc-title">${escapeHtml(documentRecord.title || documentRecord.type || 'Documento')}</td>
          <td class="generic-meta">${escapeHtml(documentRecord.code || 'CODIGO')}<br>REVISION: ${escapeHtml(documentRecord.version || 'Rev.0')}<br>PAGINA: 1 de 1</td>
        </tr>
      </table>
      <table class="generic-fields">
        <tr><th class="band" colspan="4">DATOS DEL DOCUMENTO</th></tr>
        <tr><td class="field-label">Proceso</td><td>${escapeHtml(documentRecord.process || '-')}</td><td class="field-label">Responsable</td><td>${escapeHtml(documentRecord.owner || '-')}</td></tr>
        <tr><td class="field-label">Tipo</td><td>${escapeHtml(documentRecord.type || '-')}</td><td class="field-label">Estado</td><td>Borrador controlado</td></tr>
      </table>
      <table class="generic-section"><tr><td class="section-label">${escapeHtml(copy.objective)}</td><td>${escapeHtml(content.objective || '-')}</td></tr></table>
      <table class="generic-section"><tr><td class="section-label">${escapeHtml(copy.scope)}</td><td>${escapeHtml(content.scope || '-')}</td></tr></table>
      <table class="generic-section"><tr><td class="section-label">${escapeHtml(copy.responsibilities)}</td><td>${escapeHtml(content.responsibilities || '-')}</td></tr></table>
      <table class="generic-table">
        <tr><th class="band" colspan="3">${escapeHtml(copy.steps)}</th></tr>
        <tr><th class="num">No.</th><th>ACTIVIDAD</th><th>RESPONSABLE</th></tr>
        ${steps.slice(0, 8).map((step, index) => `<tr><td class="num">${index + 1}</td><td>${escapeHtml(step)}</td><td>${escapeHtml(documentRecord.owner || 'Proceso')}</td></tr>`).join('')}
      </table>
      <table class="generic-section"><tr><th class="band" colspan="2">${escapeHtml(copy.records)}</th></tr><tr><td class="section-label">Registros</td><td>${escapeHtml(content.records || '-')}</td></tr></table>
      <table class="generic-signatures"><tr><td>ELABORADO POR</td><td>REVISADO POR</td><td>APROBADO POR</td></tr></table>
    </main>
  `;
}

function getProcedureDocumentHtml(documentRecord, { autoPrint = false } = {}) {
  const body = getPrintableDocumentBody(documentRecord);

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(documentRecord.code || documentRecord.title)}</title>
        <style>${getPrintableDocumentStyles()}</style>
      </head>
      <body>
        ${body}
        ${autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>' : ''}
      </body>
    </html>
  `;
}

function openPrintableDocument(documentRecord, { autoPrint = false } = {}) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');

  if (!printWindow) {
    return;
  }

  printWindow.document.write(getProcedureDocumentHtml(documentRecord, { autoPrint }));
  printWindow.document.close();
  printWindow.focus();
}

function printProcedureDocument(documentRecord) {
  openPrintableDocument(documentRecord, { autoPrint: true });
}

function downloadDocumentAsWord(documentRecord) {
  const html = getProcedureDocumentHtml(documentRecord);
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
  downloadBlob(blob, `${getDocumentFileBaseName(documentRecord)}.doc`);
}

function getDocxTemplateData(documentRecord) {
  const content = documentRecord.content ?? {};
  const activities = getDocumentLines(content.steps, ['Actividad pendiente de definir.']);
  const records = getDocumentLines(content.records, ['Registro pendiente de definir.']);
  const owner = String(documentRecord.owner || 'Responsable del proceso').trim();
  const objective = String(content.objective || '-').trim();
  const responsibilities = String(content.responsibilities || owner || '-').trim();
  const scope = String(content.scope || '-').trim();

  return {
    code: String(documentRecord.code || 'ITR-XXX-00').trim(),
    title: String(documentRecord.title || 'Titulo del instructivo').trim(),
    version: String(documentRecord.version || 'Rev.0').trim(),
    pageCount: '3',
    objective,
    responsibilities,
    scope,
    activity1: activities[0] || '',
    activity2: activities[1] || '',
    activity3: activities[2] || '',
    methodNumber1: activities[0] ? '1' : '-',
    methodNumber2: activities[1] ? '2' : '-',
    methodNumber3: activities[2] ? '3' : '-',
    method1: activities[0] || '',
    method2: activities[1] || '',
    recordTitle: records[0] || 'Registro asociado',
    recordCode: String(documentRecord.code || '-').trim(),
    recordFormat: 'Digital',
    recordFrequency: 'Segun uso',
    recordLocation: 'Sistema PETnova',
    recordResponsible: owner || 'Calidad',
    recordClassification: 'Por fecha',
    recordRetention: 'Vigente',
    recordDisposition: 'Segun disposicion',
    owner,
    reviewer: 'Jefe de Sistema de Gestion',
    approver: 'Gerencia / Responsable autorizado',
  };
}

async function downloadDocumentAsDocx(documentRecord) {
  if (documentRecord.type !== 'Instructivo') {
    downloadDocumentAsWord(documentRecord);
    return;
  }

  try {
    const response = await fetch('/templates/itr-rhs-02-template.docx');

    if (!response.ok) {
      throw new Error('No se pudo cargar la plantilla de instructivo.');
    }

    const templateBuffer = await response.arrayBuffer();
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '[[',
        end: ']]',
      },
    });

    doc.render(getDocxTemplateData(documentRecord));
    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });

    downloadBlob(blob, `${getDocumentFileBaseName(documentRecord)}.docx`);
  } catch (error) {
    console.error('No se pudo generar el documento Word con plantilla:', error);
    window.alert('No se pudo generar el Word con la plantilla. Se descargara una version basica.');
    downloadDocumentAsWord(documentRecord);
  }
}

async function downloadDocumentAsPdf(documentRecord) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.style.width = '816px';
  wrapper.innerHTML = `<style>${getPrintableDocumentStyles()}</style>${getPrintableDocumentBody(documentRecord)}`;
  document.body.appendChild(wrapper);

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const page = wrapper.querySelector('.print-page');
    await pdf.html(page, {
      x: 0,
      y: 0,
      width: 612,
      windowWidth: 816,
      html2canvas: { scale: 0.72, useCORS: true },
    });
    pdf.save(`${getDocumentFileBaseName(documentRecord)}.pdf`);
  } finally {
    wrapper.remove();
  }
}

function getDocumentLines(value, fallback = []) {
  const lines = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : fallback;
}

function createPreviewDocumentFromForm(form) {
  return {
    code: form.code,
    title: form.title,
    type: form.type,
    version: form.version,
    owner: form.owner,
    process: form.process,
    content: {
      objective: form.objective,
      scope: form.scope,
      responsibilities: form.responsibilities,
      steps: form.steps,
      records: form.records,
    },
  };
}

function InstructiveDocumentSheet({ documentRecord = {}, blank = false }) {
  const content = documentRecord.content ?? {};
  const steps = blank ? ['', '', ''] : getDocumentLines(content.steps, ['Actividad pendiente de definir.']).slice(0, 5);
  const methods = blank ? ['', ''] : steps.slice(0, 3);
  const records = blank ? [''] : getDocumentLines(content.records, ['Registro pendiente de definir.']).slice(0, 2);

  return (
    <article className="word-instructive-sheet">
      <header className="word-instructive-header">
        <div className="word-instructive-logo">
          <img src="/logos/logo-empacar.png" alt="Empacar" />
        </div>
        <strong>INSTRUCTIVO DE TRABAJO</strong>
        <div className="word-instructive-meta"><b>CODIGO:</b><span>{documentRecord.code || 'ITR-XXX-00'}</span></div>
        <div className="word-instructive-title">{documentRecord.title || 'Titulo del instructivo'}</div>
        <div className="word-instructive-meta"><b>REVISION:</b><span>{documentRecord.version || '--/--/----'}</span></div>
        <div className="word-instructive-empty" />
        <div className="word-instructive-meta"><b>PAGINA :</b><span>3</span></div>
      </header>

      <section className="word-instructive-info">
        <div><b>1. OBJETIVO:</b><p>{blank ? '' : content.objective || '-'}</p></div>
        <div><b>2. RESPONSABLE:</b><p>{blank ? '' : content.responsibilities || documentRecord.owner || '-'}</p></div>
        <div><b>3. FRECUENCIA:</b><p>{blank ? '' : content.scope || '-'}</p></div>
      </section>

      <section className="word-instructive-table activities">
        <h4>ACTIVIDADES</h4>
        <div className="word-instructive-row heading"><span>No.</span><span>PASO</span><span>METODO</span></div>
        {steps.map((step, index) => (
          <div className="word-instructive-row" key={`activity-${index}`}>
            <span>{blank ? '' : index + 1}</span>
            <p>{step}</p>
            <span>{blank ? '' : index + 1}</span>
          </div>
        ))}
      </section>

      <section className="word-instructive-table methods">
        <h4>METODOS</h4>
        {methods.map((method, index) => (
          <div className="word-instructive-method-row" key={`method-${index}`}>
            <span>{blank ? '' : index + 1}</span>
            <p>{method}</p>
          </div>
        ))}
      </section>

      <section className="word-instructive-record-box">
        <h4>CUADRO DE REGISTROS</h4>
        <div className="word-record-grid heading">
          <span>Titulo</span>
          <span>Codigo</span>
          <span>Formato</span>
          <span>Frecuencia llenado</span>
          <span>Lugar de archivo</span>
          <span>Responsable</span>
          <span>Clasificacion</span>
          <span>Tiempo de conservacion</span>
          <span>Disposicion final</span>
        </div>
        {records.map((record, index) => (
          <div className="word-record-grid" key={`record-${index}`}>
            <p>{record}</p>
            <p>{blank ? '' : documentRecord.code || '-'}</p>
            <p>{blank ? '' : 'Digital'}</p>
            <p>{blank ? '' : 'Segun uso'}</p>
            <p>{blank ? '' : 'Sistema PETnova'}</p>
            <p>{blank ? '' : documentRecord.owner || 'Calidad'}</p>
            <p>{blank ? '' : 'Por fecha'}</p>
            <p>{blank ? '' : 'Vigente'}</p>
            <p>{blank ? '' : 'Segun disposicion'}</p>
          </div>
        ))}
      </section>

      <footer className="word-instructive-footer">
        <div><b>ELABORADO POR:</b><p>{blank ? '' : documentRecord.owner || 'Responsable del proceso'}</p></div>
        <div><b>REVISADO POR:</b><p>{blank ? '' : 'Jefe de Sistema de Gestion'}</p></div>
        <div><b>APROBADO POR:</b><p>{blank ? '' : 'Gerencia / Responsable autorizado'}</p></div>
      </footer>
    </article>
  );
}

function ControlledDocumentPreview({ documentRecord, title = 'Vista previa del documento final' }) {
  const documentType = documentRecord?.type ?? 'Procedimiento';
  const content = documentRecord?.content ?? {};
  const copy = documentCreationCopy[documentType] ?? documentCreationCopy.Procedimiento;
  const steps = getDocumentLines(content.steps, ['Actividad pendiente de definir.']);
  const records = getDocumentLines(content.records, ['Registro pendiente de definir.']);

  if (documentType === 'Instructivo') {
    return (
      <div className="controlled-document-preview">
        <span>{title}</span>
        <InstructiveDocumentSheet documentRecord={documentRecord} />
      </div>
    );
  }

  return (
    <div className="controlled-document-preview">
      <span>{title}</span>
      <article className={`document-template-preview document-final-preview ${documentType.toLowerCase()}`}>
        <header>
          <div className="document-template-logo">
            <img src="/logos/logo-empacar.png" alt="Empacar" />
          </div>
          <strong>{documentRecord.title || copy.heading}</strong>
          <div className="document-template-code">
            <span>{documentRecord.code || 'CODIGO'}</span>
            <span>REVISION: {documentRecord.version || 'Rev.0'}</span>
            <span>PAGINA: 1 de 1</span>
          </div>
        </header>
        <div className="document-template-band">DATOS DEL DOCUMENTO</div>
        <div className="document-template-fields filled">
          <span>Proceso</span><p>{documentRecord.process || '-'}</p>
          <span>Responsable</span><p>{documentRecord.owner || '-'}</p>
          <span>Tipo</span><p>{documentType}</p>
          <span>Estado</span><p>Borrador controlado</p>
        </div>
        <div className="document-template-section filled"><b>{copy.objective}</b><p>{content.objective || '-'}</p></div>
        <div className="document-template-section filled"><b>{copy.scope}</b><p>{content.scope || '-'}</p></div>
        <div className="document-template-section filled"><b>{copy.responsibilities}</b><p>{content.responsibilities || '-'}</p></div>
        <div className="document-template-band">{copy.steps}</div>
        <div className="document-template-table filled">
          <span>No.</span><span>ACTIVIDAD</span><span>RESPONSABLE</span>
          {steps.slice(0, 6).map((step, index) => (
            <Fragment key={`procedure-step-${step}-${index}`}>
              <em>{index + 1}</em>
              <p>{step}</p>
              <p>{documentRecord.owner || 'Proceso'}</p>
            </Fragment>
          ))}
        </div>
        <div className="document-template-band">{copy.records}</div>
        <div className="document-template-section filled compact"><b>Registros</b><p>{content.records || '-'}</p></div>
        <div className="document-template-signatures">
          <span>ELABORADO POR</span>
          <span>REVISADO POR</span>
          <span>APROBADO POR</span>
        </div>
      </article>
    </div>
  );
}

function DocumentFormatPreview({ template }) {
  if (template.type === 'Instructivo') {
    return <InstructiveDocumentSheet documentRecord={{ code: template.code, title: template.title }} blank />;
  }

  return (
    <article className={`document-template-preview ${template.type.toLowerCase()}`}>
      <header>
        <div className="document-template-logo">
          <img src="/logos/logo-empacar.png" alt="Empacar" />
        </div>
        <strong>{template.title}</strong>
        <div className="document-template-code">
          <span>{template.code}</span>
          <span>REVISION: --/--/----</span>
          <span>PAGINA: 1 de 1</span>
        </div>
      </header>

      {template.type === 'Registro' ? (
        <>
          <div className="document-template-band">DATOS DEL REGISTRO</div>
          <div className="document-template-fields">
            <span>Fecha</span><i />
            <span>Responsable</span><i />
            <span>Codigo / referencia</span><i />
            <span>Proceso</span><i />
          </div>
          <div className="document-template-band">CONTROL / VERIFICACION</div>
          <div className="document-template-grid">
            {Array.from({ length: 24 }, (_, index) => <i key={index} />)}
          </div>
          <div className="document-template-footer">
            <span>Observaciones</span>
            <span>Firma</span>
          </div>
        </>
      ) : (
        <>
          <div className="document-template-section"><b>1. OBJETIVO</b><i /></div>
          <div className="document-template-section"><b>2. RESPONSABLE</b><i /></div>
          <div className="document-template-section"><b>3. FRECUENCIA / ALCANCE</b><i /></div>
          <div className="document-template-band">ACTIVIDADES</div>
          <div className="document-template-table">
            <span>No.</span><span>PASO</span><span>METODO</span>
            <i /><i /><i />
            <i /><i /><i />
          </div>
          <div className="document-template-signatures">
            <span>ELABORADO POR</span>
            <span>REVISADO POR</span>
            <span>APROBADO POR</span>
          </div>
        </>
      )}
    </article>
  );
}

function QualityDocumentsView({ qualityManagement, setQualityManagement }) {
  const documents = qualityManagement.documents ?? [];
  const [selectedDocumentId, setSelectedDocumentId] = useState(documents[0]?.id ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState(documentFormatTemplates[0].id);
  const [pdfForm, setPdfForm] = useState({
    code: '',
    title: '',
    type: 'Procedimiento',
    version: 'Rev.0',
    owner: '',
    process: '',
    file: null,
  });
  const [procedureForm, setProcedureForm] = useState({
    type: 'Procedimiento',
    code: '',
    title: '',
    version: 'Rev.0',
    owner: '',
    process: '',
    aiContext: '',
    objective: '',
    scope: '',
    responsibilities: '',
    steps: '',
    records: '',
  });
  const [message, setMessage] = useState('');
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);

  const selectedDocument = documents.find((item) => item.id === selectedDocumentId) ?? documents[0] ?? null;
  const selectedTemplate = documentFormatTemplates.find((template) => template.id === selectedTemplateId) ?? documentFormatTemplates[0];
  const creationCopy = documentCreationCopy[procedureForm.type] ?? documentCreationCopy.Procedimiento;
  const draftPreviewDocument = createPreviewDocumentFromForm(procedureForm);
  const hasDraftContent = Boolean(
    procedureForm.title.trim()
    || procedureForm.objective.trim()
    || procedureForm.scope.trim()
    || procedureForm.responsibilities.trim()
    || procedureForm.steps.trim()
    || procedureForm.records.trim()
  );
  const platformPreviewDocument = hasDraftContent ? draftPreviewDocument : selectedDocument;
  const canPreviewPlatformDocument = Boolean(platformPreviewDocument && !platformPreviewDocument.fileDataUrl);
  const platformPreviewTitle = hasDraftContent ? 'Documento en revision' : 'Documento finalizado';

  useEffect(() => {
    if (!selectedDocumentId && documents[0]?.id) {
      setSelectedDocumentId(documents[0].id);
    }
  }, [documents, selectedDocumentId]);

  const updatePdfForm = (field, value) => {
    setPdfForm((currentForm) => ({ ...currentForm, [field]: value }));
    setMessage('');
  };

  const updateProcedureForm = (field, value) => {
    setProcedureForm((currentForm) => ({ ...currentForm, [field]: value }));
    setMessage('');
  };

  const selectCreationType = (type) => {
    updateProcedureForm('type', type);
    const template = documentFormatTemplates.find((item) => item.type === type);
    if (template) {
      setSelectedTemplateId(template.id);
    }
  };

  const useSelectedTemplate = () => {
    const templateCopy = documentCreationCopy[selectedTemplate.type] ?? documentCreationCopy.Procedimiento;

    setProcedureForm((currentForm) => ({
      ...currentForm,
      type: selectedTemplate.type,
      code: currentForm.code || selectedTemplate.code,
      title: currentForm.title || selectedTemplate.title,
      version: currentForm.version || 'Rev.0',
      aiContext: currentForm.aiContext || selectedTemplate.description,
      objective: currentForm.objective || templateCopy.objectivePlaceholder,
      scope: currentForm.scope || 'Aplica al proceso definido por el sistema de gestion de calidad.',
      responsibilities: currentForm.responsibilities || 'El responsable del proceso debe ejecutar, registrar y verificar el cumplimiento del documento.',
      steps: currentForm.steps || 'Verificar las condiciones iniciales.\nEjecutar la actividad segun el metodo definido.\nRegistrar los resultados y comunicar desviaciones.',
      records: currentForm.records || 'Registros aplicables segun el proceso.',
    }));
    setPdfForm((currentForm) => ({
      ...currentForm,
      code: currentForm.code || selectedTemplate.code,
      title: currentForm.title || selectedTemplate.title,
      type: selectedTemplate.type,
    }));
    setMessage(`Plantilla de ${selectedTemplate.type.toLowerCase()} seleccionada para crear o cargar.`);
  };

  const savePdfDocument = (event) => {
    event.preventDefault();

    if (!pdfForm.title.trim() || !pdfForm.file) {
      setMessage('Ingrese el titulo y seleccione un PDF.');
      return;
    }

    if (pdfForm.file.type !== 'application/pdf') {
      setMessage('Solo se puede cargar archivos PDF.');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const newDocument = normalizeQualityDocument({
        code: pdfForm.code.trim(),
        title: pdfForm.title.trim(),
        type: pdfForm.type,
        version: pdfForm.version.trim() || 'Rev.0',
        owner: pdfForm.owner.trim(),
        process: pdfForm.process.trim(),
        fileName: pdfForm.file.name,
        fileDataUrl: String(reader.result),
      });

      setQualityManagement((currentState) => ({
        ...currentState,
        documents: [newDocument, ...(currentState.documents ?? [])],
      }));
      setSelectedDocumentId(newDocument.id);
      setPdfForm({
        code: '',
        title: '',
        type: 'Procedimiento',
        version: 'Rev.0',
        owner: '',
        process: '',
        file: null,
      });
      setMessage('PDF cargado en la gestion de documentos.');
    };

    reader.readAsDataURL(pdfForm.file);
  };

  const saveProcedureDocument = () => {
    if (!procedureForm.title.trim() || !procedureForm.objective.trim() || !procedureForm.steps.trim()) {
      setMessage(`Ingrese titulo, ${creationCopy.objective.toLowerCase()} y ${creationCopy.steps.toLowerCase()}.`);
      return;
    }

    const newDocument = normalizeQualityDocument({
      code: procedureForm.code.trim(),
      title: procedureForm.title.trim(),
      type: procedureForm.type,
      version: procedureForm.version.trim() || 'Rev.0',
      owner: procedureForm.owner.trim(),
      process: procedureForm.process.trim(),
      status: 'Finalizado',
      content: {
        objective: procedureForm.objective.trim(),
        scope: procedureForm.scope.trim(),
        responsibilities: procedureForm.responsibilities.trim(),
        steps: procedureForm.steps.trim(),
        records: procedureForm.records.trim(),
      },
    });

    setQualityManagement((currentState) => ({
      ...currentState,
      documents: [newDocument, ...(currentState.documents ?? [])],
    }));
    setSelectedDocumentId(newDocument.id);
    setProcedureForm({
      type: procedureForm.type,
      code: '',
      title: '',
      version: 'Rev.0',
      owner: '',
      process: '',
      aiContext: '',
      objective: '',
      scope: '',
      responsibilities: '',
      steps: '',
      records: '',
    });
    setMessage(`${procedureForm.type} creado.`);
  };

  const clearProcedureDraft = () => {
    setProcedureForm({
      type: procedureForm.type,
      code: '',
      title: '',
      version: 'Rev.0',
      owner: '',
      process: '',
      aiContext: '',
      objective: '',
      scope: '',
      responsibilities: '',
      steps: '',
      records: '',
    });
    setMessage('Borrador limpiado.');
  };

  const generateDocumentWithAi = async () => {
    if (!['Registro', 'Procedimiento', 'Instructivo'].includes(procedureForm.type)) {
      setMessage('Seleccione Registro, Procedimiento o Instructivo.');
      return;
    }

    if (!procedureForm.title.trim() && !procedureForm.objective.trim() && !procedureForm.steps.trim()) {
      setMessage('Ingrese al menos titulo, contexto, objetivo o pasos para que la IA tenga base.');
      return;
    }

    setIsGeneratingDocument(true);
    setMessage('');

    try {
      const response = await fetch('/api/petnova-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: procedureForm.type,
          draft: procedureForm,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? 'No se pudo generar el documento con IA.');
      }

      const generatedDocument = data.document ?? {};
      setProcedureForm((currentForm) => ({
        ...currentForm,
        code: generatedDocument.code || currentForm.code,
        title: generatedDocument.title || currentForm.title,
        version: generatedDocument.version || currentForm.version,
        owner: generatedDocument.owner || currentForm.owner,
        process: generatedDocument.process || currentForm.process,
        objective: generatedDocument.objective || currentForm.objective,
        scope: generatedDocument.scope || currentForm.scope,
        responsibilities: generatedDocument.responsibilities || currentForm.responsibilities,
        steps: generatedDocument.steps || currentForm.steps,
        records: generatedDocument.records || currentForm.records,
      }));
      setMessage(`${procedureForm.type} enriquecido con IA. Revise el documento antes de guardarlo.`);
    } catch (error) {
      setMessage(error.message ?? 'No se pudo generar el documento con IA.');
    } finally {
      setIsGeneratingDocument(false);
    }
  };

  return (
    <section className="quality-documents-section">
      <div className="section-heading">
        <div>
          <span>ISO 9001:2015 / 7.5</span>
          <h2>Gestion de documentos</h2>
        </div>
        <strong className="record-count">{documents.length} documentos</strong>
      </div>

      {message && <strong className="format-admin-message">{message}</strong>}

      <article className="document-template-panel">
        <div className="document-template-header">
          <div>
            <span>Formatos base</span>
            <h3>Preview solo del formato</h3>
            <p>Seleccione Registro, Procedimiento o Instructivo para ver la estructura base antes de crear o cargar el documento.</p>
          </div>
          <button type="button" className="secondary-action" onClick={useSelectedTemplate}>
            Usar formato
          </button>
        </div>
        <div className="document-template-layout">
          <div className="document-template-list">
            {documentFormatTemplates.map((template) => (
              <button
                type="button"
                key={template.id}
                className={`document-template-option ${selectedTemplate.id === template.id ? 'active' : ''}`}
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <span>{template.type}</span>
                <strong>{template.title}</strong>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
          <DocumentFormatPreview template={selectedTemplate} />
        </div>
      </article>

      <div className="document-management-layout">
        <div className="document-forms">
          <form className="document-form-panel" onSubmit={savePdfDocument}>
            <h3>Cargar formato PDF</h3>
            <label className="field">
              <span>Codigo</span>
              <input type="text" value={pdfForm.code} onChange={(event) => updatePdfForm('code', event.target.value)} placeholder="Ej. PRO-CAL-01" />
            </label>
            <label className="field">
              <span>Titulo</span>
              <input type="text" value={pdfForm.title} onChange={(event) => updatePdfForm('title', event.target.value)} />
            </label>
            <div className="document-form-grid">
              <label className="field">
                <span>Tipo</span>
                <select value={pdfForm.type} onChange={(event) => updatePdfForm('type', event.target.value)}>
                  {documentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Version</span>
                <input type="text" value={pdfForm.version} onChange={(event) => updatePdfForm('version', event.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Responsable</span>
              <input type="text" value={pdfForm.owner} onChange={(event) => updatePdfForm('owner', event.target.value)} />
            </label>
            <label className="field">
              <span>Proceso</span>
              <input type="text" value={pdfForm.process} onChange={(event) => updatePdfForm('process', event.target.value)} />
            </label>
            <label className="field">
              <span>Archivo PDF</span>
              <input type="file" accept="application/pdf" onChange={(event) => updatePdfForm('file', event.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" className="primary-action">Guardar PDF</button>
          </form>

          <form className="document-form-panel document-creation-form" onSubmit={(event) => event.preventDefault()}>
            <div className="document-creation-title">
              <span>Creacion de documentos</span>
              <h3>{creationCopy.heading}</h3>
              <p>Complete el borrador, use la IA para enriquecerlo y revise la vista previa antes de guardar.</p>
            </div>
            <div className="document-type-selector" role="tablist" aria-label="Tipo de documento a crear">
              {['Registro', 'Procedimiento', 'Instructivo'].map((type) => (
                <button
                  type="button"
                  key={type}
                  className={procedureForm.type === type ? 'active' : ''}
                  onClick={() => selectCreationType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="document-form-grid">
              <label className="field">
                <span>Codigo</span>
                <input type="text" value={procedureForm.code} onChange={(event) => updateProcedureForm('code', event.target.value)} placeholder="Ej. PRO-SGC-01" />
              </label>
              <label className="field">
                <span>Version</span>
                <input type="text" value={procedureForm.version} onChange={(event) => updateProcedureForm('version', event.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Titulo</span>
              <input type="text" value={procedureForm.title} onChange={(event) => updateProcedureForm('title', event.target.value)} />
            </label>
            <label className="field">
              <span>Contexto para IA</span>
              <textarea
                value={procedureForm.aiContext}
                onChange={(event) => updateProcedureForm('aiContext', event.target.value)}
                rows={3}
                placeholder="Explique el proceso, restricciones, equipos, riesgos o datos importantes que la IA debe tomar en cuenta."
              />
            </label>
            <div className="document-form-grid">
              <label className="field">
                <span>Proceso</span>
                <input type="text" value={procedureForm.process} onChange={(event) => updateProcedureForm('process', event.target.value)} />
              </label>
              <label className="field">
                <span>Responsable</span>
                <input type="text" value={procedureForm.owner} onChange={(event) => updateProcedureForm('owner', event.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>{creationCopy.objective}</span>
              <textarea value={procedureForm.objective} onChange={(event) => updateProcedureForm('objective', event.target.value)} rows={3} placeholder={creationCopy.objectivePlaceholder} />
            </label>
            <label className="field">
              <span>{creationCopy.scope}</span>
              <textarea value={procedureForm.scope} onChange={(event) => updateProcedureForm('scope', event.target.value)} rows={3} />
            </label>
            <label className="field">
              <span>{creationCopy.responsibilities}</span>
              <textarea value={procedureForm.responsibilities} onChange={(event) => updateProcedureForm('responsibilities', event.target.value)} rows={3} />
            </label>
            <label className="field">
              <span>{creationCopy.steps}</span>
              <textarea value={procedureForm.steps} onChange={(event) => updateProcedureForm('steps', event.target.value)} rows={5} placeholder="Una actividad por linea" />
            </label>
            <label className="field">
              <span>{creationCopy.records}</span>
              <textarea value={procedureForm.records} onChange={(event) => updateProcedureForm('records', event.target.value)} rows={3} />
            </label>
            <div className="document-ai-actions">
              <button type="button" className="secondary-action" onClick={generateDocumentWithAi} disabled={isGeneratingDocument}>
                {isGeneratingDocument ? 'Generando...' : 'Generar con IA'}
              </button>
              <button type="button" className="secondary-action" onClick={clearProcedureDraft} disabled={!hasDraftContent}>
                Limpiar borrador
              </button>
            </div>
          </form>
        </div>

        <aside className="document-viewer-panel">
          <div className="document-draft-preview-panel">
            <div className="pdf-viewer-heading">
              <div>
                <span>{hasDraftContent ? 'Borrador en plataforma' : 'Documento seleccionado'}</span>
                <strong>{hasDraftContent ? 'Vista previa antes de guardar' : 'Vista final del documento'}</strong>
                <small>
                  {hasDraftContent
                    ? `${procedureForm.type} en edicion`
                    : selectedDocument
                      ? `${selectedDocument.status || 'Finalizado'} / ${selectedDocument.type}`
                      : 'Complete los campos para ver el documento'}
                </small>
              </div>
            </div>
            {canPreviewPlatformDocument ? (
              <>
                <div className="document-output-tools">
                  <button type="button" className="secondary-action" onClick={() => downloadDocumentAsDocx(platformPreviewDocument)}>
                    Word (.docx)
                  </button>
                  <button type="button" className="secondary-action" onClick={() => downloadDocumentAsPdf(platformPreviewDocument)}>
                    PDF
                  </button>
                  <button type="button" className="secondary-action" onClick={() => printProcedureDocument(platformPreviewDocument)}>
                    Imprimir
                  </button>
                  {hasDraftContent && (
                    <button type="button" className="primary-action" onClick={saveProcedureDocument}>
                      Guardar documento
                    </button>
                  )}
                </div>
                <div className="procedure-preview">
                  <ControlledDocumentPreview documentRecord={platformPreviewDocument} title={platformPreviewTitle} />
                </div>
              </>
            ) : selectedDocument?.fileDataUrl ? (
              <div className="mold-placeholder">El PDF guardado se muestra en el visor inferior.</div>
            ) : (
              <div className="mold-placeholder">El documento finalizado se mostrara aqui despues de guardarse.</div>
            )}
          </div>

          <div className="document-list">
            {documents.length === 0 ? (
              <div className="empty-database">Todavia no hay documentos cargados.</div>
            ) : documents.map((documentRecord) => (
              <button
                type="button"
                className={`document-list-item ${selectedDocument?.id === documentRecord.id ? 'active' : ''}`}
                key={documentRecord.id}
                onClick={() => setSelectedDocumentId(documentRecord.id)}
              >
                <span>{documentRecord.code || documentRecord.type}</span>
                <strong>{documentRecord.title}</strong>
                <small>{documentRecord.status || 'Vigente'} / {documentRecord.version} / {documentRecord.process || 'Sin proceso'}</small>
              </button>
            ))}
          </div>

          <div className="pdf-viewer-box">
            {!selectedDocument ? (
              <div className="mold-placeholder">Seleccione o cree un documento para verlo aqui.</div>
            ) : selectedDocument.fileDataUrl ? (
              <>
                <div className="pdf-viewer-heading">
                  <div>
                    <span>{selectedDocument.type}</span>
                    <strong>{selectedDocument.title}</strong>
                    <small>{selectedDocument.fileName}</small>
                  </div>
                  <a className="secondary-action" href={selectedDocument.fileDataUrl} download={selectedDocument.fileName || `${selectedDocument.title}.pdf`}>
                    Descargar
                  </a>
                </div>
                <iframe title={selectedDocument.title} src={selectedDocument.fileDataUrl} />
              </>
            ) : (
              <>
                <div className="pdf-viewer-heading">
                  <div>
                    <span>{selectedDocument.type}</span>
                    <strong>{selectedDocument.title}</strong>
                    <small>{selectedDocument.code || 'Sin codigo'} / {selectedDocument.version}</small>
                  </div>
                  <div className="document-output-tools compact">
                    <button type="button" className="secondary-action" onClick={() => downloadDocumentAsDocx(selectedDocument)}>
                      Word (.docx)
                    </button>
                    <button type="button" className="secondary-action" onClick={() => downloadDocumentAsPdf(selectedDocument)}>
                      PDF
                    </button>
                    <button type="button" className="secondary-action" onClick={() => printProcedureDocument(selectedDocument)}>
                      Imprimir
                    </button>
                  </div>
                </div>
                <div className="procedure-preview">
                  <ControlledDocumentPreview documentRecord={selectedDocument} title="Documento guardado" />
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function PasswordField({ label, value, onChange, autoComplete }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label className="field password-field">
      <span>{label}</span>
      <div className="password-input-wrap">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className={`password-visibility-toggle ${isVisible ? 'visible' : ''}`}
          onClick={() => setIsVisible((current) => !current)}
          aria-label={isVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          title={isVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        >
          <span aria-hidden="true" className="password-eye-icon" />
        </button>
      </div>
    </label>
  );
}

function PasswordStrengthMeter({ password }) {
  const strength = getPasswordStrength(password);
  const width = `${(strength.score / strength.checks.length) * 100}%`;

  return (
    <div className={`password-strength ${strength.className}`} aria-live="polite">
      <div className="password-strength-heading">
        <span>Nivel de seguridad</span>
        <strong>{strength.label}</strong>
      </div>
      <div className="password-strength-track" aria-hidden="true">
        <span style={{ width }} />
      </div>
      <div className="password-strength-checks">
        {strength.checks.map((check) => (
          <small className={check.ok ? 'ok' : ''} key={check.key}>{check.label}</small>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, onLocalLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  

  const submitLogin = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    // Intentar autenticacion local primero (backend Postgres). Si falla,
    // continuar con Supabase (si esta disponible).
    if (typeof onLocalLogin === 'function') {
      try {
        const localResult = await onLocalLogin(username, password);
        console.log('localResult', localResult);
        if (localResult?.ok) {
          setIsLoading(false);
          return;
        }
        // si no ok, seguir al intent de Supabase
      } catch (err) {
        console.error('local login error', err);
        // fallo local -> intentar Supabase a continuacion
      }
    }

    if (!supabaseConfigReady || !supabase) {
      setError('Faltan variables de Supabase y la autenticacion local fallo.');
      setIsLoading(false);
      return;
    }

    if (!username.trim() || !password) {
      setError('Ingrese usuario y contrasena.');
      setIsLoading(false);
      return;
    }

    const loginEmail = getLoginEmail(username);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (loginError || !data.user) {
      setError(`${loginError?.message ?? 'Usuario o contrasena incorrectos.'} Usuario usado: ${loginEmail}`);
      setIsLoading(false);
      return;
    }

    const loginResult = await onLogin(data.user);

    if (!loginResult?.ok) {
      setError(loginResult?.message ?? 'No se pudo iniciar sesion.');
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
  };

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-logo-pair login-logo-pair">
            <img src="/logos/logo-empacar.png" alt="Logo Empacar" />
            <img src="/logos/petnova-logo.svg" alt="Logo PETnova" />
          </div>
          <div>
            <strong>PETnova</strong>
          </div>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <div>
            <span className="eyebrow">Acceso restringido</span>
            <h1>Iniciar sesion</h1>
          </div>

          <label className="field">
            <span>Usuario</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
          </label>

          <PasswordField
            label="Contrasena"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          {error && <strong className="login-error">{error}</strong>}

          <button type="submit" className="primary-action" disabled={isLoading}>
            {isLoading ? 'Validando...' : 'Entrar'}
          </button>
        </form>

        
      </section>
    </main>
  );
}

function UserSettingsModal({ user, theme, onThemeChange, onLogout, onClose, onAudit }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const updatePassword = async (event) => {
    event.preventDefault();
    setMessage('');

    if (!currentPassword) {
      setMessage('Ingrese la contrasena actual.');
      return;
    }

    const passwordSecurityMessage = getPasswordSecurityMessage(newPassword);

    if (passwordSecurityMessage) {
      setMessage(passwordSecurityMessage);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Las contrasenas no coinciden.');
      return;
    }

    setIsSaving(true);
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user?.username ?? '',
      password: currentPassword,
    });

    if (verificationError) {
      setIsSaving(false);
      setMessage('La contrasena actual no es correcta.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSaving(false);

    if (error) {
      setMessage(`No se pudo cambiar la contrasena: ${error.message}`);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('Contrasena actualizada correctamente.');
    onAudit?.({
      action: 'Cambio contrasena',
      area: 'Seguridad',
      target: user?.username ?? '',
      detail: 'Usuario actualizo su contrasena',
    });
  };

  return (
    <div className="user-settings-overlay" role="dialog" aria-modal="true" aria-label="Configuracion de usuario">
      <section className="user-settings-panel">
        <div className="user-settings-header">
          <div>
            <span>Configuracion de usuario</span>
            <h2>{formatDisplayName(user?.displayName ?? user?.username)}</h2>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>Cerrar</button>
        </div>

        <div className="user-info-grid">
          <div>
            <span>Usuario</span>
            <strong>{formatDisplayName(user?.displayName ?? user?.username)}</strong>
          </div>
          <div>
            <span>Cuenta</span>
            <strong>{user?.username ?? 'Sin dato'}</strong>
          </div>
          <div>
            <span>ID</span>
            <strong>{user?.userId ? user.userId.slice(0, 8) : '-'}</strong>
          </div>
          <div>
            <span>Rol</span>
            <strong>{userRoleLabels[user?.role] ?? 'Control de calidad'}</strong>
          </div>
        </div>

        <div className="theme-toggle-panel">
          <span>Modo de visualizacion</span>
          <div>
            <button
              type="button"
              className={`secondary-action ${theme === 'light' ? 'active-option' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`secondary-action ${theme === 'dark' ? 'active-option' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              Dark
            </button>
          </div>
        </div>

        <form className="user-settings-form" onSubmit={updatePassword}>
          <div>
            <span className="settings-section-label">Seguridad</span>
          </div>
          <PasswordField
            label="Contrasena actual"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
          <PasswordField
            label="Nueva contrasena"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={newPassword} />
          <PasswordField
            label="Confirmar contrasena"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
          {message && <strong className="user-settings-message">{message}</strong>}
          <button type="submit" className="primary-action" disabled={isSaving}>
            {isSaving ? 'Guardando' : 'Cambiar contrasena'}
          </button>
        </form>

        <button type="button" className="danger-action user-settings-logout" onClick={onLogout}>
          Cerrar sesion
        </button>
      </section>
    </div>
  );
}

function App() {
  const [records, setRecords] = useState(loadRecords);
  const [currentView, setCurrentView] = useState(getInitialView);
  const [visualControlSessions, setVisualControlSessions] = useState(() => loadVisualControlState().sessions);
  const [visualControlResponsible, setVisualControlResponsible] = useState(() => loadVisualControlState().responsible);
  const [closedVisualRounds, setClosedVisualRounds] = useState(() => loadVisualControlState().closedRounds);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [bottleFormats, setBottleFormats] = useState(loadLocalBottleFormats);
  const [productionFormats, setProductionFormats] = useState(loadLocalProductionFormats);
  const [masterFormats, setMasterFormats] = useState([]);
  const [formatsReady, setFormatsReady] = useState(false);
  const [formatsError, setFormatsError] = useState('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [visualSyncNotice, setVisualSyncNotice] = useState('');
  const [savedVisualReports, setSavedVisualReports] = useState(loadSavedVisualReports);
  const [qualityManagement, setQualityManagement] = useState(loadQualityManagementState);
  const [measurementEquipmentRecords, setMeasurementEquipmentRecords] = useState(loadMeasurementEquipmentRecords);
  const [operatorProductionRecords, setOperatorProductionRecords] = useState(loadOperatorProductionRecords);
  const [blowerVariableControlRecords, setBlowerVariableControlRecords] = useState(loadBlowerVariableControlRecords);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(loadThemePreference);
  const [auditLogs, setAuditLogs] = useState(loadAuditLogs);
  const currentUserIsAdmin = isAdminUser(authUser);
  const currentUserIsGuest = isGuestUser(authUser);
  const currentUserCanManageFormats = canManageFormats(authUser);
  const allowedViewIds = useMemo(() => getAllowedViewIdsForUser(authUser), [authUser?.role]);
  const defaultAllowedViewId = allowedViewIds[0] ?? 'dashboard';

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveVisualControlState({
      sessions: visualControlSessions,
      responsible: visualControlResponsible,
      closedRounds: closedVisualRounds,
    });
  }, [visualControlSessions, visualControlResponsible, closedVisualRounds]);

  useEffect(() => {
    saveSavedVisualReports(savedVisualReports);
  }, [savedVisualReports]);

  useEffect(() => {
    saveQualityManagementState(qualityManagement);
  }, [qualityManagement]);

  useEffect(() => {
    saveMeasurementEquipmentRecords(measurementEquipmentRecords);
  }, [measurementEquipmentRecords]);

  useEffect(() => {
    saveOperatorProductionRecords(operatorProductionRecords);
  }, [operatorProductionRecords]);

  useEffect(() => {
    saveBlowerVariableControlRecords(blowerVariableControlRecords);
  }, [blowerVariableControlRecords]);

  useEffect(() => {
    saveAuditLogs(auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    saveThemePreference(theme);
    document.documentElement.dataset.theme = theme;

    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, [theme]);

  useEffect(() => {
    saveLocalProductionFormats(productionFormats);
  }, [productionFormats]);

  useEffect(() => {
    if (masterFormats.length === 0) {
      return;
    }

    const listSignature = (items) => JSON.stringify((items ?? []).map((item) => ({
      id: item.id,
      label: item.label ?? item.name,
      imagePath: item.imagePath,
      specs: item.specs,
      saiCode: item.saiCode,
    })));
    const masterProductionFormats = masterFormats.map(mapMasterFormatToProductionFormat);
    const masterBottleFormats = masterFormats.map(mapMasterFormatToBottleFormat);

    setProductionFormats((currentFormats) => {
      const mergedFormats = uniqueProductionFormatsByIdentity([...currentFormats, ...masterProductionFormats]);
      return listSignature(mergedFormats) === listSignature(currentFormats) ? currentFormats : mergedFormats;
    });
    setBottleFormats((currentFormats) => {
      const mergedFormats = dedupeTechnicalFormats(uniqueById([...currentFormats, ...masterBottleFormats]), masterProductionFormats);
      if (listSignature(mergedFormats) === listSignature(currentFormats)) {
        return currentFormats;
      }
      saveLocalBottleFormats(mergedFormats);
      return mergedFormats;
    });
  }, [masterFormats]);

  useEffect(() => {
    const syncViewFromHash = () => {
      setCurrentView(getInitialView());
    };

    window.addEventListener('hashchange', syncViewFromHash);
    window.addEventListener('popstate', syncViewFromHash);
    return () => {
      window.removeEventListener('hashchange', syncViewFromHash);
      window.removeEventListener('popstate', syncViewFromHash);
    };
  }, []);

  useEffect(() => {
    if (!authUser || allowedViewIds.includes(currentView)) {
      return;
    }

    setCurrentView(defaultAllowedViewId);
    window.history.replaceState(null, '', `#${defaultAllowedViewId}`);
  }, [allowedViewIds, authUser, currentView, defaultAllowedViewId]);

  useEffect(() => {
    const syncSupabaseSession = async () => {
      const localSession = loadAuthSession();

      if (localSession?.authProvider === 'local') {
        const localUser = await getLocalSession();
        if (localUser) {
          setAuthUser(localSession);
        } else {
          saveAuthSession(null);
          setAuthUser(null);
        }
        setAuthReady(true);
        return;
      }

      if (!supabaseConfigReady || !supabase) {
        saveAuthSession(null);
        setAuthUser(null);
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (localSession && data.session?.user) {
        const trustedSession = {
          ...localSession,
          role: await getTrustedQualityRole(data.session.user),
        };
        const lockResult = await acquireActiveUserSession(trustedSession);

        if (lockResult.ok) {
          saveAuthSession(trustedSession);
          setAuthUser(trustedSession);
        } else {
          saveAuthSession(null);
          await supabase.auth.signOut();
          setAuthUser(null);
        }
      } else {
        saveAuthSession(null);
        if (data.session) {
          await supabase.auth.signOut();
        }
        setAuthUser(null);
      }

      setAuthReady(true);
    };

    syncSupabaseSession();
  }, []);

  useEffect(() => {
    if (!authUser || !supabase || authUser.authProvider === 'local') {
      return undefined;
    }

    const validateSession = async () => {
      const activeSession = loadAuthSession();

      if (!activeSession) {
        await releaseActiveUserSession(authUser);
        await supabase.auth.signOut();
        setAuthUser(null);
        return;
      }

      await refreshActiveUserSession(authUser);
    };

    const intervalId = window.setInterval(validateSession, ACTIVE_SESSION_HEARTBEAT_MS);
    validateSession();

    return () => window.clearInterval(intervalId);
  }, [authUser]);

  useEffect(() => {
    if (!authUser?.userId) {
      setBottleFormats([]);
      setMasterFormats([]);
      setFormatsReady(false);
      setFormatsError('');
      return undefined;
    }

    let isMounted = true;

    const loadBottleFormats = async () => {
      setFormatsReady(false);
      setFormatsError('');

      try {
        let savedMasterFormats = [];

        try {
          savedMasterFormats = await loadMasterFormatsFromSupabase();
        } catch (masterFormatError) {
          console.error('No se pudo cargar la tabla unica de formatos desde Supabase:', masterFormatError);
        }

        const formats = await loadBottleFormatsFromSupabase();

        if (!isMounted) {
          return;
        }

        const masterBottleFormats = savedMasterFormats.map(mapMasterFormatToBottleFormat);
        const masterProductionFormats = savedMasterFormats.map(mapMasterFormatToProductionFormat);

        setMasterFormats(savedMasterFormats);
        setBottleFormats((currentFormats) => {
          const mergedFormats = dedupeTechnicalFormats(uniqueById([...masterBottleFormats, ...currentFormats, ...formats]), productionFormats);
          saveLocalBottleFormats(mergedFormats);
          return mergedFormats;
        });

        try {
          const savedProductionFormats = await loadProductionFormatsFromSupabase();

          if (isMounted) {
            setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([...masterProductionFormats, ...currentFormats, ...savedProductionFormats]));
          }
        } catch (productionFormatError) {
          console.error('No se pudieron cargar los formatos de produccion desde Supabase:', productionFormatError);
          if (isMounted && masterProductionFormats.length > 0) {
            setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([...masterProductionFormats, ...currentFormats]));
          }
        }
      } catch (error) {
        console.error('No se pudieron cargar las especificaciones tecnicas desde Supabase:', error);

        if (isMounted) {
          const localFormats = loadLocalBottleFormats();
          setBottleFormats(localFormats);
          setFormatsError('No se pudieron cargar los formatos tecnicos desde Supabase.');
        }
      } finally {
        if (isMounted) {
          setFormatsReady(true);
        }
      }
    };

    const loadVisualControls = async () => {
      try {
        const localVisualState = loadVisualControlState();
        const deletedSessionIds = loadDeletedVisualSessionIds();
        const syncResult = await syncLocalVisualSessionsToSupabase(localVisualState.sessions, authUser.userId, deletedSessionIds);

        if (!isMounted) {
          return;
        }

        if (!syncResult.ok) {
          setVisualSyncNotice(syncResult.message ?? 'No se pudieron sincronizar las rondas locales con Supabase.');
        } else if (syncResult.synced > 0) {
          setVisualSyncNotice(`Rondas locales sincronizadas con Supabase: ${syncResult.synced}.`);
        } else {
          setVisualSyncNotice('');
        }

        const sessions = (await loadVisualSessionsFromSupabase())
          .filter((session) => !deletedSessionIds.includes(session.id));

        if (!isMounted) {
          return;
        }

        setVisualControlSessions(sessions);
      } catch (error) {
        console.error('No se pudieron cargar los controles visuales desde Supabase:', error);
        setVisualSyncNotice('No se pudieron cargar los controles visuales desde Supabase.');
      }
    };

    const loadSavedReports = async () => {
      try {
        const reports = await loadVisualReportsFromSupabase();

        if (!isMounted) {
          return;
        }

        setSavedVisualReports(reports);
      } catch (error) {
        console.error('No se pudieron cargar los reportes visuales guardados:', error);
      }
    };

    const loadAuditTrail = async () => {
      if (!isAdminUser(authUser)) {
        return;
      }

      try {
        const remoteLogs = await loadAuditLogsFromSupabase();

        if (!isMounted) {
          return;
        }

        setAuditLogs((currentLogs) => {
          const mergedLogs = uniqueById([...remoteLogs, ...currentLogs])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 500);
          saveAuditLogs(mergedLogs);
          return mergedLogs;
        });
      } catch (error) {
        console.error('No se pudo cargar la auditoria desde Supabase:', error);
      }
    };

    loadBottleFormats();
    loadVisualControls();
    loadSavedReports();
    loadAuditTrail();
    const visualRefreshInterval = window.setInterval(loadVisualControls, 30000);
    const auditRefreshInterval = isAdminUser(authUser)
      ? window.setInterval(loadAuditTrail, 30000)
      : null;
    const refreshRemoteDataOnFocus = () => {
      loadVisualControls();
      loadAuditTrail();
    };

    window.addEventListener('focus', refreshRemoteDataOnFocus);

    return () => {
      isMounted = false;
      window.clearInterval(visualRefreshInterval);
      if (auditRefreshInterval) {
        window.clearInterval(auditRefreshInterval);
      }
      window.removeEventListener('focus', refreshRemoteDataOnFocus);
    };
  }, [authUser?.userId]);

  const recordAudit = async ({ action, area, target = '', detail = '', metadata = {} }) => {
    const log = normalizeAuditLog({
      userId: authUser?.userId ?? '',
      username: authUser?.username ?? '',
      displayName: authUser?.displayName ?? '',
      role: authUser?.role ?? getDefaultUserRole(authUser?.username ?? authUser?.displayName),
      action,
      area,
      target,
      detail,
      metadata: await buildAuditMetadata(metadata),
    });

    setAuditLogs((currentLogs) => {
      const nextLogs = [log, ...currentLogs].slice(0, 500);
      saveAuditLogs(nextLogs);
      return nextLogs;
    });

    await persistAuditLogToSupabase(log);
    return log;
  };

  const deleteRecord = (recordId) => {
    if (!canDeleteQualityRecords(authUser)) {
      window.alert('Solo un administrador puede borrar registros.');
      return;
    }

    const recordToDelete = records.find((record) => record.id === recordId);
    setRecords((currentRecords) => currentRecords.filter((record) => record.id !== recordId));
    recordAudit({
      action: 'Elimino registro dimensional',
      area: 'Especificaciones tecnicas',
      target: recordToDelete?.formatName ?? recordId,
      detail: recordToDelete ? `${recordToDelete.date} / ${recordToDelete.entries?.length ?? 0} medicion(es)` : '',
      metadata: { recordId },
    });
  };

  const deleteRecordEntry = (recordId, entryId) => {
    if (!canDeleteQualityRecords(authUser)) {
      window.alert('Solo un administrador puede borrar mediciones.');
      return;
    }

    const recordToUpdate = records.find((record) => record.id === recordId);
    const entryToDelete = recordToUpdate?.entries?.find((entry) => entry.id === entryId);
    setRecords((currentRecords) =>
      currentRecords
        .map((record) => {
          if (record.id !== recordId) {
            return record;
          }

          const entries = record.entries.filter((entry) => entry.id !== entryId);

          return {
            ...record,
            entries,
            status: getGroupStatus(entries),
            updatedAt: new Date().toISOString(),
          };
        })
        .filter((record) => record.entries.length > 0),
    );
    recordAudit({
      action: 'Elimino medicion dimensional',
      area: 'Especificaciones tecnicas',
      target: recordToUpdate?.formatName ?? recordId,
      detail: entryToDelete ? `${entryToDelete.machine ?? 'Sin maquina'} / Molde ${entryToDelete.mold ?? '-'}` : '',
      metadata: { recordId, entryId },
    });
  };

  const navigate = (viewId) => {
    const nextViewId = allowedViewIds.includes(viewId) ? viewId : defaultAllowedViewId;
    setCurrentView(nextViewId);
    setIsMobileNavOpen(false);
    window.history.pushState(null, '', `#${nextViewId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pageTitles = {
    dashboard: 'Graficas por area',
    etiquetas: 'Etiquetas',
    'produccion-planificacion': 'Planificacion',
    'produccion-reportes': 'Reportes',
    'produccion-almacen': 'Almacen Produccion',
    'produccion-equipo': 'Equipo Operativo',
    'produccion-productos': 'Productos e Insumos',
    'produccion-mantenimiento': 'Mantenimiento',
    'almacen-inventario': 'Inventario',
    'almacen-despachos': 'Despachos',
    administracion: 'Administracion',
    'especificaciones-tecnicas': 'Especificaciones tecnicas',
    'controles-visuales': 'Controles visuales',
    'base-visual': 'Base de controles visuales',
    'equipos-medicion': 'Equipos de medicion',
    'registro-operadores': 'Registro operadores',
    'control-variables-sopladora': 'Registros - Calidad',
    'administrar-formatos': 'Administrar formatos',
    'defectos-encontrados': 'Defectos encontrados',
    'reportes-guardados': 'Reportes guardados',
    auditoria: 'Actividad',
    'sgc-reclamos': 'Sistema de gestion de calidad',
    'sgc-documentos': 'Gestion de documentos',
    'sgc-seguimiento': 'Seguimiento a los reclamos',
    'sgc-acciones-correctivas': 'Acciones correctivas',
    'base-datos': 'Base de datos',
  };

  const login = async (user) => {
    const profile = {
      ...getSupabaseUserProfile(user),
      role: await getTrustedQualityRole(user),
    };
    const lockResult = await acquireActiveUserSession(profile);

    if (!lockResult.ok) {
      return lockResult;
    }

    saveAuthSession(profile);
    setAuthUser(profile);
    const loginLog = normalizeAuditLog({
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      action: 'Inicio de sesion',
      area: 'Seguridad',
      target: profile.username,
      detail: 'Usuario inicio sesion en PETnova',
      metadata: await buildAuditMetadata({ event: 'login' }),
    });
    setAuditLogs((currentLogs) => [loginLog, ...currentLogs].slice(0, 500));
    await persistAuditLogToSupabase(loginLog);
    return { ok: true };
  };

  // Login del "administrador local": autentica contra el servidor local
  // (Express + SQLite, ver server/) en vez de Supabase. Es un sistema de
  // identidad aparte del login de Supabase de arriba -- no toca active_user_sessions
  // ni get_current_quality_role, que son especificos de Supabase. Ver el plan en
  // C:\Users\LENOVO\.claude\plans\virtual-sauteeing-kurzweil.md para el porque.
  const loginWithLocalAdmin = async (username, password) => {
    try {
      const localUser = await loginLocal(username, password);
      const profile = {
        username: localUser.username,
        displayName: localUser.displayName || localUser.username,
        userId: `local-${localUser.id}`,
        sessionId: crypto.randomUUID(),
        role: localUser.role,
        authProvider: 'local',
      };
      saveAuthSession(profile);
      setAuthUser(profile);
      const loginLog = normalizeAuditLog({
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        role: profile.role,
        action: 'Inicio de sesion (local)',
        area: 'Seguridad',
        target: profile.username,
        detail: 'Usuario inicio sesion en el servidor local',
      });
      setAuditLogs((currentLogs) => [loginLog, ...currentLogs].slice(0, 500));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message ?? 'No se pudo iniciar sesion local.' };
    }
  };

  const logout = async () => {
    const currentSession = loadAuthSession();
    await recordAudit({
      action: 'Cierre de sesion',
      area: 'Seguridad',
      target: authUser?.username ?? currentSession?.username ?? '',
      detail: 'Usuario cerro sesion',
    });

    if ((currentSession ?? authUser)?.authProvider === 'local') {
      await logoutLocal();
    } else {
      await releaseActiveUserSession(currentSession ?? authUser);

      if (supabase) {
        await supabase.auth.signOut();
      }
    }
    saveAuthSession(null);
    setAuthUser(null);
  };

  const saveTodayVisualReport = async () => {
    const todayVisualSessions = visualControlSessions.filter((session) => session.date === getToday());

    if (todayVisualSessions.length === 0) {
      return false;
    }

    const report = normalizeSavedVisualReport({
      id: crypto.randomUUID(),
      userId: authUser?.userId ?? '',
      title: 'Reporte de controles visuales',
      reportDate: getToday(),
      responsible: visualControlResponsible || getRoundResponsible(todayVisualSessions),
      generatedAt: new Date().toISOString(),
      sessionCount: todayVisualSessions.length,
      reviewCount: todayVisualSessions.reduce((sum, session) => sum + (session.reviews?.length ?? 0), 0),
      sessions: todayVisualSessions,
    });

    setSavedVisualReports((currentReports) => [report, ...currentReports]);

    if (authUser?.userId) {
      await persistVisualReportToSupabase(report, authUser.userId);
    }

    await recordAudit({
      action: 'Guardo reporte visual',
      area: 'Controles visuales',
      target: report.reportDate,
      detail: `${report.sessionCount} maquina(s), ${report.reviewCount} revision(es)`,
      metadata: { reportId: report.id },
    });

    return true;
  };

  useEffect(() => {
    const handleReportMessage = async (event) => {
      if (!['null', window.location.origin].includes(event.origin) || event.data?.type !== 'PETNOVA_SAVE_VISUAL_REPORT') {
        return;
      }

      const saved = await saveTodayVisualReport();
      event.source?.postMessage({ type: 'PETNOVA_VISUAL_REPORT_SAVED', ok: saved }, '*');
    };

    window.addEventListener('message', handleReportMessage);
    return () => window.removeEventListener('message', handleReportMessage);
  }, [visualControlSessions, visualControlResponsible, authUser]);

  const openSavedVisualReport = (report) => {
    printVisualControlReport(report.sessions, report.responsible, { enableSave: false });
  };

  const saveProductionFormatOption = async (formatName, imageFile = null, formatId = '') => {
    const cleanFormat = String(formatName ?? '').trim().replace(/\s+/g, ' ');
    const comparableFormat = getFormatIdentityKey(cleanFormat);

    if (!cleanFormat) {
      return { ok: false, message: 'Escriba el formato que desea agregar.' };
    }

    const duplicateProductionFormat = productionFormats.find((format) => (
      getFormatIdentityKey(format.label) === comparableFormat
      && (!formatId || format.id !== formatId)
    ));
    const duplicateFallbackFormat = fallbackProductionFormatOptions.find((label) => getFormatIdentityKey(label) === comparableFormat);
    const duplicateFormat = duplicateProductionFormat || (duplicateFallbackFormat
      ? {
          id: createStableTextId('production-format', duplicateFallbackFormat),
          label: duplicateFallbackFormat,
        }
      : null);

    if (formatId && duplicateProductionFormat) {
      const { error: deleteError } = await supabase
        .from('production_formats')
        .delete()
        .eq('id', formatId);

      if (deleteError) {
        return { ok: false, message: `Ya existe ese nombre, pero no se pudo borrar el duplicado: ${deleteError.message}` };
      }

      setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([
        ...currentFormats.filter((format) => format.id !== formatId),
        duplicateProductionFormat,
      ]));
      await recordAudit({
        action: 'Fusiono formato',
        area: 'Formatos',
        target: duplicateProductionFormat.label,
        detail: 'Se elimino un duplicado al editar el nombre maestro',
        metadata: { removedFormatId: formatId, keptFormatId: duplicateProductionFormat.id },
      });
      return {
        ok: true,
        merged: true,
        label: duplicateProductionFormat.label,
        format: duplicateProductionFormat,
        message: 'El nombre ya existia. Se elimino el duplicado y se mantuvo el formato correcto.',
      };
    }

    if (!formatId && duplicateFormat) {
      if (!imageFile) {
        return {
          ok: true,
          duplicate: true,
          message: 'Ese formato ya existe en la lista. No se creo otro registro.',
          label: duplicateFormat.label ?? cleanFormat,
          format: duplicateFormat,
        };
      }

      const targetId = duplicateFormat.productionFormatId || duplicateFormat.id || createStableTextId('production-format', duplicateFormat.label ?? cleanFormat);
      const imageUpdateResult = await saveProductionFormatToSupabase(duplicateFormat.label ?? cleanFormat, imageFile, targetId);

      if (!imageUpdateResult.ok) {
        return imageUpdateResult;
      }

      const savedDuplicateFormat = {
        ...duplicateFormat,
        ...imageUpdateResult.format,
        label: duplicateFormat.label ?? imageUpdateResult.format.label,
        imageSrc: imageUpdateResult.format.imageSrc || duplicateFormat.imageSrc || '',
        imagePath: imageUpdateResult.format.imagePath || duplicateFormat.imagePath || '',
      };

      setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([
        ...currentFormats.filter((format) => format.id !== savedDuplicateFormat.id),
        savedDuplicateFormat,
      ]));

      return {
        ok: true,
        duplicate: true,
        message: 'El formato ya existia. Se actualizo la foto sin crear duplicados.',
        label: savedDuplicateFormat.label,
        format: savedDuplicateFormat,
      };
    }

    const result = await saveProductionFormatToSupabase(cleanFormat, imageFile, formatId);

    if (!result.ok) {
      return result;
    }

    if (result.merged) {
      if (formatId && result.mergedFromId) {
        const { error: deleteError } = await supabase
          .from('production_formats')
          .delete()
          .eq('id', result.mergedFromId);

        if (deleteError) {
          return { ok: false, message: `El nombre ya existia, pero no se pudo borrar el duplicado: ${deleteError.message}` };
        }
      }

      setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([
        ...currentFormats.filter((format) => format.id !== result.mergedFromId && format.id !== formatId),
        result.format,
      ]));
      await recordAudit({
        action: 'Fusiono formato',
        area: 'Formatos',
        target: result.format.label,
        detail: 'Supabase detecto nombre duplicado y se elimino el registro repetido',
        metadata: { removedFormatId: result.mergedFromId, keptFormatId: result.format.id },
      });
      return {
        ok: true,
        merged: true,
        label: result.format.label,
        format: result.format,
        message: 'El nombre ya existia. Se elimino el duplicado y se mantuvo el formato correcto.',
      };
    }

    const savedFormat = {
      ...(productionFormats.find((format) => format.id === result.format.id) ?? {}),
      ...result.format,
      label: result.format.label,
      imageSrc: result.format.imageSrc || productionFormats.find((format) => format.id === result.format.id)?.imageSrc || '',
      imagePath: result.format.imagePath || productionFormats.find((format) => format.id === result.format.id)?.imagePath || '',
    };

    setProductionFormats((currentFormats) => uniqueProductionFormatsByIdentity([...currentFormats.filter((format) => format.id !== savedFormat.id), savedFormat]));
    await recordAudit({
      action: formatId ? 'Actualizo formato' : 'Creo formato',
      area: 'Formatos',
      target: savedFormat.label,
      detail: savedFormat.imagePath ? 'Formato guardado con imagen referencial' : 'Formato guardado',
      metadata: { formatId: savedFormat.id },
    });
    return { ok: true, label: savedFormat.label, format: savedFormat };
  };

  const updateTechnicalBottleFormat = async (format, values) => {
    const cleanName = String(values?.name ?? format?.name ?? '').trim().replace(/\s+/g, ' ');
    const comparableName = getFormatIdentityKey(cleanName);
    const duplicateTechnicalFormat = bottleFormats.find((currentFormat) => (
      comparableName
      && getFormatIdentityKey(getCanonicalFormatLabel(currentFormat, productionFormats)) === comparableName
      && currentFormat.id !== format?.id
    ));

    if (duplicateTechnicalFormat && format?.id) {
      return { ok: false, message: 'Ya existe una ficha tecnica con ese formato. No se creo ni renombro otro duplicado.' };
    }

    const targetFormat = duplicateTechnicalFormat && !format?.id ? duplicateTechnicalFormat : format;
    const result = await saveBottleFormatToSupabase(targetFormat, values);

    if (!result.ok) {
      return result;
    }

    setBottleFormats((currentFormats) => {
      const exists = currentFormats.some((currentFormat) => currentFormat.id === result.format.id);

      if (!exists) {
        const nextFormats = dedupeTechnicalFormats([...currentFormats, result.format], productionFormats).sort((a, b) => a.name.localeCompare(b.name));
        saveLocalBottleFormats(nextFormats);
        return nextFormats;
      }

      const nextFormats = dedupeTechnicalFormats(currentFormats.map((currentFormat) => (
        currentFormat.id === result.format.id ? result.format : currentFormat
      )), productionFormats);
      saveLocalBottleFormats(nextFormats);
      return nextFormats;
    });
    await recordAudit({
      action: values?.specs ? 'Guardo especificacion tecnica' : 'Actualizo formato tecnico',
      area: 'Especificaciones tecnicas',
      target: result.format.name,
      detail: values?.specs ? 'Rangos tecnicos actualizados desde muestras' : 'Ficha tecnica actualizada',
      metadata: { formatId: result.format.id },
    });
    return result;
  };

  const deleteUnifiedFormatOption = async (format) => {
    const productionId = format.productionFormatId
      || (productionFormats.some((currentFormat) => currentFormat.id === format.id) ? format.id : '');

    if (!productionId) {
      return { ok: false, message: 'Este formato base no se puede borrar porque viene incluido en la aplicacion.' };
    }

    const errors = [];

    if (productionId) {
      const { error } = await supabase
        .from('production_formats')
        .delete()
        .eq('id', productionId);

      if (error) {
        errors.push(`formato: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, message: `No se pudo borrar ${errors.join(' / ')}` };
    }

    setProductionFormats((currentFormats) => currentFormats.filter((currentFormat) => currentFormat.id !== productionId));

    await recordAudit({
      action: 'Borro formato',
      area: 'Formatos',
      target: format.label,
      detail: 'Nombre maestro eliminado. La ficha tecnica no fue modificada.',
      metadata: { productionId },
    });

    return { ok: true };
  };

  const generateReport = () => {
    if (currentView === 'controles-visuales') {
      const todayVisualSessions = visualControlSessions.filter((session) => session.date === getToday());
      printVisualControlReport(todayVisualSessions, visualControlResponsible, { enableSave: true });
      return;
    }

    printGeneralReport(pageTitles[currentView] ?? pageTitles.dashboard, records);
  };

  const aiDataContext = useMemo(() => buildPetnovaAiContext({
    records,
    visualControlSessions,
    savedVisualReports,
    operatorProductionRecords,
    bottleFormats,
    productionFormats,
    qualityManagement,
    currentView,
    authUser,
  }), [
    records,
    visualControlSessions,
    savedVisualReports,
    operatorProductionRecords,
    bottleFormats,
    productionFormats,
    qualityManagement,
    currentView,
    authUser,
  ]);

  const renderCurrentView = () => {
    const resolvedView = allowedViewIds.includes(currentView) ? currentView : defaultAllowedViewId;
    const views = {
      dashboard: <DashboardView />,
      etiquetas: <EtiquetasView />,
      'produccion-planificacion': <PlanificacionView />,
      'produccion-reportes': <ReportesView />,
      'produccion-almacen': <AlmacenProduccionView />,
      'produccion-equipo': <EquipoOperativoView />,
      'produccion-productos': <ProductosInsumosView />,
      'produccion-mantenimiento': <AreaWorkspaceView area="Produccion" items={maintenanceItems} />,
      'almacen-inventario': <AreaWorkspaceView area="Almacen" items={inventoryItems} />,
      'almacen-despachos': <AreaWorkspaceView area="Almacen" items={dispatchItems} />,
      administracion: <AreaWorkspaceView area="Administracion" items={administrationItems} />,
      'especificaciones-tecnicas': (
        <SpecificationDigitizer
          records={records}
          setRecords={setRecords}
          onNavigate={navigate}
          bottleFormats={bottleFormats}
          productionFormats={productionFormats}
          formatsReady={formatsReady}
          formatsError={formatsError}
          onSaveTechnicalFormat={updateTechnicalBottleFormat}
        />
      ),
      'controles-visuales': (
        <VisualControls
          controlSessions={visualControlSessions}
          setControlSessions={setVisualControlSessions}
          responsible={visualControlResponsible}
          setResponsible={setVisualControlResponsible}
          closedRounds={closedVisualRounds}
          setClosedRounds={setClosedVisualRounds}
          authUser={authUser}
          bottleFormats={bottleFormats}
          productionFormats={productionFormats}
          syncNotice={visualSyncNotice}
          canDeleteRecords={currentUserIsAdmin}
          onAudit={recordAudit}
          onSaveDailyReport={saveTodayVisualReport}
        />
      ),
      'base-visual': (
        <VisualControlsDatabaseView
          sessions={visualControlSessions}
          setSessions={setVisualControlSessions}
          authUser={authUser}
          bottleFormats={bottleFormats}
          productionFormats={productionFormats}
          onAudit={recordAudit}
        />
      ),
      'equipos-medicion': (
        <MeasurementEquipmentView
          records={measurementEquipmentRecords}
          setRecords={setMeasurementEquipmentRecords}
          onAudit={recordAudit}
        />
      ),
      'registro-operadores': (
        <OperatorProductionRegister
          records={operatorProductionRecords}
          setRecords={setOperatorProductionRecords}
          productionFormats={productionFormats}
          bottleFormats={bottleFormats}
        />
      ),
      'control-variables-sopladora': (
        <BlowerVariableControlView
          records={blowerVariableControlRecords}
          setRecords={setBlowerVariableControlRecords}
          productionFormats={productionFormats}
          bottleFormats={bottleFormats}
          masterFormats={masterFormats}
          authUser={authUser}
          onAudit={recordAudit}
        />
      ),
      'administrar-formatos': currentUserCanManageFormats ? (
        <FormatManagementView
          bottleFormats={bottleFormats}
          productionFormats={productionFormats}
          masterFormats={masterFormats}
          onMasterFormatsChange={setMasterFormats}
          onSaveProductionFormat={saveProductionFormatOption}
          onDeleteFormat={deleteUnifiedFormatOption}
        />
      ) : (
        <AccessDeniedView text="La administracion de formatos esta disponible para administradores y control de calidad." />
      ),
      'defectos-encontrados': <FoundDefectsView sessions={visualControlSessions} />,
      'reportes-guardados': <SavedReportsView reports={savedVisualReports} onOpen={openSavedVisualReport} />,
      auditoria: currentUserIsAdmin ? (
        <AuditLogView logs={auditLogs} />
      ) : (
        <AccessDeniedView text="La actividad esta disponible solo para administradores." />
      ),
      'sgc-reclamos': <QualityComplaintsView qualityManagement={qualityManagement} setQualityManagement={setQualityManagement} />,
      'sgc-documentos': <QualityDocumentsView qualityManagement={qualityManagement} setQualityManagement={setQualityManagement} />,
      'sgc-seguimiento': <ComplaintFollowUpView qualityManagement={qualityManagement} setQualityManagement={setQualityManagement} />,
      'sgc-acciones-correctivas': <CorrectiveActionsView qualityManagement={qualityManagement} setQualityManagement={setQualityManagement} />,
      'base-datos': <GroupedDatabaseView records={records} onDelete={deleteRecord} onDeleteEntry={deleteRecordEntry} canDelete={currentUserIsAdmin} />,
    };

    return views[resolvedView] ?? views[defaultAllowedViewId] ?? views.dashboard;
  };

  // Si no hay Supabase configurado, continuar para permitir autenticacion
  // via el servidor local (Postgres) usando `/api/auth/login`.

  if (!authReady) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="login-brand">
            <div className="brand-logo-pair login-logo-pair">
              <img src="/logos/logo-empacar.png" alt="Logo Empacar" />
              <img src="/logos/petnova-logo.svg" alt="Logo PETnova" />
            </div>
            <div>
              <strong>PETnova</strong>
            </div>
          </div>
          <div className="login-form">
            <span className="eyebrow">Acceso restringido</span>
            <h1>Cargando sesion</h1>
          </div>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return <LoginScreen onLogin={login} onLocalLogin={loginWithLocalAdmin} />;
  }

  return (
    <main className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${isMobileNavOpen ? 'menu-open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`} aria-label="Navegacion principal">
        <div className="brand-mark">
          <div className="brand-logo-pair sidebar-logo-pair">
            <img src="/logos/logo-empacar.png" alt="Logo Empacar" />
            <img src="/logos/petnova-logo.svg" alt="Logo PETnova" />
          </div>
          <div className="brand-title-row">
            <strong>PETnova</strong>
            <button
              type="button"
              className="sidebar-collapse-button"
              aria-label={isSidebarCollapsed ? 'Desplegar menu lateral' : 'Plegar menu lateral'}
              title={isSidebarCollapsed ? 'Desplegar menu' : 'Plegar menu'}
              onClick={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
            >
              <span className="sidebar-collapse-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
          <button
            type="button"
            className="mobile-menu-button"
            aria-controls="primary-nav"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen((isOpen) => !isOpen)}
          >
            <span>Menu</span>
            <span className="menu-lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
        <nav id="primary-nav">
          {!currentUserIsGuest && (
            <>
              <NavButton active={currentView === 'dashboard'} onClick={() => navigate('dashboard')}>Dashboard</NavButton>
              <NavButton active={currentView === 'etiquetas'} onClick={() => navigate('etiquetas')}>Etiquetas</NavButton>
              <NavGroup title="Produccion">
                <NavButton active={currentView === 'produccion-planificacion'} onClick={() => navigate('produccion-planificacion')}>Planificacion</NavButton>
                <NavButton active={currentView === 'produccion-reportes'} onClick={() => navigate('produccion-reportes')}>Reportes</NavButton>
                <NavButton active={currentView === 'produccion-almacen'} onClick={() => navigate('produccion-almacen')}>Almacen Produccion</NavButton>
                <NavButton active={currentView === 'produccion-equipo'} onClick={() => navigate('produccion-equipo')}>Equipo Operativo</NavButton>
                <NavButton active={currentView === 'produccion-productos'} onClick={() => navigate('produccion-productos')}>Productos e Insumos</NavButton>
                <NavButton active={currentView === 'produccion-mantenimiento'} onClick={() => navigate('produccion-mantenimiento')}>Mantenimiento</NavButton>
              </NavGroup>
              <NavGroup title="Almacen">
                <NavButton active={currentView === 'almacen-inventario'} onClick={() => navigate('almacen-inventario')}>Inventario</NavButton>
                <NavButton active={currentView === 'almacen-despachos'} onClick={() => navigate('almacen-despachos')}>Despachos</NavButton>
              </NavGroup>
              <NavButton active={currentView === 'administracion'} onClick={() => navigate('administracion')}>Administracion</NavButton>
              {currentUserIsAdmin && (
                <NavButton active={currentView === 'auditoria'} onClick={() => navigate('auditoria')}>Actividad</NavButton>
              )}
            </>
          )}
          <NavGroup title="Control de calidad" defaultOpen>
            <NavButton active={currentView === 'especificaciones-tecnicas'} onClick={() => navigate('especificaciones-tecnicas')}>Especificaciones tecnicas</NavButton>
            <NavButton active={currentView === 'controles-visuales'} onClick={() => navigate('controles-visuales')}>Controles visuales</NavButton>
            <NavButton active={currentView === 'base-visual'} onClick={() => navigate('base-visual')}>Base visual</NavButton>
            <NavButton active={currentView === 'equipos-medicion'} onClick={() => navigate('equipos-medicion')}>Equipos de medicion</NavButton>
            <NavButton active={currentView === 'registro-operadores'} onClick={() => navigate('registro-operadores')}>Registro operadores</NavButton>
            <NavButton active={currentView === 'control-variables-sopladora'} onClick={() => navigate('control-variables-sopladora')}>Registros - Calidad</NavButton>
            {currentUserCanManageFormats && (
              <NavButton active={currentView === 'administrar-formatos'} onClick={() => navigate('administrar-formatos')}>Administrar formatos</NavButton>
            )}
            <NavButton active={currentView === 'defectos-encontrados'} onClick={() => navigate('defectos-encontrados')}>Defectos encontrados</NavButton>
            <NavButton active={currentView === 'reportes-guardados'} onClick={() => navigate('reportes-guardados')}>Reportes guardados</NavButton>
          </NavGroup>
          {!currentUserIsGuest && (
            <>
              <NavGroup title="Sistema de gestion de calidad">
                <NavButton active={currentView === 'sgc-reclamos'} onClick={() => navigate('sgc-reclamos')}>Reclamos</NavButton>
                <NavButton active={currentView === 'sgc-documentos'} onClick={() => navigate('sgc-documentos')}>Gestion de documentos</NavButton>
                <NavButton active={currentView === 'sgc-seguimiento'} onClick={() => navigate('sgc-seguimiento')}>Seguimiento a reclamos</NavButton>
                <NavButton active={currentView === 'sgc-acciones-correctivas'} onClick={() => navigate('sgc-acciones-correctivas')}>Acciones correctivas</NavButton>
              </NavGroup>
              <NavButton active={currentView === 'base-datos'} onClick={() => navigate('base-datos')}>Base de datos</NavButton>
            </>
          )}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar-stack">
          <div className="user-topbar">
            <div className="welcome-user">
              <strong>Bienvenido {formatDisplayName(authUser.displayName ?? authUser.username)}</strong>
              <span className={`role-pill ${authUser.role ?? 'calidad'}`}>{userRoleLabels[authUser.role] ?? 'Control de calidad'}</span>
            </div>
            <div className="user-actions">
              <button
                type="button"
                className="secondary-action icon-action"
                aria-label="Configuracion de usuario"
                title="Configuracion de usuario"
                onClick={() => setIsUserSettingsOpen(true)}
              >
                <span aria-hidden="true">&#9881;</span>
              </button>
            </div>
          </div>

          {!['control-variables-sopladora', 'registro-operadores'].includes(currentView) && (
            <div className="topbar">
              <div>
                <h1>{pageTitles[currentView] ?? pageTitles.dashboard}</h1>
              </div>
              <div className="topbar-actions">
                {['controles-visuales', 'base-visual'].includes(currentView) && (
                  <button type="button" className="secondary-action" onClick={() => navigate('base-visual')}>
                    Base visual
                  </button>
                )}
                <button type="button" className="primary-action" onClick={generateReport}>Generar reporte</button>
              </div>
            </div>
          )}
        </header>

        <div className="view-surface">{renderCurrentView()}</div>
      </section>
      <PetnovaAiAssistant dataContext={aiDataContext} />
      {isUserSettingsOpen && (
        <UserSettingsModal
          user={authUser}
          theme={theme}
          onThemeChange={setTheme}
          onLogout={logout}
          onClose={() => setIsUserSettingsOpen(false)}
          onAudit={recordAudit}
        />
      )}
    </main>
  );
}

export default App;
