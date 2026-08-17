// Minimal fixed-window rate limiter for /api/agent/*. In-memory and
// per-process by design: there's a single backend instance and a single
// agent identity in this phase. Known limitation (documented, not hidden):
// this resets on process restart and would not coordinate across multiple
// backend instances — fine now, would need a shared store (e.g. Redis)
// before running more than one instance behind a load balancer.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

const windows = new Map();

export function agentRateLimit(req, res, next) {
  const key = 'agent';
  const now = Date.now();
  let entry = windows.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    windows.set(key, entry);
  }
  entry.count += 1;

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'rate_limited',
      message: `Limite de ${MAX_REQUESTS_PER_WINDOW} requisições por minuto excedido.`,
      retry_after_seconds: retryAfterSec,
    });
  }
  next();
}
