import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { articlesRouter } from './routes/articles.js';
import { categoriesRouter } from './routes/categories.js';
import { searchRouter } from './routes/search.js';
import { analyticsRouter } from './routes/analytics.js';
import { statsRouter } from './routes/stats.js';
import { authRouter } from './routes/auth.js';
import { agentRouter } from './routes/agent.js';
import { adminRouter } from './routes/admin.js';
import { mcpRouter } from './mcp/router.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, env: env.nodeEnv }));

// ── Static frontend (production single-process hosting) ──────────────
// Deliberately NOT `express.static(repoRoot)` — that would also serve
// everything under backend/ (source files, package.json, node_modules) to
// any visitor who guesses the path. Only these four files, by exact name,
// are ever the frontend — the same set api.js/script.js were built
// against, and the same set Vercel serves. Local split-server dev
// (python -m http.server 8080 + this backend on 3001) is untouched — this
// is an additional way to serve the frontend, not a replacement.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND_FILES = ['index.html', 'styles.css', 'script.js', 'api.js'];
for (const file of FRONTEND_FILES) {
  app.get('/' + file, (req, res) => res.sendFile(path.join(REPO_ROOT, file)));
}
app.get('/', (req, res) => res.sendFile(path.join(REPO_ROOT, 'index.html')));

app.use('/api/articles', articlesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/search', searchRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/auth', authRouter);
app.use('/api/agent', agentRouter);
app.use('/api/admin', adminRouter);
app.use('/mcp', mcpRouter);

app.use(notFoundHandler);
app.use(errorHandler);
