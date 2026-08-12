# Linked Two-Sided Quality Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `Nuevo registro` y `Pruebas` en anverso y reverso de un
solo documento digital que persiste como borrador y se envia, aprueba,
imprime y certifica como una unidad.

**Architecture:** Crear `quality_documents` como entidad principal y enlazar
exactamente dos filas de `new_quality_records` mediante `document_id`. El
estado, version formal y datos compartidos pertenecen al documento; cada cara
conserva su `payload`. Las operaciones se realizan con RPC transaccionales y
la interfaz usa un repositorio aislado para no seguir ampliando la logica de
Supabase dentro de `App.jsx`.

**Tech Stack:** React 19, Vite 7, Supabase JS 2, PostgreSQL/RLS/RPC, Node test
runner y CSS responsivo existente.

## Global Constraints

- `Nuevo registro` es el anverso y `Pruebas` es el reverso.
- El borrador se guarda en Supabase y puede abrirse y modificarse despues.
- Solo existe un envio y una decision de revision para ambas caras.
- Leonel (`admin`) y Rafael (`calidad`) pueden revisar y autoaprobar.
- Guest (`lectura`) puede completar y mandar, pero no revisar ni certificar.
- La impresion produce dos paginas carta y conserva los formatos existentes.
- El certificado obtiene ambas caras por `document_id`, nunca por coincidencia
  de fecha, maquina y SAI.
- Ninguna falla de red limpia el formulario local.
- El archivo local `supabase-clear-rafael-session.sql` no se incluye en commits.

---

## File Structure

- Create `src/qualityDocumentWorkflow.js`: estados, normalizacion, validacion,
  combinacion de filas y etiquetas de completitud.
- Create `src/qualityDocumentRepository.js`: unica frontera entre React y los
  RPC de Supabase para documentos de dos caras.
- Create `src/QualityDocumentDialogs.jsx`: revision e historial del documento
  completo.
- Create `src/qualityDocumentPrint.js`: composicion de las dos vistas
  imprimibles en un solo documento.
- Create `supabase-quality-two-sided-documents.sql`: tablas, restricciones,
  RLS, migracion y RPC transaccionales.
- Create `tests/qualityDocumentWorkflow.test.js`: pruebas del dominio.
- Create `tests/qualityDocumentRepository.test.js`: pruebas de mapeo y errores
  del repositorio.
- Create `tests/qualityDocumentSql.test.js`: contrato estatico de la migracion.
- Create `tests/qualityDocumentPrint.test.js`: contrato de impresion y enlace
  de certificado.
- Modify `src/App.jsx`: sustituir los dos flujos independientes por un editor
  y una base de documentos.
- Modify `src/styles.css`: navegacion de caras, estado de guardado, base unica,
  revision y estilos de impresion.
- Modify `src/newQualityCertificate.js`: consumir un documento ya enlazado.
- Modify `src/qualityRecordWorkflow.js`: compatibilidad temporal de estados.
- Modify `supabase-quality-record-approval.sql`: delegar los nuevos envios y
  revisiones al flujo de documento.

---

### Task 1: Modelo de dominio del documento

**Files:**
- Create: `src/qualityDocumentWorkflow.js`
- Create: `tests/qualityDocumentWorkflow.test.js`

**Interfaces:**
- Produces:
  - `QUALITY_DOCUMENT_STATUS`
  - `createEmptyQualityDocument()`
  - `normalizeQualityDocument(value)`
  - `mergeQualityDocumentRows(documentRow, recordRows)`
  - `validateQualityDocument(document)`
  - `getQualityDocumentCompletion(document)`
  - `canReviewQualityDocument(user)`
  - `diffQualityDocumentSnapshots(previous, next)`

- [ ] **Step 1: Escribir pruebas fallidas de identidad, normalizacion y validacion**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyQualityDocument,
  mergeQualityDocumentRows,
  validateQualityDocument,
  getQualityDocumentCompletion,
} from '../src/qualityDocumentWorkflow.js';

test('creates one draft with an inspection face and a tests face', () => {
  const document = createEmptyQualityDocument();
  assert.equal(document.status, 'draft');
  assert.deepEqual(Object.keys(document.faces).sort(), ['inspection', 'tests']);
});

test('merges both database rows by document id', () => {
  const merged = mergeQualityDocumentRows(
    { id: 'doc-1', status: 'draft', shared_data: { saiCode: '14590-100' } },
    [
      { document_id: 'doc-1', record_type: 'inspection', payload: { operator: 'Elvis C.' } },
      { document_id: 'doc-1', record_type: 'tests', payload: { fallTest: 'SI' } },
    ],
  );
  assert.equal(merged.faces.inspection.operator, 'Elvis C.');
  assert.equal(merged.faces.tests.fallTest, 'SI');
});

test('reports missing fields grouped by face', () => {
  const result = validateQualityDocument(createEmptyQualityDocument());
  assert.ok(result.shared.includes('productionDate'));
  assert.ok(result.shared.includes('machine'));
  assert.ok(result.shared.includes('saiCode'));
  assert.ok(result.inspection.includes('operator'));
});

test('marks both faces complete without sending the draft', () => {
  const document = createEmptyQualityDocument({
    shared: { productionDate: '2026-07-28', machine: 'F', saiCode: '14590-100' },
    faces: {
      inspection: { operator: 'Elvis C.', qualityAuxiliary: 'Leonel Apaza', shifts: ['1'] },
      tests: { stressCracking: { applies: false }, fallTest: { applies: true, result: 'SI' } },
    },
  });
  assert.deepEqual(getQualityDocumentCompletion(document), {
    inspection: true,
    tests: true,
    complete: true,
  });
  assert.equal(document.status, 'draft');
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo**

Run: `node --test tests/qualityDocumentWorkflow.test.js`

Expected: FAIL con `ERR_MODULE_NOT_FOUND` para
`src/qualityDocumentWorkflow.js`.

- [ ] **Step 3: Implementar el modelo minimo**

```js
export const QUALITY_DOCUMENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  CORRECTION_REQUESTED: 'correction_requested',
  REJECTED: 'rejected',
  APPROVED_MIGRATED: 'approved_migrated',
  LINKING_REQUIRED: 'linking_required',
});

export function createEmptyQualityDocument(seed = {}) {
  return normalizeQualityDocument({
    id: '',
    documentNumber: '',
    status: QUALITY_DOCUMENT_STATUS.DRAFT,
    version: 0,
    lockVersion: 0,
    shared: {},
    faces: { inspection: {}, tests: {} },
    ...seed,
  });
}

export function validateQualityDocument(document = {}) {
  const sharedRequired = ['productionDate', 'machine', 'saiCode'];
  const inspectionRequired = ['operator', 'qualityAuxiliary'];
  const missing = (source, keys) => keys.filter((key) => {
    const value = source?.[key];
    return Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();
  });
  const inspection = missing(document.faces?.inspection, inspectionRequired);
  if (!(document.faces?.inspection?.shifts ?? []).length) inspection.push('shifts');
  const tests = [];
  if (document.faces?.tests?.stressCracking?.applies == null) tests.push('stressCracking');
  if (document.faces?.tests?.fallTest?.applies == null) tests.push('fallTest');
  return {
    shared: missing(document.shared, sharedRequired),
    inspection,
    tests,
  };
}
```

`normalizeQualityDocument` debe aceptar nombres camelCase o nombres SQL,
preservar siempre ambas claves de `faces` y convertir `version` y
`lockVersion` a numeros. `mergeQualityDocumentRows` filtra las filas cuyo
`document_id` coincide con el padre, asigna `inspection` y `tests` por
`record_type` y pasa el resultado por el normalizador.

`getQualityDocumentCompletion` llama `validateQualityDocument` y devuelve
`true` por cara cuando su arreglo de faltantes y el arreglo `shared` estan
vacios. `canReviewQualityDocument` devuelve `true` solo para roles `admin` y
`calidad`. `diffQualityDocumentSnapshots` recorre objetos anidados, devuelve
`{ section, field, previous, next }` y obtiene `section` del primer segmento
de la ruta (`shared`, `inspection` o `tests`).

- [ ] **Step 4: Ejecutar pruebas**

Run: `node --test tests/qualityDocumentWorkflow.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/qualityDocumentWorkflow.js tests/qualityDocumentWorkflow.test.js
git commit -m "Add two-sided quality document model"
```

---

### Task 2: Esquema, seguridad y RPC transaccionales

**Files:**
- Create: `supabase-quality-two-sided-documents.sql`
- Create: `tests/qualityDocumentSql.test.js`
- Modify: `supabase-quality-record-approval.sql`

**Interfaces:**
- Consumes: estados definidos en Task 1.
- Produces RPC:
  - `create_quality_document(p_shared_data jsonb)`
  - `save_quality_document_draft(p_document_id uuid, p_expected_lock_version integer, p_shared_data jsonb, p_inspection_payload jsonb, p_tests_payload jsonb)`
  - `submit_quality_document(p_document_id uuid, p_expected_lock_version integer, p_shared_data jsonb, p_inspection_payload jsonb, p_tests_payload jsonb)`
  - `review_quality_document(p_document_id uuid, p_action text, p_comment text, p_expected_lock_version integer)`
  - `get_quality_document(p_document_id uuid)`
  - `get_quality_certificate_source(p_document_id uuid, p_expected_version integer)`

- [ ] **Step 1: Escribir el contrato SQL fallido**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('two-sided migration defines parent, links, history, and atomic RPCs', async () => {
  const sql = (
    await readFile(new URL('../supabase-quality-two-sided-documents.sql', import.meta.url), 'utf8')
  ).toLowerCase();
  [
    'create table if not exists public.quality_documents',
    'lock_version integer',
    'add column if not exists document_id uuid',
    'unique (document_id, record_type)',
    'create table if not exists public.quality_document_history',
    'create or replace function public.create_quality_document',
    'create or replace function public.save_quality_document_draft',
    'create or replace function public.submit_quality_document',
    'create or replace function public.review_quality_document',
    'create or replace function public.get_quality_document',
    'create or replace function public.get_quality_certificate_source',
    "status = 'draft'",
    "status = 'pending'",
    "notify pgrst, 'reload schema'",
  ].forEach((token) => assert.ok(sql.includes(token), token));
});

test('direct writes are revoked and review checks server role', async () => {
  const sql = (
    await readFile(new URL('../supabase-quality-two-sided-documents.sql', import.meta.url), 'utf8')
  ).toLowerCase();
  assert.match(sql, /revoke insert,\s*update,\s*delete on public\.quality_documents/);
  assert.match(sql, /get_current_quality_role\(\) in \('admin', 'calidad'\)/);
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `node --test tests/qualityDocumentSql.test.js`

Expected: FAIL porque la migracion no existe.

- [ ] **Step 3: Crear tablas y restricciones**

La migracion debe crear:

```sql
create table if not exists public.quality_documents (
  id uuid primary key default gen_random_uuid(),
  document_number text not null unique,
  status text not null default 'draft'
    check (status in ('draft','pending','approved','correction_requested','rejected','approved_migrated','linking_required')),
  version integer not null default 0,
  lock_version integer not null default 0,
  production_date date,
  machine text not null default '',
  sai_code text not null default '',
  shared_data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_by_name text not null default '',
  submitted_by uuid references auth.users(id),
  submitted_by_name text not null default '',
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  review_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.new_quality_records
  add column if not exists document_id uuid
  references public.quality_documents(id) on delete cascade;

create unique index if not exists new_quality_records_document_face_key
on public.new_quality_records(document_id, record_type)
where document_id is not null;
```

Crear el historial con:

```sql
create table if not exists public.quality_document_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.quality_documents(id) on delete cascade,
  version integer not null,
  event_type text not null,
  section text not null
    check (section in ('shared','inspection','tests','document')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  reason text not null default '',
  changed_fields jsonb not null default '[]'::jsonb,
  previous_snapshot jsonb,
  new_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 4: Implementar RPC y permisos**

`create_quality_document` inserta el padre y dos caras vacias. Los RPC de
guardado bloquean estados `pending` y `approved`; aceptan `draft`,
`correction_requested` y `rejected`. `save_quality_document_draft` incrementa
`lock_version`, pero no `version`. `submit_quality_document` guarda las dos
caras, incrementa ambos contadores y crea un evento `submitted` o
`resubmitted`.

`review_quality_document` exige:

```sql
if public.get_current_quality_role() not in ('admin', 'calidad') then
  raise exception 'No tiene permiso para revisar documentos';
end if;
```

Revocar escrituras directas para `authenticated`, conceder lectura y
`execute` solamente sobre los RPC. Terminar con:

```sql
revoke execute on function public.submit_new_quality_record(
  uuid, text, jsonb, integer, text, text, jsonb
) from authenticated;
revoke execute on function public.review_new_quality_record(
  uuid, text, text, integer
) from authenticated;
drop function if exists public.get_quality_certificate_source(
  uuid, uuid, integer, integer
);

notify pgrst, 'reload schema';
```

- [ ] **Step 5: Ejecutar pruebas SQL y suite completa**

Run: `node --test tests/qualityDocumentSql.test.js`

Expected: PASS.

Run: `npm test`

Expected: todas las pruebas PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase-quality-two-sided-documents.sql supabase-quality-record-approval.sql tests/qualityDocumentSql.test.js
git commit -m "Add transactional quality document schema"
```

---

### Task 3: Repositorio de documentos y persistencia de borradores

**Files:**
- Create: `src/qualityDocumentRepository.js`
- Create: `tests/qualityDocumentRepository.test.js`

**Interfaces:**
- Consumes: RPC de Task 2 y `normalizeQualityDocument` de Task 1.
- Produces:
  - `createQualityDocument(supabase, shared)`
  - `saveQualityDocumentDraft(supabase, document)`
  - `submitQualityDocument(supabase, document)`
  - `reviewQualityDocument(supabase, request)`
  - `loadQualityDocument(supabase, id)`
  - `listQualityDocuments(supabase)`
  - `loadQualityDocumentHistory(supabase, id)`

- [ ] **Step 1: Escribir pruebas fallidas del mapeo y conflicto**

```js
test('maps the parent and both faces returned by an RPC', async () => {
  const supabase = fakeRpcClient({
    get_quality_document: {
      data: {
        document: { id: 'doc-1', status: 'draft', lock_version: 2, shared_data: { saiCode: '14590' } },
        records: [
          { record_type: 'inspection', payload: { operator: 'Elvis C.' } },
          { record_type: 'tests', payload: { fallTest: { result: 'SI' } } },
        ],
      },
      error: null,
    },
  });
  const result = await loadQualityDocument(supabase, 'doc-1');
  assert.equal(result.faces.inspection.operator, 'Elvis C.');
  assert.equal(result.lockVersion, 2);
});

test('keeps the caller draft when Supabase rejects a stale lock version', async () => {
  const supabase = fakeRpcClient({
    save_quality_document_draft: { data: null, error: { message: 'Version desactualizada' } },
  });
  await assert.rejects(
    () => saveQualityDocumentDraft(supabase, { id: 'doc-1', lockVersion: 1 }),
    /Version desactualizada/,
  );
});
```

`fakeRpcClient` registra nombre y argumentos de `rpc` y devuelve la respuesta
configurada; no necesita red.

- [ ] **Step 2: Ejecutar y confirmar fallo**

Run: `node --test tests/qualityDocumentRepository.test.js`

Expected: FAIL por modulo inexistente.

- [ ] **Step 3: Implementar repositorio**

Cada funcion debe:

1. Convertir camelCase a argumentos RPC.
2. Lanzar `new Error(error.message)` sin modificar el borrador recibido.
3. Normalizar la respuesta con `mergeQualityDocumentRows`.
4. No escribir `localStorage`; ese cache pertenece a la vista.

`saveQualityDocumentDraft` envia:

```js
return callDocumentRpc(supabase, 'save_quality_document_draft', {
  p_document_id: document.id,
  p_expected_lock_version: document.lockVersion,
  p_shared_data: document.shared,
  p_inspection_payload: document.faces.inspection,
  p_tests_payload: document.faces.tests,
});
```

- [ ] **Step 4: Ejecutar pruebas**

Run: `node --test tests/qualityDocumentRepository.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/qualityDocumentRepository.js tests/qualityDocumentRepository.test.js
git commit -m "Add quality document repository"
```

---

### Task 4: Editor unico, autoguardado y base de documentos

**Files:**
- Modify: `src/App.jsx:11735-13390`
- Modify: `src/App.jsx:14000-14070`
- Modify: `src/styles.css:8005-8939`
- Modify: `src/styles.css:10304-10368`

**Interfaces:**
- Consumes: dominio de Task 1 y repositorio de Task 3.
- Produces component:
  - `QualityDocumentWorkspace`
  - `QualityDocumentList`
  - reutiliza `NewQualityInspectionRecordView` y
    `NewQualityTestsRecordView` como caras controladas.

- [ ] **Step 1: Extraer las caras como formularios controlados**

Cambiar ambas vistas para recibir:

```jsx
function NewQualityInspectionRecordView({ value, shared, onChange, readOnly }) {}
function NewQualityTestsRecordView({ value, shared, onChange, readOnly }) {}
```

Eliminar de esas vistas el envio individual, la base individual y la busqueda
por `sharedSaiCode`. Los datos generales se leen de `shared`.

- [ ] **Step 2: Crear el espacio de trabajo del documento**

`QualityDocumentWorkspace` mantiene:

```js
const [document, setDocument] = useState(null);
const [activeFace, setActiveFace] = useState('inspection');
const [saveState, setSaveState] = useState('saved');
const [validation, setValidation] = useState(null);
```

La barra superior muestra:

```jsx
<div className="quality-document-face-tabs" role="tablist">
  <button role="tab">Anverso</button>
  <button role="tab">Reverso</button>
</div>
```

Cada tab incluye `Completo` o `Incompleto`. Al crear un documento, llamar
primero a `createQualityDocument`; no generar UUID solo en el navegador.

- [ ] **Step 3: Implementar persistencia del borrador**

Usar un debounce de 1000 ms después del ultimo cambio. Antes de enviar:

- Guardar una copia en
  `localStorage['pet-quality-document-draft-' + document.id]`.
- Llamar `saveQualityDocumentDraft`.
- Al confirmar, reemplazar el documento con la respuesta, borrar el cache y
  mostrar `Borrador guardado`.
- Al fallar, mantener la copia y mostrar `Sin sincronizar`.
- Al abrir un documento, preferir Supabase; si existe cache con cambios no
  confirmados, ofrecer `Recuperar cambios locales`.

Agregar tambien un boton explicito `Guardar borrador`.

- [ ] **Step 4: Implementar envio unico**

`Mandar documento` llama `validateQualityDocument`. Si hay faltantes:

```js
setValidation(errors);
setActiveFace(errors.shared.length || errors.inspection.length ? 'inspection' : 'tests');
```

Si no hay faltantes, guardar el borrador pendiente y llamar
`submitQualityDocument`. Solo después de respuesta exitosa limpiar el editor y
actualizar la lista.

- [ ] **Step 5: Sustituir las dos bases por una sola**

La lista consulta `listQualityDocuments` y muestra las columnas definidas en
la especificacion. `Abrir` carga las dos caras. Los registros `draft` muestran
`Continuar`; los demás muestran `Abrir`.

- [ ] **Step 6: Agregar CSS responsivo**

Añadir dimensiones estables y controles visibles:

```css
.quality-document-toolbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: auto 1fr auto;
}

.quality-document-face-tabs {
  display: flex;
  min-width: 0;
}

@media (max-width: 760px) {
  .quality-document-toolbar {
    grid-template-columns: 1fr auto;
  }
  .quality-document-save-state {
    grid-column: 1 / -1;
  }
}
```

Mantener el lienzo de cada cara con su ancho minimo y desplazamiento táctil
bidimensional existente.

- [ ] **Step 7: Verificar**

Run: `npm test`

Expected: todas las pruebas PASS.

Run: `npm run build`

Expected: build Vite exitoso.

Probar manualmente: crear, escribir en ambas caras, recargar, continuar el
borrador y confirmar que no aparece como pendiente.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "Unify quality record editor and drafts"
```

---

### Task 5: Revision e historial conjuntos

**Files:**
- Create: `src/QualityDocumentDialogs.jsx`
- Modify: `src/QualityRecordHistoryDialog.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `tests/qualityDocumentWorkflow.test.js`

**Interfaces:**
- Consumes: `reviewQualityDocument`, `loadQualityDocumentHistory` y
  `diffQualityDocumentSnapshots`.
- Produces:
  - `QualityDocumentReviewDialog`
  - `QualityDocumentHistoryDialog`

- [ ] **Step 1: Agregar prueba fallida de agrupacion de historial**

```js
test('labels history changes by shared data, front, and back', () => {
  const changes = diffQualityDocumentSnapshots(
    { shared: { machine: 'F' }, faces: { inspection: { operator: 'A' }, tests: {} } },
    { shared: { machine: 'L' }, faces: { inspection: { operator: 'B' }, tests: { fallTest: 'SI' } } },
  );
  assert.deepEqual(
    changes.map((change) => change.section),
    ['shared', 'inspection', 'tests'],
  );
});
```

- [ ] **Step 2: Ejecutar y confirmar fallo**

Run: `node --test tests/qualityDocumentWorkflow.test.js`

Expected: FAIL porque los cambios aun no exponen `section`.

- [ ] **Step 3: Implementar dialogs**

La revision muestra datos generales y tabs de solo lectura para ambas caras.
Un solo comentario controla:

- `approved`, comentario opcional.
- `correction_requested`, comentario obligatorio.
- `rejected`, comentario obligatorio.

El historial muestra eventos del documento y agrupa cambios bajo
`Datos generales`, `Anverso` y `Reverso`.

- [ ] **Step 4: Integrar permisos**

Mostrar `Revisar` solo cuando:

```js
canReviewQualityDocument(authUser)
  && document.status === QUALITY_DOCUMENT_STATUS.PENDING
```

La interfaz nunca asigna `reviewed_by`, rol ni estado directamente.

- [ ] **Step 5: Ejecutar pruebas y build**

Run: `npm test`

Expected: todas las pruebas PASS.

Run: `npm run build`

Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add src/QualityDocumentDialogs.jsx src/QualityRecordHistoryDialog.jsx src/App.jsx src/styles.css tests/qualityDocumentWorkflow.test.js
git commit -m "Add combined quality review and history"
```

---

### Task 6: Impresion de dos caras y certificado por documento

**Files:**
- Create: `src/qualityDocumentPrint.js`
- Create: `tests/qualityDocumentPrint.test.js`
- Modify: `src/newQualityCertificate.js`
- Modify: `tests/newQualityCertificate.test.js`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: documento normalizado y RPC
  `get_quality_certificate_source(document_id, expected_version)`.
- Produces:
  - `buildTwoSidedQualityPrintHtml(document)`
  - `openTwoSidedQualityPrint(document)`
  - `buildCertificateRecordFromQualityDocument(source)`

- [ ] **Step 1: Escribir pruebas fallidas**

```js
test('print output contains exactly two letter pages', () => {
  const html = buildTwoSidedQualityPrintHtml(completeDocument);
  assert.equal((html.match(/class="quality-print-page"/g) ?? []).length, 2);
  assert.match(html, /Pagina 1 de 2/);
  assert.match(html, /Pagina 2 de 2/);
  assert.match(html, /@page\s*\{\s*size:\s*letter/);
});

test('certificate reads both faces from the same document', () => {
  const certificate = buildCertificateRecordFromQualityDocument(completeApprovedSource);
  assert.equal(certificate.measurements.pruebaCaida, 'SI');
  assert.equal(certificate.entries[0].machine, 'F');
});
```

- [ ] **Step 2: Ejecutar y confirmar fallo**

Run: `node --test tests/qualityDocumentPrint.test.js tests/newQualityCertificate.test.js`

Expected: FAIL por funciones inexistentes.

- [ ] **Step 3: Implementar impresion**

Reutilizar el HTML actual de cada cara, envolver cada uno en:

```html
<section class="quality-print-page quality-print-front">...</section>
<section class="quality-print-page quality-print-back">...</section>
```

La hoja de estilo debe contener:

```css
@page { size: letter portrait; margin: 5mm; }
.quality-print-page {
  width: 205.9mm;
  height: 269.4mm;
  break-after: page;
  overflow: hidden;
}
.quality-print-page:last-child { break-after: auto; }
```

No incluir toolbar, estados, tolerancias visuales ni mensajes.

- [ ] **Step 4: Cambiar el certificado**

Eliminar `findLinkedQualityTestsRecord` del flujo nuevo. El frontend manda solo
`document.id` y `document.version`; la respuesta autorizada contiene:

```js
{
  document,
  inspection,
  tests,
  technical_format
}
```

`buildCertificateRecordFromQualityDocument` reutiliza los promedios y valores
FINISHED vigentes.

- [ ] **Step 5: Ejecutar pruebas y build**

Run: `npm test`

Expected: todas las pruebas PASS.

Run: `npm run build`

Expected: build exitoso.

- [ ] **Step 6: Verificacion visual**

Abrir la vista de impresion en escritorio y móvil. Confirmar en la vista previa
del navegador que existen dos paginas carta sin cortes horizontales, campos
superpuestos ni controles de la aplicacion.

- [ ] **Step 7: Commit**

```bash
git add src/qualityDocumentPrint.js src/newQualityCertificate.js src/App.jsx src/styles.css tests/qualityDocumentPrint.test.js tests/newQualityCertificate.test.js
git commit -m "Print and certify linked quality documents"
```

---

### Task 7: Migracion de registros existentes y cierre

**Files:**
- Modify: `supabase-quality-two-sided-documents.sql`
- Modify: `src/App.jsx`
- Modify: `tests/qualityDocumentSql.test.js`
- Modify: `docs/superpowers/specs/2026-07-28-quality-two-sided-document-design.md`

**Interfaces:**
- Consumes: esquema y UI de Tasks 2-6.
- Produces:
  - migracion automatica de pares unicos.
  - vista de vinculacion manual para `linking_required`.

- [ ] **Step 1: Agregar pruebas SQL de migracion**

```js
test('legacy migration only auto-links unique front and back pairs', async () => {
  const sql = (
    await readFile(new URL('../supabase-quality-two-sided-documents.sql', import.meta.url), 'utf8')
  ).toLowerCase();
  assert.match(sql, /regexp_replace\([\s\S]*sai/);
  assert.match(sql, /record_type\s*=\s*'inspection'/);
  assert.match(sql, /record_type\s*=\s*'tests'/);
  assert.match(sql, /inspection_count\s*=\s*1/);
  assert.match(sql, /tests_count\s*=\s*1/);
  assert.match(sql, /linking_required/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.new_quality_records/);
});
```

- [ ] **Step 2: Ejecutar y confirmar fallo**

Run: `node --test tests/qualityDocumentSql.test.js`

Expected: FAIL para los tokens de migracion aun ausentes.

- [ ] **Step 3: Implementar migracion idempotente**

Usar tablas temporales para candidatos y `on conflict do nothing`. Crear
documentos `approved_migrated` para pares unicos y `linking_required` para
grupos incompletos o ambiguos. Conservar `created_at`, `user_id`, `payload` e
historial existentes.

- [ ] **Step 4: Implementar vinculacion manual**

Solo `admin` y `calidad` ven `Resolver vinculacion`. La ventana lista
anversos y reversos sin pareja; exige elegir exactamente uno de cada tipo y
confirma fecha, maquina y SAI antes de llamar un RPC
`link_existing_quality_records`.

- [ ] **Step 5: Ejecutar verificacion completa**

Run: `npm test`

Expected: todas las pruebas PASS, cero fallos.

Run: `npm run build`

Expected: build exitoso.

Run: `git diff --check`

Expected: sin errores de espacios.

- [ ] **Step 6: Revisión de seguridad**

Confirmar en SQL:

- RLS habilitado en documentos e historial.
- escritura directa revocada.
- roles tomados de `user_profiles`.
- `auth.uid()` usado para usuario de envio y revision.
- conflictos de `lock_version` rechazados.
- certificados limitados a documentos aprobados.

- [ ] **Step 7: Commit final**

```bash
git add supabase-quality-two-sided-documents.sql src/App.jsx tests/qualityDocumentSql.test.js docs/superpowers/specs/2026-07-28-quality-two-sided-document-design.md
git commit -m "Migrate legacy quality records into documents"
```

- [ ] **Step 8: Publicacion**

Copiar los archivos verificados al repositorio
`github-upload-petnova`, ejecutar nuevamente `npm test` y `npm run build`,
hacer `git push origin main` y comprobar que Vercel sirve el nuevo bundle.
Indicar al usuario que ejecute completo
`supabase-quality-two-sided-documents.sql` en Supabase SQL Editor antes de usar
el flujo.
