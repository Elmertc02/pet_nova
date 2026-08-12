# Punto de retorno funcional -- 12/08/2026

Este archivo marca un estado de Etiquetas 2 verificado funcionando de punta a
punta (Etiquetas, Reportes, Validacion, Almacen Produccion, Planificacion/
Seguimiento), justo despues de la auditoria de base de datos (tablas/columnas
sin uso eliminadas) y de dejar el servidor Postgres con una sola base de la
app (`etiquetas2`).

Cuando se pida "volver a este punto", hay que revertir DOS cosas juntas
-- el codigo y los datos van de la mano, revertir solo uno de los dos deja
todo inconsistente (ej. el codigo nuevo esperando una columna que la base
vieja no tiene, o al reves).

## 1. Codigo -- commit de git

```
git reset --hard 6bcbb2ad4f0c9d113cc653b29faae6193faadcee
```

(Descarta cualquier cambio hecho despues de este commit. Si se quiere
conservar el trabajo nuevo por las dudas antes de descartarlo, guardar una
rama aparte primero: `git branch antes-de-revertir`.)

## 2. Base de datos -- restaurar el dump completo

Dump de referencia: `backend/migrations/checkpoints/CHECKPOINT-etiquetas2-20260812.sql`
(schema + datos completos de `etiquetas2` en este momento).

```bash
# 1. Cortar el backend (para que no haya conexiones activas a etiquetas2).
# 2. Borrar y recrear la base:
psql -U postgres -c "DROP DATABASE etiquetas2;"
psql -U postgres -c "CREATE DATABASE etiquetas2 OWNER etiquetas2_app;"
# 3. Restaurar el dump:
psql -U postgres -d etiquetas2 -f "backend/migrations/checkpoints/CHECKPOINT-etiquetas2-20260812.sql"
# 4. Reiniciar el backend.
```

## Otros backups en el repo (no son este punto de retorno, son de pasos
intermedios de la auditoria -- se pueden borrar si ya no hacen falta)

- `backend/migrations/backups/pre-auditoria-20260812-142741.sql`
- `backend/migrations/backups/pre-auditoria-planificacion-20260812-144547.sql`
- `backend/migrations/backups/otras-bases-borradas/*.sql` (BOTELLAS,
  NOMBRE_CUALQUIERA, NUEVO, PRUEBA, PRUEBA1, PRUEBADOC, webcl -- bases
  ajenas a Etiquetas 2, borradas del servidor Postgres el 12/08).
