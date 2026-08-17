// Minimal fixed-window rate limiter factory. In-memory and per-process by
// design — fine for a single backend instance with a single identity per
// protected surface (the agent's static key, the MCP's static secret).
// Known limitation (documented, not hidden): resets on process restart,
// doesn't coordinate across multiple instances — would need a shared
// store (e.g. Redis) before running more than one instance behind a load
// balancer.
export function createFixedWindowLimiter({ windowMs = 60_000, maxRequests = 120, key = 'default' } = {}) {
  const windows = new Map();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    let entry = windows.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      windows.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'rate_limited',
        message: `Limite de ${maxRequests} requisições por minuto excedido.`,
        retry_after_seconds: retryAfterSec,
      });
    }
    next();
  };
}
