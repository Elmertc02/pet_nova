export const QUALITY_RECORD_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  CORRECTION_REQUESTED: 'correction_requested',
  REJECTED: 'rejected',
  APPROVED_MIGRATED: 'approved_migrated',
});

export const QUALITY_RECORD_EVENTS = Object.freeze({
  SUBMITTED: 'submitted',
  UPDATED: 'updated',
  APPROVED: 'approved',
  CORRECTION_REQUESTED: 'correction_requested',
  REJECTED: 'rejected',
  MIGRATED: 'migrated',
});

const APPROVED_STATUSES = new Set([
  QUALITY_RECORD_STATUS.APPROVED,
  QUALITY_RECORD_STATUS.APPROVED_MIGRATED,
]);

export function canReviewQualityRecord(user) {
  return user?.role === 'admin' || user?.role === 'calidad';
}

export function canGenerateQualityCertificate(user, inspection, tests) {
  return canReviewQualityRecord(user)
    && APPROVED_STATUSES.has(inspection?.status)
    && APPROVED_STATUSES.has(tests?.status);
}

export function diffQualitySnapshots(previous = {}, next = {}) {
  const changes = [];

  const visit = (before, after, path = '') => {
    const keys = [...new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ])].sort();

    keys.forEach((key) => {
      const field = path ? `${path}.${key}` : key;
      const oldValue = before?.[key];
      const newValue = after?.[key];
      const bothObjects = oldValue
        && newValue
        && typeof oldValue === 'object'
        && typeof newValue === 'object'
        && !Array.isArray(oldValue)
        && !Array.isArray(newValue);

      if (bothObjects) {
        visit(oldValue, newValue, field);
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field,
          previous: oldValue ?? '',
          next: newValue ?? '',
        });
      }
    });
  };

  visit(previous, next);
  return changes;
}
