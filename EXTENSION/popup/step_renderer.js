/**
 * popup/step_renderer.js
 * Animated, step-by-step visualization of the most recent text analysis.
 * @requires CADConfig
 */

(() => {
  const namespace = globalThis.CADShieldPopup || (globalThis.CADShieldPopup = {});
  const NB_WEIGHT = CADConfig.detection.hybridNaiveBayesWeight;
  const VADER_WEIGHT = CADConfig.detection.hybridVaderWeight;
  const NB_WEIGHT_PERCENT = NB_WEIGHT * 100;
  const VADER_WEIGHT_PERCENT = VADER_WEIGHT * 100;
  const SINGLE_THRESHOLD_PERCENT = CADConfig.detection.threshold * 100;

  // ── Step-by-step algorithm trace (Test tab) ────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // Animates a number counting up from 0 to target — makes a score look
  // like it's actually being computed instead of just appearing. Ends on
  // the exact target (1 decimal place), not a rounded whole number.
  function countUp(el, target, duration = 450, rawScore = null) {
    if (!el) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const val = t >= 1 ? target : target * eased;
      el.textContent = rawScore == null
        ? val.toFixed(1) + "%"
        : `${(t >= 1 ? rawScore : rawScore * eased).toFixed(3)} (${val.toFixed(1)}%)`;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Full academic derivation — class prior from real training counts, and
  // every matched word's raw count traced through the actual Laplace
  // smoothing formula. Mirrors the same block in result_display.js so the
  // page panel and this popup never show different math. Only buildable
  // when naive_bayes.js's trace carries the extra fields (class_counts/
  // total_words in vocab.json) — returns "" if an older vocab.json is loaded.
  function buildFullDerivationHtml(nbTrace, nbTop) {
    if (nbTrace.classCounts0 == null || nbTrace.totalWords0 == null) return "";
    const c0 = nbTrace.classCounts0, c1 = nbTrace.classCounts1;
    const totalDocs = c0 + c1;
    const tw0 = nbTrace.totalWords0, tw1 = nbTrace.totalWords1, vsz = nbTrace.vocabSize;
    const priorLines =
      `Class prior (same for every comment — from the training set):\n` +
      `  ${c0.toLocaleString()} safe comments, ${c1.toLocaleString()} aggressive comments (${totalDocs.toLocaleString()} total)\n` +
      `  log_prior(safe)       = log(${c0.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${(nbTrace.logPrior0 ?? 0).toFixed(2)}\n` +
      `  log_prior(aggressive) = log(${c1.toLocaleString()} / ${totalDocs.toLocaleString()}) = ${(nbTrace.logPrior1 ?? 0).toFixed(2)}`;

    const wordLines = (nbTop || []).map(m => {
      const lines = [
        `${escapeHtml(m.token)} — appeared ${(m.rawCount0 ?? 0).toLocaleString()}x among ${tw0.toLocaleString()} safe words, ` +
        `${(m.rawCount1 ?? 0).toLocaleString()}x among ${tw1.toLocaleString()} aggressive words:`,
        `  ll(safe)       = log((${m.rawCount0}+1)/(${tw0.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl0.toFixed(2)}`,
        `  ll(aggressive) = log((${m.rawCount1}+1)/(${tw1.toLocaleString()}+${vsz.toLocaleString()})) = ${m.rawLl1.toFixed(2)}`,
      ];
      if (m.wasDampened) {
        lines.push(`  &rarr; negated, so dampened toward their average: ll(safe)=${m.ll0.toFixed(2)}  ll(aggressive)=${m.ll1.toFixed(2)}`);
      }
      return lines.join("\n");
    }).join("\n\n");

    return `
      <details class="calc-details">
        <summary>Show the full derivation (real training counts, for your defense)</summary>
        <pre class="math-block">${priorLines}\n\n${wordLines || "(no words matched the trained vocabulary)"}</pre>
      </details>`;
  }

  // Use all feature occurrences, including repeats and dampened negations.
  function buildNbCalculationHtml(trace) {
    const words = trace.matched || [];
    const fmt = value => Number(value).toFixed(6);
    const sum0 = words.reduce((sum, word) => sum + word.ll0, 0);
    const sum1 = words.reduce((sum, word) => sum + word.ll1, 0);
    const m = Math.max(trace.score0, trace.score1);
    const e0 = Math.exp(trace.score0 - m);
    const e1 = Math.exp(trace.score1 - m);
    const threshold = CADConfig.detection.threshold;
    const aggressive = trace.prob >= threshold;
    return `<pre class="math-block">1. Safe total = safe class log prior + every matched safe log score
   ${fmt(trace.logPrior0)} + (${fmt(sum0)}) ≈ ${fmt(trace.score0)}
2. Aggressive total = aggressive class log prior + every matched aggressive log score
   ${fmt(trace.logPrior1)} + (${fmt(sum1)}) ≈ ${fmt(trace.score1)}
3. Convert the two totals into aggression probability:
   m = max(safe total, aggressive total) = ${fmt(m)}
   safe weight = exp(safe total − m) ≈ ${fmt(e0)}
   aggressive weight = exp(aggressive total − m) ≈ ${fmt(e1)}
   P(aggressive) = aggressive weight / (safe weight + aggressive weight)
                ≈ ${fmt(e1 / (e0 + e1))}
   Model rounds probability to 4 decimals: ${trace.prob.toFixed(4)} (${(trace.prob * 100).toFixed(2)}%)
4. Compare probability with threshold:
   ${trace.prob.toFixed(4)} ${aggressive ? "≥" : "&lt;"} ${threshold.toFixed(4)} → <strong>${aggressive ? "AGGRESSIVE" : "SAFE"}</strong></pre>
      <p class="hint">All ${words.length} matched feature occurrences count, including repeats. Negated features use their adjusted log scores. With no matches, the totals remain the class log priors. Subtracting m keeps exp() stable; displayed values are rounded. This is the Naive Bayes verdict; Hybrid combines it with VADER below.</p>
      <details class="calc-details">
        <summary>Show every matched word’s safe and aggressive log scores</summary>
        <table class="trace-table"><thead><tr><th>Word / feature</th><th>Safe log score</th><th>Aggressive log score</th></tr></thead>
        <tbody>${words.map(word => `<tr><td>${escapeHtml(word.token)}</td><td>${fmt(word.ll0)}</td><td>${fmt(word.ll1)}</td></tr>`).join("") || '<tr><td colspan="3">No matched words</td></tr>'}</tbody></table>
      </details>`;
  }

  // Renders the step-by-step trace as an animated sequence.
  // A sequence token guards against a second Analyze click landing mid-animation.
  renderSteps._seq = 0;
  async function renderSteps(text, nbTrace, vaderTrace, meta) {
    const container = document.getElementById("stepByStep");
    if (!container) return;

    if (!nbTrace?.ok) {
      container.innerHTML = `<div class="note-box">Step-by-step trace unavailable — refresh the page and try again.</div>`;
      return;
    }

    const seq = ++renderSteps._seq;
    const stillCurrent = () => seq === renderSteps._seq;
    container.innerHTML = "";

    // ── Block 1: Pipeline Overview ────────────────────────────────────
    const block1 = document.createElement("div");
    block1.className = "step-block";
    block1.innerHTML = `
      <div class="step-title">Pipeline Overview</div>
      <div class="step-body">
        <div class="pipeline" id="pipelineLive"></div>
        <p style="margin-top:10px;"><strong>Your text, color-coded by what the algorithms reacted to:</strong></p>
        <div class="highlighted-sentence" id="sentenceLive"></div>
        <div class="hl-legend">
          <span><span class="hl-swatch hl-agg"></span> pushes toward aggressive</span>
          <span><span class="hl-swatch hl-safe"></span> pushes toward safe</span>
          <span><span class="hl-swatch hl-neg"></span> negation flips meaning</span>
        </div>
      </div>`;
    container.appendChild(block1);
    if (!stillCurrent()) return;

    const pipelineEl = block1.querySelector("#pipelineLive");
    const sentenceEl = block1.querySelector("#sentenceLive");
    const verdictClass = meta.hybridAgg ? "pipe-agg" : "pipe-safe";
    const verdictLabel  = meta.hybridAgg ? "AGGRESSIVE" : "SAFE";

    const pipeStages = [
      '<div class="pipe-node reveal-pop"><div class="pipe-icon">📝</div><div class="pipe-label">Input Text</div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      '<div class="pipe-node reveal-pop"><div class="pipe-icon">✂️</div><div class="pipe-label">Tokenize</div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      '<div class="pipe-node pipe-split reveal-pop"><div class="pipe-mini">NB<br><strong id="pipeNbNum">0%</strong></div><div class="pipe-mini">VADER<br><strong id="pipeVaderNum">0%</strong></div></div>',
      '<div class="pipe-arrow reveal-pop">→</div>',
      `<div class="pipe-node ${verdictClass} reveal-pop"><div class="pipe-label" id="pipeVerdictNum">0%</div><div class="pipe-sub">${verdictLabel}</div></div>`,
    ];
    for (const html of pipeStages) {
      if (!stillCurrent()) return;
      pipelineEl.insertAdjacentHTML("beforeend", html);
      await wait(130);
    }
    countUp(document.getElementById("pipeNbNum"), meta.nbP, 450, meta.nbProb ?? meta.nbP / 100);
    countUp(document.getElementById("pipeVaderNum"), meta.vP, 450, meta.vaderScore ?? meta.vP / 100);
    await wait(250);
    if (!stillCurrent()) return;
    countUp(document.getElementById("pipeVerdictNum"), meta.hP, 450, meta.hybridScore ?? meta.hP / 100);
    await wait(300);
    if (!stillCurrent()) return;

    // Reveal the sentence word by word, colored as each word is "read".
    const nbPush = new Map();
    // Negated NB tokens ("not_stupid") don't match the bare word ("stupid")
    // by token lookup — track them separately, keyed by the word AFTER the
    // "not_" prefix, so "stupid" in "you are not stupid" gets flagged as a
    // negation match, not silently skipped by the NB lookup below.
    const nbNegWords = new Map();
    (nbTrace.matched || []).forEach(t => {
      if (t.isSarcasmCue) return;
      if (t.token.startsWith("not_")) nbNegWords.set(t.token.slice(4), t.pushToAggressive);
      else nbPush.set(t.token, t.pushToAggressive);
    });
    const vaderPush = new Map();
    (vaderTrace.matchedWords || []).forEach(w => vaderPush.set(w.word, w.valence));

    // Every word actually flipped by a negation, from either algorithm —
    // NB's not_X tokens plus any VADER lexicon word it negated directly
    // (VADER doesn't always share NB's vocabulary, e.g. "beautiful" may
    // only ever show up here, not as a not_beautiful token).
    const negWords = new Set(nbNegWords.keys());
    (vaderTrace.matchedWords || []).forEach(w => { if (w.negated) negWords.add(w.word); });

    // Words NB's noisy, class-imbalanced counts weakly lean "aggressive" on
    // despite being genuinely positive per VADER's lexicon (e.g. "beautiful"
    // in "worthless but beautiful") — computed alongside the trace itself
    // (see the executeScript call above) since VADER's lexicon isn't loaded
    // in the popup's own script context. Left uncolored rather than forced
    // green, since a sparse NB count isn't confident evidence either way.
    const positiveWords = new Set(meta.positiveWords || []);

    // The negation word itself ("not", "never", "don't"...) — mirrors
    // naive_bayes.js's NEGATION_WORDS / vader.js's NEGATE — never earns a
    // color of its own from nbPush/vaderPush (it's a stopword, not a
    // lexicon entry), so it has to be found by scanning the text directly
    // for a trigger word sitting 1-3 words ahead of something in negWords.
    const NEGATION_TRIGGER_WORDS = new Set([
      "not", "no", "never", "neither", "nor", "without",
      "barely", "hardly", "scarcely",
      "don't", "dont", "can't", "cant", "won't", "wont",
      "wouldn't", "wouldnt", "shouldn't", "shouldnt",
      "isn't", "isnt", "aren't", "arent", "doesn't", "doesnt",
      "didn't", "didnt", "haven't", "havent", "hasn't", "hasnt",
      "hadn't", "hadnt",
    ]);
    const NEGATION_WINDOW = 3;

    const chunks = text.split(/(\s+)/);
    const wordIdxs = [];
    chunks.forEach((c, i) => { if (!/^\s*$/.test(c)) wordIdxs.push(i); });
    const negTriggerIdxs = new Set();
    wordIdxs.forEach((idx, k) => {
      const clean = chunks[idx].toLowerCase().replace(/[^a-z']/g, "");
      if (!NEGATION_TRIGGER_WORDS.has(clean)) return;
      for (let n = k + 1; n <= Math.min(wordIdxs.length - 1, k + NEGATION_WINDOW); n++) {
        const nextClean = chunks[wordIdxs[n]].toLowerCase().replace(/[^a-z']/g, "");
        if (negWords.has(nextClean)) { negTriggerIdxs.add(idx); break; }
      }
    });

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!stillCurrent()) return;
      if (/^\s*$/.test(chunk)) { sentenceEl.insertAdjacentText("beforeend", chunk); continue; }
      const clean = chunk.toLowerCase().replace(/[^a-z']/g, "");
      const nbHit  = nbPush.get(clean);
      const vHit   = vaderPush.get(clean);
      let cls = null;
      if (negTriggerIdxs.has(i) || negWords.has(clean)) cls = "hl-neg";
      else if ((nbHit !== undefined && nbHit > 0 && !positiveWords.has(clean)) || (vHit !== undefined && vHit < 0)) cls = "hl-agg";
      else if ((nbHit !== undefined && nbHit < 0) || (vHit !== undefined && vHit > 0)) cls = "hl-safe";
      const safeChunk = escapeHtml(chunk);
      sentenceEl.insertAdjacentHTML("beforeend",
        cls ? `<span class="${cls} reveal-pop">${safeChunk}</span>` : `<span class="reveal-pop">${safeChunk}</span>`);
      await wait(55);
    }
    await wait(300);
    if (!stillCurrent()) return;

    // ── Block 2: Naive Bayes ──────────────────────────────────────────
    const nbTop = nbTrace.matched.slice(0, 8);
    // A "not_X" token where X is a KNOWN NEGATIVE word (e.g. "not_ugly") is
    // a negated insult — semantically safe-leaning — but negated phrases are
    // rare in training data, so NB's learned push for the exact token can
    // noisily lean "aggressive" anyway (same root cause as the positive-word
    // case handled elsewhere, opposite sign). Flagged here so the table
    // doesn't display a confidently wrong-looking "AGGRESSIVE" for it.
    const noisyNegatedTokens = new Set(
      nbTop.filter(t => t.token.startsWith("not_") &&
        typeof VADER !== "undefined" && VADER.isNegativeLexiconWord(t.token.slice(4)))
        .map(t => t.token)
    );
    const block2 = document.createElement("div");
    block2.className = "step-block";
    block2.innerHTML = `
      <div class="step-title">Step 1 — Naive Bayes: tokenize &amp; score words</div>
      <div class="step-body">
        <p>Text is lowercased, stripped of punctuation, and split into words. Stopwords are removed${
          nbTrace.matched.some(t => t.isSarcasmCue) ? ", and any known sarcasm phrase is added as its own feature." : "."
        }</p>
        <p><strong>${nbTrace.matched.length}</strong> word(s) matched the trained vocabulary out of <strong>${nbTrace.tokens.length}</strong> extracted:</p>
        ${nbTop.length ? `
          <p class="hint" style="margin-bottom:4px;">Each row's number = <span class="hl-neg">ll(aggressive)</span> &minus; <span class="hl-pos">ll(safe)</span>, both computed with JavaScript's <code>Math.log()</code> from real training counts. <strong>Positive/red</strong> = that word's stats lean aggressive; <strong>negative/green</strong> = it leans safe.</p>
          <table class="trace-table">
            <thead><tr><th>Word</th><th>Pushes toward</th></tr></thead>
            <tbody id="nbRowsLive"></tbody>
          </table>
          ${noisyNegatedTokens.size ? `
          <p class="hint" style="margin-top:4px;"><strong>About the "NEGATED, NOISY" row${noisyNegatedTokens.size > 1 ? "s" : ""}:</strong> a negated insult like this is rare in training data (often just a handful of examples), so its learned push is mostly noise, not a real pattern — this is exactly what the 75% negation-dampening in the derivation below exists to reduce (though it doesn't fully zero it out). VADER's own negation handling doesn't have this sparse-count problem, which is why the Hybrid blend below still lands on the right side despite this.</p>
          ` : ""}` : `<p class="hint">No trained words matched (this exact word/phrase never showed up often enough in training) — Naive Bayes has no per-word evidence, so it falls back to the class prior below.</p>`
        }
        <p class="step-result ${meta.nbP >= SINGLE_THRESHOLD_PERCENT ? "is-agg" : "is-safe"}">→ Naive Bayes probability: <strong id="nbFinalNum">0%</strong></p>
        ${buildNbCalculationHtml(nbTrace)}
        ${buildFullDerivationHtml(nbTrace, nbTrace.matched)}
      </div>`;
    container.appendChild(block2);
    if (!stillCurrent()) return;

    if (nbTop.length) {
      const tbody = block2.querySelector("#nbRowsLive");
      for (const t of nbTop) {
        if (!stillCurrent()) return;
        const sign = t.pushToAggressive >= 0 ? "+" : "";
        const cls   = noisyNegatedTokens.has(t.token) ? "push-noisy" : (t.pushToAggressive >= 0 ? "push-agg" : "push-safe");
        const label = noisyNegatedTokens.has(t.token) ? "NEGATED, NOISY" : (t.pushToAggressive >= 0 ? "AGGRESSIVE" : "SAFE");
        tbody.insertAdjacentHTML("beforeend", `
          <tr class="reveal-pop">
            <td>${escapeHtml(t.token)}${t.isSarcasmCue ? ' <span class="tag-cue">sarcasm cue</span>' : ""}</td>
            <td class="${cls}">
              ${label} (${sign}${t.pushToAggressive.toFixed(2)})
            </td>
          </tr>`);
        await wait(90);
      }
    }
    if (!stillCurrent()) return;
    countUp(block2.querySelector("#nbFinalNum"), meta.nbP, 450, meta.nbProb ?? meta.nbP / 100);
    await wait(500);
    if (!stillCurrent()) return;

    // ── Block 3: VADER ─────────────────────────────────────────────────
    const vTop = (vaderTrace.matchedWords || []).slice(0, 8);
    let clauseNote = "";
    if (vaderTrace.insultOverride) {
      clauseNote = `
        <p><strong>Backhanded-insult check:</strong> the sentence splits into clauses on "but/however/although/though".
        The clause "<em>${escapeHtml(vaderTrace.insultOverride.clause)}</em>" directly insults "you", so its own score
        (${vaderTrace.insultOverride.compound.toFixed(2)}) is used instead of blending in the rest of the sentence —
        a compliment elsewhere can't cancel out the insult.</p>`;
    } else if (vaderTrace.clauses) {
      clauseNote = `<p>Sentence has multiple clauses, but none is a direct "you are/you're &lt;insult&gt;" statement, so the whole sentence is scored together.</p>`;
    }

    let sarcasmNote = "";
    if (vaderTrace.matchedMarkers?.length) {
      sarcasmNote = `
        <p><strong>Sarcasm check:</strong> matched marker phrase${vaderTrace.matchedMarkers.length > 1 ? "s" : ""}
        "${vaderTrace.matchedMarkers.map(escapeHtml).join('", "')}". ${
          vaderTrace.sarcasmApplied
            ? "Score was corrected — sarcastic-sounding praise is treated as aggression, not sentiment."
            : "Score was already negative, so it's reinforced slightly."
        }</p>`;
    }

    const block3 = document.createElement("div");
    block3.className = "step-block";
    block3.innerHTML = `
      <div class="step-title">Step 2 — VADER: lexicon sentiment score</div>
      <div class="step-body">
        <p><strong>${vTop.length}</strong> word(s) matched the sentiment lexicon:</p>
        ${vTop.length ? `
          <p class="hint" style="margin-bottom:4px;">Each word's number is its <strong>valence</strong> — a hand-assigned score from VADER's lexicon (not computed from training data). <strong>Positive/green</strong> = positive sentiment (pushes toward safe); <strong>negative/red</strong> = negative sentiment (pushes toward aggressive). <em>This is the opposite sign convention from the Naive Bayes table above</em> — there, positive meant aggressive.</p>
          <table class="trace-table">
            <thead><tr><th>Word</th><th>Valence</th><th>Adjustments</th></tr></thead>
            <tbody id="vaderRowsLive"></tbody>
          </table>` : `<p class="hint">No lexicon words matched.</p>`
        }
        ${clauseNote}
        ${sarcasmNote}
        <p class="step-result ${meta.vP >= SINGLE_THRESHOLD_PERCENT ? "is-agg" : "is-safe"}">→ VADER aggression score: <strong id="vaderFinalNum">0%</strong></p>
        <pre class="math-block">1. Add up each matched word's emotion score: total=<span class="${(vaderTrace.valenceSum ?? 0) < 0 ? "hl-neg" : "hl-pos"}">${(vaderTrace.valenceSum ?? 0).toFixed(2)}</span>
2. Smooth onto a &minus;1 to +1 scale &rarr; <span class="${(vaderTrace.compound ?? 0) < 0 ? "hl-neg" : "hl-pos"}">${(vaderTrace.compound ?? 0).toFixed(2)}</span>
3. ${(vaderTrace.compound ?? 0) < 0 ? "Negative (unfriendly tone), so it counts as aggression" : "Not negative, so it doesn't add to aggression"} &rarr; <span class="${meta.vP >= SINGLE_THRESHOLD_PERCENT ? "hl-neg" : "hl-pos"}">${meta.vP}%</span></pre>
        <p class="hint" style="margin-top:2px;"><strong>The code behind step 2:</strong> <code>Math.sqrt()</code> normalizes the raw total into that &minus;1..+1 compound score. Only a negative compound counts as aggression — the code is literally <code>Math.max(0, -compound)</code> — so positive or neutral text always scores 0% here, never a negative percentage.</p>
      </div>`;
    container.appendChild(block3);
    if (!stillCurrent()) return;

    if (vTop.length) {
      const tbody = block3.querySelector("#vaderRowsLive");
      for (const w of vTop) {
        if (!stillCurrent()) return;
        tbody.insertAdjacentHTML("beforeend", `
          <tr class="reveal-pop">
            <td>${escapeHtml(w.word)}</td>
            <td class="${w.valence >= 0 ? "push-safe" : "push-agg"}">${w.valence >= 0 ? "+" : ""}${w.valence.toFixed(2)}</td>
            <td class="hint">${[
              w.negated ? "negated" : null,
              w.boosted ? "boosted" : null,
              w.capsBoosted ? "ALL CAPS" : null,
            ].filter(Boolean).join(", ") || "—"}</td>
          </tr>`);
        await wait(90);
      }
    }
    if (!stillCurrent()) return;
    countUp(block3.querySelector("#vaderFinalNum"), meta.vP, 450, meta.vaderScore ?? meta.vP / 100);
    await wait(500);
    if (!stillCurrent()) return;

    // ── Block 4: Hybrid decision ───────────────────────────────────────
    const block4 = document.createElement("div");
    block4.className = "step-block";
    block4.innerHTML = `
      <div class="step-title">Step 3 — Hybrid: combine &amp; decide</div>
      <div class="step-body">
        ${nbTrace.matched.length === 0 ? `
        <p class="hint">Naive Bayes matched <strong>zero</strong> words this time — its ${meta.nbP}% isn't real evidence, just the untouched class prior. The code's <strong>zero-evidence guard</strong> catches this and skips the ${NB_WEIGHT_PERCENT}/${VADER_WEIGHT_PERCENT} blend entirely, using VADER's score directly instead.</p>
        <p>Final score = VADER = <strong id="hybridFinalNum">0%</strong></p>
        ` : `
        <p>Final score = <span class="hl-const">${NB_WEIGHT_PERCENT}%</span> of Naive Bayes (${meta.nbP}%) + <span class="hl-const">${VADER_WEIGHT_PERCENT}%</span> of VADER (${meta.vP}%) = <strong id="hybridFinalNum">0%</strong></p>
        <p class="hint" style="margin-top:2px;"><strong>The code:</strong> <code>(${NB_WEIGHT} * nb_prob) + (${VADER_WEIGHT} * vader_prob)</code> — plain arithmetic, run fresh on every comment.</p>
        `}
        <p class="step-result" id="hybridVerdictLine" style="opacity:0"></p>
      </div>`;
    container.appendChild(block4);
    if (!stillCurrent()) return;

    countUp(block4.querySelector("#hybridFinalNum"), meta.hP, 550, meta.hybridScore ?? meta.hP / 100);
    await wait(650);
    if (!stillCurrent()) return;

    const isAgg = meta.hP >= meta.threshold;
    const verdictLine = block4.querySelector("#hybridVerdictLine");
    verdictLine.classList.add(isAgg ? "is-agg" : "is-safe");
    verdictLine.innerHTML = `→ <span class="${isAgg ? "hl-neg" : "hl-pos"}">${meta.hP}%</span> ${isAgg ? "≥" : "<"} threshold (<span class="hl-const">${meta.threshold}%</span>) ⇒
      <strong>${isAgg ? "AGGRESSIVE" : "SAFE"}</strong>`;
    verdictLine.style.transition = "opacity .3s ease";
    requestAnimationFrame(() => { verdictLine.style.opacity = "1"; });
  }

  namespace.StepRenderer = Object.freeze({ render: renderSteps, buildNbCalculationHtml });
})();
