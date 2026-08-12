const CERTIFICATE_VARIABLE_MAP = {
  emptyBottleWeight: 'pesoVacia',
  bottleHeight: 'alturaTotal',
  lowerDiameter: 'diametroInferior',
  e1: 'e1',
  e2: 'e2',
  fillVolume: 'volumen',
};

const REQUIRED_CERTIFICATE_FIELDS = [
  ['emptyBottleWeight', 'pesoVacia', 'Peso de botella'],
  ['bottleHeight', 'alturaTotal', 'Altura de botella'],
  ['lowerDiameter', 'diametroInferior', 'Diametro inferior'],
  ['e1', 'e1', 'E-1'],
  ['e2', 'e2', 'E-2'],
  ['fillVolume', null, 'Volumen de llenado'],
];

function normalizeSaiCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getNumericSamples(samples = {}) {
  return Object.values(samples)
    .filter((value) => String(value ?? '').trim() !== '')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function averageSamples(samples = {}) {
  const values = getNumericSamples(samples);

  if (!values.length) return '';
  return String(values.reduce((total, value) => total + value, 0) / values.length);
}

function getFallTestResult(tests = {}) {
  const result = typeof tests.fallTest === 'string'
    ? tests.fallTest
    : tests.fallTest?.result || tests.fallTest?.observations || '';
  return String(result).trim();
}

export function findLinkedQualityTestsRecord(records = [], inspection = {}) {
  const inspectionCode = normalizeSaiCode(inspection.saiCode);
  return records.find((record) => (
    record.productionDate === inspection.productionDate
    && record.machine === inspection.machine
    && normalizeSaiCode(record.saiCode) === inspectionCode
  )) ?? null;
}

export function validateQualityCertificateData(inspection = {}, tests = {}, technicalFormat = {}) {
  const errors = [];
  const requiredHeaderFields = [
    [inspection.productionDate, 'Fecha de produccion'],
    [inspection.machine, 'Maquina'],
    [inspection.saiCode, 'Codigo SAI'],
    [inspection.format || inspection.formatName || technicalFormat.label || technicalFormat.name, 'Formato'],
    [inspection.client, 'Cliente'],
    [inspection.bottleOp || inspection.opBottle, 'Orden de produccion'],
    [inspection.resin, 'Resina'],
  ];

  requiredHeaderFields.forEach(([value, label]) => {
    if (!String(value ?? '').trim()) errors.push(`Falta ${label}.`);
  });

  REQUIRED_CERTIFICATE_FIELDS.forEach(([sourceKey, specKey, label]) => {
    const sampleCount = getNumericSamples(inspection.variableControls?.[sourceKey]).length;
    if (sampleCount < 4) {
      errors.push(`${label} requiere 4 muestras validas.`);
    }
    const spec = specKey ? technicalFormat.specs?.[specKey] : null;
    if (specKey && (!Number.isFinite(Number(spec?.min)) || !Number.isFinite(Number(spec?.max)))) {
      errors.push(`Falta la especificacion de ${label}.`);
    }
  });

  if (!getFallTestResult(tests)) {
    errors.push('Falta el resultado de la Prueba de caida.');
  }

  return errors;
}

export function buildCertificateRecordFromNewQuality(
  inspection = {},
  tests = {},
  technicalFormat = {},
) {
  const measurements = Object.entries(CERTIFICATE_VARIABLE_MAP).reduce(
    (result, [sourceKey, certificateKey]) => ({
      ...result,
      [certificateKey]: averageSamples(inspection.variableControls?.[sourceKey]),
    }),
    {},
  );
  const evaluations = Object.values(CERTIFICATE_VARIABLE_MAP).reduce(
    (result, certificateKey) => ({
      ...result,
      [certificateKey]: {
        spec: technicalFormat.specs?.[certificateKey] ?? null,
      },
    }),
    {},
  );

  measurements.pruebaCaida = getFallTestResult(tests);
  measurements.diametroInterno = '41.15';
  measurements.diametroExterno = '47.3';
  measurements.diametroRoturaBanda = '48.3';
  measurements.diametroAnillaSoporte = '51.54';

  return {
    id: `certificate-${inspection.id || inspection.saiCode || Date.now()}`,
    date: inspection.productionDate,
    formatId: technicalFormat.id || inspection.saiCode || '',
    formatName: inspection.format
      || inspection.formatName
      || technicalFormat.label
      || technicalFormat.name
      || `BOTELLA PET ${inspection.volume || ''}`.trim(),
    status: 'Conforme',
    certificateDetails: {
      lote: inspection.lot || '',
      ordenProduccion: inspection.bottleOp || inspection.opBottle || '',
      resinaUtilizada: inspection.resin || '',
    },
    entries: [
      {
        id: `certificate-entry-${inspection.id || inspection.saiCode || Date.now()}`,
        mold: 'Promedio de produccion',
        machine: inspection.machine || '',
        measurements,
        evaluations,
        status: 'Conforme',
      },
    ],
  };
}
