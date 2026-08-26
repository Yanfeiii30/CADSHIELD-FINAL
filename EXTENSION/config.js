/**
 * Shared runtime configuration for CAD Shield.
 *
 * This file is loaded before the background, content, and popup modules so
 * detection thresholds, weights, limits, modes, and storage keys have one
 * authoritative definition.
 */
globalThis.CADConfig = (() => {
  const modes = Object.freeze({
    HYBRID: "hybrid",
    NAIVE_BAYES: "nb",
    VADER: "vader",
  });

  const detection = Object.freeze({
    threshold: 0.50,
    hybridThreshold: 0.50,
    hybridNaiveBayesWeight: 0.60,
    hybridVaderWeight: 0.40,
    selfDistressDampen: 0.40,
    minimumTextLength: 10,
    maximumTokens: 128,
  });

  const timing = Object.freeze({
    initialScanDelaysMs: Object.freeze([2000, 5000]),
    rescanDebounceMs: 400,
    badgeUpdateDelayMs: 400,
    popupReloadDelayMs: 300,
    minimumAnalysisLoadingMs: 1400,
  });

  const limits = Object.freeze({
    scanBatchSize: 5,
    maximumLogEntries: 200,
    loggedTextLength: 100,
  });

  const storage = Object.freeze({
    enabled: "enabled",
    mode: "mode",
    panelMode: "panel_mode",
    theme: "theme",
    whitelist: "whitelist",
    blocklist: "custom_keywords",
    logEntries: "log_entries",
    totalScanned: "stat_total",
    totalAggressive: "stat_aggressive",
  });

  const messages = Object.freeze({
    reloadTab: "RELOAD_TAB",
    aggressiveFound: "AGGRESSIVE_FOUND",
    clearBadge: "CLEAR_BADGE",
    tabActivated: "TAB_ACTIVATED",
  });

  // Manifest V3 requires exclude_matches to remain in manifest.json. This
  // runtime list is the defensive equivalent used by shared page checks and
  // the popup's excluded-site status display.
  const privacy = Object.freeze({
    excludedHosts: Object.freeze([
      "messenger.com", "web.whatsapp.com", "web.telegram.org", "telegram.org",
      "viber.com", "slack.com", "teams.microsoft.com", "teams.live.com",
      "claude.ai", "chat.openai.com", "gemini.google.com", "mail.google.com",
      "outlook.com", "outlook.live.com", "outlook.office.com",
      "outlook.office365.com", "docs.google.com", "drive.google.com",
    ]),
    excludedPaths: Object.freeze([
      Object.freeze({ host: "facebook.com", path: "/messages" }),
      Object.freeze({ host: "instagram.com", path: "/direct" }),
      Object.freeze({ host: "twitter.com", path: "/messages" }),
      Object.freeze({ host: "x.com", path: "/messages" }),
      Object.freeze({ host: "tiktok.com", path: "/messages" }),
      Object.freeze({ host: "linkedin.com", path: "/messaging" }),
      Object.freeze({ host: "discord.com", path: "/channels/@me" }),
    ]),
  });

  function thresholdForMode(mode) {
    return mode === modes.NAIVE_BAYES || mode === modes.VADER
      ? detection.threshold
      : detection.hybridThreshold;
  }

  return Object.freeze({ modes, detection, timing, limits, storage, messages, privacy, thresholdForMode });
})();
