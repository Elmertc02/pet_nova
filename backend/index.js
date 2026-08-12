import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import etiquetasRoutes from './routes/etiquetas.js';
import planificacionRoutes from './routes/planificacion.js';
import equipoRoutes from './routes/equipo.js';
import catalogoRoutes from './routes/catalogo.js';
import reportesRoutes from './routes/reportes.js';
import almacenRoutes from './routes/almacen.js';
import seguimientoRoutes from './routes/seguimiento.js';
import './db.js'; // asegura que la base y las tablas existan antes de escuchar

const app = express();
const PORT = process.env.LOCAL_SERVER_PORT || 8787;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', etiquetasRoutes);
app.use('/api', planificacionRoutes);
app.use('/api', equipoRoutes);
app.use('/api', catalogoRoutes);
app.use('/api', reportesRoutes);
app.use('/api', almacenRoutes);
app.use('/api', seguimientoRoutes);

// Error-handler JSON: cualquier error async sin capturar (ej. una query de
// Postgres que falla) cae aca -- Express 5 reenvia solas las rejections de
// handlers async al error-handler, no hace falta un wrapper try/catch por
// ruta. Sin esto, Express devolveria su pagina de error HTML default, que
// rompe el parseo `response.json()` del lado del cliente.
app.use((err, req, res, next) => {
  console.error('[server local] error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// 127.0.0.1 explicito: este puerto NO se expone a la red local -- Vite lo
// reenvia internamente via su proxy (/api/* -> 127.0.0.1:8787, ver
// vite.config.js), asi que solo el propio proceso de Vite en esta PC
// necesita alcanzarlo. Quien abre la app desde otra maquina de la red solo
// ve el puerto 5000 (Vite).
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server local] escuchando en http://localhost:${PORT} (solo local, reenviado por Vite)`);
});
