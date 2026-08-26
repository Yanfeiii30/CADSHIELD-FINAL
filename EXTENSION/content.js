/**
 * content.js
 * Real-time Cyber-Aggression Detection — Chrome Extension
 * Thesis: Pamantasan ng Cabuyao BSCS 2026
 *
 * Works on ALL websites — not limited to specific platforms.
 * Detection: Fully client-side — no external server required.
 * Hybrid weights and decision thresholds are defined in config.js.
 */

// Runtime dependencies are loaded first by manifest.json. Keeping these
// aliases local makes the controller readable while values remain centralized.
const ATTR = "data-cad";
const MIN_LEN = CADConfig.detection.minimumTextLength;
const STORAGE_KEYS = CADConfig.storage;
const truncateTokens = DetectionPolicy.truncateTokens;
const isQuestion = DetectionPolicy.isQuestion;
const {
  shouldSkipElement,
  isVisuallyHidden,
  isPostCaptionNotComment,
  isUiLabelText,
  looksLikeNameLink,
  isInPrivateChatDock,
  isInFacebookProfileCard,
} = PageRules;
const detectionLog = DetectionLog.create();


let _enabled      = true;
let _panelMode    = false; // Expert Mode — enables the inline "why" trace panel on every result
let _observer     = null;
let _queue        = [];
let _running      = false;

// ── BOOT ──────────────────────────────────────────────────────────────────────
(async () => {
  // Load NaiveBayes model first — wait up to 3s for vocab.json to load
  // This prevents "Failed to fetch" errors on Reddit and other CSP-strict sites
  await NaiveBayes.load();
  await AlgorithmSelector.load();
  await CustomFilter.load();
  // Clear this tab's data on load — does not affect other tabs.
  detectionLog.reset({ clearBadge: false });
  const s  = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.enabled, r));
  _enabled = s[STORAGE_KEYS.enabled] !== false;
  const pm = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.panelMode, r));
  _panelMode = pm[STORAGE_KEYS.panelMode] === true;
  if (_enabled) startScanning();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.enabled] !== undefined) {
      _enabled = changes[STORAGE_KEYS.enabled].newValue;
      _enabled ? startScanning() : stopScanning();
    }
    if (changes[STORAGE_KEYS.panelMode] !== undefined) {
      _panelMode = changes[STORAGE_KEYS.panelMode].newValue === true;
      // Re-scan so already-blurred comments pick up (or drop) the info button
      if (_enabled) { fullReset(); startScanning(); }
    }
    if (changes[STORAGE_KEYS.mode] !== undefined) {
      AlgorithmSelector.load().then(() => {
        if (!_enabled) return;
        fullReset(); startScanning();
      });
    }
    if (changes[STORAGE_KEYS.blocklist] !== undefined) {
      CustomFilter.load().then(() => {
        if (!_enabled) return;
        // Re-scan immediately when keywords change
        fullReset(); startScanning();
      });
    }
    if (changes[STORAGE_KEYS.whitelist] !== undefined) {
      // Re-scan immediately when whitelist changes
      if (_enabled) { fullReset(); startScanning(); }
    }
  });
})().catch(error => CADDiagnostics.error("ContentController.boot", error));

// ── RESET ─────────────────────────────────────────────────────────────────────
function fullReset() {
  document.querySelectorAll(`[${ATTR}]`).forEach(el => {
    el.removeAttribute(ATTR);
    el.classList.remove("cad-blurred", "cad-revealed");
  });
  document.querySelectorAll(".cad-reveal-btn").forEach(b => b.remove());
  document.querySelectorAll(".cad-info-btn").forEach(b => b.remove());
  document.querySelectorAll(".cad-trace-panel").forEach(p => p.remove());
  document.querySelectorAll(".cad-overlay").forEach(o => o.remove());
  document.querySelectorAll(".cad-score-badge").forEach(b => b.remove());
  _queue = [];
  _running = false;
  detectionLog.reset();
}

// ── START / STOP ──────────────────────────────────────────────────────────────
function startScanning() {
  // Never scan private messaging sites — Data Privacy Act RA 10173
  if (PageRules.isPrivateLocation(window.location)) return;

  // Scan at delays to wait for comments to load
  // Only scan at 2 delays — enough for most sites to load
  CADConfig.timing.initialScanDelaysMs.forEach(ms => setTimeout(scanAll, ms));
  if (_observer) return;

  // MutationObserver — debounced, only fires after DOM settles.
  const RESCAN_DEBOUNCE_MS = CADConfig.timing.rescanDebounceMs;
  let _scanPending = false;
  _observer = new MutationObserver(() => {
    if (_scanPending) return;
    _scanPending = true;
    clearTimeout(_observer._t);
    _observer._t = setTimeout(() => {
      scanAll();
      _scanPending = false;
    }, RESCAN_DEBOUNCE_MS);
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // Scroll listener — only scan when user scrolls and stops
  let _scrollTimer = null;
  window.addEventListener("scroll", () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(scanAll, RESCAN_DEBOUNCE_MS);
  }, { passive: true });
}

function stopScanning() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  fullReset();
}


// ── Shadow DOM — recursively find and scan every OPEN shadow root on the
// page, instead of hardcoding a specific custom element name (previously
// just "shreddit-comment" for Reddit). Sites built with web components
// (Reddit's comment tree among them) render real content inside a shadow
// root that a plain TreeWalker on document.body can't see into at all —
// but which specific element hosts that shadow root changes whenever a
// site updates its frontend, which is exactly what seems to have broken
// this on Reddit. Walking for *any* shadowRoot instead of one named
// element is more work per scan but doesn't depend on guessing a tag name
// that can silently go stale again.
//
// Real limitation, not a bug: a CLOSED-mode shadow root (el.shadowRoot
// intentionally returns null for those) is invisible to any content
// script by browser design — there's no workaround from here if a site
// uses that mode.
function scanShadowRoots(root) {
  let el;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while ((el = walker.nextNode())) {
      if (el.shadowRoot) {
        collectByTreeWalker(el.shadowRoot);
        scanShadowRoots(el.shadowRoot); // shadow roots can nest further shadow roots
      }
    }
  } catch(e) {}
}

// ── SCAN — works on social media and websites with user content ───────────────
function scanAll() {
  if (!_enabled) return;
  if (PageRules.isPrivateLocation(window.location)) return; // Data Privacy Act RA 10173

  // Scan main document body
  collectByTreeWalker(document.body);
  scanShadowRoots(document.body);

  processQueue();
}

// ── Detects a byline/name link ("Angel Mae Garcia") vs. real comment text ──
// Short, every-word-Title-Case, and entirely wrapped in one <a> — the
// pattern for a commenter's name linking to their profile, on virtually
// every platform. A genuine comment is essentially never both of those
// things at once, so this stays low-risk for false rejections.
// ── TreeWalker — collects text from ANY website including shadow DOM ──────────
function collectByTreeWalker(root) {
  // Use ownerDocument for shadow roots, fallback to document
  const doc    = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent.trim();

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip already processed or pending
      if (parent.hasAttribute(ATTR)) return NodeFilter.FILTER_REJECT;
      try { if (parent.closest("[data-cad]")) return NodeFilter.FILTER_REJECT; } catch(e) {}
      // Skip our own injected UI (reveal/info buttons, trace panels) — these
      // are inserted as SIBLINGS of the scanned comment, not descendants, so
      // the [data-cad] check above doesn't reach them. Without this, the
      // panel's own text ("negation flips meaning", trace labels, etc.) gets
      // re-discovered as if it were a new comment and re-scanned forever.
      try { if (parent.closest("[data-cad-ui]")) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Skip non-content tags
      const tag = parent.tagName?.toLowerCase();
      if (["script","style","noscript","input","textarea",
           "select","button","code","pre","label","option"].includes(tag))
        return NodeFilter.FILTER_REJECT;

      // Skip comment-author name links — "Angel Mae Garcia" as a byline is
      // a profile link, not comment content. A real comment is essentially
      // never wrapped entirely in a single <a> with every word Title-Case.
      // Checked against the nearest ANCESTOR anchor's full text, not just
      // this text node — sites often split a name across inner spans
      // (e.g. <a><span>Kin</span> <span>Edrian Prudente</span></a>), so
      // requiring the direct parent to literally be <a> missed those.
      try {
        const nameAnchor = parent.closest("a");
        if (nameAnchor && looksLikeNameLink(nameAnchor.textContent.trim())) return NodeFilter.FILTER_REJECT;
      } catch(e) {}

      // Skip short interactive-control labels ("Like", "View more comments")
      if (isUiLabelText(text)) return NodeFilter.FILTER_REJECT;

      // Skip UI/navigation elements
      if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;

      // Skip screen-reader-only accessibility text ("Open menu for X
      // sponsored content") that has no distinguishing tag/role/class.
      try { if (isVisuallyHidden(parent)) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Skip a post's own caption text — only comments should be scanned
      // (real comments replying to the post still get scanned — see
      // isPostCaptionNotComment).
      try { if (isPostCaptionNotComment(parent)) return NodeFilter.FILTER_REJECT; } catch(e) {}

      // Always accept if it matches a custom blocklist keyword — bypass length/word filters
      if (CustomFilter.matches(text)) return NodeFilter.FILTER_ACCEPT;

      // Must be long enough to be meaningful
      if (text.length < MIN_LEN) return NodeFilter.FILTER_REJECT;

      // Must have at least 3 words — filters out titles and labels
      if (text.split(/\s+/).length < 3) return NodeFilter.FILTER_REJECT;

      // Skip pure numbers/symbols
      if (/^[\d\s\.,KkMm%\+\-\*\/\(\)]+$/.test(text))
        return NodeFilter.FILTER_REJECT;

      // Skip URLs
      if (/^(https?:\/\/|www\.|r\/|u\/)/.test(text.trim()))
        return NodeFilter.FILTER_REJECT;

      // Skip very short words (likely UI labels)
      if (text.trim().split(/\s+/).every(w => w.length <= 2))
        return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.hasAttribute(ATTR)) continue;
    queueEl(parent);
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────
function queueEl(el) {
  if (!el) return;
  // Skip if already processed or pending
  if (el.hasAttribute(ATTR)) return;
  // Skip if parent already processed
  if (el.closest && el.closest("[data-cad]")) return;
  // Never scan our own injected UI (reveal/info buttons, trace panels) —
  // see the matching check in collectByTreeWalker for why this is needed.
  if (el.closest && el.closest("[data-cad-ui]")) return;
  // Never scan the Messenger chat-dock popup — Data Privacy Act RA 10173
  if (isInPrivateChatDock(el)) return;
  // Never scan profile info cards (Intro, Friends, Contact info, etc.) —
  // relationship status, friend names, and mutual-friend counts aren't
  // comments, and shouldn't be scored or annotated like one.
  if (isInFacebookProfileCard(el)) return;
  // Never scan a comment-author byline link ("Angel Mae Garcia") — see
  // looksLikeNameLink() for why this pattern reliably means "name", not
  // comment content. Checked against the nearest ancestor anchor's full
  // text, same reasoning as the matching check in collectByTreeWalker.
  try {
    const nameAnchor = el.closest && el.closest("a");
    if (nameAnchor && looksLikeNameLink(nameAnchor.textContent.trim())) return;
  } catch(e) {}

  const text = (el.innerText || el.textContent || "").trim();
  // Never scan short interactive-control labels ("Like", "View more comments")
  if (isUiLabelText(text)) return;
  const isKeywordMatch = CustomFilter.matches(text);
  if (text.length < MIN_LEN && !isKeywordMatch) return;
  if (text.split(/\s+/).length < 2 && !isKeywordMatch) return;

  // Mark immediately as pending so it never gets queued twice
  el.setAttribute(ATTR, "pending");
  _queue.push({ el, text });
}

// ── Process Queue ─────────────────────────────────────────────────────────────
async function processQueue() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const batch = _queue.splice(0, CADConfig.limits.scanBatchSize);
    await Promise.all(batch.map(({ el, text }) => analyzeElement(el, text)));
  }
  _running = false;
}

// ── ANALYSE ───────────────────────────────────────────────────────────────────
async function analyzeElement(el, text) {
  if (!_enabled) return;

  // Always use chrome.storage directly — safeStorage was causing null returns
  // chrome is always available in content scripts injected by manifest
  try {

    // ── Step 1: Whitelist ───────────────────────────────────────────────────
    const whitelistKey = CADConfig.storage.whitelist;
    const wlRes     = await new Promise(r => chrome.storage.local.get(whitelistKey, r));
    const whitelist = wlRes[whitelistKey] || [];
    if (whitelist.length > 0) {
      const lower = text.toLowerCase();
      if (whitelist.some(w => w && lower.includes(w.toLowerCase()))) {
        el.setAttribute(ATTR, "safe");
        return;
      }
    }

    // ── Step 2: Custom keyword blocklist — always wins, even over questions ────
    if (CustomFilter.matches(text)) {
      el.setAttribute(ATTR, "aggressive");
      ResultDisplay.blur(el, 1.0, "custom_keyword");
      detectionLog.save(text, 1.0, true, "custom_keyword", 0);
      try { chrome.runtime.sendMessage({ type: CADConfig.messages.aggressiveFound }); } catch(e){}
      return;
    }

    // ── Step 3: Question check — only applies to algorithm scoring ──────────
    if (isQuestion(text)) {
      el.setAttribute(ATTR, "safe");
      return;
    }

    // ── Step 4: Algorithm scoring ────────────────────────────────────────────
    const t0          = Date.now();
    const mode        = AlgorithmSelector.get();
    const analyzedText = truncateTokens(text);
    const nbTrace   = NaiveBayes.scoreWithTrace(analyzedText);
    const nb        = nbTrace.ok ? nbTrace.prob : NaiveBayes.score(analyzedText);
    const vader     = VADER.analyze(analyzedText).aggression_score;
    const decision = DetectionPolicy.scoreForMode({
      mode,
      naiveBayesScore: nb,
      vaderScore: vader,
      useVaderOnly: nbTrace.ok && nbTrace.matched.length === 0,
      text: analyzedText,
    });
    const { score, isAggressive: isAgg } = decision;
    const ms    = Date.now() - t0;

    // Expert Mode — computes the NB/VADER trace for the inline "why" panel,
    // for BOTH verdicts (aggressive and safe), not just blurred comments.
    // Skipped entirely when panel mode is off.
    const trace = _panelMode ? {
      nbTrace:    NaiveBayes.scoreWithTrace(analyzedText),
      vaderTrace: VADER.analyzeWithTrace(analyzedText),
    } : null;

    if (isAgg) {
      el.setAttribute(ATTR, "aggressive");
      ResultDisplay.blur(el, score, mode, trace);
      try { chrome.runtime.sendMessage({ type: CADConfig.messages.aggressiveFound }); } catch(e){}
    } else {
      el.setAttribute(ATTR, "safe");
      if (trace) ResultDisplay.annotate(el, score, mode, trace);
    }

    detectionLog.save(text, score, isAgg, mode, ms);

  } catch(err) {
    CADDiagnostics.error("ContentController.analyzeElement", err, {
      mode: AlgorithmSelector.get(),
    });
    // Fail open so an analysis error never blocks or damages the host page.
    el.setAttribute(ATTR, "safe");
  }
}

// ── Save Result to storage ────────────────────────────────────────────────────
// ── Tab switch — push this tab's data to shared storage so popup refreshes ────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === CADConfig.messages.tabActivated) {
    detectionLog.publish();
  }
});
