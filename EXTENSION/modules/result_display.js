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

  // Return every case-insensitive whitelist occurrence as merged ranges.
  // Literal substring matching intentionally mirrors content.js's existing
  // whitelist behavior, including support for multi-word phrases.
  function _visibleRanges(text, visibleTerms) {
    const source = String(text || "");
    const lower = source.toLowerCase();
    const terms = [...new Set((Array.isArray(visibleTerms) ? visibleTerms : [])
      .map(term => String(term || "").trim().toLowerCase())
      .filter(Boolean))];
    const ranges = [];

    terms.forEach(term => {
      let fromIndex = 0;
      while (fromIndex < lower.length) {
        const start = lower.indexOf(term, fromIndex);
        if (start === -1) break;
        ranges.push({ start, end: start + term.length });
        fromIndex = start + term.length;
      }
    });

    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    return ranges.reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
  }

  // Pure helper kept public for regression tests. It also documents the exact
  // visual rule: only whitelist matches are visible; every other character in
  // a mixed blocklist/whitelist comment belongs to a blurred segment.
  function segmentTextForWhitelist(text, visibleTerms) {
    const source = String(text || "");
    if (!source) return [];
    const ranges = _visibleRanges(source, visibleTerms);
    if (ranges.length === 0) return [{ text: source, visible: false }];

    const segments = [];
    let cursor = 0;
    ranges.forEach(range => {
      if (range.start > cursor) {
        segments.push({ text: source.slice(cursor, range.start), visible: false });
      }
      segments.push({ text: source.slice(range.start, range.end), visible: true });
      cursor = range.end;
    });
    if (cursor < source.length) {
      segments.push({ text: source.slice(cursor), visible: false });
    }
    return segments;
  }

  // Wrap text-node slices in place while retaining the page's original inline
  // structure. Ranges are calculated over the element's complete textContent,
  // so a whitelisted phrase may span multiple nested text nodes.
  function _applyPartialBlur(el, visibleTerms) {
    const source = el.textContent || "";
    const ranges = _visibleRanges(source, visibleTerms);
    if (ranges.length === 0) return false;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    let globalOffset = 0;
    textNodes.forEach(textNode => {
      const value = textNode.textContent || "";
      const nodeStart = globalOffset;
      const nodeEnd = nodeStart + value.length;
      globalOffset = nodeEnd;
      if (!value) return;

      const pieces = [];
      let cursor = nodeStart;
      ranges.forEach(range => {
        if (range.end <= nodeStart || range.start >= nodeEnd) return;
        const visibleStart = Math.max(range.start, nodeStart);
        const visibleEnd = Math.min(range.end, nodeEnd);
        if (visibleStart > cursor) {
          pieces.push({ start: cursor, end: visibleStart, visible: false });
        }
        if (visibleEnd > visibleStart) {
          pieces.push({ start: visibleStart, end: visibleEnd, visible: true });
        }
        cursor = Math.max(cursor, visibleEnd);
      });
      if (cursor < nodeEnd) pieces.push({ start: cursor, end: nodeEnd, visible: false });

      const fragment = document.createDocumentFragment();
      pieces.forEach(piece => {
        const span = document.createElement("span");
        span.className = piece.visible ? "cad-whitelist-visible" : "cad-redacted-segment";
        span.setAttribute(
          "data-cad-partial-segment",
          piece.visible ? "visible" : "blurred",
        );
        span.textContent = source.slice(piece.start, piece.end);
        fragment.appendChild(span);
      });
      try { textNode.replaceWith(fragment); } catch(e) {}
    });

    el.setAttribute("data-cad-partial-root", "1");
    el.classList.add("cad-partial-blurred");
    return true;
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
    const vaderWordsHtml = vaderWordsList || `<li class="cad-none">No lexicon words matched. Context rules, if any, are shown below.</li>`;

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

    // Use unrounded model outputs for each contribution; round only for display.
    const nbScore = nb.prob ?? 0;
    const vaderScore = vader.aggression_score ?? 0;
    const nbContribution = NB_WEIGHT * nbScore;
    const vaderContribution = VADER_WEIGHT * vaderScore;
    const vaderOnly = nb.ok && nb.matched?.length === 0;
    const combinedScore = vaderOnly ? vaderScore : nbContribution + vaderContribution;
    const hybridCalculation = [
      `Input scores (0–1):`,
      `  NB = ${nbScore.toFixed(6)} (${nbPctFull}%)`,
      `  VADER = ${vaderScore.toFixed(6)} (${vaderPctFull}%)`,
      "",
      ...(vaderOnly ? [
        "Zero-evidence fallback: NB matched no words.",
        "Skip the weighted blend; use VADER directly.",
        `R_score = ${vaderScore.toFixed(6)}`,
      ] : [
        `Weights: NB ${NB_WEIGHT_PERCENT}%, VADER ${VADER_WEIGHT_PERCENT}%`,
        "1. NB contribution:",
        `   ${NB_WEIGHT} × ${nbScore.toFixed(6)} ≈ ${nbContribution.toFixed(6)}`,
        "2. VADER contribution:",
        `   ${VADER_WEIGHT} × ${vaderScore.toFixed(6)} ≈ ${vaderContribution.toFixed(6)}`,
        "3. Add weighted contributions:",
        "   R_score = (w1 × NB) + (w2 × VADER)",
        `   ${nbContribution.toFixed(6)} + ${vaderContribution.toFixed(6)} ≈ ${combinedScore.toFixed(6)}`,
      ]),
      "",
      Math.abs(score - combinedScore) > 1e-12
        ? `Detection-policy adjustment: ${combinedScore.toFixed(6)} → ${score.toFixed(6)}`
        : "No further score adjustment.",
      `Final percentage: ${score.toFixed(6)} × 100 ≈ ${hybridPctFull}%`,
      `Decision: ${score.toFixed(6)} ${isAgg ? "≥" : "<"} ${CADConfig.thresholdForMode(mode).toFixed(6)}`,
      `Threshold = ${decisionThresholdPercent}% → ${verdict}`,
      "",
      "Shown to 6 decimals; calculations use unrounded scores.",
    ].join("\n");


    // Display intermediates from the complete trace, not the six preview chips.
    const num = value => '<strong class="cad-calc-number">' + Number(value).toFixed(6) + '</strong>';
    const readAlong = {
      '1 · Add adjusted word valences': 'We add the sentiment scores assigned to the matched words by the VADER lexicon, after applying capitalization, emphasis and negation rules.',
      '2 · Add punctuation emphasis': 'We add the punctuation adjustment to the word total from the previous step.',
      '3 · Normalize the total': 'We divide the adjusted total by the square root shown here to put sentiment on a scale from minus one to plus one.',
      '4 · Apply context rules': 'We apply any detected sarcasm adjustment, limit the result to minus one through plus one, and round to four decimals.',
      '5 · Keep only negative sentiment': 'We reverse a negative sentiment score to obtain the aggression score. Positive or neutral sentiment gives zero. Multiplying by one hundred gives the percentage.',
      'Zero-evidence fallback': 'Because Naive Bayes found no vocabulary matches, we use the VADER score directly.',
      'Weighted Naive Bayes': 'We multiply the Naive Bayes probability by its configured Hybrid weight to get its contribution.',
      'Weighted VADER': 'We multiply the VADER aggression score by its configured Hybrid weight to get its contribution.',
      'Combine': 'We add those two contributions to get the combined Hybrid score.',
      'Detection-policy adjustment': 'The detection policy adjusts the combined score to the final value shown here.',
      'Selected algorithm': 'We use the score from the selected algorithm as the final score.',
      'Compare with threshold': 'We compare the final score with the configured threshold. A score at or above it is AGGRESSIVE; a score below it is SAFE.',
    };
    const row = (label, formula, narration = readAlong[label]) => '<div class="cad-calc-row"><span class="cad-calc-label">' + label + '</span><div class="cad-calc-formula">' + formula + '</div>' + (narration ? '<p class="cad-trace-note">' + _esc(narration) + '</p>' : '') + '</div>';
    const output = (label, value, note, aggressive) => '<div class="cad-score-output ' + (aggressive ? 'cad-score-agg' : 'cad-score-safe') + '"><span class="cad-output-label">' + label + '</span><strong class="cad-output-number">' + value.toFixed(3) + ' (' + (value * 100).toFixed(1) + '%)</strong><span class="cad-output-note">' + note + '</span></div>';
    const nbMatched = nb.matched || [];
    const nbSum0 = nbMatched.reduce((sum, word) => sum + word.ll0, 0);
    const nbSum1 = nbMatched.reduce((sum, word) => sum + word.ll1, 0);
    const wordAddition = side => nbMatched.length
      ? nbMatched.map(word => _esc(word.token) + ': (' + num(word['ll' + side]) + ')').join(' +<br>')
      : 'No matched words: ' + num(0);
    const priorSource = side => {
      const count = side === 0 ? nb.classCounts0 : nb.classCounts1;
      const total = nb.classCounts0 + nb.classCounts1;
      return Number.isFinite(count) && Number.isFinite(total) && total > 0
        ? 'ln(' + count.toLocaleString() + ' / ' + total.toLocaleString() + ') ≈ '
        : 'Stored model class log prior = ';
    };
    const nbThreshold = CADConfig.thresholdForMode(CADConfig.modes.NAIVE_BAYES);
    const nbAggressive = nbScore >= nbThreshold;
    const nbWalkthrough = nb.ok ?
      '<div class="cad-calc-heading">How this percentage is computed</div>' +
      '<div class="cad-trace-note">All ' + nbMatched.length + ' matched feature occurrences count, including repeats. The agg and safe numbers on the word cards are the log scores added below. The signed difference (agg − safe) only describes the word’s direction; it is not the value added to either total. Cards show 2 decimals; calculations below show 6.</div>' +
      row('1 · Safe total',
        'Safe class log prior: ' + priorSource(0) + num(nb.logPrior0) +
        '<br>Safe word scores:<br>' + wordAddition(0) + '<br>Word-score sum ≈ ' + num(nbSum0) +
        '<br>Prior + word-score sum: ' + num(nb.logPrior0) + ' + (' + num(nbSum0) + ') ≈ ' + num(nb.score0),
        'We start with the safe class log prior, ' + nbBaseSafe + ', which comes from the proportion of safe comments in the training data. We add each matched word’s safe log score shown above. These word scores sum to ' + nbSum0.toFixed(6) + ', giving a safe total of ' + nbTotSafe + '.') +
      row('2 · Aggressive total',
        'Aggressive class log prior: ' + priorSource(1) + num(nb.logPrior1) +
        '<br>Aggressive word scores:<br>' + wordAddition(1) + '<br>Word-score sum ≈ ' + num(nbSum1) +
        '<br>Prior + word-score sum: ' + num(nb.logPrior1) + ' + (' + num(nbSum1) + ') ≈ ' + num(nb.score1),
        'We start with the aggressive class log prior, ' + nbBaseAgg + ', from the proportion of aggressive training comments. We add each matched word’s aggressive log score. These sum to ' + nbSum1.toFixed(6) + ', giving an aggressive total of ' + nbTotAgg + '.') +
      '<div class="cad-trace-note">Word scores come from the trained vocabulary: ln((word count in that class + 1) / (total training words in that class + vocabulary size)). The +1 smooths rare words. Negated features use the adjusted scores actually used by the classifier; the full derivation below shows their original scores.</div>' +
      row('3 · Convert to positive weights', 'm = max(safe, aggressive) = ' + num(m) + '<br>Safe: exp(' + num(nb.score0) + ' − (' + num(m) + ')) ≈ ' + num(e0) + '<br>Aggressive: exp(' + num(nb.score1) + ' − (' + num(m) + ')) ≈ ' + num(e1),
        'We take the larger total, ' + m.toFixed(6) + ', and subtract it from both totals. We then apply exp, which reverses the natural logarithm. This gives a safe weight of ' + e0.toFixed(6) + ' and an aggressive weight of ' + e1.toFixed(6) + '. Subtracting the same value keeps the probability unchanged and prevents numerical underflow.') +
      row('4 · Divide, then convert to percent', num(e1) + ' ÷ (' + num(e0) + ' + ' + num(e1) + ') ≈ ' + num(e1 / (e0 + e1)) + '<br>Model rounds probability to 4 decimals: ' + num(nbScore) + ' × 100 ≈ <strong class="cad-calc-number">' + nbPct + '%</strong>',
        'We divide the aggressive weight by the sum of both weights. The model rounds this probability to ' + nbScore.toFixed(4) + '. Multiplying by one hundred gives ' + (nbScore * 100).toFixed(2) + ' percent aggression probability.') +
      row('5 · Naive Bayes threshold decision', num(nbScore) + (nbAggressive ? ' ≥ ' : ' &lt; ') + num(nbThreshold) + ' → <strong>' + (nbAggressive ? 'AGGRESSIVE' : 'SAFE') + '</strong>',
        'We compare the Naive Bayes probability, ' + nbScore.toFixed(4) + ', with its configured threshold, ' + nbThreshold.toFixed(4) + '. Because it is ' + (nbAggressive ? 'at or above' : 'below') + ' the threshold, the Naive Bayes verdict is ' + (nbAggressive ? 'AGGRESSIVE' : 'SAFE') + '. In Hybrid mode, the final verdict uses the combined score shown below.') +
      '<div class="cad-trace-note">Displayed numbers are rounded; the calculation uses full precision before the model rounds its output. This is a model probability, not measured accuracy.</div>' :
      '<div class="cad-trace-note">Naive Bayes calculation unavailable: model trace not loaded.</div>';
    const vWordSum = (vader.matchedWords || []).reduce((sum, word) => sum + word.valence, 0);
    const vPunctuation = (vader.valenceSum ?? 0) - vWordSum;
    const vAlpha = vader.alpha ?? 15;
    const vBase = (vader.valenceSum ?? 0) / Math.sqrt((vader.valenceSum ?? 0) ** 2 + vAlpha);
    const vCue = vader.sarcasmCue ?? 0;
    const vAdjusted = vCue > 0 ? (vBase > 0 ? -vBase - 0.4 * vCue : vBase - 0.2 * vCue) : vBase;
    const vaderWalkthrough =
      '<div class="cad-calc-heading">How this percentage is computed</div>' +
      (vader.insultOverride ? '<div class="cad-trace-note">Direct-insult clause selected: “' + _esc(vader.insultOverride.clause) + '”. The words and totals below belong to that clause.</div>' : '') +
      row('1 · Add adjusted word valences', 'All ' + (vader.matchedWords || []).length + ' matches (including repeats) sum to ' + num(vWordSum) + '. CAPS, boosters and negation are already applied.') +
      row('2 · Add punctuation emphasis', num(vWordSum) + ' + (' + num(vPunctuation) + ') ≈ ' + num(vader.valenceSum ?? 0) + '<br>Up to 4 exclamation marks × 0.292, in the sentiment direction; no boost without a matched word.') +
      row('3 · Normalize the total', 'compound = sum ÷ √(sum² + α)<br>' + num(vader.valenceSum ?? 0) + ' ÷ √((' + num(vader.valenceSum ?? 0) + ')² + ' + num(vAlpha) + ') ≈ ' + num(vBase) + '<br>α = max(10, min(15, token count)).') +
      row('4 · Apply context rules', (vCue > 0 ? (vBase > 0 ? '−(' + num(vBase) + ') − 0.4 × ' : num(vBase) + ' − 0.2 × ') + num(vCue) + ' ≈ ' + num(vAdjusted) : 'No sarcasm adjustment: ' + num(vBase)) + '<br>Clamp to [−1, +1], then round to 4 decimals: ' + num(vader.compound ?? 0)) +
      row('5 · Keep only negative sentiment', 'max(0, −(' + num(vader.compound ?? 0) + ')) = ' + num(vaderScore) + '<br>' + num(vaderScore) + ' × 100 ≈ <strong class="cad-calc-number">' + vaderPct + '%</strong>') +
      '<div class="cad-trace-note">This VADER-inspired score measures negative sentiment, not a probability or accuracy. Positive and neutral compounds contribute 0% aggression.</div>';
    function formulaReference(title, formula, note) {
      return `<details class="calc" open><summary>${_esc(title)}</summary><div class="calc-body"><pre class="cad-math-block">${_esc(formula)}</pre><div class="cad-trace-note">${_esc(note)}</div></div></details>`;
    }
    const nbFormulas = formulaReference("Naive Bayes formulas", "Class prior: P(c) = N_c / N\nLikelihood: P(w|c) = (count(w,c) + 1) / (T_c + |V|)\nℓ_c(w) = ln P(w|c)\nWord contribution: Δ(w) = ℓ′_1(w) − ℓ′_0(w)\nClass total: S_c = ln P(c) + Σ ℓ′_c(w)\nm = max(S_0, S_1)\nP(aggressive|text) = exp(S_1 − m) / (exp(S_0 − m) + exp(S_1 − m))\nNB = round(P(aggressive|text), 4)\nPercentage = NB × 100\n\nNegated features (not_ words):\nμ = (ℓ_0 + ℓ_1) / 2\nh = 0.75 × (ℓ_1 − ℓ_0) / 2\nℓ′_0 = μ − h; ℓ′_1 = μ + h\nOther features: ℓ′_c = ℓ_c", "c = class (0 safe, 1 aggressive); N_c = training comments in class c; N = all training comments; T_c = training word occurrences in class c; |V| = vocabulary size. ln is the natural logarithm; +1 is Laplace smoothing. Sum every matched occurrence, including repeats; unmatched features add nothing. Negation retains 75% of the original class gap (a 25% reduction). The signed word-card number is Δ(w), not a percentage.");
    const vaderFormulas = formulaReference("VADER formulas", "Start with v = lexicon(word).\nd(v) = +1 if v > 0, otherwise −1\nALL CAPS: v ← v + d(v) × 0.733\nEach booster in preceding 3 tokens:\n  v ← v + d(v) × B × distanceFactor\n  distanceFactor = 1 at distance 1; otherwise 0.95\nNegation in preceding 3 tokens: v ← −0.74 × v\n\ns = Σ adjusted word valences\nE = direction(s) × min(number of !, 4) × 0.292\nS = s + E\nα = max(10, min(15, token count))\nx = S / √(S² + α)\n\nSarcasm cue q = min(0.5 × matched markers, 1)\ny = −x − 0.4q, if q > 0 and x > 0\n    x − 0.2q, if q > 0 and x ≤ 0\n    x, otherwise\ncompound = max(−1, min(1, y))\nVADER = round(max(0, −compound), 4)\nPercentage = VADER × 100", "B is the matched booster’s dictionary value. Apply CAPS, each booster, then negation. Punctuation direction is +1 when s ≥ 0, otherwise −1; E = 0 without matched words. A direct-insult contrast sentence uses the first qualifying clause’s words, punctuation and token count. Sarcasm matching excludes configured standalone sincere phrases. Displayed compound is rounded to 4 decimals. These formulas include this extension’s custom VADER-inspired rules.");
    const decisionFormulas = formulaReference("Final decision formulas", `Hybrid H = ${NB_WEIGHT} × NB + ${VADER_WEIGHT} × VADER
If NB has no matched features: H = VADER
NB-only: H = NB; VADER-only: H = VADER

Hybrid policy, applied in order:
If H ≥ threshold and language check fails: H = 0
If H ≥ threshold and self-directed distress matches:
  H = H × ${CADConfig.detection.selfDistressDampen}

Final percentage = H × 100
AGGRESSIVE if H ≥ ${CADConfig.thresholdForMode(mode)}; SAFE otherwise.`, "Language and distress rules apply only in Hybrid mode. The language check accepts fewer than 3 words; otherwise it requires a Tagalog-word ratio below 0.15 and an English-word ratio of at least 0.15. Distress uses phrase and exclusion rules. Input scoring is limited to " + CADConfig.detection.maximumTokens + " whitespace-separated tokens.");

    const decisionWalkthrough = (modeIsHybrid ?
      (vaderOnly ? row('Zero-evidence fallback', 'NB matched no words, so use VADER directly: ' + num(vaderScore)) :
        row('Weighted Naive Bayes', NB_WEIGHT + ' × ' + num(nbScore) + ' = ' + num(nbContribution)) +
        row('Weighted VADER', VADER_WEIGHT + ' × ' + num(vaderScore) + ' = ' + num(vaderContribution)) +
        row('Combine', num(nbContribution) + ' + ' + num(vaderContribution) + ' ≈ ' + num(combinedScore))) +
      (Math.abs(score - combinedScore) > 1e-12 ? row('Detection-policy adjustment', num(combinedScore) + ' → ' + num(score)) : '') :
      row('Selected algorithm', _esc(modeLine) + ': ' + num(score))) +
      row('Compare with threshold', num(score) + (isAgg ? ' ≥ ' : ' &lt; ') + num(CADConfig.thresholdForMode(mode)) + ' → <strong>' + verdict + '</strong>');

    const step3 = modeIsHybrid
      ? `STEP 3 — Hybrid: Combine &amp; Decide\n\n` +
        `3a. Why ${NB_WEIGHT_PERCENT}% / ${VADER_WEIGHT_PERCENT}%? (from held-out evaluation, 12,980 test comments):\n` +
        `      Naive Bayes alone — F1 81.19%  (Precision 85.13%, Recall 77.60%)\n` +
        `      VADER alone       — F1 57.91%  (Precision 57.40%, Recall 58.43%)\n` +
        `      Naive Bayes is the stronger individual model, so it carries the\n` +
        `      majority weight (w1 = ${NB_WEIGHT}); VADER adds a smaller correction\n` +
        `      (w2 = ${VADER_WEIGHT}). The blend scores F1 81.42% / Precision 88.82% —\n` +
        `      better than either algorithm alone.\n\n` +
        _esc(hybridCalculation)
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
      `                    = ${(nb.prob ?? 0).toFixed(6)} (${nbPctFull}%)\n\n` +
      `STEP 2 — VADER\n\n` +
      `2a. Add every matched word's emotion score (positive adds, negative subtracts):\n` +
      `      total = ${vSum}\n\n` +
      `2b. Smooth onto a &minus;1 to +1 scale (&alpha; = ${vader.alpha ?? 15}, scaled down from 15 for short comments):\n` +
      `      compound = total / &radic;(total&sup2; + &alpha;)\n` +
      `               ≈ ${vBase.toFixed(6)} (before sarcasm)\n` +
      `      After context adjustment and clamping: ${vCompound}\n\n` +
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
        ${nbFormulas}
        ${nbWalkthrough}
        ${nb.ok ? output("Naive Bayes · P(aggressive)", nbScore, nbScore.toFixed(4) + " × 100 · rounded to 1 decimal", nbScore >= CADConfig.detection.threshold) : ""}
      </div>
      <div class="cad-trace-step">
        <span class="cad-trace-label">2 &middot; VADER</span>
        <span class="cad-trace-sublabel">(+ leans safe, &minus; leans aggressive &mdash; opposite of NB above)</span>
        <ul class="cad-trace-words">${vaderWordsHtml}</ul>
        <span class="cad-trace-detail">compound ${vader.compound ?? 0}</span>
        ${sarcasmLine}
        ${vaderFormulas}
        ${vaderWalkthrough}
        ${output("VADER · aggression score", vaderScore, vaderScore.toFixed(4) + " × 100 · rounded to 1 decimal", vaderScore >= CADConfig.detection.threshold)}
      </div>
      <div class="cad-trace-step cad-trace-final">
        <span class="cad-trace-label">3 &middot; ${_esc(modeLine)}</span>
        ${decisionFormulas}
        ${decisionWalkthrough}
        ${output("Final output · " + verdict, score, _esc(modeLine) + " · threshold " + decisionThresholdPercent + "%", isAgg)}
      </div>
      <div class="cad-trace-step cad-trace-math">
        <span class="cad-trace-label">How the numbers above were calculated</span>
        <details class="calc"><summary>Show detailed calculation transcript</summary><pre class="cad-math-block">${mathBlock}</pre></details>
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
    if (el.hasAttribute("data-cad-partial-root")) {
      if (el.classList.contains("cad-partial-blurred")) {
        el.classList.remove("cad-partial-blurred");
        el.classList.add("cad-partial-revealed");
        if (btn) { btn.innerHTML = EYE_SLASH; btn.title = "Click to blur again"; }
      } else {
        el.classList.remove("cad-partial-revealed");
        el.classList.add("cad-partial-blurred");
        if (btn) { btn.innerHTML = EYE_OPEN; btn.title = "Click to reveal"; }
      }
      return;
    }

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

  function blur(el, score, mode, trace, visibleTerms = []) {
    if (el.classList.contains("cad-blurred") || el.hasAttribute("data-cad-partial-root")) return;

    const isPartial = _applyPartialBlur(el, visibleTerms);
    if (!isPartial) {
      el.classList.add("cad-blurred");
      _addOverlay(el);
    }

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
    if (el.hasAttribute("data-cad-partial-root")) {
      el.classList.remove("cad-partial-blurred");
      el.classList.add("cad-partial-revealed");
      setTimeout(() => el.classList.remove("cad-partial-revealed"), 3000);
      return;
    }
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

  return { blur, reveal, annotate, segmentTextForWhitelist };
})();
