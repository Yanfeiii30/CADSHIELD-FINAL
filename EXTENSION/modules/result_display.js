/**
 * modules/result_display.js
 * Blur/reveal toggle — eye button stays, user can re-blur anytime.
 * @requires CADConfig
 */

const ResultDisplay = (() => {

  const NB_WEIGHT = CADConfig.detection.hybridNaiveBayesWeight;
  const VADER_WEIGHT = CADConfig.detection.hybridVaderWeight;
  const NB_WEIGHT_PERCENT = NB_WEIGHT * 100;
  const VADER_WEIGHT_PERCENT = VADER_WEIGHT * 100;

  const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_SLASH = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  const INFO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="19" x2="4" y2="11"/><line x1="12" y1="19" x2="12" y2="5"/><line x1="20" y1="19" x2="20" y2="14"/></svg>`;

  function _esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function _tipRow(label, value) {
    return `<div class="cad-word-tooltip-row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;
  }

  // ── Hover card HTML for a single NB word chip — the exact Laplace-
  // smoothed likelihood computation behind that word's push value, broken
  // into clean labeled rows instead of one long plain-text native tooltip,
  // so the "how was this computed" answer is right on the word. Empty
  // string if the vocab.json loaded doesn't carry the raw counts (older
  // cached version).
  function _nbWordTooltip(m, nb) {
    if (nb.totalWords0 == null) return "";
    const tw0 = nb.totalWords0, tw1 = nb.totalWords1, vsz = nb.vocabSize;
    const c0 = m.rawCount0 ?? 0, c1 = m.rawCount1 ?? 0;
    const rows =
      _tipRow("seen in aggressive comments", `${c1.toLocaleString()}&times;`) +
      _tipRow("seen in safe comments", `${c0.toLocaleString()}&times;`) +
      _tipRow("ll(aggressive)", `log((${c1}+1)/(${tw1.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl1.toFixed(3)}`) +
      _tipRow("ll(safe)", `log((${c0}+1)/(${tw0.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl0.toFixed(3)}`);
    const dampenNote = m.wasDampened
      ? `<div class="cad-word-tooltip-note">Negated word — dampened 75% toward the average of both, so one rare "not_X" phrase can't single-handedly flip the verdict.</div>`
      : "";
    const pushColor = m.pushToAggressive >= 0 ? "#ff8a80" : "#7ee6a8";
    const final = `<div class="cad-word-tooltip-final">push = ll(agg) &minus; ll(safe) = ${m.ll1.toFixed(3)} &minus; (${m.ll0.toFixed(3)}) = <span style="color:${pushColor}">${m.pushToAggressive >= 0 ? "+" : ""}${m.pushToAggressive.toFixed(3)}</span></div>`;
    return `<div class="cad-word-tooltip-title">"${_esc(m.token)}"</div>${rows}${dampenNote}${final}`;
  }

  // ── Hover card HTML for a single VADER word chip — base lexicon value,
  // which adjustments applied, and the resulting final valence.
  function _vaderWordTooltip(w) {
    let rows = _tipRow("base lexicon valence", `${w.baseValence >= 0 ? "+" : ""}${w.baseValence.toFixed(2)}`);
    if (w.negated)     rows += _tipRow("negation applied", "&times; &minus;0.74");
    if (w.boosted)     rows += _tipRow("booster applied", `nearby intensifier`);
    if (w.capsBoosted) rows += _tipRow("ALL CAPS emphasis", "applied");
    const valColor = w.valence < 0 ? "#ff8a80" : "#7ee6a8";
    const final = `<div class="cad-word-tooltip-final">final valence = <span style="color:${valColor}">${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(3)}</span></div>`;
    return `<div class="cad-word-tooltip-title">"${_esc(w.word)}"</div>${rows}${final}`;
  }

  // Display-only filter — words that carry a statistical push but read as
  // noise if highlighted (pronouns, auxiliary verbs, articles, intensifiers).
  const FUNCTION_WORDS = new Set([
    "i","im","ive","id","my","me","mine","myself",
    "you","youre","your","yours","yourself",
    "he","she","it","we","they","them","their","this","that","these","those",
    "am","is","are","was","were","be","been","being",
    "a","an","the","and","or","but","so","if","as",
    "of","to","in","on","at","for","with","by","from","because",
    "do","does","did","have","has","had",
    "right","now","just","very","really","literally","incredibly",
    "completely","totally",
  ]);

  // Words that flip a following word's meaning — mirrors naive_bayes.js's
  // NEGATION_WORDS / vader.js's NEGATE (kept as literal surface forms here
  // since these patterns are matched directly against the on-page text,
  // contractions and all, rather than a stripped/normalized token).
  const NEGATION_TRIGGER_WORDS = new Set([
    "not", "no", "never", "neither", "nor", "without",
    "barely", "hardly", "scarcely",
    "don't", "dont", "can't", "cant", "won't", "wont",
    "wouldn't", "wouldnt", "shouldn't", "shouldnt",
    "isn't", "isnt", "aren't", "arent", "doesn't", "doesnt",
    "didn't", "didnt", "haven't", "havent", "hasn't", "hasnt",
    "hadn't", "hadnt",
  ]);
  const NEGATION_TRIGGER_WINDOW = 3;

  // Finds the actual negation word(s) in the source text that precede a
  // flipped target word (within the same window naive_bayes.js/vader.js use
  // to tag/negate it), so "not" can be highlighted alongside "beautiful"
  // instead of leaving the negation itself uncolored.
  function _findNegationTriggers(text, negWords) {
    if (!text || negWords.size === 0) return new Set();
    const tokens = text.match(/[a-zA-Z']+/g) || [];
    const triggers = new Set();

    tokens.forEach((tok, i) => {
      const norm = tok.toLowerCase();
      if (!NEGATION_TRIGGER_WORDS.has(norm)) return;
      for (let j = i + 1; j <= Math.min(tokens.length - 1, i + NEGATION_TRIGGER_WINDOW); j++) {
        if (negWords.has(tokens[j].toLowerCase())) { triggers.add(tok); break; }
      }
    });

    return triggers;
  }

  // ── Signal words to highlight, derived from the bag-of-words trace data.
  function _buildHighlightEntries(trace, text) {
    const nb    = trace.nbTrace    || {};
    const vader = trace.vaderTrace || {};

    const negWords = new Set();
    const nbWords  = new Set();
    (nb.matched || []).forEach(m => {
      if (m.isSarcasmCue || m.pushToAggressive <= 0) return;
      if (FUNCTION_WORDS.has(m.token.replace(/^not_/, ""))) return;
      if (m.token.startsWith("not_")) { negWords.add(m.token.slice(4)); return; }
      // NB's sparse, class-imbalanced word counts can lean "aggressive" on a
      // rare word purely from noise (e.g. "beautiful" appearing a handful of
      // times in each class, normalized against a much smaller aggressive-
      // class word total) even though it's a genuinely positive word. Don't
      // paint it as an aggression signal when VADER's lexicon says otherwise
      // and it isn't negated here.
      if (typeof VADER !== "undefined" && VADER.isPositiveLexiconWord(m.token)) return;
      nbWords.add(m.token);
    });

    // Words VADER already flipped via negation (e.g. "not beautiful") belong
    // in the same "negation flips meaning" bucket as NB's not_X tokens, even
    // when NB's own vocabulary never separately tagged them — checked before
    // the vaderWords pass below so a word doesn't end up double-classified.
    (vader.matchedWords || []).forEach(w => {
      if (!FUNCTION_WORDS.has(w.word) && w.negated) negWords.add(w.word);
    });

    const vaderWords = new Set();
    (vader.matchedWords || []).forEach(w => {
      if (FUNCTION_WORDS.has(w.word)) return;
      if (w.valence < 0 && !negWords.has(w.word) && !nbWords.has(w.word)) vaderWords.add(w.word);
    });

    const negTriggers = _findNegationTriggers(text, negWords);

    const markers = vader.matchedMarkers || [];

    const entries = [];
    markers.forEach(m    => entries.push({ pattern: m, cls: "cad-hl-sarcasm" }));
    negWords.forEach(w    => entries.push({ pattern: w, cls: "cad-hl-neg" }));
    negTriggers.forEach(w => entries.push({ pattern: w, cls: "cad-hl-neg" }));
    nbWords.forEach(w    => entries.push({ pattern: w, cls: "cad-hl-nb" }));
    vaderWords.forEach(w => entries.push({ pattern: w, cls: "cad-hl-vader" }));

    entries.sort((a, b) => b.pattern.length - a.pattern.length);
    return entries;
  }

  // ── Marks the real comment element in place, walking its own text nodes
  // rather than rebuilding it, so inline elements (emoji, mentions) are untouched.
  function _applyInPlaceHighlight(el, trace) {
    const entries = _buildHighlightEntries(trace, el.textContent);
    const used = new Set();
    if (entries.length === 0) return used;

    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const alt = entries.map(e => escRe(e.pattern)).join("|");
    const re  = new RegExp(`\\b(${alt})\\b`, "gi");

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    textNodes.forEach(node => {
      const nodeText = node.textContent;
      re.lastIndex = 0;
      if (!re.test(nodeText)) return;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIndex = 0, match;
      while ((match = re.exec(nodeText)) !== null) {
        if (match.index > lastIndex) frag.appendChild(document.createTextNode(nodeText.slice(lastIndex, match.index)));
        const hitLower = match[0].toLowerCase();
        const found = entries.find(e => e.pattern.toLowerCase() === hitLower) || entries[0];
        used.add(found.cls);
        const mark = document.createElement("mark");
        mark.className = found.cls;
        mark.textContent = match[0];
        frag.appendChild(mark);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < nodeText.length) frag.appendChild(document.createTextNode(nodeText.slice(lastIndex)));

      try { node.replaceWith(frag); } catch(e) {}
    });

    return used;
  }

  const LEGEND = {
    "cad-hl-neg":     "negation flips meaning",
    "cad-hl-nb":      "Naive Bayes signal word",
    "cad-hl-vader":   "VADER negative word",
    "cad-hl-sarcasm": "sarcasm marker",
  };

  // ── Expert Mode — inline "why was this blurred / left alone" breakdown ────
  // Mirrors the popup's Steps tab, anchored to the actual comment on the page.
  // isAgg is passed in by the caller (content.js) rather than recomputed
  // here, so this stays correct even if the modes' thresholds ever diverge
  // again in the future.
  function _buildTracePanel(score, mode, trace, usedClasses, isAgg) {
    const nb    = trace.nbTrace    || {};
    const vader = trace.vaderTrace || {};
    const nbPct     = ((nb.prob ?? 0) * 100).toFixed(1);
    const vaderPct  = ((vader.aggression_score ?? 0) * 100).toFixed(1);
    const hybridPct = (score * 100).toFixed(1);

    const legendHtml = [...usedClasses].map(cls =>
      `<span class="cad-legend-item"><mark class="${cls}">&nbsp;&nbsp;</mark> ${LEGEND[cls]}</span>`
    ).join("");

    // Dedupe by token (a repeated word in the text produces one matched
    // entry per occurrence) and drop bare function words — same noise
    // filter used for the in-text highlighting, so the two stay consistent.
    const seenNb = new Set();
    const nbList = (nb.matched || []).filter(m => {
      const base = m.token.replace(/^not_/, "");
      if (FUNCTION_WORDS.has(base) || seenNb.has(m.token)) return false;
      seenNb.add(m.token);
      return true;
    });
    const words = nbList.slice(0, 6).map(m => {
      const sign = m.pushToAggressive >= 0 ? "+" : "";
      const negTag = m.token.startsWith("not_") ? ` <span class="cad-neg-tag">(negation)</span>` : "";
      const tip = _nbWordTooltip(m, nb);
      // Always-visible calc line (not just on hover) — the raw ll(aggressive)
      // and ll(safe) that subtract into the push value shown above them.
      const calcLine = (m.ll0 != null && m.ll1 != null)
        ? `<div class="cad-word-calc">agg ${m.ll1.toFixed(2)} &minus; safe ${m.ll0.toFixed(2)}</div>`
        : "";
      const pushCls = m.pushToAggressive >= 0 ? "agg" : "safe";
      const tooltipHtml = tip ? `<div class="cad-word-tooltip">${tip}</div>` : "";
      return `<li><code>${_esc(m.token)}</code>${negTag}<span class="cad-push ${pushCls}">${sign}${m.pushToAggressive.toFixed(2)}</span>${calcLine}${tooltipHtml}</li>`;
    }).join("");
    const wordsHtml = words || `<li class="cad-none">No strong signal words matched.</li>`;

    const seenVader = new Set();
    const vaderList = (vader.matchedWords || []).filter(w => {
      if (FUNCTION_WORDS.has(w.word) || seenVader.has(w.word)) return false;
      seenVader.add(w.word);
      return true;
    });
    const vaderWordsList = vaderList.slice(0, 6).map(w => {
      const flags = [w.negated && "negated", w.boosted && "boosted", w.capsBoosted && "CAPS"].filter(Boolean).join(", ");
      const tip = _vaderWordTooltip(w);
      // Always-visible calc line — base lexicon value the adjustments (shown
      // via the (negated/boosted/CAPS) tag already on this chip) started from.
      const calcLine = `<div class="cad-word-calc">base ${w.baseValence >= 0 ? "+" : ""}${w.baseValence.toFixed(1)} &rarr; ${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(2)}</div>`;
      const pushCls = w.valence < 0 ? "agg" : "safe"; // opposite of NB's sign convention above — negative valence = leans aggressive
      const tooltipHtml = `<div class="cad-word-tooltip">${tip}</div>`;
      return `<li><code>${_esc(w.word)}</code><span class="cad-push ${pushCls}">${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(1)}</span>${flags ? ` <span class="cad-neg-tag">(${flags})</span>` : ""}${calcLine}${tooltipHtml}</li>`;
    }).join("");
    const vaderWordsHtml = vaderWordsList || `<li class="cad-none">No lexicon words matched — score came from punctuation/caps only.</li>`;

    let sarcasmLine = "";
    if (vader.sarcasmApplied) {
      const markerText = (vader.matchedMarkers || []).map(m => `"${_esc(m)}"`).join(", ") || "a sarcasm pattern";
      sarcasmLine = `<div class="cad-trace-note">Sarcasm cue detected (${markerText}) — VADER's raw tone was flipped/adjusted before scoring.</div>`;
    }

    const modeLine = mode === CADConfig.modes.NAIVE_BAYES ? "Naive Bayes only"
                    : mode === CADConfig.modes.VADER ? "VADER only"
                    : `Hybrid — ${NB_WEIGHT}×NB + ${VADER_WEIGHT}×VADER`;
    const verdict = isAgg ? "AGGRESSIVE" : "SAFE";

    // Plain-language summary line, built from whichever signals actually fired
    let summary;
    if (isAgg) {
      const reasons = [];
      if ((nb.matched || []).some(m => m.token.startsWith("not_") && m.pushToAggressive > 0)) reasons.push("a negated phrase");
      if ((nb.matched || []).some(m => !m.token.startsWith("not_") && !m.isSarcasmCue && m.pushToAggressive > 0)) reasons.push("aggressive-leaning words");
      if (vader.sarcasmApplied) reasons.push("a detected sarcasm cue");
      if (vader.compound < -0.3) reasons.push("an overall negative tone");
      summary = reasons.length
        ? `Flagged mainly because of ${reasons.join(", ")}.`
        : `Flagged by the combined hybrid score, with no single dominant signal.`;
    } else {
      const safeReasons = [];
      if ((nb.matched || []).some(m => m.token.startsWith("not_") && m.pushToAggressive < 0)) safeReasons.push("a negation that neutralized an insult");
      if (!(nb.matched || []).some(m => !m.isSarcasmCue && m.pushToAggressive > 0)) safeReasons.push("no aggressive-leaning words in the trained vocabulary");
      if (!vader.sarcasmApplied && vader.compound >= -0.3) safeReasons.push("a neutral-to-positive tone");
      summary = safeReasons.length
        ? `Scored safe — ${safeReasons.join(", ")}.`
        : `Scored safe — the combined score stayed under the ${mode === "hybrid" ? "hybrid " : ""}threshold.`;
    }

    // ── Plain-language computation walkthrough, PLUS (in the collapsible
    // "Show the calculation" section below) the full academic derivation —
    // class prior from real training-set counts, and every matched word's
    // raw count traced back through the actual Laplace-smoothing formula.
    // Expert Mode only (this whole panel only exists when Expert Mode is on).
    const modeIsHybrid = mode !== CADConfig.modes.NAIVE_BAYES && mode !== CADConfig.modes.VADER;
    const decisionThresholdPercent = CADConfig.thresholdForMode(mode) * 100;

    // Full precision throughout — no rounding to 1-2 decimals here, since
    // this block exists specifically so the exact computation can be
    // verified (e.g. for a thesis defense) rather than skimmed.
    const nbBaseSafe = (nb.logPrior0 ?? 0).toFixed(6);
    const nbBaseAgg  = (nb.logPrior1 ?? 0).toFixed(6);
    const nbTotSafe  = (nb.score0    ?? 0).toFixed(6);
    const nbTotAgg   = (nb.score1    ?? 0).toFixed(6);
    const vSum       = (vader.valenceSum ?? 0).toFixed(6);
    const vCompound  = (vader.compound   ?? 0).toFixed(6);
    const vNegative  = (vader.compound ?? 0) < 0;

    const nbPctFull     = ((nb.prob ?? 0) * 100).toFixed(6);
    const vaderPctFull  = ((vader.aggression_score ?? 0) * 100).toFixed(6);
    const hybridPctFull = (score * 100).toFixed(6);

    // Softmax intermediate terms — shows exactly how the two log-space
    // totals above become the single NB percentage.
    const m  = Math.max(nb.score0 ?? 0, nb.score1 ?? 0);
    const e0 = Math.exp((nb.score0 ?? 0) - m);
    const e1 = Math.exp((nb.score1 ?? 0) - m);

    const step3 = modeIsHybrid
      ? `STEP 3 — Hybrid: Combine &amp; Decide\n\n` +
        `3a. Why ${NB_WEIGHT_PERCENT}% / ${VADER_WEIGHT_PERCENT}%? (from held-out evaluation, 12,980 test comments):\n` +
        `      Naive Bayes alone — F1 81.19%  (Precision 85.13%, Recall 77.60%)\n` +
        `      VADER alone       — F1 57.91%  (Precision 57.40%, Recall 58.43%)\n` +
        `      Naive Bayes is the stronger individual model, so it carries the\n` +
        `      majority weight (w1 = ${NB_WEIGHT}); VADER adds a smaller correction\n` +
        `      (w2 = ${VADER_WEIGHT}). The blend scores F1 81.42% / Precision 88.82% —\n` +
        `      better than either algorithm alone.\n\n` +
        `3b. Weighted combination:\n` +
        `      R_score = (w1 &times; NB) + (w2 &times; VADER)\n` +
        `              = (${NB_WEIGHT_PERCENT}% &times; ${nbPctFull}%) + (${VADER_WEIGHT_PERCENT}% &times; ${vaderPctFull}%)\n` +
        `              = ${hybridPctFull}%\n\n` +
        `3c. Decision:\n` +
        `      ${hybridPctFull}% ${isAgg ? "&ge;" : "<"} ${decisionThresholdPercent}% (threshold) &rarr; ${verdict}`
      : `STEP 3 — Decision\n\n` +
        `      ${mode === "nb" ? "Naive Bayes" : "VADER"} score = ${hybridPctFull}%\n` +
        `      ${hybridPctFull}% ${isAgg ? "&ge;" : "<"} ${decisionThresholdPercent}% (threshold) &rarr; ${verdict}`;

    const mathBlock =
      `STEP 1 — Naive Bayes\n\n` +
      `1a. Baseline score for each side (class prior, from real training-set counts):\n` +
      `      safe:       log(P) = ${nbBaseSafe}\n` +
      `      aggressive: log(P) = ${nbBaseAgg}\n\n` +
      `1b. Add every matched word's log-likelihood (Laplace-smoothed) on top of the baseline:\n` +
      `      safe total:       ${nbTotSafe}\n` +
      `      aggressive total: ${nbTotAgg}\n\n` +
      `1c. Convert both totals into one probability (softmax):\n` +
      `      P(aggressive) = e^(aggressive total) / (e^(safe total) + e^(aggressive total))\n` +
      `                    = e^(${nbTotAgg} &minus; (${(m).toFixed(6)})) / (e^(${nbTotSafe} &minus; (${(m).toFixed(6)})) + e^(${nbTotAgg} &minus; (${(m).toFixed(6)})))\n` +
      `                    = ${e1.toFixed(6)} / (${e0.toFixed(6)} + ${e1.toFixed(6)})\n` +
      `                    = ${nbPctFull}%\n\n` +
      `STEP 2 — VADER\n\n` +
      `2a. Add every matched word's emotion score (positive adds, negative subtracts):\n` +
      `      total = ${vSum}\n\n` +
      `2b. Smooth onto a &minus;1 to +1 scale (&alpha; = ${vader.alpha ?? 15}, scaled down from 15 for short comments):\n` +
      `      compound = total / &radic;(total&sup2; + &alpha;)\n` +
      `               = ${vCompound}\n\n` +
      `2c. Only a negative compound counts as aggression:\n` +
      `      aggression_score = max(0, &minus;compound)\n` +
      `                       = ${vNegative ? vaderPctFull : "0.000000"}%\n\n` +
      step3;

    // ── Full academic derivation — class prior from real training counts,
    // and every matched word's raw count traced through the actual Laplace
    // smoothing formula. Only buildable when naive_bayes.js's trace carries
    // the extra fields (class_counts/total_words in vocab.json) — falls
    // back to nothing if an older vocab.json is loaded.
    let fullCalcHtml = "";
    if (nb.classCounts0 != null && nb.totalWords0 != null) {
      const c0 = nb.classCounts0, c1 = nb.classCounts1;
      const totalDocs = c0 + c1;
      const priorLines =
        `Class prior (same for every comment — from the training set):\n` +
        `  ${c0.toLocaleString()} safe comments, ${c1.toLocaleString()} aggressive comments (${totalDocs.toLocaleString()} total)\n` +
        `  log_prior(safe)       = log(${c0.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${nbBaseSafe}\n` +
        `  log_prior(aggressive) = log(${c1.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${nbBaseAgg}`;

      const tw0 = nb.totalWords0, tw1 = nb.totalWords1, vsz = nb.vocabSize;
      const wordLines = nbList.slice(0, 6).map(m => {
        const lines = [
          `${m.token} — appeared ${(m.rawCount0 ?? 0).toLocaleString()}x among ${tw0.toLocaleString()} safe words, ` +
          `${(m.rawCount1 ?? 0).toLocaleString()}x among ${tw1.toLocaleString()} aggressive words:`,
          `  ll(safe)       = log((${m.rawCount0}+1)/(${tw0.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl0.toFixed(2)}`,
          `  ll(aggressive) = log((${m.rawCount1}+1)/(${tw1.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl1.toFixed(2)}`,
        ];
        if (m.wasDampened) {
          lines.push(`  &rarr; negated, so dampened toward their average: ll(safe)=${m.ll0.toFixed(2)}  ll(aggressive)=${m.ll1.toFixed(2)}`);
        }
        return lines.join("\n");
      }).join("\n\n");

      fullCalcHtml = `
        <details class="calc">
          <summary>Show Naive Bayes' full per-word derivation (real training counts, for your defense)</summary>
          <div class="calc-body">
            <pre class="cad-math-block">${priorLines}\n\n${wordLines || "(no words matched the trained vocabulary)"}</pre>
          </div>
        </details>`;
    }

    // ── Same idea, for VADER — every matched word's base lexicon value,
    // which adjustments applied (negation/booster/CAPS), and its final
    // valence. Independent of the NB vocab-version guard above.
    let vaderCalcHtml = "";
    if (vaderList.length) {
      const vaderWordLines = vaderList.slice(0, 6).map(w => {
        const lines = [`${w.word} — base lexicon valence = ${w.baseValence >= 0 ? "+" : ""}${w.baseValence.toFixed(2)}`];
        if (w.negated)     lines.push(`  &rarr; negated (negation word 1-3 tokens before it) &times; &minus;0.74`);
        if (w.boosted)     lines.push(`  &rarr; boosted by a nearby intensifier ("very", "so", etc.)`);
        if (w.capsBoosted) lines.push(`  &rarr; ALL CAPS emphasis applied`);
        lines.push(`  final valence = ${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(4)}`);
        return lines.join("\n");
      }).join("\n\n");

      vaderCalcHtml = `
        <details class="calc">
          <summary>Show VADER's full per-word derivation</summary>
          <div class="calc-body">
            <pre class="cad-math-block">${vaderWordLines}</pre>
          </div>
        </details>`;
    }

    return `
      ${legendHtml ? `<div class="cad-legend">${legendHtml}</div>` : ""}
      <div class="cad-trace-summary">${_esc(summary)}</div>
      <div class="cad-trace-step">
        <span class="cad-trace-label">1 &middot; Naive Bayes</span>
        <span class="cad-trace-sublabel">(+ leans aggressive, &minus; leans safe)</span>
        <ul class="cad-trace-words">${wordsHtml}</ul>
        <span class="cad-trace-val">${nbPct}% aggressive</span>
      </div>
      <div class="cad-trace-step">
        <span class="cad-trace-label">2 &middot; VADER</span>
        <span class="cad-trace-sublabel">(+ leans safe, &minus; leans aggressive &mdash; opposite of NB above)</span>
        <ul class="cad-trace-words">${vaderWordsHtml}</ul>
        <span class="cad-trace-detail">compound ${vader.compound ?? 0}</span>
        ${sarcasmLine}
        <span class="cad-trace-val">${vaderPct}% aggressive</span>
      </div>
      <div class="cad-trace-step cad-trace-final">
        <span class="cad-trace-label">3 &middot; ${_esc(modeLine)}</span>
        <span class="cad-trace-val cad-trace-verdict">${hybridPct}% &rarr; ${verdict}</span>
      </div>
      <div class="cad-trace-step cad-trace-math">
        <span class="cad-trace-label">How the numbers above were calculated</span>
        <pre class="cad-math-block">${mathBlock}</pre>
        ${fullCalcHtml}
        ${vaderCalcHtml}
      </div>
    `;
  }

  function _addOverlay(el) {
    if (el.querySelector(".cad-overlay")) return;
    const overlay = document.createElement("span");
    overlay.className = "cad-overlay";
    // Mid-gray fill + colored border so it reads clearly in both light and dark mode.
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(120, 120, 120, 0.55);
      border: 1.5px solid rgba(231, 76, 60, 0.85);
      box-sizing: border-box;
      border-radius: 3px;
      z-index: 9999;
      pointer-events: none;
    `;
    el.style.position = "relative";
    el.appendChild(overlay);
  }

  function _toggle(el, btn) {
    if (el.classList.contains("cad-blurred")) {
      // Currently blurred → reveal
      el.classList.remove("cad-blurred");
      el.classList.add("cad-revealed");
      const overlay = el.querySelector(".cad-overlay");
      if (overlay) overlay.remove();
      if (btn) { btn.innerHTML = EYE_SLASH; btn.title = "Click to blur again"; }
    } else {
      // Currently revealed → re-blur
      el.classList.remove("cad-revealed");
      el.classList.add("cad-blurred");
      _addOverlay(el);
      if (btn) { btn.innerHTML = EYE_OPEN; btn.title = "Click to reveal"; }
    }
  }

  // ── Builds the info button + trace panel pair shared by blur() (aggressive,
  // blurred comments) and annotate() (safe comments left visible) ──────────
  function _createInfoButton(el, score, mode, trace, isAgg, title) {
    // In-text word highlighting only for aggressive/blurred comments — a
    // safe comment's text stays untouched on the page; the info button and
    // panel still explain the score, just without marking up the comment.
    const usedClasses = isAgg ? _applyInPlaceHighlight(el, trace) : new Set();

    const infoBtn = document.createElement("button");
    infoBtn.className = "cad-info-btn";
    infoBtn.innerHTML = INFO_ICON;
    infoBtn.title = title;
    // Marks this as our own injected UI, not scannable page content — it's
    // inserted as a SIBLING of the scanned comment (not a descendant), so
    // the [data-cad] check on the comment itself doesn't cover it. Without
    // this, content.js's scanner re-discovers the panel's own text
    // ("negation flips meaning", "3 · Hybrid — ...") as if it were a new
    // comment and re-scans it, inflating the scanned/detection counts.
    infoBtn.setAttribute("data-cad-ui", "1");

    const panel = document.createElement("div");
    panel.className = "cad-trace-panel";
    panel.setAttribute("data-cad-ui", "1");
    panel.innerHTML = _buildTracePanel(score, mode, trace, usedClasses, isAgg);
    panel.style.display = "none";

    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = panel.style.display !== "none";
      panel.style.display = isOpen ? "none" : "block";
      infoBtn.classList.toggle("cad-info-active", !isOpen);
    });

    return { infoBtn, panel };
  }

  function blur(el, score, mode, trace) {
    if (el.classList.contains("cad-blurred")) return;

    el.classList.add("cad-blurred");
    _addOverlay(el);

    // Remove any stale buttons/panel from a previous run
    let sib = el.nextElementSibling;
    while (sib && (sib.classList.contains("cad-reveal-btn") ||
                   sib.classList.contains("cad-info-btn") ||
                   sib.classList.contains("cad-trace-panel"))) {
      const toRemove = sib;
      sib = sib.nextElementSibling;
      toRemove.remove();
    }

    // Eye icon button — persists, toggles blur on/off. Only this button
    // (not the whole comment) triggers reveal, to avoid accidental clicks.
    const btn     = document.createElement("button");
    btn.className = "cad-reveal-btn";
    btn.innerHTML = EYE_OPEN;
    btn.title     = "Click to reveal";
    btn.setAttribute("data-cad-ui", "1"); // our own UI — never re-scan it, see _createInfoButton

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      _toggle(el, btn);
    });

    try {
      el.insertAdjacentElement("afterend", btn);
    } catch(e) {
      if (el.parentNode) el.parentNode.insertBefore(btn, el.nextSibling);
    }

    // Info button + inline trace panel — only when Expert Mode computed a
    // trace (plain blocklist hits have no NB/VADER breakdown to show).
    if (trace) {
      const { infoBtn, panel } = _createInfoButton(el, score, mode, trace, true, "Show why this was blurred");
      try {
        btn.insertAdjacentElement("afterend", infoBtn);
        infoBtn.insertAdjacentElement("afterend", panel);
      } catch(e) {}
    }
  }

  function reveal(el) {
    el.classList.remove("cad-blurred");
    el.classList.add("cad-revealed");
    const overlay = el.querySelector(".cad-overlay");
    if (overlay) overlay.remove();
    setTimeout(() => el.classList.remove("cad-revealed"), 3000);
  }

  // ── Expert Mode on a SAFE comment — no blur, just an info button so you
  // can inspect why the algorithms didn't flag it. ──────────────────────────
  function annotate(el, score, mode, trace) {
    // Remove any stale info button/panel from a previous run (e.g. re-scan
    // after switching algorithm mode).
    let sib = el.nextElementSibling;
    while (sib && (sib.classList.contains("cad-info-btn") ||
                   sib.classList.contains("cad-trace-panel"))) {
      const toRemove = sib;
      sib = sib.nextElementSibling;
      toRemove.remove();
    }
    if (!trace) return;

    const { infoBtn, panel } = _createInfoButton(el, score, mode, trace, false, "Show why this was left alone");
    infoBtn.classList.add("cad-info-safe");
    try {
      el.insertAdjacentElement("afterend", infoBtn);
      infoBtn.insertAdjacentElement("afterend", panel);
    } catch(e) {
      if (el.parentNode) el.parentNode.insertBefore(infoBtn, el.nextSibling);
    }
  }

  return { blur, reveal, annotate };
})();
