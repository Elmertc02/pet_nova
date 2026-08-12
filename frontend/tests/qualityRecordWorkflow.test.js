import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_RECORD_STATUS,
  canGenerateQualityCertificate,
  canReviewQualityRecord,
  diffQualitySnapshots,
} from '../src/qualityRecordWorkflow.js';

test('only admin and calidad can review', () => {
  assert.equal(canReviewQualityRecord({ role: 'admin' }), true);
  assert.equal(canReviewQualityRecord({ role: 'calidad' }), true);
  assert.equal(canReviewQualityRecord({ role: 'lectura' }), false);
});

test('certificate requires two approved related records and an allowed role', () => {
  const approved = { status: QUALITY_RECORD_STATUS.APPROVED };
  assert.equal(canGenerateQualityCertificate({ role: 'admin' }, approved, approved), true);
  assert.equal(canGenerateQualityCertificate({ role: 'calidad' }, approved, approved), true);
  assert.equal(canGenerateQualityCertificate({ role: 'lectura' }, approved, approved), false);
  assert.equal(
    canGenerateQualityCertificate({ role: 'admin' }, approved, { status: 'pending' }),
    false,
  );
});

test('snapshot diff reports nested old and new values', () => {
  assert.deepEqual(
    diffQualitySnapshots(
      { client: 'A', variableControls: { e1: { 'sample-1': '1.2' } } },
      { client: 'B', variableControls: { e1: { 'sample-1': '1.4' } } },
    ),
    [
      { field: 'client', previous: 'A', next: 'B' },
      { field: 'variableControls.e1.sample-1', previous: '1.2', next: '1.4' },
    ],
  );
});
