// Fleet Desk API. Routes follow API_CONTRACT.md; everything below /api/v1.
import express from 'express';
import { config } from './config.js';
import { errorHandler, ApiError } from './errors.js';
import { pool, waitForDatabase, value } from './db.js';
import { attachUser, requireUser, blockUntilPasswordChanged } from './auth.js';
import { startRetryWorker } from './mailer.js';
import { startSweeper } from './sessions.js';
import { migrate } from './migrate.js';
import { seedDemoData, ensureAccounts } from './seed.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import meRouter from './routes/me.js';
import settingsRouter from './routes/settings.js';
import requisitionsRouter from './routes/requisitions.js';
import reportsRouter from './routes/reports.js';
import collectionsRouter from './routes/collections.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// Liveness and readiness for the container health check, before any auth.
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/readyz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, database: e.code || 'down' });
  }
});

const api = express.Router();
api.use(attachUser);
api.use('/auth', authRouter);                   // reachable before signing in
api.use(requireUser);                           // everything below needs a session
api.use('/me', meRouter);
api.use(blockUntilPasswordChanged);
api.use('/users', usersRouter);
api.use('/settings', settingsRouter);
api.use('/requisitions', requisitionsRouter);   // workflow first: /requisitions/conflicts
api.use('/reports', reportsRouter);
api.use('/', collectionsRouter);                // generic CRUD for the rest
app.use(config.basePath, api);

app.use((req, res, next) => next(new ApiError(`No such endpoint: ${req.method} ${req.originalUrl}`, 404)));
app.use(errorHandler);

async function start() {
  await waitForDatabase();
  await migrate();
  // Sample data first: the accounts step then gives those people a password.
  if (config.seedDemoData) await seedDemoData({ force: false });
  await ensureAccounts();

  startRetryWorker();
  startSweeper();
  const server = app.listen(config.port, () => {
    const counts = ['drivers', 'cars', 'requisitions'];
    Promise.all(counts.map((t) => value(`SELECT count(*)::int FROM ${t}`)))
      .then((n) => console.log(`[api] listening on :${config.port}${config.basePath} — ${counts.map((t, i) => `${n[i]} ${t}`).join(', ')}`))
      .catch(() => console.log(`[api] listening on :${config.port}${config.basePath}`));
    console.log(config.auth.mode === 'proxy'
      ? '[api] AUTH_MODE=proxy: identity comes from the proxy in front.'
      : `[api] sign-in page in use; sessions last ${config.auth.sessionHours}h`);
    if (config.showDemoAccounts) console.log('[api] SHOW_DEMO_ACCOUNTS is on: the sign-in page lists the sample accounts. Turn it off for real use.');
  });

  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      console.log(`[api] ${sig} — shutting down`);
      server.close(() => pool.end().then(() => process.exit(0)));
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
}

start().catch((e) => {
  console.error('[api] failed to start:', e.message);
  process.exit(1);
});
