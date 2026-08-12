# Etiquetas 2 ↔ DIGITALIZACION — resumen de lo hecho y estado de la unificación

Este archivo explica que se porto de `DIGITALIZACION/` (la app vieja en Python/Flask)
hacia `Etiquetas 2` (la app nueva en Node/Express + React) durante esta sesion de
trabajo, y deja planteado que falta para que dejen de ser dos sistemas separados.

## 1. Que es cada cosa hoy

- **DIGITALIZACION/** — la app original en Python/Flask + Postgres. Tenia
  **114 rutas** (`@app.route`) y **25 templates** HTML. Cubria mucho mas que lo
  que se porto aca: roles de usuario (operador/supervisor/administrador) con
  permisos finos, validacion de reportes, planeacion dinamica, almacen,
  catalogo de productos, etc. Es un repo git real, con remoto propio en
  GitHub (`github.com/Elmertc02/planificacion_saldo_bot_fixed`) y su propio
  despliegue en Vercel. **(12/08) Se saco de este proyecto y se movio completa
  a `C:\Users\LENOVO\Downloads\DIGITALIZACION`** -- ya no vive dentro de
  `Etiquetas 2/`. Se confirmo antes de moverla que ningun archivo de
  `frontend/`/`backend/` la referencia en tiempo de ejecucion (solo hay
  comentarios en el codigo citandola como referencia de diseño), asi que la
  web sigue funcionando exactamente igual.
- **Etiquetas 2** (el resto de esta carpeta) — la app nueva, la que va a
  reemplazar a DIGITALIZACION. Se separo en dos proyectos independientes, cada
  uno con su propio `package.json`/`node_modules`:
  - `backend/` — Express + `pg` (Postgres local).
  - `frontend/` — React + Vite.
  El root solo tiene un `package.json` chico que orquesta correr los dos juntos
  (`npm run dev:all`).

**Decision tomada:** el objetivo es dejar de usar DIGITALIZACION y que
Etiquetas 2 (`frontend/` + `backend/`) sea el unico sistema. Eso significa
terminar de portar lo que falta (seccion 4) antes de poder apagar
DIGITALIZACION del todo -- no es un simple "conectar las dos bases", es
completar funcionalidad.

## 2. Que se porto/construyo en esta sesion (por modulo)

### Planificacion
- Export a PDF del kanban semanal: todas las maquinas juntas en una sola tabla
  (no una pagina por maquina), con separador visual entre maquinas, columna de
  bot/h y horario aproximado por bloque, nombre de archivo segun semana/mes,
  fix de filas cortadas entre paginas, descripcion de botella resaltada, y una
  pagina de "TOTAL GENERAL" cuando se exportan varios meses/semanas juntos.
- Cambio de molde individual por maquina (antes solo existia para el combo
  SEM 63/78), y que el cambio de molde consuma horas reales del dia (si no
  termina en el turno Mañana, sigue en el turno Noche sin reiniciar).
- Pestaña **Seguimiento** ("Planeacion Dinamica" de DIGITALIZACION): kanban de
  real vs. planificado, paros/adiciones/reasignaciones, dias de atraso,
  porcentaje de cumplimiento, historial calculado en vivo (no snapshot).

### Dashboard
- "Produccion por dia" y "Produccion por maquina / Rendimiento estimado" ahora
  salen de los reportes diarios reales (antes eran valores hardcodeados).

### Reportes diarios (el grueso de esta sesion)
- Paradas programadas/no programadas: hora inicio + hora fin en vez de minutos
  a mano (se calculan solos).
- Edicion de un reporte ya guardado, con las cajas de preforma cargando la
  cantidad **de la primera vez que se llenaron** (no la cantidad actual, ya
  reducida por consumos posteriores).
- Export a Excel de todos los reportes, y de las cajas de preforma (con una
  hoja aparte "Observaciones" para las preformas observadas/defectuosas).
- Export a PDF de un reporte individual **calcado del formulario de papel real**
  `REG-PRS-CB-01` que ya usa la planta (mismo logo, mismos campos, misma
  distribucion) — dibujado a mano con jsPDF, no una captura de pantalla ni un
  port literal del HTML de DIGITALIZACION (se probo que ese camino generaba
  archivos rotos).
- Separacion de "Nuevo reporte" (el formulario) y **Historial** (la tabla de
  reportes guardados), con filtros de maquina/año/mes/dia y un buscador libre
  por codigo de botella u OP.
- **Validacion de supervisor**: todo reporte nuevo entra "pendiente"; una
  pestaña **Validacion** deja aprobarlo (pasa a Historial) o rechazarlo con
  motivo (queda documentado en una lista de rechazados, se puede reabrir).
- Vistas filtradas de **Produccion** (solo botellas buenas) y **Mermas** (con
  la OP de la caja de preforma usada), separadas de Reportes guardados.

### Almacen Produccion
- Export a Excel del inventario de cajas de preforma.

## 3. Que es "portar" en este contexto (y su limite)

Cada feature de arriba se reconstruyo mirando el codigo/HTML/CSS de
`DIGITALIZACION/` como **referencia de diseño y de reglas de negocio** (por
ejemplo, el formato exacto del PDF de reporte, o los campos que guarda un
reporte diario), pero el codigo en si es nuevo, vive en Etiquetas 2, y usa su
propio modelo de datos en Postgres. No hay ningun mecanismo que sincronice
datos entre las dos apps ni que las haga correr como una sola.

## 4. Lo que NO se toco (sigue solo en DIGITALIZACION) -- decidido que no hace falta

De lo que aparecio en el codigo de DIGITALIZACION mientras se investigaba
cada feature, quedan sin portar al menos lo siguiente. **Decision (12/08):
el alcance actual de Etiquetas 2 esta bien asi, no hace falta agregar nada
de esta lista.** Queda documentada solo como referencia de que existe en
DIGITALIZACION, no como pendiente:

- Sistema de roles y permisos (operador/supervisor/administrador con permisos
  finos por accion) — Etiquetas 2 hoy tiene un solo login compartido sin
  distincion de rol para Reportes/Planificacion.
- Autorizacion de correccion (que un administrador habilite puntualmente a un
  supervisor a editar un reporte ya rechazado).
- Catalogo de productos e insumos completo (en Etiquetas 2 solo se consume una
  parte para autocompletar Planificacion/Reportes).
- Todo lo que no sea Planificacion/Seguimiento/Dashboard/Reportes/Almacen
  Produccion (DIGITALIZACION tiene 114 rutas en total; en esta sesion se
  trabajo sobre un subconjunto).

## 5. Plan: migrar de DIGITALIZACION a Etiquetas 2

Objetivo confirmado: Etiquetas 2 (`frontend/` + `backend/`) reemplaza a
DIGITALIZACION. DIGITALIZACION queda intacta y sin tocar mientras tanto (sigue
siendo la que se usa en el dia a dia hasta que Etiquetas 2 tenga todo lo que
hace falta).

Pasos, en orden:

1. ~~Terminar de portar lo que falta (seccion 4)~~ -- **descartado**: se
   decidio que el alcance funcional actual de Etiquetas 2 ya esta completo,
   no hace falta portar mas pantallas ni features de DIGITALIZACION.
2. **Migrar los datos historicos** de la base de DIGITALIZACION a la de
   Etiquetas 2. Este es el proximo paso real (ver seccion 6 -- ya no hay
   bloqueante para arrancarlo).
3. Recien ahi, dejar de usar DIGITALIZACION.

## 6. Resuelto -- perdida de datos en `reportes_diarios`

Durante el trabajo de esta sesion se detecto que la tabla `reportes_diarios`
(y `cajas_preforma_mov`, el historial de consumo de cajas) quedo vacia --
se habian perdido los reportes reales cargados durante la sesion (OP 088T,
012P, 076P). El resto de las tablas (maquinas, planes, cajas de preforma,
usuarios) estaba intacto. Se confirmo con el usuario (12/08) que fue un
borrado intencional hecho por el mismo desde la app web, no un bug ni una
perdida accidental -- no hace falta restaurar nada ni seguir investigando.
