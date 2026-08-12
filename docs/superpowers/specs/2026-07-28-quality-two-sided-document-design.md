# PETnova: documento de calidad de anverso y reverso

Fecha: 2026-07-28

## Objetivo

Convertir `Nuevo registro` y `Pruebas` en las dos caras de un unico documento
digital. Las caras pueden completarse en momentos distintos como borrador,
pero se envian, revisan, aprueban, imprimen y consultan como una sola unidad.

## Alcance

El cambio cubre:

- Creacion de un expediente unico para cada produccion.
- `Nuevo registro` como anverso y `Pruebas` como reverso.
- Datos generales compartidos entre ambas caras.
- Guardado de borrador sin enviar a aprobacion.
- Un solo comando `Mandar documento`.
- Una sola decision de aprobacion, correccion o rechazo.
- Historial conjunto con identificacion de la cara modificada.
- Una sola fila por documento en la base visible.
- Impresion en dos paginas tamaño carta.
- Generacion de certificado desde el documento aprobado.
- Migracion controlada de registros existentes.

No se modifica el flujo de otros formularios de calidad.

## Experiencia de uso

### Creacion

1. El usuario pulsa `Nuevo documento`.
2. El sistema genera un `document_id` UUID que no depende de la fecha, maquina
   ni codigo SAI.
3. Se abre el anverso y se muestra un encabezado de navegacion:
   `Anverso | Reverso`.
4. El documento queda en estado `Borrador`.

### Datos compartidos

Los siguientes datos pertenecen al documento y no a una cara:

- Fecha de produccion.
- Maquina.
- Codigo SAI.
- Formato, volumen, gramaje y color.
- Cliente.
- OP de botella.
- Resina.
- Turno.
- Operador.
- Auxiliar de calidad.

Al modificar uno de estos datos en el anverso, el reverso lo recibe
automaticamente. El reverso los muestra como contexto y no crea una copia
independiente.

### Borrador

- El usuario puede cambiar entre caras sin perder datos.
- El sistema guarda el borrador en Supabase.
- Un indicador muestra si cada cara esta `Incompleta` o `Completa`.
- Cerrar la pagina no envia el documento a aprobacion.
- Cualquier usuario autorizado puede continuar un borrador compartido.

### Envio

- Existe un unico boton `Mandar documento`.
- Antes de enviar, se validan los campos obligatorios de ambas caras.
- Si falta informacion, se muestra una lista agrupada por `Anverso` y
  `Reverso`; al seleccionar un error se abre la cara y el campo correspondiente.
- Una transaccion guarda ambas caras, incrementa la version del documento,
  crea el historial y cambia el estado a `Pendiente`.
- El formulario solo se limpia cuando Supabase confirma toda la operacion.

### Revision

- Leonel (`admin`) y Rafael (`calidad`) pueden revisar el documento completo.
- La pantalla de revision permite alternar entre anverso y reverso.
- Existe una sola decision: `Aprobar`, `Solicitar correccion` o `Rechazar`.
- Solicitar correccion y rechazar exigen un comentario.
- La autoaprobacion permanece permitida.
- Una correccion reabre ambas caras, aunque el historial indique en cual se
  solicitaron o realizaron cambios.

## Estados

Los estados del documento son:

- `draft`: borrador.
- `pending`: pendiente de aprobacion.
- `approved`: aprobado.
- `correction_requested`: requiere correccion.
- `rejected`: rechazado.
- `approved_migrated`: documento anterior migrado como aprobado.
- `linking_required`: registros antiguos que requieren vinculacion manual.

El estado pertenece al documento completo. Las caras no pueden quedar con
decisiones de aprobacion diferentes.

## Base visible

La base de datos de la pagina muestra una sola fila por documento:

- Fecha.
- Maquina.
- Codigo SAI.
- Formato.
- Responsable.
- Estado del anverso.
- Estado del reverso.
- Estado general.
- Version.
- Ultima modificacion.
- Acciones.

Las acciones son:

- `Abrir`.
- `Historial`.
- `Revisar`, cuando corresponda.
- `Imprimir`.
- `Generar certificado`, cuando corresponda.

Al abrir una fila se recuperan ambas caras mediante el mismo `document_id`.

## Modelo de datos

### Nueva tabla `public.quality_documents`

- `id uuid primary key`.
- `document_number text unique`.
- `status text`.
- `version integer`.
- `lock_version integer`, incrementado en cada guardado de borrador para
  detectar ediciones simultaneas sin crear versiones formales adicionales.
- `production_date date`.
- `machine text`.
- `sai_code text`.
- `shared_data jsonb`.
- `created_by uuid`.
- `created_by_name text`.
- `submitted_by uuid`.
- `submitted_by_name text`.
- `submitted_at timestamptz`.
- `reviewed_by uuid`.
- `reviewed_by_name text`.
- `reviewed_at timestamptz`.
- `review_comment text`.
- `created_at timestamptz`.
- `updated_at timestamptz`.

`document_number` sera un correlativo legible para busqueda. `id` sera la
relacion tecnica estable.

### Cambios en `public.new_quality_records`

- Se agrega `document_id uuid` relacionado con `quality_documents`.
- Se conserva `record_type`, con `inspection` para el anverso y `tests` para
  el reverso.
- Se agrega una restriccion unica para `(document_id, record_type)`, de modo
  que un documento solo pueda tener una cara de cada tipo.
- El `payload` conserva los campos propios de cada cara.
- Los estados existentes se mantienen temporalmente por compatibilidad, pero
  la fuente de verdad es `quality_documents.status`.

### Nueva tabla `public.quality_document_history`

- `id uuid`.
- `document_id uuid`.
- `version integer`.
- `event_type text`.
- `section text`, con valores `shared`, `inspection`, `tests` o `document`.
- `actor_id uuid`.
- `actor_name text`.
- `actor_role text`.
- `reason text`.
- `changed_fields jsonb`.
- `previous_snapshot jsonb`.
- `new_snapshot jsonb`.
- `created_at timestamptz`.

El historial anterior de cada cara se conserva. La nueva interfaz presenta una
linea de tiempo conjunta ordenada por fecha.

## Funciones de base de datos

Las operaciones sensibles se realizan mediante RPC con transacciones:

- `create_quality_document`: crea el expediente y sus dos caras vacias.
- `save_quality_document_draft`: guarda cambios de ambas caras sin enviar.
- `submit_quality_document`: valida y manda las dos caras como una unidad.
- `review_quality_document`: aprueba, solicita correccion o rechaza todo el
  documento.
- `get_quality_document`: recupera documento, anverso y reverso.
- `get_quality_certificate_source`: obtiene una version aprobada y consistente.

Cada funcion valida `lock_version` para evitar que un dispositivo sobrescriba
cambios realizados desde otro. `version` solo aumenta al mandar o reenviar el
documento, de modo que los autoguardados no generen versiones formales
innecesarias.

## Historial

La ventana de historial muestra:

- Version.
- Fecha y hora.
- Usuario y rol.
- Accion.
- Cara afectada.
- Motivo.
- Campo modificado.
- Valor anterior y nuevo.

La aprobacion y el envio aparecen como eventos del documento. Las ediciones
indican `Anverso`, `Reverso` o `Datos generales`.

## Impresion

- El comando `Imprimir documento` genera una vista de dos paginas carta.
- Pagina 1: anverso (`Nuevo registro`).
- Pagina 2: reverso (`Pruebas`).
- Cada cara conserva su formato establecido, dimensiones y encabezado.
- La impresion no incluye controles de la aplicacion, estados auxiliares,
  tolerancias visuales ni mensajes de validacion.
- El mismo resultado puede guardarse como PDF desde el navegador.

## Certificado

El certificado se genera desde un solo `quality_document` aprobado:

- Mediciones y datos productivos: anverso.
- Prueba de caida y demas pruebas: reverso.
- Especificaciones tecnicas: formato centralizado por codigo SAI.
- FINISHED: mantiene los mismos valores fijos del certificado vigente.

Ya no se busca el reverso por fecha, maquina y SAI. La relacion se obtiene
directamente mediante `document_id`.

## Migracion

Los registros existentes se procesan sin eliminarlos:

1. Se intenta emparejar anverso y reverso por fecha, maquina y codigo SAI.
2. Si existe una sola coincidencia de cada tipo, se crea el documento y se
   enlazan ambas caras.
3. Si existen varias coincidencias posibles o falta una cara, el expediente
   queda `linking_required`.
4. Una herramienta de vinculacion permite seleccionar manualmente el anverso
   y reverso correctos.
5. Los pares confirmados conservan usuarios, fechas, versiones e historial.

No se generan certificados para documentos en `linking_required`.

## Seguridad

- Todos los usuarios autenticados autorizados pueden crear y completar
  borradores.
- Solo `admin` y `calidad` pueden aprobar, rechazar, pedir correcciones y
  generar certificados.
- Las reglas se validan en PostgreSQL, no solo en la interfaz.
- El cliente no puede asignarse roles, estados aprobados ni usuarios de
  revision.
- El historial es de solo lectura para el frontend.

## Manejo de errores

- Una falla al guardar mantiene los datos visibles y permite reintentar.
- Un envio parcial se revierte completamente.
- Una version desactualizada obliga a recargar antes de continuar.
- Si una cara no existe, el documento se marca incompleto y no se envia.
- Si falla la impresion, el documento permanece guardado y aprobado.
- Los errores indican la cara y el campo involucrados.

## Verificacion

Se comprobaran:

- Creacion de un documento con dos caras y un solo `document_id`.
- Datos generales sincronizados.
- Recuperacion del borrador desde otro dispositivo.
- Bloqueo de envio cuando falta informacion en cualquiera de las caras.
- Envio atomico y un solo estado pendiente.
- Aprobacion y autoaprobacion del documento completo.
- Correccion con motivo obligatorio e historial por cara.
- Conflictos entre versiones.
- Una sola fila visible por documento.
- Impresion carta de dos paginas.
- Certificado generado mediante `document_id`.
- Restricciones de Guest.
- Migracion automatica de pares unicos.
- Vinculacion manual de registros ambiguos.
- Fallas de red sin perdida de datos.
