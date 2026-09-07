// Reusable date-window helper for the future curation agent (Phase 2+).
// Never hardcode a floor year — always derive it from the current date, so the
// window moves forward automatically as time passes.

/**
 * The earliest publication date the curation agent should accept.
 * Currently: today minus 10 years. Kept as a parameter (not a hardcoded 10)
 * so a future policy change doesn't require touching call sites.
 * @param {number} years - size of the acceptance window, in years
 * @param {Date} [now] - inject for testing; defaults to the real current date
 * @returns {Date}
 */
export function minimumPublicationDate(years = 10, now = new Date()) {
  const floor = new Date(now);
  floor.setFullYear(floor.getFullYear() - years);
  return floor;
}

/** @returns {boolean} true if the given date falls within the last `years` years */
export function isWithinPublicationWindow(date, years = 10, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d >= minimumPublicationDate(years, now) && d <= now;
}
