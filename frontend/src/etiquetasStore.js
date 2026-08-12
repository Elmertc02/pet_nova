// Acceso a datos del apartado "Etiquetas".
//
// Fase 1 de la migracion local: esto ya no es localStorage — habla con el servidor
// local (Express + SQLite) via src/localApiClient.js. Requiere estar logueado como
// administrador local (ver LoginScreen -> "Entrar como administrador local") y tener
// el servidor corriendo (`npm run server`, o `npm run dev:all`).

import { localApi } from './localApiClient.js';

export const TURNOS = ['Dia', 'Tarde', 'Noche'];

export function getMachines() {
  return localApi.getMachines();
}

export function addMachine({ nombre, letra }) {
  return localApi.addMachine({ nombre, letra });
}

// Si se pasa `maquina` (nombre real, ej. "SEM 139"), filtra el catalogo a esa
// maquina primero -- el mismo codigo de botella puede tener distinta preforma
// segun en que maquina se produzca.
export function searchProducts(query, maquina = '', limit = 20) {
  return localApi.getProducts(query, maquina).then((products) => products.slice(0, limit));
}

export function findProductByCode(codBotella, maquina = '') {
  const query = (codBotella ?? '').trim();
  if (!query) return Promise.resolve(null);
  return localApi.getProducts(query, maquina).then(
    (products) => products.find((p) => p.codBotella.toLowerCase() === query.toLowerCase()) ?? null,
  );
}

export function upsertProduct({ codBotella, codPreforma, descripcion, maquina }) {
  return localApi.upsertProduct({ codBotella, codPreforma, descripcion, maquina });
}

export function getEntries() {
  return localApi.getEntries();
}

export function addEntry(entry) {
  return localApi.addEntry(entry);
}

export function deleteEntry(id) {
  return localApi.deleteEntry(id);
}
