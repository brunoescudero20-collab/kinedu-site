import { createFixedWindowLimiter } from '../utils/rateLimiter.js';

// Separate limiter instance from the agent's — different surface, own
// budget, so a burst against one never eats into the other's headroom.
export const mcpRateLimit = createFixedWindowLimiter({ windowMs: 60_000, maxRequests: 120, key: 'mcp' });
