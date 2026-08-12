import { Fragment, useEffect, useRef, useState } from 'react';
import writeXlsxFile, { getSheetData } from 'write-excel-file/browser';
import { localApi } from './localApiClient.js';

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'activa', label: 'Activa' },
  { value: 'sobrante', label: 'Sobrante' },
  { value: 'faltante', label: 'Faltante' },
  { value: 'vaciada', label: 'Vaciada' },
  // Caja apartada a mano: no aparece para consumir en reportes nuevos hasta
  // que alguien la vuelva a poner en 'Activa' desde aca.
  { value: 'cambio_preforma', label: 'Cambio de preforma' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return { codPreforma: '', numCaja: '', op: '', resina: '', cantidadInicial: '', fechaIngreso: todayIso() };
}

function CajasPrefTab() {
  const [cajas, setCajas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [historialAbierto, setHistorialAbierto] = useState(null); // id de la caja expandida
  const [historialPorCaja, setHistorialPorCaja] = useState({}); // { [cajaId]: 'loading' | rows | 'error' }

  const [preformaSugerencias, setPreformaSugerencias] = useState([]);
  const [isPreformaDropdownOpen, setIsPreformaDropdownOpen] = useState(false);
  const preformaFieldRef = useRef(null);

  useEffect(() => {
    function onClickOutside(event) {
      if (preformaFieldRef.current && !preformaFieldRef.current.contains(event.target)) {
        setIsPreformaDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const buscarPreformas = (query) => {
    localApi.getPreformasAdmin(query).then(setPreformaSugerencias).catch(() => setPreformaSugerencias([]));
  };

  const onCodPreformaInput = (value) => {
    setForm((c) => ({ ...c, codPreforma: value }));
    setIsPreformaDropdownOpen(true);
    buscarPreformas(value);
  };

  const seleccionarPreforma = (p) => {
    setForm((c) => ({ ...c, codPreforma: p.codigo }));
    setIsPreformaDropdownOpen(false);
  };

  const load = () => {
    setLoaded(false);
    localApi.getCajasPreforma(filtroEstado ? { estado: filtroEstado } : {})
      .then((data) => { setCajas(data); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  };
  useEffect(load, [filtroEstado]);

  const crear = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await localApi.addCajaPreforma(form);
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message || 'No se pudo crear la caja.');
    }
  };

  const updateField = (id, field, value) => setCajas((current) => current.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const guardarFila = async (c) => {
    try {
      const updated = await localApi.updateCajaPreforma(c.id, {
        codPreforma: c.codPreforma, numCaja: c.numCaja, op: c.op, resina: c.resina,
        cantidadActual: c.cantidadActual, estado: c.estado, observaciones: c.observaciones,
      });
      setCajas((current) => current.map((x) => (x.id === c.id ? updated : x)));
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const eliminar = async (id) => {
    try {
      await localApi.deleteCajaPreforma(id);
      setCajas((current) => current.filter((c) => c.id !== id));
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  const exportarExcel = async () => {
    if (cajas.length === 0) return;
    const texto = (fn) => (row) => ({ value: fn(row) ?? '', type: String });

    const columnsCajas = [
      { header: 'Cod. preforma', cell: texto((c) => c.codPreforma) },
      { header: 'Descripcion', width: 34, cell: texto((c) => c.descripcion || '') },
      { header: 'N. caja', cell: texto((c) => c.numCaja) },
      { header: 'OP', cell: texto((c) => c.op || '') },
      { header: 'Resina', cell: texto((c) => c.resina || '') },
      { header: 'Cant. inicial', cell: texto((c) => String(c.cantidadInicial ?? '')) },
      { header: 'Cant. actual', cell: texto((c) => String(c.cantidadActual ?? '')) },
      { header: 'Fecha ingreso', cell: texto((c) => c.fechaIngreso || '') },
      { header: 'Fecha vaciada', cell: texto((c) => c.fechaVaciada || '') },
      { header: 'Estado', cell: texto((c) => c.estado || '') },
      { header: 'Observaciones', width: 30, cell: texto((c) => c.observaciones || '') },
    ];

    // Preformas observadas (defectos) de todas las cajas -- van en una hoja
    // aparte del mismo archivo, como pidio el usuario.
    let observaciones = [];
    try {
      observaciones = await localApi.getObservacionesPreforma();
    } catch {
      observaciones = [];
    }
    const columnsObservaciones = [
      { header: 'N. caja', cell: texto((o) => o.numCaja) },
      { header: 'Descripcion', width: 34, cell: texto((o) => o.descripcion || '') },
      { header: 'OP', cell: texto((o) => o.op || '') },
      { header: 'Observacion', width: 40, cell: texto((o) => o.observacion || '') },
      { header: 'Cantidad', cell: texto((o) => String(o.cantidad ?? '')) },
    ];

    await writeXlsxFile([
      { data: getSheetData(cajas, columnsCajas), sheet: 'Cajas de preforma', columns: columnsCajas },
      { data: getSheetData(observaciones, columnsObservaciones), sheet: 'Observaciones', columns: columnsObservaciones },
    ]).toFile(`cajas-preforma-${todayIso()}.xlsx`);
  };

  const toggleHistorial = (id) => {
    if (historialAbierto === id) { setHistorialAbierto(null); return; }
    setHistorialAbierto(id);
    if (!historialPorCaja[id]) {
      setHistorialPorCaja((current) => ({ ...current, [id]: 'loading' }));
      localApi.getHistorialCaja(id)
        .then((rows) => setHistorialPorCaja((current) => ({ ...current, [id]: rows })))
        .catch(() => setHistorialPorCaja((current) => ({ ...current, [id]: 'error' })));
    }
  };

  return (
    <div>
      <div className="form-grid planificacion-config-grid">
        <label className="field">
          <span>Filtrar por estado</span>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </label>
      </div>

      <div className="save-row">
        <button type="button" className="secondary-action" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancelar' : '+ Nueva caja'}
        </button>
        <button type="button" className="secondary-action" disabled={cajas.length === 0} onClick={exportarExcel}>
          Exportar a Excel
        </button>
      </div>

      {showForm && (
        <form className="etiquetas-inline-panel" onSubmit={crear}>
          <div className="etiquetas-inline-panel-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <label className="field etiquetas-product-field" ref={preformaFieldRef}>
              <span>Codigo de preforma</span>
              <input
                required
                autoComplete="off"
                value={form.codPreforma}
                onChange={(e) => onCodPreformaInput(e.target.value)}
                onFocus={() => { setIsPreformaDropdownOpen(true); buscarPreformas(form.codPreforma); }}
              />
              {isPreformaDropdownOpen && preformaSugerencias.length > 0 && (
                <div className="etiquetas-autocomplete-dropdown">
                  {preformaSugerencias.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="etiquetas-autocomplete-option"
                      onMouseDown={() => seleccionarPreforma(p)}
                    >
                      <strong>{p.codigo}</strong>
                      <span>{p.descripcion || 'Sin descripcion'}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="field"><span>N. caja</span><input required value={form.numCaja} onChange={(e) => setForm((c) => ({ ...c, numCaja: e.target.value }))} /></label>
            <label className="field"><span>OP</span><input value={form.op} onChange={(e) => setForm((c) => ({ ...c, op: e.target.value }))} /></label>
            <label className="field"><span>Resina</span><input value={form.resina} onChange={(e) => setForm((c) => ({ ...c, resina: e.target.value }))} /></label>
            <label className="field"><span>Cantidad</span><input required type="number" min="1" value={form.cantidadInicial} onChange={(e) => setForm((c) => ({ ...c, cantidadInicial: e.target.value }))} /></label>
            <label className="field"><span>Fecha ingreso</span><input required type="date" value={form.fechaIngreso} onChange={(e) => setForm((c) => ({ ...c, fechaIngreso: e.target.value }))} /></label>
          </div>
          <div className="save-row"><button type="submit" className="primary-action">Guardar</button></div>
        </form>
      )}

      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : cajas.length === 0 ? (
        <p className="etiquetas-empty">Sin cajas registradas todavia.</p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr>
                <th>Cod. preforma</th><th>Descripcion</th><th>N. caja</th><th>OP</th><th>Resina</th>
                <th>Cant. inicial</th><th>Cant. actual</th><th>Ingreso</th><th>Vaciada</th><th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {cajas.map((c) => {
                const historial = historialPorCaja[c.id];
                return (
                <Fragment key={c.id}>
                  <tr>
                    <td><input value={c.codPreforma} onChange={(e) => updateField(c.id, 'codPreforma', e.target.value)} /></td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.82rem', whiteSpace: 'normal', minWidth: 180 }}>{c.descripcion || '-'}</td>
                    <td><input value={c.numCaja} onChange={(e) => updateField(c.id, 'numCaja', e.target.value)} /></td>
                    <td><input value={c.op} onChange={(e) => updateField(c.id, 'op', e.target.value)} /></td>
                    <td><input value={c.resina} onChange={(e) => updateField(c.id, 'resina', e.target.value)} /></td>
                    <td>{c.cantidadInicial.toLocaleString()}</td>
                    <td><input type="number" style={{ width: 90 }} value={c.cantidadActual} onChange={(e) => updateField(c.id, 'cantidadActual', Number(e.target.value) || 0)} /></td>
                    <td>{c.fechaIngreso}</td>
                    <td>{c.fechaVaciada || '-'}</td>
                    <td>
                      <select value={c.estado} onChange={(e) => updateField(c.id, 'estado', e.target.value)}>
                        {ESTADOS.slice(1).map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                      </select>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="secondary-action" onClick={() => toggleHistorial(c.id)}>
                        {historialAbierto === c.id ? 'Ocultar historial' : 'Historial'}
                      </button>{' '}
                      <button type="button" className="secondary-action" onClick={() => guardarFila(c)}>Guardar</button>{' '}
                      <button type="button" className="etiquetas-delete-button" onClick={() => eliminar(c.id)}>Eliminar</button>
                    </td>
                  </tr>
                  {historialAbierto === c.id && (
                    <tr>
                      <td colSpan={11} style={{ background: 'var(--panel-alt, rgba(127,127,127,0.06))', padding: '10px 14px' }}>
                        {historial === 'loading' ? (
                          <p className="etiquetas-empty">Cargando historial...</p>
                        ) : historial === 'error' ? (
                          <p className="etiquetas-form-error">No se pudo cargar el historial.</p>
                        ) : !historial || historial.length === 0 ? (
                          <p className="etiquetas-empty">Esta caja todavia no fue consumida por ningun reporte.</p>
                        ) : (
                          <div className="etiquetas-table-wrap">
                            <table className="etiquetas-table">
                              <thead>
                                <tr>
                                  <th>OP</th><th>Fecha</th><th>Turno</th><th>Operador</th><th>Maquina</th>
                                  <th>Cantidad</th><th>Estado</th><th>Saldo ant.</th><th>Saldo actual</th>
                                </tr>
                              </thead>
                              <tbody>
                                {historial.map((h) => (
                                  <tr key={h.id} style={h.estado === 'observado' ? { background: 'rgba(184,84,80,0.08)' } : undefined}>
                                    <td>{h.ordenOp}</td>
                                    <td>{h.fecha || '-'}</td>
                                    <td>{h.turno || '-'}</td>
                                    <td>{h.operador || '-'}</td>
                                    <td>{h.maquina || '-'}</td>
                                    <td>{h.cantidad.toLocaleString()}</td>
                                    <td>
                                      {h.estado === 'ninguno' ? '-' : h.estado === 'observado' ? 'Observada' : h.estado}
                                      {h.estado === 'observado' && h.descripcion && (
                                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>{h.descripcion}</span>
                                      )}
                                    </td>
                                    <td>{h.saldoAnterior.toLocaleString()}</td>
                                    <td>{h.saldoActual.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ESTADOS_SALDO = [
  { value: '', label: 'Todos los estados' },
  { value: 'activo', label: 'Activo' },
  { value: 'agotado', label: 'Agotado' },
];

function SaldoBotellasTab() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const load = () => {
    setLoaded(false);
    localApi.getSaldoBotellas(filtroEstado ? { estado: filtroEstado } : {})
      .then((data) => { setRows(data); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  };
  useEffect(load, [filtroEstado]);

  const updateField = (id, field, value) => setRows((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const guardarFila = async (r) => {
    try {
      const updated = await localApi.updateSaldoBotellaAdmin(r.id, {
        cantidadActual: r.cantidadActual, estado: r.estado, observaciones: r.observaciones,
      });
      setRows((current) => current.map((x) => (x.id === r.id ? updated : x)));
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const eliminar = async (id) => {
    try {
      await localApi.deleteSaldoBotellaAdmin(id);
      setRows((current) => current.filter((r) => r.id !== id));
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  return (
    <div>
      <div className="form-grid planificacion-config-grid">
        <label className="field">
          <span>Filtrar por estado</span>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            {ESTADOS_SALDO.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : rows.length === 0 ? (
        <p className="etiquetas-empty">
          Sin saldo de botellas todavia. Se genera desde Reportes marcando "Fin de produccion con saldo".
        </p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr><th>Cod. botella</th><th>Maquina</th><th>Cant. actual</th><th>Fecha</th><th>Estado</th><th>Observaciones</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.codBotella}</td>
                  <td>{r.maquina || '-'}</td>
                  <td><input type="number" style={{ width: 90 }} value={r.cantidadActual} onChange={(e) => updateField(r.id, 'cantidadActual', Number(e.target.value) || 0)} /></td>
                  <td>{r.fecha}</td>
                  <td>
                    <select value={r.estado} onChange={(e) => updateField(r.id, 'estado', e.target.value)}>
                      {ESTADOS_SALDO.slice(1).map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </td>
                  <td><input value={r.observaciones} onChange={(e) => updateField(r.id, 'observaciones', e.target.value)} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary-action" onClick={() => guardarFila(r)}>Guardar</button>{' '}
                    <button type="button" className="etiquetas-delete-button" onClick={() => eliminar(r.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AlmacenProduccionView() {
  const [tab, setTab] = useState('cajas');

  return (
    <section className="etiquetas-section">
      <div className="etiquetas-intro-banner">
        {tab === 'cajas'
          ? 'Inventario de cajas de preforma. Estas cajas son las que se consumen desde Producción → Reportes (sección "Consumo de preformas") cuando se guarda un reporte diario.'
          : 'Saldo de botellas producidas de mas. Se genera desde Reportes marcando "Fin de produccion con saldo", y se consume desde otros reportes futuros de la misma botella con "Usar saldo de botella".'}
      </div>

      <div className="planificacion-subtabs">
        <button type="button" className={`secondary-action ${tab === 'cajas' ? 'active-option' : ''}`} onClick={() => setTab('cajas')}>Cajas de preforma</button>
        <button type="button" className={`secondary-action ${tab === 'saldo' ? 'active-option' : ''}`} onClick={() => setTab('saldo')}>Saldo de botellas</button>
      </div>

      <div className="panel">
        {tab === 'cajas' ? <CajasPrefTab /> : <SaldoBotellasTab />}
      </div>
    </section>
  );
}
