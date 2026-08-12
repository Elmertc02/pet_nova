import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCertificateRecordFromNewQuality,
  findLinkedQualityTestsRecord,
  validateQualityCertificateData,
} from '../src/newQualityCertificate.js';

test('averages four variable samples and maps certificate fields', () => {
  const certificate = buildCertificateRecordFromNewQuality(
    {
      productionDate: '2026-07-27',
      machine: 'SEM99-P',
      saiCode: '14590-100',
      format: '0.600L Cristal-100 Bebidas 22g',
      resin: 'ECOPET',
      bottleOp: '020P-2026',
      variableControls: {
        emptyBottleWeight: {
          'sample-1': '21.8',
          'sample-2': '22',
          'sample-3': '22.2',
          'sample-4': '22',
        },
        e1: {
          'sample-1': '1',
          'sample-2': '2',
          'sample-3': '3',
          'sample-4': '4',
        },
      },
    },
    { fallTest: { result: 'PASA' } },
    { specs: { pesoVacia: { min: 21, max: 23, target: 22 } } },
  );

  assert.equal(certificate.entries[0].measurements.pesoVacia, '22');
  assert.equal(certificate.entries[0].measurements.e1, '2.5');
  assert.equal(certificate.entries[0].measurements.pruebaCaida, 'PASA');
  assert.deepEqual(
    certificate.entries[0].evaluations.pesoVacia.spec,
    { min: 21, max: 23, target: 22 },
  );
  assert.equal(certificate.entries[0].measurements.diametroInterno, '41.15');
  assert.equal(certificate.entries[0].measurements.diametroExterno, '47.3');
  assert.equal(certificate.entries[0].measurements.diametroRoturaBanda, '48.3');
  assert.equal(certificate.entries[0].measurements.diametroAnillaSoporte, '51.54');
});

test('links tests by exact date, machine, and normalized SAI code', () => {
  const inspection = {
    productionDate: '2026-07-27',
    machine: 'SEM99-P',
    saiCode: '14590 - 100',
  };
  const expected = {
    id: 'linked',
    productionDate: '2026-07-27',
    machine: 'SEM99-P',
    saiCode: '14590-100',
  };
  const records = [
    { ...expected, id: 'wrong-date', productionDate: '2026-07-26' },
    { ...expected, id: 'wrong-machine', machine: 'SEM78-F' },
    expected,
  ];

  assert.equal(findLinkedQualityTestsRecord(records, inspection)?.id, 'linked');
});

test('ignores blank and invalid samples when averaging', () => {
  const certificate = buildCertificateRecordFromNewQuality(
    {
      variableControls: {
        e2: {
          'sample-1': '',
          'sample-2': '0.4',
          'sample-3': 'sin dato',
          'sample-4': '0.6',
        },
      },
    },
    {},
    {},
  );

  assert.equal(certificate.entries[0].measurements.e2, '0.5');
});

test('certificate validation reports missing required measurements, specs, and fall test', () => {
  const errors = validateQualityCertificateData(
    {
      variableControls: {
        emptyBottleWeight: { 'sample-1': '22' },
      },
    },
    { fallTest: { result: '' } },
    { specs: { pesoVacia: { min: 21, max: 23 } } },
  );

  assert.ok(errors.some((error) => error.includes('Altura de botella')));
  assert.ok(errors.some((error) => error.includes('Prueba de caida')));
  assert.ok(errors.some((error) => error.includes('E-1')));
  assert.ok(errors.some((error) => error.includes('Orden de produccion')));
  assert.ok(errors.some((error) => error.includes('4 muestras')));
});

test('certificate validation accepts complete production data', () => {
  const fourSamples = { 'sample-1': '1', 'sample-2': '2', 'sample-3': '3', 'sample-4': '4' };
  const inspection = {
    productionDate: '2026-07-27',
    machine: 'SEM99-P',
    saiCode: '14590-100',
    format: 'BOT-CR-600 CC-22 GR-ESTRIADA-SFRU-BEBIDAS S.A.',
    client: 'Bebidas',
    bottleOp: '020P-2026',
    resin: 'ECOPET',
    variableControls: {
      emptyBottleWeight: fourSamples,
      bottleHeight: fourSamples,
      lowerDiameter: fourSamples,
      e1: fourSamples,
      e2: fourSamples,
      fillVolume: fourSamples,
    },
  };
  const specs = ['pesoVacia', 'alturaTotal', 'diametroInferior', 'e1', 'e2']
    .reduce((result, key) => ({ ...result, [key]: { min: 1, max: 4 } }), {});

  assert.deepEqual(
    validateQualityCertificateData(inspection, { fallTest: { result: 'PASA' } }, { specs }),
    [],
  );
});
