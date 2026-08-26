/**
 * Per-tab detection statistics and storage synchronization.
 *
 * @requires CADConfig
 * @requires CADDiagnostics
 */
globalThis.DetectionLog = (() => {
  function create(api = chrome, options = {}) {
    const storage = api.storage.local;
    const runtime = api.runtime;
    const tabKey = options.tabKey || `tab_${Math.random().toString(36).slice(2, 11)}`;
    const now = options.now || (() => new Date());
    let total = 0;
    let aggressive = 0;
    let entries = [];

    function storageUpdate(includeTabValues = true) {
      const update = {
        [CADConfig.storage.logEntries]: entries,
        [CADConfig.storage.totalScanned]: total,
        [CADConfig.storage.totalAggressive]: aggressive,
      };
      if (includeTabValues) {
        update[`log_${tabKey}`] = entries;
        update[`tot_${tabKey}`] = total;
        update[`agg_${tabKey}`] = aggressive;
      }
      return update;
    }

    function sendMessage(type) {
      try {
        const pending = runtime.sendMessage({ type });
        if (pending && typeof pending.catch === "function") {
          pending.catch(error => CADDiagnostics.warn("DetectionLog.sendMessage", error, { type }));
        }
      } catch (error) {
        CADDiagnostics.warn("DetectionLog.sendMessage", error, { type });
      }
    }

    function writeStorage(update, area, details) {
      try {
        const pending = storage.set(update);
        if (pending && typeof pending.catch === "function") {
          pending.catch(error => CADDiagnostics.error(area, error, details));
        }
      } catch (error) {
        CADDiagnostics.error(area, error, details);
      }
    }

    function reset({ clearBadge = true } = {}) {
      total = 0;
      aggressive = 0;
      entries = [];
      writeStorage(storageUpdate(true), "DetectionLog.reset");
      if (clearBadge) sendMessage(CADConfig.messages.clearBadge);
    }

    function save(text, score, isAggressive, mode, durationMs) {
      try {
        total++;
        if (isAggressive) aggressive++;
        entries.push({
          text: text.substring(0, CADConfig.limits.loggedTextLength),
          score: Number(score.toFixed(3)),
          is_aggressive: isAggressive,
          mode,
          time: now().toLocaleTimeString(),
          ms: durationMs,
        });
        if (entries.length > CADConfig.limits.maximumLogEntries) entries.shift();
        writeStorage(storageUpdate(true), "DetectionLog.save", { mode, isAggressive });
      } catch (error) {
        CADDiagnostics.error("DetectionLog.save", error, { mode, isAggressive });
      }
    }

    function publish() {
      writeStorage(storageUpdate(false), "DetectionLog.publish");
      if (aggressive > 0) sendMessage(CADConfig.messages.aggressiveFound);
    }

    function snapshot() {
      return {
        tabKey,
        total,
        aggressive,
        entries: entries.map(entry => ({ ...entry })),
      };
    }

    return Object.freeze({ reset, save, publish, snapshot });
  }

  return Object.freeze({ create });
})();
