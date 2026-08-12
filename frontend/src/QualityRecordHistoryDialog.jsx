import { useEffect, useMemo, useRef } from 'react';
import { diffQualitySnapshots } from './qualityRecordWorkflow.js';

const EVENT_LABELS = {
  submitted: 'Enviado',
  updated: 'Modificado y reenviado',
  approved: 'Aprobado',
  correction_requested: 'Correccion solicitada',
  rejected: 'Rechazado',
  migrated: 'Registro anterior migrado',
};

function formatEventDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ModalShell({ title, children, onClose, className = '' }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="quality-record-modal-backdrop" onMouseDown={onClose}>
      <section
        className={`quality-record-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Registros de calidad</span>
            <h2>{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="quality-record-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function QualityRecordReviewDialog({
  record,
  comment,
  busy,
  onCommentChange,
  onReview,
  onClose,
}) {
  if (!record) return null;

  return (
    <ModalShell title={`Revisar ${record.saiCode || 'registro'}`} onClose={onClose} className="quality-record-review-dialog">
      <div className="quality-record-review-summary">
        <span>Version {record.version || 1}</span>
        <strong>{record.productionDate || '-'}</strong>
        <p>{record.machine || '-'} · {record.createdBy || '-'}</p>
      </div>
      <label className="quality-record-review-comment">
        <span>Comentario de revision</span>
        <textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder="Obligatorio para solicitar correccion o rechazar"
          disabled={busy}
        />
      </label>
      <div className="quality-record-review-actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => onReview('approved')}>
          Aprobar
        </button>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => onReview('correction_requested')}>
          Solicitar correccion
        </button>
        <button type="button" className="danger-action" disabled={busy} onClick={() => onReview('rejected')}>
          Rechazar
        </button>
      </div>
    </ModalShell>
  );
}

export default function QualityRecordHistoryDialog({
  record,
  events = [],
  loading = false,
  error = '',
  onClose,
}) {
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => new Date(right.created_at) - new Date(left.created_at)),
    [events],
  );

  if (!record) return null;

  return (
    <ModalShell title={`Historial de ${record.saiCode || 'registro'}`} onClose={onClose} className="quality-record-history-dialog">
      {loading && <p className="quality-record-history-empty">Cargando historial...</p>}
      {error && <p className="quality-record-history-error">{error}</p>}
      {!loading && !error && sortedEvents.length === 0 && (
        <p className="quality-record-history-empty">Este registro aun no tiene eventos guardados.</p>
      )}
      <div className="quality-record-history-list">
        {sortedEvents.map((event) => {
          const snapshotChanges = diffQualitySnapshots(
            event.previous_snapshot ?? {},
            event.new_snapshot ?? {},
          );
          const changes = snapshotChanges.length
            ? snapshotChanges
            : Array.isArray(event.changed_fields)
              ? event.changed_fields
              : [];

          return (
            <article key={event.id} className="quality-record-history-event">
              <div className="quality-record-history-event-head">
                <strong>{EVENT_LABELS[event.event_type] ?? event.event_type}</strong>
                <span>Version {event.version}</span>
              </div>
              <dl>
                <div><dt>Fecha y hora</dt><dd>{formatEventDate(event.created_at)}</dd></div>
                <div><dt>Usuario</dt><dd>{event.actor_name || '-'}</dd></div>
                <div><dt>Rol</dt><dd>{event.actor_role || '-'}</dd></div>
                {event.reason && <div><dt>Motivo</dt><dd>{event.reason}</dd></div>}
              </dl>
              {changes.length ? (
                <div className="quality-record-history-changes">
                  {changes.map((change) => (
                    <div key={`${event.id}-${change.field}`}>
                      <strong>{change.field}</strong>
                      <span>{String(change.previous ?? '') || '(vacio)'}</span>
                      <b aria-hidden="true">→</b>
                      <span>{String(change.next ?? '') || '(vacio)'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="quality-record-history-no-changes">Sin modificaciones de campos.</p>
              )}
            </article>
          );
        })}
      </div>
    </ModalShell>
  );
}
