// Cliente del backend local (Express + SQLite). Mismo rol que supabaseClient.js
// pero para el modo "local" de la app (ver el plan de migracion en
// C:\Users\LENOVO\.claude\plans\virtual-sauteeing-kurzweil.md).

// Por defecto, vacio: las llamadas usan rutas relativas ("/api/...") al
// mismo origen desde el que se cargo la pagina -- Vite reenvia /api/* al
// backend Express (ver proxy en vite.config.js), asi que funciona igual
// abierto en esta PC (localhost:5000) o desde otra maquina de la red local
// usando la IP LAN de esta PC (ej. http://192.168.x.x:5000), sin CORS y sin
// exponer el puerto 8787 aparte. Solo hace falta VITE_LOCAL_API_URL si el
// backend corre en otra maquina distinta a la que sirve el frontend.
const BASE_URL = import.meta.env.VITE_LOCAL_API_URL || '';
const TOKEN_STORAGE_KEY = 'petnova-local-session-token';

export function getLocalSessionToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

function setLocalSessionToken(token) {
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getLocalSessionToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error del servidor local (${response.status}).`);
  }

  return data;
}

export async function loginLocal(username, password) {
  const data = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  setLocalSessionToken(data.token);
  return data.user;
}

export async function logoutLocal() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    // La sesion puede ya estar vencida del lado del servidor; no bloquea el logout local.
  } finally {
    setLocalSessionToken(null);
  }
}

export async function getLocalSession() {
  if (!getLocalSessionToken()) return null;
  try {
    const data = await request('/api/auth/me');
    return data.user;
  } catch {
    setLocalSessionToken(null);
    return null;
  }
}

export const localApi = {
  getMachines: (scope = '') => request(`/api/machines${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`),
  addMachine: (machine) => request('/api/machines', { method: 'POST', body: machine }),
  getProducts: (query = '', maquina = '') => request(
    `/api/products?q=${encodeURIComponent(query)}&maquina=${encodeURIComponent(maquina)}`,
  ),
  upsertProduct: (product) => request('/api/products', { method: 'POST', body: product }),
  getEntries: () => request('/api/entries'),
  addEntry: (entry) => request('/api/entries', { method: 'POST', body: entry }),
  deleteEntry: (id) => request(`/api/entries/${id}`, { method: 'DELETE' }),

  getBotellasCatalogo: (maquina = '') => request(`/api/botellas-catalogo?maquina=${encodeURIComponent(maquina)}`),
  getPlanes: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/api/planes?${params.toString()}`);
  },
  savePlan: (plan) => request('/api/planes', { method: 'POST', body: plan }),
  deletePlan: (id) => request(`/api/planes/${id}`, { method: 'DELETE' }),

  getParos: () => request('/api/paros'),
  addParo: (paro) => request('/api/paros', { method: 'POST', body: paro }),
  deleteParo: (id) => request(`/api/paros/${id}`, { method: 'DELETE' }),
  getAdiciones: () => request('/api/adiciones'),
  addAdicion: (adicion) => request('/api/adiciones', { method: 'POST', body: adicion }),
  deleteAdicion: (id) => request(`/api/adiciones/${id}`, { method: 'DELETE' }),
  getReasignaciones: () => request('/api/reasignaciones'),
  addReasignacion: (reasignacion) => request('/api/reasignaciones', { method: 'POST', body: reasignacion }),
  deleteReasignacion: (id) => request(`/api/reasignaciones/${id}`, { method: 'DELETE' }),

  // Equipo operativo
  getAllMachines: () => request('/api/admin/machines'),
  addMachineAdmin: (machine) => request('/api/admin/machines', { method: 'POST', body: machine }),
  updateMachine: (id, patch) => request(`/api/admin/machines/${id}`, { method: 'PUT', body: patch }),
  deleteMachine: (id) => request(`/api/admin/machines/${id}`, { method: 'DELETE' }),
  getPersonal: () => request('/api/personal'),
  addPersonal: (p) => request('/api/personal', { method: 'POST', body: p }),
  updatePersonal: (id, patch) => request(`/api/personal/${id}`, { method: 'PUT', body: patch }),
  deletePersonal: (id) => request(`/api/personal/${id}`, { method: 'DELETE' }),

  // Productos e insumos
  getBotellasAdmin: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/admin/botellas?${qs.toString()}`);
  },
  addBotellaAdmin: (b) => request('/api/admin/botellas', { method: 'POST', body: b }),
  updateBotellaAdmin: (id, patch) => request(`/api/admin/botellas/${id}`, { method: 'PUT', body: patch }),
  deleteBotellaAdmin: (id) => request(`/api/admin/botellas/${id}`, { method: 'DELETE' }),
  getPreformasAdmin: (query = '') => request(`/api/admin/preformas?q=${encodeURIComponent(query)}`),
  addPreformaAdmin: (p) => request('/api/admin/preformas', { method: 'POST', body: p }),
  updatePreformaAdmin: (id, patch) => request(`/api/admin/preformas/${id}`, { method: 'PUT', body: patch }),
  deletePreformaAdmin: (id) => request(`/api/admin/preformas/${id}`, { method: 'DELETE' }),

  // Reportes diarios
  lookupEtiquetaByOp: (op) => request(`/api/etiquetas-lookup?op=${encodeURIComponent(op)}`),
  getReportesDiarios: () => request('/api/reportes-diarios'),
  saveReporteDiario: (reporte) => request('/api/reportes-diarios', { method: 'POST', body: reporte }),
  deleteReporteDiario: (id) => request(`/api/reportes-diarios/${id}`, { method: 'DELETE' }),
  validarReporteDiario: (id) => request(`/api/reportes-diarios/${id}/validar`, { method: 'POST' }),
  rechazarReporteDiario: (id, motivo) => request(`/api/reportes-diarios/${id}/rechazar`, { method: 'POST', body: { motivo } }),
  marcarPendienteReporteDiario: (id) => request(`/api/reportes-diarios/${id}/marcar-pendiente`, { method: 'POST' }),

  // Cajas de preforma (Almacen Produccion)
  getCajasPreforma: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/admin/cajas-preforma?${qs.toString()}`);
  },
  addCajaPreforma: (c) => request('/api/admin/cajas-preforma', { method: 'POST', body: c }),
  updateCajaPreforma: (id, patch) => request(`/api/admin/cajas-preforma/${id}`, { method: 'PUT', body: patch }),
  deleteCajaPreforma: (id) => request(`/api/admin/cajas-preforma/${id}`, { method: 'DELETE' }),
  getCajasPreformaDisponibles: (codPreforma) => request(`/api/cajas-preforma-disponibles?codPreforma=${encodeURIComponent(codPreforma)}`),
  getHistorialCaja: (id) => request(`/api/admin/cajas-preforma/${id}/historial`),
  getObservacionesPreforma: () => request('/api/admin/cajas-preforma/observaciones'),

  // Saldo de botellas (Almacen Produccion)
  getSaldoBotellas: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/admin/saldo-botellas?${qs.toString()}`);
  },
  updateSaldoBotellaAdmin: (id, patch) => request(`/api/admin/saldo-botellas/${id}`, { method: 'PUT', body: patch }),
  deleteSaldoBotellaAdmin: (id) => request(`/api/admin/saldo-botellas/${id}`, { method: 'DELETE' }),
  getSaldoBotellasDisponibles: (codBotella) => request(`/api/saldo-botellas-disponibles?codBotella=${encodeURIComponent(codBotella)}`),
};
