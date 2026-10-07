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
const STORAGE_KEYS = CADConfig.storage;
const truncateTokens = DetectionPolicy.truncateTokens;
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
let _seenElements = new WeakSet();
let _initialScanTimers = [];
let _scrollTimer  = null;
let _scrollHandler = null;
let _pendingMutationRoots = new Set();
let _bootReady = false;
let _scanGeneration = 0;

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
  _bootReady = true;
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
  _scanGeneration += 1;
  PageProtection.reset();
  document.querySelectorAll(`[${ATTR}]`).forEach(el => {
    el.removeAttribute(ATTR);
    el.classList.remove(
      "cad-blurred", "cad-revealed",
      "cad-partial-blurred", "cad-partial-revealed",
    );
    el.removeAttribute("data-cad-partial-root");
  });
  // Restore the host page's original text nodes before re-scanning. Partial
  // custom-keyword blurs add only these marked wrappers, so removing them is
  // safe and does not disturb the page's own inline elements.
  const partialParents = new Set();
  document.querySelectorAll("[data-cad-partial-segment]").forEach(segment => {
    const parent = segment.parentNode;
    if (parent) partialParents.add(parent);
    segment.replaceWith(document.createTextNode(segment.textContent || ""));
  });
  partialParents.forEach(parent => parent.normalize?.());
  document.querySelectorAll(".cad-reveal-btn").forEach(b => b.remove());
  document.querySelectorAll(".cad-info-btn").forEach(b => b.remove());
  document.querySelectorAll(".cad-trace-panel").forEach(p => p.remove());
  document.querySelectorAll(".cad-overlay").forEach(o => o.remove());
  document.querySelectorAll(".cad-score-badge").forEach(b => b.remove());
  _queue = [];
  _running = false;
  _seenElements = new WeakSet();
  detectionLog.reset();
}

// ── START / STOP ──────────────────────────────────────────────────────────────
function startScanning() {
  // Never scan private messaging sites — Data Privacy Act RA 10173
  if (PageRules.isPrivateLocation(window.location)) return;

  // Scan at delays to wait for comments to load
  // Only scan at 2 delays — enough for most sites to load
  _initialScanTimers.forEach(clearTimeout);
  _initialScanTimers = CADConfig.timing.initialScanDelaysMs.map(ms => setTimeout(scanAll, ms));
  if (_observer) return;

  // MutationObserver — scan only newly-added subtrees after the DOM settles.
  // Facebook mutates unrelated navigation, counters, and accessibility nodes
  // continuously; re-walking document.body for every one of those mutations
  // made the scanner appear endless and repeatedly classified site chrome.
  const RESCAN_DEBOUNCE_MS = CADConfig.timing.rescanDebounceMs;
  _observer = new MutationObserver((records) => {
    mutationScanRoots(records).forEach(root => _pendingMutationRoots.add(root));
    if (_pendingMutationRoots.size === 0) return;

    clearTimeout(_observer._t);
    _observer._t = setTimeout(() => {
      const roots = Array.from(_pendingMutationRoots);
      _pendingMutationRoots.clear();
      roots.forEach(scanRoot);
      processQueue();
    }, RESCAN_DEBOUNCE_MS);
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  // Scroll listener — only scan when user scrolls and stops
  _scrollHandler = () => {
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(scanAll, RESCAN_DEBOUNCE_MS);
  };
  window.addEventListener("scroll", _scrollHandler, { passive: true });
}

function stopScanning() {
  _initialScanTimers.forEach(clearTimeout);
  _initialScanTimers = [];
  clearTimeout(_scrollTimer);
  _scrollTimer = null;
  _pendingMutationRoots.clear();
  if (_observer) {
    clearTimeout(_observer._t);
    _observer.disconnect();
    _observer = null;
  }
  if (_scrollHandler) {
    window.removeEventListener("scroll", _scrollHandler);
    _scrollHandler = null;
  }
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
    // When a newly-added custom element is itself the shadow host, a
    // TreeWalker starts below that host and would otherwise miss its root.
    if (root.closest?.("[data-cad-ui]")) return;
    if (root.shadowRoot) {
      collectByTreeWalker(root.shadowRoot);
      scanShadowRoots(root.shadowRoot);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while ((el = walker.nextNode())) {
      if (el.closest?.("[data-cad-ui]")) continue;
      if (el.shadowRoot) {
        collectByTreeWalker(el.shadowRoot);
        scanShadowRoots(el.shadowRoot); // shadow roots can nest further shadow roots
      }
    }
  } catch(e) {}
}

// ── SCAN — works on social media and websites with user content ───────────────
function scanAll() {
  PageProtection.syncLocation();
  if (!_enabled) return;
  if (PageRules.isPrivateLocation(window.location)) return; // Data Privacy Act RA 10173

  // Scan main document body
  scanRoot(document.body);

  processQueue();
}

function scanRoot(root) {
  PageProtection.syncLocation();
  if (!root || root.isConnected === false) return;
  try { if (root.closest && root.closest("[data-cad-ui]")) return; } catch(e) {}
  collectByTreeWalker(root);
  scanShadowRoots(root);
}

function mutationScanRoots(records) {
  const roots = new Set();
  for (const record of records || []) {
    for (const node of Array.from(record.addedNodes || [])) {
      let root = null;
      if (node.nodeType === Node.ELEMENT_NODE) root = node;
      else if (node.nodeType === Node.TEXT_NODE) root = node.parentElement;
      if (!root || root.isConnected === false) continue;
      try { if (root.closest && root.closest("[data-cad-ui]")) continue; } catch(e) {}
      roots.add(root);
    }
  }
  return roots;
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
      if (!text) return NodeFilter.FILTER_REJECT;

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

      // Always accept custom blocklist matches before the remaining generic
      // content filters, preserving their explicit user-defined precedence.
      if (CustomFilter.matches(text)) return NodeFilter.FILTER_ACCEPT;

      // Skip pure numbers/symbols
      if (/^[\d\s\.,KkMm%\+\-\*\/\(\)]+$/.test(text))
        return NodeFilter.FILTER_REJECT;

      // Skip URLs
      if (/^(https?:\/\/|www\.|r\/|u\/)/.test(text.trim()))
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
  // Keep the same DOM node from being counted again if a host framework
  // rewrites or strips extension-owned attributes during a re-render.
  if (_seenElements.has(el)) return;
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
  if (!text) return;
  // Never scan short interactive-control labels ("Like", "View more comments")
  if (isUiLabelText(text)) return;

  // Mark immediately as pending so it never gets queued twice
  _seenElements.add(el);
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
  const generation = _scanGeneration;
  const pageUrl = window.location.href;
  if (!_enabled) return;

  // Always use chrome.storage directly — safeStorage was causing null returns
  // chrome is always available in content scripts injected by manifest
  try {

    // Read the whitelist before applying blocklist precedence so a mixed
    // comment can remain aggressive while its exact whitelisted ranges stay
    // visible (for example: blurred "you are ugly" + visible "super").
    const whitelistKey = CADConfig.storage.whitelist;
    const wlRes     = await new Promise(r => chrome.storage.local.get(whitelistKey, r));
    const whitelist = wlRes[whitelistKey] || [];
    if (!_enabled || generation !== _scanGeneration || pageUrl !== window.location.href) return;

    // ── Step 1: Custom keyword blocklist — highest user-defined priority ────
    // A blocked term still determines the verdict, but any separate whitelist
    // word or phrase is passed to the renderer and kept readable.
    if (CustomFilter.matches(text)) {
      el.setAttribute(ATTR, "aggressive");
      ResultDisplay.blur(el, 1.0, "custom_keyword", null, whitelist);
      PageProtection.record(el);
      detectionLog.save(text, 1.0, true, "custom_keyword", 0);
      try { chrome.runtime.sendMessage({ type: CADConfig.messages.aggressiveFound }); } catch(e){}
      return;
    }

    // ── Step 2: Whitelist ───────────────────────────────────────────────────
    if (whitelist.length > 0) {
      const lower = text.toLowerCase();
      if (whitelist.some(w => w && lower.includes(w.toLowerCase()))) {
        el.setAttribute(ATTR, "safe");
        return;
      }
    }

    // ── Step 3: Algorithm scoring ────────────────────────────────────────────
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
      PageProtection.record(el);
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
  if (msg.type === CADConfig.messages.clearDetections) {
    detectionLog.reset();
    return;
  }
  if (msg.type === CADConfig.messages.tabActivated) {
    if (PageRules.isPrivateLocation(window.location)) {
      if (_bootReady) stopScanning();
      return;
    }
    detectionLog.publish();
    // A tab can remain open while the extension starts or while another tab
    // is active. Re-arm its observer and scan immediately when the user
    // returns instead of requiring a manual page reload.
    if (_bootReady && _enabled) {
      startScanning();
      scanAll();
    }
  }
});
