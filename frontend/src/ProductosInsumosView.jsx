import { useEffect, useMemo, useState } from 'react';
import { localApi } from './localApiClient.js';

const PAGE_SIZE = 50;

function emptyBotellaForm() {
  return {
    maquinas: [], codBotella: '', codPreforma: '', descripcion: '',
    gramaje: '', volumen: '', velocidad: '', uBolsa: '', rosca: '',
  };
}

function BotellasTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [porMaquina, setPorMaquina] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [maquinaFiltro, setMaquinaFiltro] = useState('');
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(emptyBotellaForm);
  const [showForm, setShowForm] = useState(false);
  const [machines, setMachines] = useState([]);

  const load = () => {
    setLoaded(false);
    localApi.getBotellasAdmin({ q: query, maquina: maquinaFiltro, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((data) => { setRows(data.rows); setTotal(data.total); setPorMaquina(data.porMaquina); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  };

  useEffect(load, [query, maquinaFiltro, page]);
  useEffect(() => setPage(0), [query, maquinaFiltro]);
  useEffect(() => { localApi.getAllMachines().then(setMachines).catch(() => setMachines([])); }, []);

  const totalCargado = useMemo(() => porMaquina.reduce((sum, m) => sum + m.n, 0), [porMaquina]);

  const toggleFormMaquina = (nombre) => {
    setForm((c) => ({
      ...c,
      maquinas: c.maquinas.includes(nombre) ? c.maquinas.filter((m) => m !== nombre) : [...c.maquinas, nombre],
    }));
  };

  // Una fila del catalogo = una maquina que produce esa botella (asi esta
  // armada la tabla, igual que en el dump de DIGITALIZACION). Si se marcan
  // varias maquinas al crear, se crea una fila por cada una, con los mismos
  // datos (gramaje/volumen/velocidad/etc.) -- asi queda "asignada" a todas
  // las que la producen.
  const addBotella = async (event) => {
    event.preventDefault();
    setError('');
    if (form.maquinas.length === 0) {
      setError('Selecciona al menos una maquina que produce esta botella.');
      return;
    }
    try {
      const { maquinas, ...datos } = form;
      await Promise.all(maquinas.map((maquina) => localApi.addBotellaAdmin({ ...datos, maquina })));
      setForm(emptyBotellaForm());
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message || 'No se pudo agregar.');
    }
  };

  const updateField = (id, field, value) => setRows((current) => current.map(
    (r) => (r.id === id ? { ...r, [field]: value } : r),
  ));

  const saveRow = async (r) => {
    try {
      await localApi.updateBotellaAdmin(r.id, r);
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const removeRow = async (id) => {
    try {
      await localApi.deleteBotellaAdmin(id);
      load();
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="planificacion-result-header">
        <span className="planificacion-badge planificacion-badge-accent">{totalCargado.toLocaleString()} botellas cargadas</span>
        {porMaquina.map((m) => (
          <span key={m.maquina} className="planificacion-badge">{m.maquina}: {m.n}</span>
        ))}
      </div>

      <div className="form-grid planificacion-config-grid">
        <label className="field">
          <span>Buscar</span>
          <input type="text" placeholder="codigo, descripcion o preforma..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="field">
          <span>Maquina</span>
          <select value={maquinaFiltro} onChange={(e) => setMaquinaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {porMaquina.map((m) => <option key={m.maquina} value={m.maquina}>{m.maquina}</option>)}
          </select>
        </label>
      </div>

      <div className="save-row">
        <button type="button" className="secondary-action" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancelar' : '+ Agregar botella'}
        </button>
      </div>

      {showForm && (
        <form className="etiquetas-inline-panel" onSubmit={addBotella}>
          <div className="sec-title" style={{ marginTop: 0 }}>Maquinas que la producen</div>
          {machines.length === 0 ? (
            <p className="etiquetas-empty">No hay maquinas cargadas -- agrega alguna en Equipo Operativo primero.</p>
          ) : (
            <div className="etiquetas-chips" style={{ marginBottom: 12 }}>
              {machines.map((m) => (
                <label key={m.id} className="planificacion-checkbox" style={{ display: 'inline-flex', width: 'auto', marginRight: 12 }}>
                  <input type="checkbox" checked={form.maquinas.includes(m.nombre)} onChange={() => toggleFormMaquina(m.nombre)} />
                  {m.nombre}
                </label>
              ))}
            </div>
          )}
          <div className="etiquetas-inline-panel-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <label className="field"><span>Cod. botella</span><input required value={form.codBotella} onChange={(e) => setForm((c) => ({ ...c, codBotella: e.target.value }))} /></label>
            <label className="field"><span>Cod. preforma</span><input value={form.codPreforma} onChange={(e) => setForm((c) => ({ ...c, codPreforma: e.target.value }))} /></label>
            <label className="field"><span>Descripcion</span><input value={form.descripcion} onChange={(e) => setForm((c) => ({ ...c, descripcion: e.target.value }))} /></label>
            <label className="field"><span>Gramaje</span><input type="number" step="any" value={form.gramaje} onChange={(e) => setForm((c) => ({ ...c, gramaje: e.target.value }))} /></label>
            <label className="field"><span>Volumen</span><input type="number" step="any" value={form.volumen} onChange={(e) => setForm((c) => ({ ...c, volumen: e.target.value }))} /></label>
            <label className="field"><span>Velocidad</span><input value={form.velocidad} onChange={(e) => setForm((c) => ({ ...c, velocidad: e.target.value }))} /></label>
            <label className="field"><span>Unidades por bolsa</span><input type="number" step="any" value={form.uBolsa} onChange={(e) => setForm((c) => ({ ...c, uBolsa: e.target.value }))} /></label>
            <label className="field"><span>Rosca</span><input value={form.rosca} onChange={(e) => setForm((c) => ({ ...c, rosca: e.target.value }))} /></label>
          </div>
          <div className="save-row"><button type="submit" className="primary-action">Guardar</button></div>
        </form>
      )}

      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : (
        <>
          <div className="etiquetas-table-wrap">
            <table className="etiquetas-table">
              <thead>
                <tr><th>Maquina</th><th>Cod. botella</th><th>Cod. preforma</th><th>Descripcion</th><th>Gramaje</th><th>Volumen</th><th>Vel/h</th><th>U/bolsa</th><th>Rosca</th><th aria-label="Acciones" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <select value={r.maquina} onChange={(e) => updateField(r.id, 'maquina', e.target.value)}>
                        {!machines.some((m) => m.nombre === r.maquina) && <option value={r.maquina}>{r.maquina}</option>}
                        {machines.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                      </select>
                    </td>
                    <td><input value={r.codBotella} onChange={(e) => updateField(r.id, 'codBotella', e.target.value)} /></td>
                    <td><input value={r.codPreforma} onChange={(e) => updateField(r.id, 'codPreforma', e.target.value)} /></td>
                    <td><input value={r.descripcion} onChange={(e) => updateField(r.id, 'descripcion', e.target.value)} /></td>
                    <td><input type="number" step="any" style={{ width: 80 }} value={r.gramaje ?? ''} onChange={(e) => updateField(r.id, 'gramaje', e.target.value)} /></td>
                    <td><input type="number" step="any" style={{ width: 80 }} value={r.volumen ?? ''} onChange={(e) => updateField(r.id, 'volumen', e.target.value)} /></td>
                    <td><input style={{ width: 70 }} value={r.velocidad || ''} onChange={(e) => updateField(r.id, 'velocidad', e.target.value)} /></td>
                    <td><input type="number" step="any" style={{ width: 70 }} value={r.uBolsa || ''} onChange={(e) => updateField(r.id, 'uBolsa', e.target.value)} /></td>
                    <td><input style={{ width: 80 }} value={r.rosca || ''} onChange={(e) => updateField(r.id, 'rosca', e.target.value)} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="secondary-action" onClick={() => saveRow(r)}>Guardar</button>{' '}
                      <button type="button" className="etiquetas-delete-button" onClick={() => removeRow(r.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="save-row">
            <button type="button" className="secondary-action" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <span>Pagina {page + 1} de {totalPages} ({total} resultados)</span>
            <button type="button" className="secondary-action" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}

function PreformasTab() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ codigo: '', descripcion: '', unidCaja: '', gramaje: '' });

  const load = () => {
    localApi.getPreformasAdmin(query).then((data) => { setRows(data); setLoaded(true); }).catch((e) => setError(e.message));
  };
  useEffect(load, [query]);

  const addPreforma = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const created = await localApi.addPreformaAdmin(form);
      setRows((current) => [...current, created].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      setForm({ codigo: '', descripcion: '', unidCaja: '', gramaje: '' });
    } catch (e) {
      setError(e.message || 'No se pudo agregar.');
    }
  };

  const updateField = (id, field, value) => setRows((current) => current.map(
    (r) => (r.id === id ? { ...r, [field]: value } : r),
  ));

  const saveRow = async (r) => {
    try {
      await localApi.updatePreformaAdmin(r.id, r);
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const removeRow = async (id) => {
    try {
      await localApi.deletePreformaAdmin(id);
      setRows((current) => current.filter((r) => r.id !== id));
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  return (
    <div>
      <label className="field">
        <span>Buscar</span>
        <input type="text" placeholder="codigo o descripcion..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <form className="planificacion-mant-form" onSubmit={addPreforma} style={{ gridTemplateColumns: '1fr 2fr 100px 100px auto', marginTop: 12 }}>
        <input placeholder="Codigo" value={form.codigo} onChange={(e) => setForm((c) => ({ ...c, codigo: e.target.value }))} />
        <input placeholder="Descripcion" value={form.descripcion} onChange={(e) => setForm((c) => ({ ...c, descripcion: e.target.value }))} />
        <input type="number" placeholder="Unid/caja" value={form.unidCaja} onChange={(e) => setForm((c) => ({ ...c, unidCaja: e.target.value }))} />
        <input type="number" placeholder="Gramaje" value={form.gramaje} onChange={(e) => setForm((c) => ({ ...c, gramaje: e.target.value }))} />
        <button type="submit" className="primary-action">+ Preforma</button>
      </form>

      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead><tr><th>Codigo</th><th>Descripcion</th><th>Unid/caja</th><th>Gramaje</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.codigo}</td>
                  <td><input value={r.descripcion} onChange={(e) => updateField(r.id, 'descripcion', e.target.value)} /></td>
                  <td><input type="number" style={{ width: 80 }} value={r.unidCaja} onChange={(e) => updateField(r.id, 'unidCaja', Number(e.target.value) || 0)} /></td>
                  <td>{r.gramaje ?? '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary-action" onClick={() => saveRow(r)}>Guardar</button>{' '}
                    <button type="button" className="etiquetas-delete-button" onClick={() => removeRow(r.id)}>Eliminar</button>
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

export default function ProductosInsumosView() {
  const [tab, setTab] = useState('botellas');

  return (
    <section className="etiquetas-section">
      <div className="etiquetas-intro-banner">
        Catalogo real importado de DIGITALIZACION (tablas "botellas" y "preformas"). Si un
        contador por maquina se ve bajo, todavia falta importar esas filas.
      </div>

      <div className="planificacion-subtabs">
        <button type="button" className={`secondary-action ${tab === 'botellas' ? 'active-option' : ''}`} onClick={() => setTab('botellas')}>Botellas</button>
        <button type="button" className={`secondary-action ${tab === 'preformas' ? 'active-option' : ''}`} onClick={() => setTab('preformas')}>Preformas</button>
      </div>

      <div className="panel">
        {tab === 'botellas' ? <BotellasTab /> : <PreformasTab />}
      </div>
    </section>
  );
}
