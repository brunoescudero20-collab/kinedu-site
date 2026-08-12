import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { articlesRouter } from './routes/articles.js';
import { categoriesRouter } from './routes/categories.js';
import { searchRouter } from './routes/search.js';
import { analyticsRouter } from './routes/analytics.js';
import { statsRouter } from './routes/stats.js';
import { authRouter } from './routes/auth.js';
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

app.use('/api/articles', articlesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/search', searchRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/auth', authRouter);

app.use(notFoundHandler);
app.use(errorHandler);
