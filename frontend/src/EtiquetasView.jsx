import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TURNOS,
  addEntry,
  addMachine,
  deleteEntry,
  getEntries,
  getMachines,
  searchProducts,
  upsertProduct,
} from './etiquetasStore.js';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Orden de OP: digitos primero (obligatorio), como mucho UNA letra al final
// (la de la maquina -- "088T", "088R", "088S" son ordenes distintas). Nunca
// puede empezar con una letra -- evita tipear "O" (letra) en vez de "0"
// (numero), que antes se colaba como una OP "distinta" sin que nadie lo note.
function sanitizeOrdenOp(raw) {
  const digits = raw.match(/^\d*/)[0];
  if (!digits) return '';
  const letra = raw.slice(digits.length).match(/^[A-Za-z]?/)[0];
  return digits + letra;
}

function formatFechaDisplay(iso) {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

const emptyForm = () => ({
  ordenOp: '',
  maquinaId: '',
  fecha: todayIso(),
  turno: '',
  codBotella: '',
  codPreforma: '',
});

export default function EtiquetasView() {
  const [machines, setMachines] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [productQuery, setProductQuery] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState(null);
  const productFieldRef = useRef(null);
  const productSearchToken = useRef(0);

  const [isMachinePanelOpen, setIsMachinePanelOpen] = useState(false);
  const [newMachineNombre, setNewMachineNombre] = useState('');
  const [newMachineLetra, setNewMachineLetra] = useState('');
  const [machineError, setMachineError] = useState('');
  const [isSavingMachine, setIsSavingMachine] = useState(false);

  const loadAll = async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const [machinesData, entriesData] = await Promise.all([getMachines(), getEntries()]);
      setMachines(machinesData);
      setEntries(entriesData);
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      setLoadError(error.message || 'No se pudo conectar con el servidor local.');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    function onClickOutside(event) {
      if (productFieldRef.current && !productFieldRef.current.contains(event.target)) {
        setIsProductDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selectedMachine = useMemo(
    () => machines.find((machine) => String(machine.id) === String(form.maquinaId)) ?? null,
    [machines, form.maquinaId],
  );

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage('');
  };

  // Al escribir la letra de maquina al final de la Orden de OP (ej. "088T"),
  // selecciona sola la maquina que tiene esa letra -- no hace falta elegirla
  // a mano dos veces. Si la letra no coincide con ninguna maquina, no toca
  // la seleccion actual (el usuario puede seguir escribiendo/corrigiendo).
  const updateOrdenOp = (raw) => {
    const value = sanitizeOrdenOp(raw);
    const letra = value.match(/[A-Za-z]$/)?.[0] ?? '';
    setForm((current) => {
      if (!letra) return { ...current, ordenOp: value };
      const match = machines.find((m) => (m.letra || '').toLowerCase() === letra.toLowerCase());
      return match ? { ...current, ordenOp: value, maquinaId: String(match.id) } : { ...current, ordenOp: value };
    });
    setFormMessage('');
  };

  const runProductSearch = async (value) => {
    const token = ++productSearchToken.current;
    try {
      const results = await searchProducts(value, selectedMachine?.nombre ?? '');
      if (token === productSearchToken.current) {
        setProductSuggestions(results);
      }
    } catch {
      if (token === productSearchToken.current) {
        setProductSuggestions([]);
      }
    }
  };

  const onProductInput = (value) => {
    setProductQuery(value);
    updateField('codBotella', value);
    updateField('codPreforma', '');
    setMatchedProduct(null);
    setIsProductDropdownOpen(true);
    runProductSearch(value);
  };

  const selectProduct = (product) => {
    setProductQuery(product.codBotella);
    setForm((current) => ({ ...current, codBotella: product.codBotella, codPreforma: product.codPreforma }));
    setMatchedProduct(product);
    setIsProductDropdownOpen(false);
  };

  const registerNewProduct = async () => {
    if (!form.codBotella.trim()) return;
    try {
      const saved = await upsertProduct({
        codBotella: form.codBotella,
        codPreforma: form.codPreforma,
        maquina: selectedMachine?.nombre ?? '',
      });
      setMatchedProduct(saved);
      setFormMessage(`Producto "${saved.codBotella}" guardado en el catalogo local.`);
    } catch (error) {
      setFormError(error.message || 'No se pudo guardar el producto.');
    }
  };

  useEffect(() => {
    if (productQuery.trim()) {
      runProductSearch(productQuery);
    }
    // Cambiar de maquina invalida el codigo de preforma ya autocompletado, porque
    // la misma botella puede usar otra preforma segun la maquina.
    setMatchedProduct(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.maquinaId]);

  const submitEntry = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!form.ordenOp.trim()) return setFormError('Falta la orden de OP.');
    if (!selectedMachine) return setFormError('Selecciona una maquina.');
    if (!form.fecha) return setFormError('Falta la fecha de produccion.');
    if (!form.turno) return setFormError('Selecciona el turno.');
    if (!form.codBotella.trim()) return setFormError('Falta el codigo de producto (botella).');

    setIsSaving(true);
    try {
      // La OP se guarda tal cual (numero + letra de maquina si se escribio,
      // ej. "088T") -- la letra es parte de la identidad de la OP, "088T",
      // "088R" y "088S" son ordenes distintas. El input de arriba ya
      // garantiza el formato (digitos, despues como mucho una letra).
      const ordenOp = form.ordenOp.trim();

      const record = await addEntry({
        ordenOp,
        maquinaId: selectedMachine.id,
        maquinaNombre: selectedMachine.nombre,
        maquinaLetra: selectedMachine.letra,
        fecha: form.fecha,
        turno: form.turno,
        codBotella: form.codBotella,
        codPreforma: form.codPreforma,
      });

      setEntries((current) => [record, ...current]);
      setForm((current) => ({ ...emptyForm(), maquinaId: current.maquinaId, fecha: current.fecha, turno: current.turno }));
      setProductQuery('');
      setMatchedProduct(null);
      setFormMessage(`Registro de la orden ${record.ordenOp} guardado.`);
    } catch (error) {
      setFormError(error.message || 'No se pudo guardar el registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeEntry = async (id) => {
    try {
      const updated = await deleteEntry(id);
      setEntries(updated);
    } catch (error) {
      setFormError(error.message || 'No se pudo eliminar el registro.');
    }
  };

  const submitNewMachine = async (event) => {
    event.preventDefault();
    setMachineError('');
    setIsSavingMachine(true);
    try {
      const updated = await addMachine({ nombre: newMachineNombre, letra: newMachineLetra });
      setMachines(updated);
      setNewMachineNombre('');
      setNewMachineLetra('');
      setIsMachinePanelOpen(false);
    } catch (error) {
      setMachineError(error.message || 'No se pudo guardar la maquina.');
    } finally {
      setIsSavingMachine(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <section className="etiquetas-section">
        <div className="panel etiquetas-form">Cargando datos del servidor local...</div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="etiquetas-section">
        <div className="etiquetas-intro-banner etiquetas-error-banner">
          <strong>No se pudo conectar con el servidor local.</strong> {loadError}
          <br />
          Verifica que este corriendo (<code>npm run server</code> o <code>npm run dev:all</code>) y que
          iniciaste sesion como administrador local.
          <div className="save-row">
            <button type="button" className="secondary-action" onClick={loadAll}>Reintentar</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="etiquetas-section">
      <div className="etiquetas-intro-banner">
        <strong>Conectado al servidor local (PostgreSQL).</strong> Estos registros, maquinas y productos ya
        se guardan en la base de datos local, no en el navegador. Los reportes diarios de DIGITALIZACION
        todavia no estan enlazados — eso es una fase siguiente.
      </div>

      <form className="panel etiquetas-form" onSubmit={submitEntry}>
        <div className="section-heading">
          <div>
            <span>Etiquetas</span>
            <h2>Nuevo registro de produccion</h2>
          </div>
        </div>

        <div className="form-grid etiquetas-form-grid">
          <label className="field">
            <span>Orden de OP</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej. 088 o 088T"
              value={form.ordenOp}
              // Digitos primero, despues como mucho una letra (la de la
              // maquina) -- ver sanitizeOrdenOp(). Si la letra coincide con
              // una maquina, la selecciona sola (ver updateOrdenOp()).
              onChange={(event) => updateOrdenOp(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Maquina</span>
            <select value={form.maquinaId} onChange={(event) => updateField('maquinaId', event.target.value)}>
              <option value="">Seleccionar maquina</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.nombre} ({machine.letra})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="etiquetas-link-button"
              onClick={() => setIsMachinePanelOpen((open) => !open)}
            >
              {isMachinePanelOpen ? 'Cancelar' : '+ Agregar maquina'}
            </button>
          </label>

          <label className="field">
            <span>Fecha</span>
            <input type="date" value={form.fecha} onChange={(event) => updateField('fecha', event.target.value)} />
          </label>

          <label className="field">
            <span>Turno</span>
            <select value={form.turno} onChange={(event) => updateField('turno', event.target.value)}>
              <option value="">Seleccionar turno</option>
              {TURNOS.map((turno) => (
                <option key={turno} value={turno}>{turno}</option>
              ))}
            </select>
          </label>

          <label className="field etiquetas-product-field" ref={productFieldRef}>
            <span>Producto (codigo de botella)</span>
            <input
              type="text"
              placeholder="Ej. 14590-1"
              value={productQuery}
              onChange={(event) => onProductInput(event.target.value)}
              onFocus={() => { runProductSearch(productQuery); setIsProductDropdownOpen(true); }}
              autoComplete="off"
            />
            {isProductDropdownOpen && productSuggestions.length > 0 && (
              <div className="etiquetas-autocomplete-dropdown">
                {productSuggestions.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    className="etiquetas-autocomplete-option"
                    onMouseDown={() => selectProduct(product)}
                  >
                    <strong>{product.codBotella}</strong>
                    <span>{product.descripcion || 'Sin descripcion'}</span>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="field">
            <span>Codigo de preforma</span>
            <input
              type="text"
              placeholder="Se autocompleta desde el catalogo"
              value={form.codPreforma}
              onChange={(event) => updateField('codPreforma', event.target.value)}
            />
            {form.codBotella.trim() && !matchedProduct && (
              <button type="button" className="etiquetas-link-button" onClick={registerNewProduct}>
                + Guardar este codigo de botella / preforma en el catalogo
              </button>
            )}
          </label>
        </div>

        {isMachinePanelOpen && (
          <div className="etiquetas-inline-panel">
            <div className="etiquetas-inline-panel-grid">
              <label className="field">
                <span>Nombre de maquina</span>
                <input
                  type="text"
                  placeholder="Ej. SEM 120"
                  value={newMachineNombre}
                  onChange={(event) => setNewMachineNombre(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Letra</span>
                <input
                  type="text"
                  placeholder="Ej. V"
                  maxLength={3}
                  value={newMachineLetra}
                  onChange={(event) => setNewMachineLetra(event.target.value.toUpperCase())}
                />
              </label>
              <button type="button" className="primary-action" onClick={submitNewMachine} disabled={isSavingMachine}>
                {isSavingMachine ? 'Guardando...' : 'Guardar maquina'}
              </button>
            </div>
            {machineError && <strong className="visual-sync-warning">{machineError}</strong>}
          </div>
        )}

        <div className="save-row">
          <button type="submit" className="primary-action" disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar registro'}
          </button>
          {formError && <span className="etiquetas-form-error">{formError}</span>}
          {!formError && formMessage && <span>{formMessage}</span>}
        </div>
      </form>

      <div className="panel etiquetas-history">
        <div className="section-heading">
          <div>
            <span>Etiquetas</span>
            <h2>Registros guardados en la base local ({entries.length})</h2>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="etiquetas-empty">Todavia no hay registros. Completa el formulario de arriba.</p>
        ) : (
          <div className="etiquetas-table-wrap">
            <table className="etiquetas-table">
              <thead>
                <tr>
                  <th>Orden OP</th>
                  <th>Maquina</th>
                  <th>Fecha</th>
                  <th>Turno</th>
                  <th>Producto</th>
                  <th>Preforma</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.ordenOp}</td>
                    <td>{entry.maquinaNombre} ({entry.maquinaLetra})</td>
                    <td>{formatFechaDisplay(entry.fecha)}</td>
                    <td>{entry.turno}</td>
                    <td>{entry.codBotella}</td>
                    <td>{entry.codPreforma || '—'}</td>
                    <td>
                      <button type="button" className="etiquetas-delete-button" onClick={() => removeEntry(entry.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
