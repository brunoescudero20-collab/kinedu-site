import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

if (env.sessionSecretIsEphemeral) {
  logger.warn('SESSION_SECRET not set — using a random per-process secret. Admin sessions will not survive a restart.');
}

// 0.0.0.0 explicitly, not the Node default — most PaaS hosts (Render,
// Railway, Fly.io) route external traffic to the container's public
// interface, not just loopback, and expect the app to bind accordingly.
app.listen(env.port, '0.0.0.0', () => {
  logger.info(`KinEdu API listening on port ${env.port}`, { env: env.nodeEnv, host: '0.0.0.0' });
});
