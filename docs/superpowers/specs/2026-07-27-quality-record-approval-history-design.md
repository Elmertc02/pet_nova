# PETnova: aprobacion, historial y certificado de registros de calidad

Fecha: 2026-07-27

## Objetivo

Agregar un flujo de envio, revision, trazabilidad y aprobacion para las hojas
`Nuevo registro` y `Pruebas`, y permitir generar el certificado de calidad
desde los datos aprobados de `Nuevo registro`.

## Alcance

El cambio cubre:

- Cambio del comando `Guardar registro` por `Mandar registro`.
- Estados de revision para `Nuevo registro` y `Pruebas`.
- Aprobacion, rechazo y solicitud de correccion.
- Autoaprobacion permitida temporalmente para Leonel y Rafael.
- Historial inmutable de versiones y decisiones.
- Generacion del certificado de calidad solo para registros aprobados.
- Conservacion de los registros existentes.

No cubre la aprobacion de otros formularios de la plataforma.

## Roles y permisos

- `admin` (Leonel): puede enviar, editar, aprobar, rechazar, solicitar
  correccion, consultar historial y generar certificados.
- `calidad` (Rafael): tiene los mismos permisos de revision y certificado.
- `lectura` (Guest): puede llenar y mandar registros, consultar los registros
  visibles, pero no puede aprobar, rechazar ni generar certificados.
- Leonel y Rafael pueden aprobar sus propios registros.
- Los permisos de revision se validan con `public.user_profiles`, no solo con
  controles visuales del frontend.

## Estados

Los estados oficiales son:

- `pending`: pendiente de aprobacion.
- `approved`: aprobado.
- `correction_requested`: requiere correccion.
- `rejected`: rechazado.
- `approved_migrated`: registro anterior migrado como aprobado.

La interfaz los muestra como `Pendiente`, `Aprobado`, `Requiere correccion`,
`Rechazado` y `Aprobado migrado`.

## Flujo funcional

1. El usuario completa `Nuevo registro` o `Pruebas`.
2. Al pulsar `Mandar registro`, el sistema valida los campos obligatorios.
3. El registro se guarda en Supabase con estado `pending` y version 1.
4. La base de datos de la hoja muestra las columnas `Estado`, `Historial` y
   `Accion`.
5. Leonel o Rafael pueden abrir la revision y elegir `Aprobar`, `Solicitar
   correccion` o `Rechazar`.
6. Aprobar cambia el estado a `approved`.
7. Solicitar correccion exige un comentario y cambia el estado a
   `correction_requested`.
8. Rechazar exige un comentario y cambia el estado a `rejected`.
9. Al reenviar una correccion, se crea una version nueva y vuelve a `pending`.
10. Si se modifica un registro aprobado, se crea una version nueva, vuelve a
    `pending` y se bloquea el certificado hasta una nueva aprobacion.

## Interfaz de base de datos

Las tablas visibles de `Nuevo registro` y `Pruebas` conservan sus columnas
actuales y agregan:

- `Estado`: distintivo de color con el estado actual.
- `Historial`: boton `Ver cambios (n)`.
- `Accion`: abre el registro y, segun permisos y estado, muestra las acciones
  de revision o el certificado.

No se agregan columnas individuales para usuario, motivo o valores anteriores.
Esos datos aparecen en una ventana de historial para mantener la tabla legible.

## Historial de cambios

El historial se presenta como una linea de tiempo de solo lectura. Cada evento
muestra:

- Numero de version.
- Fecha y hora.
- Usuario y rol.
- Accion realizada.
- Motivo o comentario.
- Campos modificados.
- Valor anterior y valor nuevo.

Cada version conserva tambien una copia completa del registro. El historial no
puede editarse ni eliminarse desde la pagina.

## Modelo de datos

### Cambios en `public.new_quality_records`

Se agregan:

- `status text not null default 'pending'`.
- `version integer not null default 1`.
- `submitted_by uuid`.
- `submitted_by_name text`.
- `submitted_at timestamptz`.
- `reviewed_by uuid`.
- `reviewed_by_name text`.
- `reviewed_at timestamptz`.
- `review_comment text`.

El `payload jsonb` sigue guardando el formulario actual para mantener
compatibilidad con los registros existentes.

### Nueva tabla `public.new_quality_record_history`

Campos:

- `id uuid`.
- `record_id uuid` relacionado con `new_quality_records`.
- `record_type text`.
- `version integer`.
- `event_type text`.
- `actor_id uuid`.
- `actor_name text`.
- `actor_role text`.
- `reason text`.
- `changed_fields jsonb`.
- `previous_snapshot jsonb`.
- `new_snapshot jsonb`.
- `created_at timestamptz`.

Los eventos incluyen `submitted`, `updated`, `approved`,
`correction_requested`, `rejected` y `migrated`.

## Consistencia y seguridad

- Las operaciones de envio y revision se ejecutan mediante funciones de
  PostgreSQL llamadas desde Supabase RPC.
- Cada funcion actualiza el registro y crea el evento de historial dentro de
  una sola transaccion.
- Las funciones de aprobacion validan que el usuario tenga rol `admin` o
  `calidad` en `public.user_profiles`.
- Guest no tiene permisos de revision aunque intente llamar directamente a la
  API.
- Todos los usuarios autenticados autorizados pueden consultar el historial.
- Los registros previos se migran a `approved_migrated`, version 1, con un
  evento `migrated`.

## Certificado de calidad

El certificado reutiliza el formato ya existente.

Fuentes:

- Encabezado: fecha, codigo SAI, formato, cliente, maquina, resina y datos de
  produccion de `Nuevo registro`.
- Resultados: promedio de las cuatro muestras de `variableControls`.
- Tolerancias: especificacion tecnica enlazada al codigo SAI.
- Prueba de caida: registro `Pruebas` relacionado por fecha de produccion,
  maquina y codigo SAI.
- FINISHED: conserva y repite los mismos valores numericos y especificaciones
  usados por el certificado anterior.

El boton `Generar certificado` aparece habilitado cuando `Nuevo registro` y el
registro `Pruebas` relacionado estan en `approved` o `approved_migrated`. Si
falta el registro de pruebas, una aprobacion o cualquier dato obligatorio, se
informa exactamente que falta y no se genera un certificado incompleto.

## Manejo de errores

- Si Supabase no confirma el envio, el formulario no se limpia y se muestra el
  error.
- Si falla una revision, el estado visible no cambia localmente.
- Si el historial no puede cargarse, el registro sigue visible y se ofrece
  reintentar.
- Las acciones de revision evitan dobles envios mientras esperan respuesta.
- Una version desactualizada no puede sobrescribir silenciosamente una version
  mas reciente.

## Verificacion

Se deben comprobar:

- Envio nuevo desde Guest, Calidad y Admin.
- Autoaprobacion de Leonel y Rafael.
- Bloqueo de revision y certificado para Guest.
- Solicitud de correccion, modificacion, reenvio y aumento de version.
- Retorno a pendiente al modificar un registro aprobado.
- Comparacion correcta de campos anteriores y nuevos.
- Historial compartido entre usuarios y dispositivos.
- Migracion de registros existentes.
- Certificado bloqueado en estados no aprobados.
- Certificado bloqueado cuando la prueba relacionada no existe o no esta
  aprobada.
- Promedios, tolerancias, FINISHED y prueba de caida correctos en el
  certificado.
- Fallos de red sin perdida del formulario ni estados falsos.
