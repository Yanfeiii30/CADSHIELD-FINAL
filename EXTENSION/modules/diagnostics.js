/**
 * Small, privacy-safe diagnostic recorder used by extension modules.
 * It records technical context only; scanned page text is never included.
 */
globalThis.CADDiagnostics = (() => {
  const MAX_ENTRIES = 50;
  const entries = [];

  function normalizeError(error) {
    if (error instanceof Error) return error.message;
    if (error && typeof error.message === "string") return error.message;
    return String(error || "Unknown error");
  }

  function record(level, area, error, details = {}) {
    const entry = Object.freeze({
      level,
      area,
      message: normalizeError(error),
      details: { ...details },
      time: new Date().toISOString(),
    });
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();

    const logger = level === "error" ? console.error : console.warn;
    logger(`[CAD Shield] ${area}: ${entry.message}`, entry.details);
    return entry;
  }

  function warn(area, error, details) {
    return record("warning", area, error, details);
  }

  function error(area, problem, details) {
    return record("error", area, problem, details);
  }

  function getRecent() {
    return entries.map(entry => ({ ...entry, details: { ...entry.details } }));
  }

  function clear() {
    entries.length = 0;
  }

  return Object.freeze({ warn, error, getRecent, clear });
})();
