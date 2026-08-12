import { useEffect, useState } from 'react';
import { localApi } from './localApiClient.js';

const TIPOS_MAQUINA = [
  { value: 'ambos', label: 'Ambos (Etiquetas + Planificacion)' },
  { value: 'reporte_diario', label: 'Solo reporte diario / Etiquetas' },
  { value: 'planificacion', label: 'Solo planificacion' },
];

function MaquinasTab() {
  const [machines, setMachines] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ nombre: '', letra: '', tipo: 'ambos' });

  const load = () => {
    localApi.getAllMachines().then((data) => { setMachines(data); setLoaded(true); }).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const addMachine = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const created = await localApi.addMachineAdmin(form);
      setMachines((current) => [...current, created].sort((a, b) => a.orden - b.orden));
      setForm({ nombre: '', letra: '', tipo: 'ambos' });
    } catch (e) {
      setError(e.message || 'No se pudo crear la maquina.');
    }
  };

  const updateField = (id, field, value) => setMachines((current) => current.map(
    (m) => (m.id === id ? { ...m, [field]: value } : m),
  ));

  const saveRow = async (m) => {
    try {
      const updated = await localApi.updateMachine(m.id, m);
      setMachines((current) => current.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const removeMachine = async (id) => {
    try {
      await localApi.deleteMachine(id);
      setMachines((current) => current.filter((m) => m.id !== id));
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  return (
    <div>
      <form className="planificacion-mant-form" onSubmit={addMachine} style={{ gridTemplateColumns: '1fr 80px 1fr auto' }}>
        <input type="text" placeholder="Nombre (ej. SEM 200)" value={form.nombre} onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} />
        <input type="text" placeholder="Letra" maxLength={3} value={form.letra} onChange={(e) => setForm((c) => ({ ...c, letra: e.target.value.toUpperCase() }))} />
        <select value={form.tipo} onChange={(e) => setForm((c) => ({ ...c, tipo: e.target.value }))}>
          {TIPOS_MAQUINA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="submit" className="primary-action">+ Maquina</button>
      </form>
      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead>
              <tr><th>Nombre</th><th>Letra</th><th>Tipo</th><th>Activa</th><th>Orden</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td><input type="text" value={m.nombre} onChange={(e) => updateField(m.id, 'nombre', e.target.value)} /></td>
                  <td><input type="text" style={{ width: 50 }} value={m.letra} onChange={(e) => updateField(m.id, 'letra', e.target.value.toUpperCase())} /></td>
                  <td>
                    <select value={m.tipo} onChange={(e) => updateField(m.id, 'tipo', e.target.value)}>
                      {TIPOS_MAQUINA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td><input type="checkbox" checked={m.activa} onChange={(e) => updateField(m.id, 'activa', e.target.checked)} /></td>
                  <td><input type="number" style={{ width: 60 }} value={m.orden} onChange={(e) => updateField(m.id, 'orden', Number(e.target.value) || 0)} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary-action" onClick={() => saveRow(m)}>Guardar</button>{' '}
                    <button type="button" className="etiquetas-delete-button" onClick={() => removeMachine(m.id)}>Eliminar</button>
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

function PersonalTab() {
  const [personal, setPersonal] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ nombre: '', rol: 'operador' });

  const load = () => {
    localApi.getPersonal().then((data) => { setPersonal(data); setLoaded(true); }).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const addPersona = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const created = await localApi.addPersonal(form);
      setPersonal((current) => [...current, created]);
      setForm({ nombre: '', rol: 'operador' });
    } catch (e) {
      setError(e.message || 'No se pudo agregar.');
    }
  };

  const updateField = (id, field, value) => setPersonal((current) => current.map(
    (p) => (p.id === id ? { ...p, [field]: value } : p),
  ));

  const saveRow = async (p) => {
    try {
      const updated = await localApi.updatePersonal(p.id, p);
      setPersonal((current) => current.map((x) => (x.id === p.id ? updated : x)));
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
    }
  };

  const removePersona = async (id) => {
    try {
      await localApi.deletePersonal(id);
      setPersonal((current) => current.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || 'No se pudo eliminar.');
    }
  };

  return (
    <div>
      <form className="planificacion-mant-form" onSubmit={addPersona} style={{ gridTemplateColumns: '1fr 1fr auto' }}>
        <input type="text" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} />
        <input type="text" placeholder="Rol (ej. operador)" value={form.rol} onChange={(e) => setForm((c) => ({ ...c, rol: e.target.value }))} />
        <button type="submit" className="primary-action">+ Persona</button>
      </form>
      {error && <p className="etiquetas-form-error">{error}</p>}

      {!loaded ? <p className="etiquetas-empty">Cargando...</p> : personal.length === 0 ? (
        <p className="etiquetas-empty">Todavia no hay personal cargado.</p>
      ) : (
        <div className="etiquetas-table-wrap">
          <table className="etiquetas-table">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Activo</th><th aria-label="Acciones" /></tr></thead>
            <tbody>
              {personal.map((p) => (
                <tr key={p.id}>
                  <td><input type="text" value={p.nombre} onChange={(e) => updateField(p.id, 'nombre', e.target.value)} /></td>
                  <td><input type="text" value={p.rol} onChange={(e) => updateField(p.id, 'rol', e.target.value)} /></td>
                  <td><input type="checkbox" checked={p.activo} onChange={(e) => updateField(p.id, 'activo', e.target.checked)} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="secondary-action" onClick={() => saveRow(p)}>Guardar</button>{' '}
                    <button type="button" className="etiquetas-delete-button" onClick={() => removePersona(p.id)}>Eliminar</button>
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

export default function EquipoOperativoView() {
  const [tab, setTab] = useState('maquinas');

  return (
    <section className="etiquetas-section">
      <div className="etiquetas-intro-banner">
        Administracion de maquinas y personal. El tipo de maquina decide donde aparece: "reporte
        diario" en Etiquetas, "planificacion" solo en Planificacion (caso SEM 63/78), "ambos" en
        las dos.
      </div>

      <div className="planificacion-subtabs">
        <button type="button" className={`secondary-action ${tab === 'maquinas' ? 'active-option' : ''}`} onClick={() => setTab('maquinas')}>Maquinas</button>
        <button type="button" className={`secondary-action ${tab === 'personal' ? 'active-option' : ''}`} onClick={() => setTab('personal')}>Personal</button>
      </div>

      <div className="panel">
        {tab === 'maquinas' ? <MaquinasTab /> : <PersonalTab />}
      </div>
    </section>
  );
}
