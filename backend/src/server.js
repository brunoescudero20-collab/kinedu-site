import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

if (env.sessionSecretIsEphemeral) {
  logger.warn('SESSION_SECRET not set — using a random per-process secret. Admin sessions will not survive a restart.');
}

app.listen(env.port, () => {
  logger.info(`KinEdu API listening on port ${env.port}`, { env: env.nodeEnv });
});
