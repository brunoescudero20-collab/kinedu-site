import { createFixedWindowLimiter } from '../utils/rateLimiter.js';

export const agentRateLimit = createFixedWindowLimiter({ windowMs: 60_000, maxRequests: 120, key: 'agent' });
