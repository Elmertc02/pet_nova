# Quality Record Approval, History, and Certificate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add submission, approval, immutable version history, and approved-only certificate generation to `Nuevo registro` and `Pruebas`.

**Architecture:** Keep the current `new_quality_records` table as the source of the latest record and add a separate append-only history table. PostgreSQL RPC functions perform submission and review atomically and enforce roles from `user_profiles`; React loads those records, renders status/history/review controls, and adapts approved variable data into the existing certificate template.

**Tech Stack:** React 19, Vite 7, Supabase JS 2, PostgreSQL/RLS/RPC, Node built-in test runner.

## Global Constraints

- Leonel (`admin`) and Rafael (`calidad`) may approve their own or other users' records.
- Guest (`lectura`) may submit records but may not review or generate certificates.
- A modified approved record returns to `pending`.
- A certificate requires approved `inspection` and approved linked `tests` records.
- Existing remote records migrate to `approved_migrated`.
- FINISHED values remain the same fixed numeric values used by the existing certificate.
- The root project is the working source; mirror final source and SQL changes into `github-upload-petnova` before committing.
- Preserve unrelated files, especially `supabase-clear-rafael-session.sql`.

---

### Task 1: Pure Workflow Rules and Tests

**Files:**
- Create: `src/qualityRecordWorkflow.js`
- Create: `tests/qualityRecordWorkflow.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `QUALITY_RECORD_STATUS`, `QUALITY_RECORD_EVENTS`, `canReviewQualityRecord(user)`, `canGenerateQualityCertificate(user, inspection, tests)`, `diffQualitySnapshots(previous, next)`.
- Consumes: plain record and user objects; no React or Supabase dependency.

- [ ] **Step 1: Add the Node test command**

Add this script to `package.json`:

```json
"test": "node --test tests/*.test.js"
```

- [ ] **Step 2: Write failing workflow tests**

Create `tests/qualityRecordWorkflow.test.js`:

```js
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
  assert.equal(canGenerateQualityCertificate({ role: 'admin' }, approved, { status: 'pending' }), false);
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
```

- [ ] **Step 3: Run the tests and confirm failure**

Run: `npm.cmd test`

Expected: failure because `src/qualityRecordWorkflow.js` does not exist.

- [ ] **Step 4: Implement the workflow helpers**

Create `src/qualityRecordWorkflow.js` with:

```js
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
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
    keys.forEach((key) => {
      const field = path ? `${path}.${key}` : key;
      const oldValue = before?.[key];
      const newValue = after?.[key];
      const bothObjects = oldValue && newValue
        && typeof oldValue === 'object' && typeof newValue === 'object'
        && !Array.isArray(oldValue) && !Array.isArray(newValue);
      if (bothObjects) visit(oldValue, newValue, field);
      else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({ field, previous: oldValue ?? '', next: newValue ?? '' });
      }
    });
  };
  visit(previous, next);
  return changes;
}
```

- [ ] **Step 5: Run tests**

Run: `npm.cmd test`

Expected: all workflow tests pass.

- [ ] **Step 6: Commit**

Mirror the three files into `github-upload-petnova`, then run there:

```powershell
git add package.json src/qualityRecordWorkflow.js tests/qualityRecordWorkflow.test.js
git commit -m "Add quality record workflow rules"
```

---

### Task 2: Supabase Approval and Append-Only History

**Files:**
- Create: `supabase-quality-record-approval.sql`
- Test: `tests/qualityRecordSql.test.js`

**Interfaces:**
- Produces RPC `submit_new_quality_record(uuid,text,jsonb,integer,text,text,jsonb)` returning the updated `new_quality_records` row.
- Produces RPC `review_new_quality_record(uuid,text,text,integer)` returning the updated row.
- Produces table `new_quality_record_history`.
- Consumes roles from `public.user_profiles`.

- [ ] **Step 1: Write a SQL contract test**

Create `tests/qualityRecordSql.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('approval migration defines schema, policies, and RPC functions', async () => {
  const sql = await readFile(new URL('../supabase-quality-record-approval.sql', import.meta.url), 'utf8');
  [
    'new_quality_record_history',
    'submit_new_quality_record',
    'review_new_quality_record',
    'approved_migrated',
    'user_profiles',
    'security definer',
    \"notify pgrst, 'reload schema'\",
  ].forEach((token) => assert.match(sql.toLowerCase(), new RegExp(token)));
});
```

- [ ] **Step 2: Run the SQL contract test and confirm failure**

Run: `npm.cmd test`

Expected: failure because `supabase-quality-record-approval.sql` does not exist.

- [ ] **Step 3: Add the schema migration**

Create `supabase-quality-record-approval.sql` with these exact schema elements:

```sql
alter table public.new_quality_records
  add column if not exists status text not null default 'pending',
  add column if not exists version integer not null default 1,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submitted_by_name text not null default '',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_name text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text not null default '';

create table if not exists public.new_quality_record_history (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.new_quality_records(id) on delete cascade,
  record_type text not null check (record_type in ('inspection', 'tests')),
  version integer not null,
  event_type text not null check (event_type in (
    'submitted', 'updated', 'approved', 'correction_requested', 'rejected', 'migrated'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default '',
  reason text not null default '',
  changed_fields jsonb not null default '[]'::jsonb,
  previous_snapshot jsonb,
  new_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'new_quality_records_status_check'
      and conrelid = 'public.new_quality_records'::regclass
  ) then
    alter table public.new_quality_records
      add constraint new_quality_records_status_check
      check (status in (
        'pending', 'approved', 'correction_requested', 'rejected', 'approved_migrated'
      ));
  end if;
end $$;

update public.new_quality_records
set status = 'approved_migrated',
    version = greatest(coalesce(version, 1), 1)
where not exists (
  select 1
  from public.new_quality_record_history history
  where history.record_id = new_quality_records.id
);

insert into public.new_quality_record_history (
  record_id, record_type, version, event_type, actor_id, actor_name,
  actor_role, reason, changed_fields, previous_snapshot, new_snapshot, created_at
)
select
  record.id, record.record_type, record.version, 'migrated', record.user_id,
  record.created_by, '', 'Registro existente migrado', '[]'::jsonb,
  null, record.payload, coalesce(record.updated_at, record.created_at, now())
from public.new_quality_records record
where not exists (
  select 1
  from public.new_quality_record_history history
  where history.record_id = record.id
);

alter table public.new_quality_record_history enable row level security;

drop policy if exists "new quality history select authenticated"
on public.new_quality_record_history;
create policy "new quality history select authenticated"
on public.new_quality_record_history for select
to authenticated
using (true);

revoke insert, update, delete on public.new_quality_records from authenticated;
revoke insert, update, delete on public.new_quality_record_history from authenticated;
grant select on public.new_quality_records to authenticated;
grant select on public.new_quality_record_history to authenticated;
```

The migration must also:

- Add a status check constraint allowing the five approved design statuses.
- Mark rows without an explicit workflow event as `approved_migrated`.
- Insert one `migrated` history row per existing record, guarded by `not exists`.
- Enable RLS on the history table.
- Allow authenticated users to select records and history.
- Remove direct authenticated update/delete grants that could bypass history.
- Add `public.can_review_new_quality_record()` that checks `user_profiles.role in ('admin','calidad')`.
- Add `submit_new_quality_record(...)` that locks an existing row, checks `p_expected_version`, sets `pending`, increments the version on edits, and inserts the history snapshot in the same transaction.
- Add `review_new_quality_record(...)` that validates the role, accepts only `approved`, `correction_requested`, or `rejected`, requires a comment for correction/rejection, checks the expected version, updates review metadata, and inserts the matching history event.
- Revoke RPC execution from `public`, grant it to `authenticated`, and reload PostgREST.

Use these concrete RPC contracts and transaction bodies:

```sql
create or replace function public.can_review_new_quality_record()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = auth.uid()
      and role in ('admin', 'calidad')
  );
$$;

create or replace function public.submit_new_quality_record(
  p_record_id uuid,
  p_record_type text,
  p_payload jsonb,
  p_expected_version integer,
  p_created_by text,
  p_reason text default '',
  p_changed_fields jsonb default '[]'::jsonb
)
returns public.new_quality_records
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_record public.new_quality_records%rowtype;
  saved_record public.new_quality_records%rowtype;
  actor_role text;
  event_name text;
begin
  if auth.uid() is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_record_type not in ('inspection', 'tests') then
    raise exception 'Tipo de registro invalido';
  end if;

  select role into actor_role
  from public.user_profiles
  where user_id = auth.uid();

  select * into previous_record
  from public.new_quality_records
  where id = p_record_id
  for update;

  if found then
    if previous_record.version <> p_expected_version then
      raise exception 'El registro fue actualizado por otro usuario';
    end if;

    update public.new_quality_records
    set payload = p_payload,
        status = 'pending',
        version = previous_record.version + 1,
        submitted_by = auth.uid(),
        submitted_by_name = p_created_by,
        submitted_at = now(),
        reviewed_by = null,
        reviewed_by_name = '',
        reviewed_at = null,
        review_comment = '',
        updated_at = now()
    where id = p_record_id
    returning * into saved_record;
    event_name := 'updated';
  else
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'Version inicial invalida';
    end if;

    insert into public.new_quality_records (
      id, record_type, user_id, created_by, payload, status, version,
      submitted_by, submitted_by_name, submitted_at, created_at, updated_at
    )
    values (
      p_record_id, p_record_type, auth.uid(), p_created_by, p_payload,
      'pending', 1, auth.uid(), p_created_by, now(), now(), now()
    )
    returning * into saved_record;
    event_name := 'submitted';
  end if;

  insert into public.new_quality_record_history (
    record_id, record_type, version, event_type, actor_id, actor_name,
    actor_role, reason, changed_fields, previous_snapshot, new_snapshot
  )
  values (
    saved_record.id, saved_record.record_type, saved_record.version, event_name,
    auth.uid(), p_created_by, coalesce(actor_role, 'lectura'), p_reason,
    coalesce(p_changed_fields, '[]'::jsonb),
    case when previous_record.id is null then null else previous_record.payload end,
    saved_record.payload
  );

  return saved_record;
end;
$$;

create or replace function public.review_new_quality_record(
  p_record_id uuid,
  p_action text,
  p_comment text,
  p_expected_version integer
)
returns public.new_quality_records
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_record public.new_quality_records%rowtype;
  saved_record public.new_quality_records%rowtype;
  actor_name text;
  actor_role text;
begin
  if not public.can_review_new_quality_record() then
    raise exception 'No tiene permiso para revisar registros';
  end if;

  if p_action not in ('approved', 'correction_requested', 'rejected') then
    raise exception 'Accion de revision invalida';
  end if;

  if p_action in ('correction_requested', 'rejected')
     and trim(coalesce(p_comment, '')) = '' then
    raise exception 'Debe ingresar un comentario';
  end if;

  select display_name, role into actor_name, actor_role
  from public.user_profiles
  where user_id = auth.uid();

  select * into previous_record
  from public.new_quality_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'Registro no encontrado';
  end if;

  if previous_record.version <> p_expected_version then
    raise exception 'El registro fue actualizado por otro usuario';
  end if;

  update public.new_quality_records
  set status = p_action,
      reviewed_by = auth.uid(),
      reviewed_by_name = coalesce(actor_name, ''),
      reviewed_at = now(),
      review_comment = coalesce(p_comment, ''),
      updated_at = now()
  where id = p_record_id
  returning * into saved_record;

  insert into public.new_quality_record_history (
    record_id, record_type, version, event_type, actor_id, actor_name,
    actor_role, reason, changed_fields, previous_snapshot, new_snapshot
  )
  values (
    saved_record.id, saved_record.record_type, saved_record.version, p_action,
    auth.uid(), coalesce(actor_name, ''), coalesce(actor_role, ''),
    coalesce(p_comment, ''), '[]'::jsonb,
    previous_record.payload, saved_record.payload
  );

  return saved_record;
end;
$$;

revoke all on function public.submit_new_quality_record(uuid,text,jsonb,integer,text,text,jsonb) from public;
revoke all on function public.review_new_quality_record(uuid,text,text,integer) from public;
grant execute on function public.submit_new_quality_record(uuid,text,jsonb,integer,text,text,jsonb) to authenticated;
grant execute on function public.review_new_quality_record(uuid,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the contract tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Mirror the SQL and test file into `github-upload-petnova`, then run there:

```powershell
git add supabase-quality-record-approval.sql tests/qualityRecordSql.test.js
git commit -m "Add quality record approval schema"
```

---

### Task 3: Supabase Client Workflow and History UI

**Files:**
- Create: `src/QualityRecordHistoryDialog.jsx`
- Modify: `src/App.jsx:11749`
- Modify: `src/App.jsx:11820`
- Modify: `src/App.jsx:11921`
- Modify: `src/App.jsx:12607`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes workflow constants and permission helpers from Task 1.
- Consumes RPC functions and history table from Task 2.
- Produces `submitQualityRecord`, `reviewQualityRecord`, `loadQualityRecordHistory`, and `QualityRecordHistoryDialog`.

- [ ] **Step 1: Extend record normalization**

In both `normalizeNewQualityInspectionRecord` and `normalizeNewQualityTestsRecord`, add:

```js
status: record.status ?? 'pending',
version: Number(record.version ?? 0),
submittedBy: record.submittedBy ?? '',
submittedByName: record.submittedByName ?? '',
submittedAt: record.submittedAt ?? '',
reviewedBy: record.reviewedBy ?? '',
reviewedByName: record.reviewedByName ?? '',
reviewedAt: record.reviewedAt ?? '',
reviewComment: record.reviewComment ?? '',
```

Map the equivalent snake_case columns in `loadNewQualityRecordsFromSupabase`.

- [ ] **Step 2: Replace direct upsert with RPC submission**

Replace `persistNewQualityRecordToSupabase` for these forms with:

```js
async function submitQualityRecord(recordType, record, authUser, previousPayload = null) {
  const changedFields = diffQualitySnapshots(previousPayload ?? {}, record);
  const { data, error } = await supabase.rpc('submit_new_quality_record', {
    p_record_id: record.id,
    p_record_type: recordType,
    p_payload: prepareNewQualityPayloadForSupabase(record),
    p_expected_version: record.version || 0,
    p_created_by: authUser.displayName || authUser.username || '',
    p_reason: record.editReason || '',
    p_changed_fields: changedFields,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, record: data };
}
```

Add wrappers for `review_new_quality_record` and history selection. Do not
clear the draft or update the visible state until Supabase confirms.

Use these exact wrappers:

```js
async function reviewQualityRecord(record, action, comment) {
  const { data, error } = await supabase.rpc('review_new_quality_record', {
    p_record_id: record.id,
    p_action: action,
    p_comment: comment,
    p_expected_version: record.version,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, record: Array.isArray(data) ? data[0] : data };
}

async function loadQualityRecordHistory(recordId) {
  const { data, error } = await supabase
    .from('new_quality_record_history')
    .select('*')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, message: error.message, events: [] };
  return { ok: true, events: data ?? [] };
}
```

- [ ] **Step 3: Change form commands**

For both forms:

- Rename `Guardar registro` and `Actualizar registro` to `Mandar registro` and `Mandar correccion`.
- Keep the required edit reason for edits.
- On a confirmed submission, replace the local row with the returned remote row.
- On failure, preserve all entered values and show the Supabase message.
- Stop automatically uploading every local row during `refreshSharedRecords`; refresh should read remote data and merge local unsent drafts by id.

- [ ] **Step 4: Add status and review actions**

Add `Estado` and `Historial` columns to both database tables. In `Accion`:

- Always show `Abrir`.
- Show `Revisar` only when `canReviewQualityRecord(authUser)` is true.
- Review opens a compact dialog with `Aprobar`, `Solicitar correccion`, and `Rechazar`.
- Require a comment for correction and rejection.
- Disable buttons while the RPC is running.
- After success, reload records and history.

- [ ] **Step 5: Build the history dialog**

Create `QualityRecordHistoryDialog.jsx` that:

- Receives `{ record, events, onClose }`.
- Sorts events newest first.
- Calls `diffQualitySnapshots(event.previous_snapshot, event.new_snapshot)`.
- Displays version, event label, actor, role, local date/time, reason, and changed fields.
- Uses a proper modal with Escape close, backdrop close, focusable close button, and `aria-modal="true"`.
- Shows `Sin modificaciones de campos` for approval-only events.

- [ ] **Step 6: Style and mobile-check the workflow**

Add restrained status colors and a scrollable dialog to `styles.css`. Ensure the
existing wide spreadsheet tables keep horizontal scrolling on mobile and the
history dialog fits at 360 px width.

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: tests pass and Vite completes successfully.

- [ ] **Step 8: Commit**

Mirror the modified source files into `github-upload-petnova`, then run there:

```powershell
git add src/App.jsx src/QualityRecordHistoryDialog.jsx src/styles.css
git commit -m "Add quality record review and history"
```

---

### Task 4: Approved Certificate Adapter

**Files:**
- Create: `src/newQualityCertificate.js`
- Create: `tests/newQualityCertificate.test.js`
- Modify: `src/App.jsx:7270`
- Modify: `src/App.jsx:12411`

**Interfaces:**
- Consumes an approved inspection record, approved related tests record, and technical format.
- Produces `findLinkedQualityTestsRecord(records, inspection)` and `buildCertificateRecordFromNewQuality(inspection, tests, technicalFormat)`.
- Feeds the existing `getCertificateHtml(record)` and `printQualityCertificate(record)`.

- [ ] **Step 1: Write failing adapter tests**

Create tests that prove:

```js
test('averages four variable samples and maps certificate fields', () => {
  const certificate = buildCertificateRecordFromNewQuality(
    {
      productionDate: '2026-07-27',
      saiCode: '14590-100',
      format: '0.600L Cristal-100 Bebidas 22g',
      resin: 'ECOPET',
      opBottle: '020P-2026',
      variableControls: {
        emptyBottleWeight: { 'sample-1': '21.8', 'sample-2': '22', 'sample-3': '22.2', 'sample-4': '22' },
        e1: { 'sample-1': '1', 'sample-2': '2', 'sample-3': '3', 'sample-4': '4' },
      },
    },
    { fallTest: { result: 'PASA' } },
    { specs: { pesoVacia: { min: 21, max: 23, target: 22 } } },
  );
  assert.equal(certificate.entries[0].measurements.pesoVacia, '22');
  assert.equal(certificate.entries[0].measurements.e1, '2.5');
  assert.equal(certificate.entries[0].measurements.pruebaCaida, 'PASA');
});
```

Also test linkage by exact date, machine, and normalized SAI code.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test`

Expected: failure because the adapter module does not exist.

- [ ] **Step 3: Implement the adapter**

Implement:

- Numeric averaging that ignores blank and invalid samples.
- Mapping `emptyBottleWeight -> pesoVacia`, `bottleHeight -> alturaTotal`,
  `lowerDiameter -> diametroInferior`, `e1 -> e1`, `e2 -> e2`, and
  `fillVolume -> volumen`.
- Technical specs mapped into the entry evaluations expected by the existing
  certificate.
- `certificateDetails.ordenProduccion` from `opBottle`.
- `certificateDetails.resinaUtilizada` from `resin`.
- Fall test from the linked tests record.
- Existing fixed FINISHED values remain unchanged in the certificate renderer.

- [ ] **Step 4: Add approved-only certificate action**

In the `Nuevo registro` database table:

- Find the linked `tests` row using date, machine, and SAI code.
- Show `Generar certificado` only when `canGenerateQualityCertificate` is true.
- Otherwise show a disabled certificate icon/button with a tooltip stating
  whether approval or linked tests are missing.
- Call the adapter and pass its result to `printQualityCertificate`.
- Update `getCertificateHtml` to prefer the mapped average `volumen` when
  present, while preserving legacy behavior for old certificate records.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests pass and the production build succeeds.

- [ ] **Step 6: Commit**

Mirror the adapter, tests, and `App.jsx` into `github-upload-petnova`, then run
there:

```powershell
git add src/App.jsx src/newQualityCertificate.js tests/newQualityCertificate.test.js
git commit -m "Generate certificates from approved quality records"
```

---

### Task 5: Final Verification and Deployment Copy

**Files:**
- Modify: `github-upload-petnova/package.json`
- Create: `github-upload-petnova/src/qualityRecordWorkflow.js`
- Create: `github-upload-petnova/src/QualityRecordHistoryDialog.jsx`
- Create: `github-upload-petnova/src/newQualityCertificate.js`
- Modify: `github-upload-petnova/src/App.jsx`
- Modify: `github-upload-petnova/src/styles.css`
- Create: `github-upload-petnova/supabase-quality-record-approval.sql`
- Create: `github-upload-petnova/tests/qualityRecordWorkflow.test.js`
- Create: `github-upload-petnova/tests/qualityRecordSql.test.js`
- Create: `github-upload-petnova/tests/newQualityCertificate.test.js`

**Interfaces:**
- Consumes all completed tasks.
- Produces a deployable GitHub/Vercel source copy and the SQL script the user runs in Supabase.

- [ ] **Step 1: Mirror only relevant files**

Copy the listed root files into the matching paths under
`github-upload-petnova`. Do not add `supabase-clear-rafael-session.sql`.

- [ ] **Step 2: Run root verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all Node tests pass and Vite builds successfully.

- [ ] **Step 3: Run deployment-copy verification**

Run the same commands inside `github-upload-petnova`.

Expected: identical passing tests and successful build.

- [ ] **Step 4: Manual workflow verification**

Verify:

- Guest sends an inspection and cannot see review/certificate actions.
- Leonel or Rafael approves it, including self-approval.
- A correction request requires a comment.
- Editing an approved row creates a new version and returns it to pending.
- `Ver cambios` shows old/new values and actor details.
- Another account sees the same history.
- Certificate remains disabled until both linked rows are approved.
- Generated certificate preserves the previous layout and fixed FINISHED values.

- [ ] **Step 5: Commit deployment source**

```powershell
git add package.json src/App.jsx src/styles.css src/qualityRecordWorkflow.js src/QualityRecordHistoryDialog.jsx src/newQualityCertificate.js supabase-quality-record-approval.sql tests
git commit -m "Add approved quality record workflow"
```

- [ ] **Step 6: Push after SQL handoff is ready**

Push the deployment repository only after reporting that
`supabase-quality-record-approval.sql` must be run in Supabase SQL Editor.
