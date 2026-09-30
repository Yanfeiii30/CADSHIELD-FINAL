/**
 * popup/popup.js — CAD Shield
 * Cyber-Aggression Detector
 * Thesis: Pamantasan ng Cabuyao BSCS 2026
 */

const STORAGE_KEYS = CADConfig.storage;
const MESSAGE_TYPES = CADConfig.messages;
const ALGO_DESCRIPTIONS = {
  [CADConfig.modes.HYBRID]: "Naive Bayes + VADER combined (recommended)",
  [CADConfig.modes.NAIVE_BAYES]: "Naive Bayes only — pattern-based detection",
  [CADConfig.modes.VADER]: "VADER only — sentiment-based detection",
};

function filterManagedWords(words, query) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  if (!normalizedQuery) return [...words];
  return words.filter(word => word.toLowerCase().includes(normalizedQuery));
}

function resolveBlocklistAddition(word, whitelist, blocklist) {
  if (blocklist.includes(word)) {
    return { status: "exists", whitelist: [...whitelist], blocklist: [...blocklist] };
  }
  const nextWhitelist = whitelist.filter(existing => existing !== word);
  return {
    status: nextWhitelist.length === whitelist.length ? "added" : "moved",
    whitelist: nextWhitelist,
    blocklist: [...blocklist, word],
  };
}

document.addEventListener("DOMContentLoaded", () => {

  // ── Refs ───────────────────────────────────────────────────────────────────
  const toggleEnabled   = document.getElementById("toggleEnabled");
  const statusBar       = document.getElementById("statusBar");
  const statusText      = document.getElementById("statusText");
  const platformBadge   = document.getElementById("platformBadge");
  const algoDesc        = document.getElementById("algoDesc");
  const algoButtons     = document.querySelectorAll(".algo-btn");
  const liveLog         = document.getElementById("liveLog");
  const logCount        = document.getElementById("logCount");
  const clearLogBtn     = document.getElementById("clearLog");
  const exportPdfBtn    = document.getElementById("exportPdf");
  const whitelistInput  = document.getElementById("whitelistInput");
  const addWhitelistBtn = document.getElementById("addWhitelistBtn");
  const whitelistList   = document.getElementById("whitelistList");
  const whitelistSearch = document.getElementById("whitelistSearch");
  const whitelistCount  = document.getElementById("whitelistCount");
  const whitelistSearchMeta = document.getElementById("whitelistSearchMeta");
  const testInput       = document.getElementById("testInput");
  const testBtn         = document.getElementById("testBtn");
  const keywordInput    = document.getElementById("keywordInput");
  const addKeywordBtn   = document.getElementById("addKeywordBtn");
  const keywordList     = document.getElementById("keywordList");
  const blocklistSearch = document.getElementById("blocklistSearch");
  const blocklistCount  = document.getElementById("blocklistCount");
  const blocklistSearchMeta = document.getElementById("blocklistSearchMeta");
  const wordTabButtons  = document.querySelectorAll("[data-word-tab]");
  const wordPanels      = document.querySelectorAll("[data-word-panel]");
  const statTotal       = document.getElementById("statTotal");
  const statAggressive  = document.getElementById("statAggressive");
  const statSafe        = document.getElementById("statSafe");
  const statCards       = document.querySelectorAll("[data-log-filter]");
  const sop2Results     = document.getElementById("sop2Results");
  const sop2Verdict     = document.getElementById("sop2Verdict");
  const thresholdLabel  = document.getElementById("thresholdLabel");
  const togglePanelMode = document.getElementById("togglePanelMode");
  const helpBtn         = document.getElementById("helpBtn");
  const helpBox         = document.getElementById("helpBox");
  const demoTabs        = document.querySelectorAll(".demo-tab");
  const expertOnlyItems = document.querySelectorAll(".expert-only");
  const replayStepsBtn  = document.getElementById("replayStepsBtn");
  const stepsEmpty      = document.getElementById("stepsEmpty");
  const themeToggleBtn  = document.getElementById("themeToggleBtn");
  let whitelistWords    = [];
  let blocklistWords    = [];
  // Keep the long Expert Evaluation report easy to scan. Each section title
  // becomes a native expandable heading; only the weight comparison starts
  // open because it contains the main 60/40 evidence.
  globalThis.CADShieldPopup.ExpertLayout.setup();

  // ── Theme (Light / Dark / Auto) ─────────────────────────────────────────────
  // Single header icon button that cycles Light → Dark → Auto on click.
  // "Auto" follows the OS/browser color scheme via prefers-color-scheme, and
  // stays live — if the system theme flips while the popup happens to be
  // open, the listener below re-resolves it immediately.
  const themeController = globalThis.CADShieldPopup.ThemeController.create(
    themeToggleBtn,
    chrome.storage.local
  );

  // ── Reload tab ─────────────────────────────────────────────────────────────
  function reloadTab(delay = CADConfig.timing.popupReloadDelayMs) {
    setTimeout(() => chrome.runtime.sendMessage({ type: MESSAGE_TYPES.reloadTab }), delay);
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function switchToTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
    if (name === "steps") playStepsForLastAnalysis();
  }

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchToTab(tab.dataset.tab));
  });

  // ── Steps tab — replays the last analysis from the Test tab. Jumped to
  // automatically as soon as an analysis finishes (see finishAnalysis).
  let lastAnalysis = null; // { text, nbTrace, vaderTrace, meta }

  function playStepsForLastAnalysis() {
    if (!lastAnalysis) {
      if (stepsEmpty)     stepsEmpty.classList.remove("hidden");
      if (replayStepsBtn) replayStepsBtn.classList.add("hidden");
      return;
    }
    if (stepsEmpty)     stepsEmpty.classList.add("hidden");
    if (replayStepsBtn) replayStepsBtn.classList.remove("hidden");
    globalThis.CADShieldPopup.StepRenderer.render(
      lastAnalysis.text,
      lastAnalysis.nbTrace,
      lastAnalysis.vaderTrace,
      lastAnalysis.meta
    );
  }

  if (replayStepsBtn) replayStepsBtn.addEventListener("click", playStepsForLastAnalysis);

  // ── Load ALL settings ──────────────────────────────────────────────────────
  chrome.storage.local.get(
    Object.values(STORAGE_KEYS),
    (res) => {
      toggleEnabled.checked = res[STORAGE_KEYS.enabled] !== false;
      updateStatus(res[STORAGE_KEYS.enabled] !== false);
      setActiveAlgo(res[STORAGE_KEYS.mode] || CADConfig.modes.HYBRID);
      renderKeywords(res[STORAGE_KEYS.blocklist] || []);
      renderWhitelist(res[STORAGE_KEYS.whitelist] || []);
      renderLog(res[STORAGE_KEYS.logEntries] || []);
      updateStats(res[STORAGE_KEYS.totalScanned] || 0, res[STORAGE_KEYS.totalAggressive] || 0);

      togglePanelMode.checked = res[STORAGE_KEYS.panelMode] === true;
      applyPanelMode(res[STORAGE_KEYS.panelMode] === true);

      themeController.setPreference(res[STORAGE_KEYS.theme] || "auto");
    }
  );

  // ── Expert Mode — show/hide the Test & Evaluation demo tabs ────────────────
  // Off by default: regular users only see Detection + Settings. Turning it
  // on reveals the SOP 2 demo tabs for showing the algorithm to a panel.
  function applyPanelMode(enabled) {
    demoTabs.forEach(tab => tab.classList.toggle("hidden", !enabled));
    expertOnlyItems.forEach(item => item.classList.toggle("hidden", !enabled));

    // If a now-hidden demo tab was active, fall back to Detection.
    const activeTab = document.querySelector(".tab.active");
    if (!enabled && activeTab && activeTab.classList.contains("demo-tab")) {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.querySelector('.tab[data-tab="detection"]').classList.add("active");
      document.getElementById("tab-detection").classList.add("active");
    }
  }

  togglePanelMode.addEventListener("change", () => {
    const panelMode = togglePanelMode.checked;
    chrome.storage.local.set({ [STORAGE_KEYS.panelMode]: panelMode });
    applyPanelMode(panelMode);
  });

  // ── Poll storage every second to keep stats fresh ─────────────────────────
  // Fixes blocked count not updating while popup is open
  setInterval(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.totalScanned, STORAGE_KEYS.totalAggressive, STORAGE_KEYS.logEntries],
      (res) => {
      if (chrome.runtime.lastError) return;
      updateStats(res[STORAGE_KEYS.totalScanned] || 0, res[STORAGE_KEYS.totalAggressive] || 0);
      if (res[STORAGE_KEYS.logEntries]) renderLog(res[STORAGE_KEYS.logEntries]);
      }
    );
  }, 1000);

  // ── Platform badge ─────────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || "";
    // Extract hostname from URL and display as platform badge
    // Works for ALL websites not just specific ones
    try {
      const hostname = new URL(url).hostname.replace("www.","");
      // Known platforms get friendly names
      const known = {
        "reddit.com": "Reddit",
        "youtube.com": "YouTube",
        "twitter.com": "Twitter/X",
        "x.com": "Twitter/X",
        "facebook.com": "Facebook",
        "instagram.com": "Instagram",
        "tiktok.com": "TikTok",
        "linkedin.com": "LinkedIn",
        "tumblr.com": "Tumblr",
        "pinterest.com": "Pinterest",
        "twitch.tv": "Twitch",
      };
      // Use friendly name if known, otherwise use hostname directly
      const platform = known[hostname] || hostname;
      platformBadge.textContent = platform;

      _isExcludedSite = PageRules.isExcludedHostname(hostname);
      if (_isExcludedSite) {
        platformBadge.textContent = platform + " (excluded)";
        updateStats(0, 0); // correct any stale numbers immediately, don't wait for the next poll
      }
    } catch(e) {
      platformBadge.textContent = "Active";
    }
  });

  // ── Help button — regular-user facing, not shown in thesis demo tabs ──────
  if (helpBtn && helpBox) {
    helpBtn.addEventListener("click", () => helpBox.classList.toggle("hidden"));
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  toggleEnabled.addEventListener("change", () => {
    const enabled = toggleEnabled.checked;
    updateStatus(enabled);
    chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled }, () => reloadTab());
  });

  function updateStatus(on) {
    statusBar.className    = on ? "status-strip status-on" : "status-strip status-off";
    statusText.textContent = on ? "Protection Active" : "Protection Paused";
  }

  // ── Algorithm buttons ──────────────────────────────────────────────────────
  algoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      chrome.storage.local.get(STORAGE_KEYS.mode, (res) => {
        if (res[STORAGE_KEYS.mode] === mode) return;
        chrome.storage.local.set({ [STORAGE_KEYS.mode]: mode }, () => {
          setActiveAlgo(mode);
          reloadTab();
        });
      });
    });
  });

  function setActiveAlgo(mode) {
    algoButtons.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    if (algoDesc) algoDesc.textContent = ALGO_DESCRIPTIONS[mode] || "";
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  // stat_total/stat_aggressive live in chrome.storage.local as GLOBAL keys,
  // not scoped per-site — they only get reset to 0 when content.js loads on
  // a page. On an excluded site (Messenger, Gmail, etc.) content.js never
  // runs at all, so those numbers are just whatever was left over from the
  // last site that WAS scanned, not anything happening on this tab. Forced
  // to 0 here whenever the active tab is a known-excluded site, so the
  // popup can't make it look like scanning happened somewhere it didn't.
  let _isExcludedSite = false;

  function updateStats(total, aggressive) {
    if (_isExcludedSite) { total = 0; aggressive = 0; }
    const safe = Math.max(0, total - aggressive);
    if (statTotal)      statTotal.textContent      = total;
    if (statAggressive) statAggressive.textContent = aggressive;
    if (statSafe)       statSafe.textContent       = safe;
  }

  // ── Detection Log ──────────────────────────────────────────────────────────
  let logFilter = "all";
  let latestLogEntries = [];

  function entryIsBlocked(entry) {
    const mode = entry.mode || CADConfig.modes.HYBRID;
    return Boolean(entry.is_aggressive || (entry.score || 0) >= CADConfig.thresholdForMode(mode));
  }

  function renderLog(entries) {
    if (!liveLog) return;
    latestLogEntries = entries || [];
    const visibleEntries = latestLogEntries.filter(entry => {
      if (logFilter === "blocked") return entryIsBlocked(entry);
      if (logFilter === "safe") return !entryIsBlocked(entry);
      return true;
    });
    if (visibleEntries.length === 0) {
      const emptyMessage = latestLogEntries.length === 0
        ? "No detections yet — browse any page."
        : `No ${logFilter} detections.`;
      liveLog.innerHTML = `<div class="log-empty">${emptyMessage}</div>`;
      if (logCount) logCount.textContent = logFilter === "all" ? "0 detections" : `0 ${logFilter} detections`;
      return;
    }
    if (logCount) logCount.textContent = logFilter === "all"
      ? `${visibleEntries.length} detections`
      : `${visibleEntries.length} ${logFilter} detections`;
    const reversed = [...visibleEntries].reverse();
    liveLog.innerHTML = reversed.map(e => {
      // Use the configured threshold OR the stored verdict — whichever says blocked.
      const isBlocked = entryIsBlocked(e);
      const cls   = isBlocked ? "log-item log-agg" : "log-item log-safe";
      const label = isBlocked ? "BLOCKED" : "SAFE";
      const pct   = ((e.score || 0) * 100).toFixed(1);
      return `
        <div class="${cls}">
          <div class="log-top">
            <span class="log-badge">${label}</span>
            <span class="log-score">${pct}%</span>
            <span class="log-mode">${(e.mode || CADConfig.modes.HYBRID).toUpperCase()}</span>
            <span class="log-time">${e.time || ""}</span>
          </div>
          <div class="log-text">${e.text || ""}</div>
        </div>`;
    }).join("");
  }

  statCards.forEach(card => {
    card.addEventListener("click", () => {
      logFilter = card.dataset.logFilter;
      statCards.forEach(item => {
        const active = item === card;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      switchToTab("detection");
      renderLog(latestLogEntries);
    });
  });

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      chrome.storage.local.get(
        [STORAGE_KEYS.logEntries, STORAGE_KEYS.totalScanned, STORAGE_KEYS.totalAggressive, STORAGE_KEYS.mode],
        (res) => {
          if (chrome.runtime.lastError) return;
          try {
            globalThis.CADShieldPopup.PdfExporter.download({
              entries: res[STORAGE_KEYS.logEntries] || [],
              total: res[STORAGE_KEYS.totalScanned] || 0,
              aggressive: res[STORAGE_KEYS.totalAggressive] || 0,
              mode: res[STORAGE_KEYS.mode] || CADConfig.modes.HYBRID,
              platform: platformBadge?.textContent || "Active tab",
              generatedAt: new Date(),
            });
          } catch (error) {
            CADDiagnostics.error("Popup.exportPdf", error);
          }
        }
      );
    });
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      if (!confirm("Clear the detection log? This removes all detections and resets the scanned, blocked, and safe totals. This cannot be undone.")) return;
      chrome.storage.local.set(
        {
          [STORAGE_KEYS.logEntries]: [],
          [STORAGE_KEYS.totalScanned]: 0,
          [STORAGE_KEYS.totalAggressive]: 0,
        },
        () => {
          renderLog([]);
          updateStats(0, 0);
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.clearDetections }).catch(() => {});
        }
      );
    });
  }

  // ── Custom word-list tabs, search, and rendering ──────────────────────────
  function activateWordTab(tabName, { focus = false } = {}) {
    wordTabButtons.forEach(button => {
      const isActive = button.dataset.wordTab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      if (isActive && focus) button.focus();
    });
    wordPanels.forEach(panel => {
      const isActive = panel.dataset.wordPanel === tabName;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  }

  wordTabButtons.forEach(button => {
    button.addEventListener("click", () => activateWordTab(button.dataset.wordTab));
    button.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      activateWordTab(button.dataset.wordTab === "whitelist" ? "blocklist" : "whitelist", { focus: true });
    });
  });

  function renderManagedWordList({ listElement, words, query, type, emptyText, countElement, metaElement }) {
    if (!listElement) return;
    const filteredWords = filterManagedWords(words, query);
    listElement.textContent = "";

    if (countElement) countElement.textContent = String(words.length);
    if (metaElement) {
      metaElement.textContent = query.trim()
        ? `${filteredWords.length} of ${words.length} matching`
        : `${words.length} saved`;
    }

    if (filteredWords.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty-list";
      emptyItem.textContent = words.length === 0 ? emptyText : "No matching words or phrases.";
      listElement.appendChild(emptyItem);
      return;
    }

    filteredWords.forEach(word => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const removeButton = document.createElement("button");
      label.textContent = word;
      removeButton.type = "button";
      removeButton.className = "remove-btn";
      removeButton.textContent = "✕";
      removeButton.dataset.word = word;
      removeButton.dataset.type = type;
      removeButton.setAttribute("aria-label", `Remove ${word} from ${type}`);
      removeButton.addEventListener("click", () => removeWord(word, type));
      item.append(label, removeButton);
      listElement.appendChild(item);
    });
  }

  // ── Whitelist ──────────────────────────────────────────────────────────────
  function renderWhitelist(words) {
    if (Array.isArray(words)) whitelistWords = [...words];
    renderManagedWordList({
      listElement: whitelistList,
      words: whitelistWords,
      query: whitelistSearch?.value || "",
      type: "whitelist",
      emptyText: "No whitelisted words yet.",
      countElement: whitelistCount,
      metaElement: whitelistSearchMeta,
    });
  }

  if (addWhitelistBtn) {
    addWhitelistBtn.addEventListener("click", () => addWhitelistWord());
  }
  if (whitelistInput) {
    whitelistInput.addEventListener("keydown", e => {
      if (e.key === "Enter") addWhitelistWord();
    });
  }
  if (whitelistSearch) {
    whitelistSearch.addEventListener("input", () => renderWhitelist());
  }

  function addWhitelistWord() {
    const word = whitelistInput.value.trim().toLowerCase();
    if (!word) return;

    // ── Check: word must NOT be in blocklist ──────────────────────────────
    chrome.storage.local.get([STORAGE_KEYS.whitelist, STORAGE_KEYS.blocklist], (res) => {
      const whitelist = res[STORAGE_KEYS.whitelist] || [];
      const blocklist = res[STORAGE_KEYS.blocklist] || [];

      // Conflict check — cannot be in both lists
      if (blocklist.includes(word)) {
        showFeedback(addWhitelistBtn, "⚠ In blocklist!", "#f59e0b");
        whitelistInput.value = "";
        return;
      }

      if (whitelist.includes(word)) {
        showFeedback(addWhitelistBtn, "Exists!", "#6b7280");
        whitelistInput.value = "";
        return;
      }

      whitelist.push(word);
      chrome.storage.local.set({ [STORAGE_KEYS.whitelist]: whitelist }, () => {
        if (whitelistSearch) whitelistSearch.value = "";
        renderWhitelist(whitelist);
        whitelistInput.value = "";
        showFeedback(addWhitelistBtn, "✓ Added!", "#16a34a");
        reloadTab();
      });
    });
  }

  // ── Blocklist ──────────────────────────────────────────────────────────────
  function renderKeywords(words) {
    if (Array.isArray(words)) blocklistWords = [...words];
    renderManagedWordList({
      listElement: keywordList,
      words: blocklistWords,
      query: blocklistSearch?.value || "",
      type: "blocklist",
      emptyText: "No blocked words yet.",
      countElement: blocklistCount,
      metaElement: blocklistSearchMeta,
    });
  }

  if (addKeywordBtn) {
    addKeywordBtn.addEventListener("click", () => addKeyword());
  }
  if (keywordInput) {
    keywordInput.addEventListener("keydown", e => {
      if (e.key === "Enter") addKeyword();
    });
  }
  if (blocklistSearch) {
    blocklistSearch.addEventListener("input", () => renderKeywords());
  }

  function addKeyword() {
    const word = keywordInput.value.trim().toLowerCase();
    if (!word) return;

    // ── Check: word must NOT be in whitelist ──────────────────────────────
    chrome.storage.local.get([STORAGE_KEYS.blocklist, STORAGE_KEYS.whitelist], (res) => {
      const blocklist = res[STORAGE_KEYS.blocklist] || [];
      const whitelist = res[STORAGE_KEYS.whitelist] || [];

      const update = resolveBlocklistAddition(word, whitelist, blocklist);
      if (update.status === "exists") {
        showFeedback(addKeywordBtn, "Exists!", "#6b7280");
        keywordInput.value = "";
        return;
      }

      // Blocklist has priority. Adding a previously allowed word moves it out
      // of the whitelist so the two settings cannot contradict each other.
      chrome.storage.local.set({
        [STORAGE_KEYS.blocklist]: update.blocklist,
        [STORAGE_KEYS.whitelist]: update.whitelist,
      }, () => {
        if (blocklistSearch) blocklistSearch.value = "";
        renderKeywords(update.blocklist);
        renderWhitelist(update.whitelist);
        keywordInput.value = "";
        showFeedback(addKeywordBtn, update.status === "moved" ? "Moved to blocklist!" : "✓ Added!", "#16a34a");
        reloadTab();
      });
    });
  }

  function removeWord(word, type) {
    const listName = type === "whitelist" ? "whitelist" : "blocklist";
    if (!confirm(`Remove "${word}" from your ${listName}?`)) return;

    const key = type === "whitelist" ? STORAGE_KEYS.whitelist : STORAGE_KEYS.blocklist;
    chrome.storage.local.get(key, (res) => {
      const list = (res[key] || []).filter(w => w !== word);
      chrome.storage.local.set({ [key]: list }, () => {
        if (type === "whitelist") renderWhitelist(list);
        else renderKeywords(list);
        reloadTab();
      });
    });
  }

  // ── Helper: show button feedback ───────────────────────────────────────────
  function showFeedback(btn, msg, color) {
    const orig = btn.textContent;
    const origBg = btn.style.background;
    btn.textContent       = msg;
    btn.style.background  = color;
    setTimeout(() => {
      btn.textContent      = orig;
      btn.style.background = origBg;
    }, 1800);
  }

  // ── Test Tab — SOP 2 Live Demo ─────────────────────────────────────────────
  const TEST_BTN_IDLE_LABEL = "▶ Analyze Text (SOP 2 Demo)";
  function setTestBtnLoading(loading) {
    if (loading) {
      testBtn.innerHTML = '<span class="btn-spinner"></span> Analyzing…';
      testBtn.disabled  = true;
      if (sop2Results) sop2Results.style.opacity = "0.45";
    } else {
      testBtn.textContent = TEST_BTN_IDLE_LABEL;
      testBtn.disabled    = false;
      if (sop2Results) sop2Results.style.opacity = "1";
    }
  }

  // Minimum loading spinner duration, so it doesn't just flash and disappear.
  const MIN_LOADING_MS = CADConfig.timing.minimumAnalysisLoadingMs;

  function finishAnalysis(text, results) {
    setTestBtnLoading(false);

    const analysisResult = results?.[0]?.result;
    if (!analysisResult || analysisResult.ok === false) {
      if (analysisResult?.err) {
        CADDiagnostics.warn("PopupController.finishAnalysis", new Error(analysisResult.err));
      }
      sop2Results.classList.remove("hidden");
      sop2Verdict.className   = "sop2-verdict safe";
      sop2Verdict.textContent = "⚠ Please refresh the page first, then try again.";
      return;
    }

    const { nb, vader, hybrid, nbTrace, vaderTrace, positiveWords } = analysisResult;
    const threshold       = CADConfig.detection.threshold;
    const hybridThreshold = CADConfig.detection.hybridThreshold;

    const nbAgg     = nb     >= threshold;
    const vaderAgg  = vader  >= threshold;
    const hybridAgg = hybrid >= hybridThreshold;

    sop2Results.classList.remove("hidden");

    // Verdict
    sop2Verdict.className   = hybridAgg ? "sop2-verdict agg" : "sop2-verdict safe";
    sop2Verdict.textContent = hybridAgg
      ? "⚠ AGGRESSIVE CONTENT DETECTED"
      : "✓ SAFE — Not Aggressive";

    // Scores — kept to 1 decimal place, not rounded to a whole number, so
    // the displayed figure is the actual computed score (e.g. 67.8%).
    const nbP  = parseFloat((nb * 100).toFixed(1));
    const vP   = parseFloat((vader * 100).toFixed(1));
    const hP   = parseFloat((hybrid * 100).toFixed(1));

    document.getElementById("nbScore").textContent     = nbP + "%";
    document.getElementById("vaderScore").textContent  = vP + "%";
    document.getElementById("hybridScore").textContent = hP + "%";

    const setResult = (id, isAgg) => {
      const el = document.getElementById(id);
      el.textContent = isAgg ? "AGGRESSIVE" : "SAFE";
      el.className   = isAgg ? "result-agg"  : "result-safe";
    };
    setResult("nbResult",     nbAgg);
    setResult("vaderResult",  vaderAgg);
    setResult("hybridResult", hybridAgg);

    // Hybrid row background reflects this request's actual verdict —
    // must not be hardcoded green, or an AGGRESSIVE result would show
    // in a "safe" color.
    const hybridRow = document.getElementById("hybridRow");
    if (hybridRow) hybridRow.className = "row-hybrid " + (hybridAgg ? "verdict-agg" : "verdict-safe");

    // Bars
    const setBar = (barId, pctId, pct, isAgg) => {
      document.getElementById(barId).style.width      = pct + "%";
      document.getElementById(barId).style.background = isAgg ? "#dc2626" : "#16a34a";
      document.getElementById(pctId).textContent      = pct + "%";
    };
    setBar("nbBar",     "nbPct",     nbP,  nbAgg);
    setBar("vaderBar",  "vaderPct",  vP,   vaderAgg);
    setBar("hybridBar", "hybridPct", hP,   hybridAgg);

    if (thresholdLabel) thresholdLabel.textContent = `── Threshold: ${hybridThreshold * 100}%`;

    // Note
    const nbWeight = CADConfig.detection.hybridNaiveBayesWeight;
    const vaderWeight = CADConfig.detection.hybridVaderWeight;
    document.getElementById("sop2Note").textContent =
      `Hybrid formula: R_score = ${nbWeight} × NB (${nbP}%) + ${vaderWeight} × VADER (${vP}%) = ${hP}%. ` +
      `Threshold = ${hybridThreshold * 100}% (same cutoff as NB/VADER). ` +
      `The Hybrid model combines both algorithms for better detection than single-algorithm approaches.`;

    // Store this analysis, then jump straight to the Steps tab so the
    // detailed breakdown plays immediately — no manual "see how this was
    // calculated" click needed.
    lastAnalysis = {
      text, nbTrace, vaderTrace,
      meta: { nbP, vP, hP, threshold: hybridThreshold * 100, hybridAgg, positiveWords: positiveWords || [] },
    };
    switchToTab("steps");
  }

  if (testBtn) {
    testBtn.addEventListener("click", () => {
      const text = testInput.value.trim();
      if (!text) return;

      setTestBtnLoading(true);
      const startedAt = Date.now();

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          setTestBtnLoading(false);
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (inputText) => {
            try {
              const analyzedText = globalThis.DetectionPolicy.truncateTokens(inputText);
              const fallbackScore = globalThis.CADConfig.detection.threshold;
              const nbTrace = typeof NaiveBayes !== "undefined"
                ? NaiveBayes.scoreWithTrace(analyzedText) : { ok: false };
              const vaderTrace = typeof VADER !== "undefined"
                ? VADER.analyzeWithTrace(analyzedText) : { ok: false };

              const nb    = nbTrace.ok
                ? nbTrace.prob
                : (typeof NaiveBayes !== "undefined" ? NaiveBayes.score(analyzedText) : fallbackScore);
              const vader = vaderTrace.aggression_score ?? fallbackScore;
              const decision = globalThis.DetectionPolicy.scoreForMode({
                mode: globalThis.CADConfig.modes.HYBRID,
                naiveBayesScore: nb,
                vaderScore: vader,
                useVaderOnly: nbTrace.ok && nbTrace.matched.length === 0,
                text: analyzedText,
              });
              const hybrid = decision.score;

              // Words NB's sparse, class-imbalanced counts happen to lean
              // "aggressive" on but that VADER's lexicon knows are genuinely
              // positive (e.g. "beautiful") — used downstream to stop the
              // Steps replay from painting a compliment red just because a
              // rare word's noisy log-likelihood split leans that way.
              const positiveWords = typeof VADER !== "undefined"
                ? Array.from(new Set((nbTrace.matched || [])
                    .map(t => t.token.replace(/^not_/, ""))
                    .filter(w => VADER.isPositiveLexiconWord(w))))
                : [];

              return { nb, vader, hybrid, nbTrace, vaderTrace, positiveWords, ok: true };
            } catch(e) {
              return { nb: 0, vader: 0, hybrid: 0, ok: false, err: e.message };
            }
          },
          args: [text],
        }, (results) => {
          const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
          if (remaining > 0) {
            setTimeout(() => finishAnalysis(text, results), remaining);
          } else {
            finishAnalysis(text, results);
          }
        });
      });
    });
  }


  // ── Live storage updates ───────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.totalScanned] || changes[STORAGE_KEYS.totalAggressive]) {
      chrome.storage.local.get([STORAGE_KEYS.totalScanned, STORAGE_KEYS.totalAggressive], (res) => {
        updateStats(res[STORAGE_KEYS.totalScanned] || 0, res[STORAGE_KEYS.totalAggressive] || 0);
      });
    }
    if (changes[STORAGE_KEYS.logEntries]) {
      renderLog(changes[STORAGE_KEYS.logEntries].newValue || []);
    }
  });

});
