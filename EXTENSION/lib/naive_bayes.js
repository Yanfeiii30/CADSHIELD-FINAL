/**
 * lib/naive_bayes.js
 * Lightweight client-side Naive Bayes classifier for the browser.
 * No server needed — runs entirely client-side.
 *
 * Loads the trained vocab.json model produced by SOP2_Evaluation.ipynb and scores text.
 * Returns aggression probability [0, 1]:
 *   1.0 = very likely aggressive
 *   0.0 = very likely safe
 */

const NaiveBayes = (() => {

  let _model = null;

  // ── Load vocab.json using XMLHttpRequest (fetch() is blocked by some sites' CSP) ──
  async function load() {
    if (_model) return; // already loaded
    return new Promise((resolve) => {
      try {
        const url = chrome.runtime.getURL("lib/vocab.json");
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "json";
        xhr.onload = function() {
          if (xhr.status === 200 && xhr.response) {
            _model = xhr.response;
            console.log("[NaiveBayes] vocab.json loaded successfully. Vocab size:", _model.vocab_size);
          } else {
            console.warn("[NaiveBayes] XHR failed with status:", xhr.status);
            _model = null;
          }
          resolve();
        };
        xhr.onerror = function() {
          console.warn("[NaiveBayes] XHR error loading vocab.json");
          _model = null;
          resolve();
        };
        xhr.send();
      } catch(e) {
        console.warn("[NaiveBayes] Failed to load vocab.json:", e.message);
        _model = null;
        resolve();
      }
    });
  }

  // ── Sarcasm marker phrases — reuses VADER's own matching (including its
  // standalone-sincere-phrase exemption) so this can't drift out of sync ──
  function sarcasmMarkerTokens(text) {
    const markers = (typeof VADER !== "undefined" && VADER.matchedSarcasmMarkers)
      ? VADER.matchedSarcasmMarkers(text) : [];
    return markers.map(m => `cue_${m.replace(/\s+/g, "_")}`);
  }

  // ── Swear word used as an intensifier — aligned with the VADER rules ────
  // Excludes a swear word from NB's features when it's immediately followed
  // by a word VADER's lexicon scores positive (e.g. "fucking beautiful").
  const SWEAR_WORDS = new Set([
    "fucking", "fuckin", "fuck", "shit", "shitty", "damn", "goddamn",
    "hella", "freaking", "frickin", "bloody", "effing",
  ]);

  function intensifierSwearWord(text) {
    const raw = (text.toLowerCase().match(/[a-z]+/g) || []);
    for (let i = 0; i < raw.length - 1; i++) {
      if (SWEAR_WORDS.has(raw[i]) &&
          typeof VADER !== "undefined" &&
          VADER.isPositiveLexiconWord(raw[i + 1])) {
        return raw[i];
      }
    }
    return null;
  }

  // Casual words that falsely correlate with aggression in the training data.
  const CASUAL_SAFE_WORDS = new Set(["gg", "bro"]);

  // ── Negation handling — aligned with the evaluation notebook tokenizer ──
  // Tags words after a negation word with a "not_" prefix so NB treats
  // negated terms as separate features from their base word.
  const NEGATION_WORDS = new Set([
    "not", "no", "never", "neither", "nor", "without",
    "barely", "hardly", "scarcely",
    "dont", "cant", "wont", "wouldnt", "shouldnt",
    "isnt", "arent", "doesnt", "didnt", "havent", "hasnt", "hadnt",
  ]);
  const NEGATION_WINDOW = 3;

  // ── Tokenize text ──────────────────────────────────────────────────────────
  function tokenize(text) {
    const stopWords = new Set(
      _model?.stop_words || [
        "a","an","the","is","it","in","on","at","to","for","of","and",
        "or","but","this","that","with","was","be","are","as","by","i",
        "you","we","they","he","she","my","your","our","its","do","did",
        "have","has","had","so","if","can","will","just","up"
      ]
    );
    const raw = text
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

    const unigrams = [];
    let negateRemaining = 0;
    for (const word of raw) {
      if (NEGATION_WORDS.has(word)) {
        negateRemaining = NEGATION_WINDOW;
        continue;
      }
      if (word.length <= 1 || stopWords.has(word)) {
        if (negateRemaining > 0) negateRemaining--;
        continue;
      }
      if (negateRemaining > 0) {
        unigrams.push(`not_${word}`);
        negateRemaining--;
      } else {
        unigrams.push(word);
      }
    }

    return unigrams.concat(sarcasmMarkerTokens(text));
  }

  // ── Negation-tagged tokens (not_X) are trusted less than regular words ────
  // A not_X feature is only ever seen in a handful of training documents, so
  // its learned class split is noisy — it can end up leaning "aggressive"
  // just because the few examples of "not stupid" etc. happened to be
  // backhanded insults, not because negation itself signals aggression.
  // Shrinking the gap between its two log-likelihoods toward their average
  // (rather than trusting either raw value) keeps a not_X match from single-
  // handedly deciding the verdict, without discarding it as a signal.
  //
  // Tuned for HYBRID mode correctness specifically (0.75, not the more
  // conservative 0.4 this started at): after NB-only/VADER-only/Hybrid were
  // unified onto one 0.5 threshold, no single factor kept both "you are not
  // stupid" correct in NB-only mode AND "you don't deserve to play" correct
  // in Hybrid mode — accepted trade-off is Hybrid stays correct on both,
  // NB-only alone can misread a negated backhanded insult, since Hybrid
  // (blended with VADER) is the mode that actually needs to be right.
  const NEGATION_DAMPEN = 0.75;

  // ── Score text with a full step-by-step trace ─────────────────────────────
  // Same computation as score(), but also reports which tokens were found
  // in the vocab and how much each pushed the result toward each class —
  // used by the popup's "how the algorithm works" demo view.
  function scoreWithTrace(text) {
    const originalText = text;
    if (typeof VADER !== "undefined") text = VADER.normalizeObfuscation(text);
    if (!_model) {
      return { ok: false, reason: "Model not loaded" };
    }

    let tokens = tokenize(text);
    const swear = intensifierSwearWord(text);
    if (swear) tokens = tokens.filter(t => t !== swear);
    tokens = tokens.filter(t => !CASUAL_SAFE_WORDS.has(t));

    const logLik     = _model.log_likelihood;
    const logPrior   = _model.log_prior;
    const totalWords0 = _model.total_words?.["0"];
    const totalWords1 = _model.total_words?.["1"];
    const vocabSize   = _model.vocab_size;

    let score0 = logPrior["0"];
    let score1 = logPrior["1"];

    const matched   = [];
    const unmatched = [];

    // Derives the raw training-data word count back out of a log-likelihood
    // value — the inverse of the notebook's Laplace-smoothing formula:
    //   ll = log((count + 1) / (total_words + vocab_size))
    //   =>  count = exp(ll) * (total_words + vocab_size) - 1
    // Raw counts aren't stored per-word in vocab.json (would ~double its
    // size); deriving them on demand keeps the file small while still
    // letting the UI show "this word appeared N times in training".
    function deriveRawCount(ll, totalWords) {
      if (ll === undefined || totalWords === undefined) return null;
      return Math.round(Math.exp(ll) * (totalWords + vocabSize) - 1);
    }

    tokens.forEach(token => {
      let ll0 = logLik["0"][token];
      let ll1 = logLik["1"][token];
      if (ll0 !== undefined || ll1 !== undefined) {
        // Raw counts always come from the ORIGINAL (undamped) likelihoods —
        // they describe real training data, so a negated token's counts
        // shouldn't reflect the confidence-dampening applied below.
        const rawCount0 = deriveRawCount(ll0 ?? 0, totalWords0);
        const rawCount1 = deriveRawCount(ll1 ?? 0, totalWords1);
        // Kept alongside the (possibly damped) ll0/ll1 below so the UI can
        // show both steps for a negated token instead of numbers that
        // silently don't match the displayed raw counts.
        const rawLl0 = ll0 ?? 0, rawLl1 = ll1 ?? 0;
        const wasDampened = token.startsWith("not_");

        if (wasDampened) {
          const avg = (rawLl0 + rawLl1) / 2;
          const halfDelta = ((rawLl1 - rawLl0) / 2) * NEGATION_DAMPEN;
          ll0 = avg - halfDelta;
          ll1 = avg + halfDelta;
        }
        score0 += ll0 ?? 0;
        score1 += ll1 ?? 0;
        matched.push({
          token,
          isSarcasmCue: token.startsWith("cue_"),
          ll0: ll0 ?? 0,
          ll1: ll1 ?? 0,
          rawLl0, rawLl1, wasDampened,
          rawCount0, rawCount1,
          // Positive = pushes toward "aggressive", negative = toward "safe"
          pushToAggressive: (ll1 ?? 0) - (ll0 ?? 0),
        });
      } else {
        unmatched.push(token);
      }
    });

    const m    = Math.max(score0, score1);
    const e0   = Math.exp(score0 - m);
    const e1   = Math.exp(score1 - m);
    const prob = e1 / (e0 + e1);

    matched.sort((a, b) => Math.abs(b.pushToAggressive) - Math.abs(a.pushToAggressive));

    return {
      ok: true,
      originalText, normalizedText: text,
      tokens, matched, unmatched,
      logPrior0: logPrior["0"], logPrior1: logPrior["1"],
      score0, score1,
      prob: parseFloat(prob.toFixed(4)),
      // Raw training-set figures, for showing the class-prior derivation
      // (docs per class / total docs) in the UI, same shape both places.
      classCounts0: _model.class_counts?.["0"],
      classCounts1: _model.class_counts?.["1"],
      totalWords0, totalWords1, vocabSize,
    };
  }

  // ── Score text — returns aggression probability [0, 1] ────────────────────
  function score(text) {
    if (!_model) return 0.5; // fallback if model not loaded
    return scoreWithTrace(text).prob;
  }

  // Auto-load on startup
  load();

  return { load, score, scoreWithTrace };
})();
