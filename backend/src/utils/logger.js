// Minimal structured logger. No external dependency — this project doesn't need one yet,
// and adding one is easy later without touching call sites (they all go through here).
function line(level, msg, meta) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(entry));
}

export const logger = {
  info: (msg, meta) => line('info', msg, meta),
  warn: (msg, meta) => line('warn', msg, meta),
  error: (msg, meta) => line('error', msg, meta),
};
