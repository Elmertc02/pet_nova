import { mkdir, writeFile } from 'node:fs/promises';
import { bottleFormats2025 } from '../src/data/bottleFormats2025.js';

const outputPath = new URL('../private/supabase-bottle-formats-seed.sql', import.meta.url);

function sqlText(value) {
  if (value === null || value === undefined) {
    return 'null';
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value ?? {}))}::jsonb`;
}

function sqlTextArray(values) {
  return `array[${(values ?? []).map(sqlText).join(', ')}]::text[]`;
}

function normalizeImagePath(imageSrc) {
  if (!imageSrc || imageSrc.startsWith('http')) {
    return '';
  }

  return imageSrc.replace(/^\/+/, '');
}

const rows = bottleFormats2025.map((format, index) => `(
  ${sqlText(format.id)},
  ${index + 1},
  ${sqlText(format.name)},
  ${sqlText(format.subtitle ?? '')},
  ${sqlText(format.accent ?? '#2457a6')},
  ${Number(format.height ?? 214)},
  ${Number(format.shoulder ?? 64)},
  ${Number(format.body ?? 82)},
  ${sqlText(normalizeImagePath(format.imageSrc))},
  ${sqlTextArray(format.molds)},
  ${sqlJson(format.specs)}
)`);

const sql = `-- PETnova - carga privada de especificaciones tecnicas.
-- Ejecutar en Supabase > SQL Editor despues de supabase-schema.sql.
-- Este archivo contiene datos privados; no subir a GitHub.

insert into public.bottle_formats (
  id,
  sort_order,
  name,
  subtitle,
  accent,
  height,
  shoulder,
  body,
  image_path,
  molds,
  specs
)
values
${rows.join(',\n')}
on conflict (id) do update set
  sort_order = excluded.sort_order,
  name = excluded.name,
  subtitle = excluded.subtitle,
  accent = excluded.accent,
  height = excluded.height,
  shoulder = excluded.shoulder,
  body = excluded.body,
  image_path = excluded.image_path,
  molds = excluded.molds,
  specs = excluded.specs,
  updated_at = now();
`;

await mkdir(new URL('../private/', import.meta.url), { recursive: true });
await writeFile(outputPath, sql, 'utf8');
console.log(`Archivo generado: ${outputPath.pathname}`);
