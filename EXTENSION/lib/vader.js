/**
 * lib/vader.js
 * Lightweight VADER-inspired sentiment scorer for the browser.
 * No server needed — runs entirely client-side.
 *
 * Returns aggression_score [0, 1] using |Vcomp| as per manuscript formula:
 *   Rscore = w1 * Pnb + w2 * |Vcomp|
 *   1.0 = very aggressive / negative
 *   0.0 = neutral / safe
 *
 * Fixes applied (aligned with manuscript Chapter 3):
 *   1. Slang splitter — handles joined words like "fuckyou", "shutup", "kys"
 *   2. Expanded lexicon — covers common internet slang and aggressive terms
 *   3. Formula corrected — uses Math.abs(compound) per manuscript |Vcomp|
 */

const VADER = (() => {

  // ── Sentiment lexicon (word → valence score) ───────────────────────────────
  const LEXICON = {
    // Strong negatives / aggressive — core
    "hate":         -3.2, "kill":        -3.5, "die":         -1.2,
    "stupid":       -2.9, "idiot":       -3.1, "moron":       -3.0,
    "ugly":         -2.5, "worthless":   -3.3, "loser":       -2.7,
    "disgusting":   -2.8, "trash":       -2.6, "dumb":        -2.4,
    "pathetic":     -2.8, "horrible":    -2.9, "awful":       -2.7,
    "terrible":     -2.6, "worst":       -3.0, "jerk":        -2.4,
    "freak":        -2.3, "scum":        -3.1, "garbage":     -2.5,
    "filth":        -2.6, "bastard":     -3.0, "creep":       -2.3,
    "crap":        -1.5,
    "suck":         -1.8, "sucks":       -1.8, "toxic":       -2.5,
    "bully":        -2.8, "harass":      -3.0, "abuse":       -3.0,
    "threat":       -2.9, "hurt":        -1.5, "destroy":     -1.5,
    "attack":       -1.5, "punish":      -2.4, "suffer":      -1.5,
    "pain":         -1.0, "evil":        -2.8, "vile":        -3.0,
    "rude":         -1.8, "cruel":       -2.5,
    "unkind":       -1.7, "annoying":    -1.5,
    "liar":        -2.5, "fake":        -1.5,
    "coward":       -2.3, "despise":     -3.1, "loathe":      -3.0,
    "filthy":       -2.7, "repulsive":   -2.9, "disgrace":    -2.8,
    "shameful":     -2.6, "useless":     -2.8, "failure":     -2.5,
    "retard":       -3.2, "retarded":    -3.2,
    "dropout":      -2.0, "nobody":      -1.5, "waste":       -2.4,
    "pitiful":      -2.6, "inferior":    -2.4, "subhuman":    -3.4,
    "degenerate":   -3.0, "brainless":   -2.8, "mindless":    -2.3,

    // Internet slang aggressive terms
    "kys":          -3.8, "stfu":        -2.8, "gtfo":        -2.7,
    "wtf":          -2.0, "fuk":         -3.0, "fck":         -3.0,
    "fvck":         -3.0, "fuq":         -3.0, "sht":         -2.2,
    "btch":         -3.0, "bich":        -2.9, "hoe":         -2.5,
    "thot":         -2.6, "dumbass":     -2.9, "jackass":     -2.8,
    "asshole":      -3.1, "scumbag":     -3.0, "dipshit":     -2.9,
    "dimwit":       -2.6, "nitwit":      -2.4, "halfwit":     -2.4,
    "imbecile":     -3.0, "braindead":   -3.1, "numskull":    -2.5,
    "crybaby":      -2.0, "weirdo":      -2.1, "cretin":      -2.9,
    "vermin":       -3.0, "rat":         -2.2, "pig":         -2.4,
    "snake":        -2.3, "parasite":    -2.8, "leech":       -2.5,
    "slut":         -3.2, "whore":       -3.3, "bitch":       -3.1,
    "cunt":         -3.5, "dick":        -2.8, "ass":         -2.0,
    "piss":         -1.8, "shit":        -2.5, "fuck":        -3.0,
    "fucker":       -3.2, "fucking":     -2.8, "motherfucker":-3.5,
    "mofo":         -3.2, "prick":       -2.9, "twat":        -3.0,
    "wanker":       -2.8, "jerkoff":     -2.9, "douchebag":   -2.9,
    "douche":       -2.7, "shutup":      -2.5, "loserface":   -2.8,
    "idiotface":    -2.9, "stupidass":   -2.9, "uglyass":     -2.7,
    "noob":         -1.8, "scrub":       -1.9,

    // Threats and harm
    "murder":       -3.5, "rape":        -3.8, "stab":        -3.4,
    "shoot":        -1.5, "punch":       -1.5, "slap":        -1.5,
    "beat":         -1.0, "bash":        -1.0, "smash":       -1.0,
    "obliterate":   -3.0, "annihilate":  -3.1, "exterminate": -3.2,

    // Dismissive / belittling
    "pointless":    -2.0, "irrelevant":  -1.8, "ignorant":    -2.5,
    "incompetent":  -2.6, "incapable":   -2.4, "hopeless":    -2.5,
    "helpless":     -2.0, "clueless":    -2.3, "delusional":  -2.5,
    "psycho":       -2.6, "crazy":       -0.5, "insane":      -0.5,
    "nutcase":      -2.4, "lunatic":     -2.6,
    "maniac":       -2.5,
    "weak":         -2.5, "unworthy":    -2.5, "mediocre":    -1.8,
    "overrated":    -2.0, "replaceable": -1.8,

    // Expanded coverage — plurals/tenses/comparatives of words already
    // above (e.g. "dumbest" was missing though "dumb" was there, which is
    // exactly what let a real insult slip through undetected earlier), plus
    // common modern slang insults not covered by the original list.
    //
    // "killed"/"kills"/"killing"/"destroyed"/"destroys"/"destroying" were
    // tried here and reverted — they fixed literal-violence detection but
    // caused a real, confirmed regression: "you killed it out there!
    // destroyed the opposition!" (celebratory sports praise) flipped from
    // safe to AGGRESSIVE, since VADER has no way to tell literal violence
    // from violence-as-praise idioms, which are extremely common in casual
    // English. Deliberately left out rather than special-cased — a small
    // hardcoded exception list for specific phrases ("killed it", "crushed
    // it"...) would only cover the exact wordings anticipated, not the
    // general pattern.
    "dumbest":      -2.6, "stupider":    -2.9, "stupidest":   -3.0,
    "stupidly":     -2.5, "idiots":      -3.1, "uglier":      -2.5,
    "ugliest":      -2.7, "disgustingly":-2.8, "pathetically":-2.6,
    "horribly":     -2.9, "awfully":     -2.5, "terribly":    -2.6,
    "hurts":        -1.5, "hurting":     -1.6, "hurtful":     -2.4,
    "attacked":     -1.6, "attacks":     -1.5, "attacking":   -1.6,
    "threatened":   -2.9, "threatens":   -2.8, "threatening": -2.9,
    "hated":        -3.0, "hates":       -3.0, "hating":      -2.9,
    "despised":     -3.0, "despises":    -3.0, "loathed":     -3.0,
    "loathes":      -3.0, "liars":       -2.5, "lying":       -2.3,
    "cowards":      -2.2, "cowardly":    -2.4, "disgraceful": -2.7,
    "shamefully":   -2.5, "uselessly":   -2.5, "failures":    -2.4,
    "failed":       -2.2, "fails":       -2.0, "pitifully":   -2.5,
    "weaker":       -2.2, "weakest":     -2.4, "weakly":      -1.8,
    "ignorantly":   -2.4, "incompetently":-2.5,"hopelessly":  -2.3,
    "helplessly":   -1.8, "crazier":     -0.6, "craziest":    -0.6,
    "insanely":     -0.6, "maniacs":     -2.4, "annoyed":     -1.4,
    "annoys":       -1.5, "annoyingly":  -1.6, "ruder":       -1.8,
    "rudest":       -2.0, "rudely":      -1.8, "crueler":     -2.4,
    "cruelest":     -2.6, "cruelly":     -2.4, "unkindly":    -1.7,
    "creepy":       -2.2,
    // Modern internet-slang insults — common in real cyberbullying/mockery
    // comments but absent from the original, more "classic" insult list.
    "cringe":       -1.8, "cringey":     -1.8, "mid":         -1.2,
    "clown":        -2.0, "clownish":    -1.8, "flop":        -1.8,
    "washed":       -1.5, "npc":         -1.6, "simp":        -1.4,
    "bum":          -1.9, "lame":        -1.6, "pest":        -1.8,
    // Additional explicit insults; avoid assigning aggression to ambiguous
    // slang such as "cooked", "dead", or "ate" without contextual evidence.
    "dickhead":     -3.0, "shithead":    -3.0, "fuckwit":     -3.1,
    "dumbfuck":     -3.2, "knucklehead": -2.5, "bonehead":    -2.5,
    "airhead":      -2.3, "shitbag":     -3.0, "scumbags":    -3.0,
    "morons":       -3.0, "imbeciles":   -3.0, "assholes":    -3.1,
    "bastards":     -3.0, "dumbasses":   -2.9, "dickheads":   -3.0,

    // Positives
    "good":         1.9,  "great":       3.1,  "love":        3.0,
    "happy":        2.7,  "excellent":   3.2,  "wonderful":   3.4,
    "amazing":      3.3,  "fantastic":   3.6,  "best":        3.1,
    "kind":         2.2,  "nice":        1.8,  "awesome":     3.2,
    "thanks":       2.0,  "help":        1.5,  "beautiful":   2.8,
    "brilliant":    3.0,  "enjoy":       2.4,  "fun":         2.2,
    "glad":         2.1,  "pleased":     2.3,  "grateful":    2.8,
    "welcome":      1.9,  "perfect":     3.2,  "superb":      3.3,
    "outstanding":  3.4,  "splendid":    3.2,  "positive":    2.5,
    "peaceful":     2.4,  "calm":        2.0,  "safe":        2.2,
    // Positive words whose NEGATION ("don't deserve", "can't belong") signals aggression
    "deserve":      2.5,  "belong":      2.0,  "worthy":      2.5,
    "capable":      2.0,  "qualified":   2.0,

    // Expanded coverage — same rationale as the negative side above:
    // inflected forms of existing positive words, plus modern praise slang.
    "better":       1.9,  "greater":     2.8,  "greatest":    3.2,
    "happier":      2.5,  "happiest":    2.8,  "happily":     2.3,
    "excellently":  3.0,  "wonderfully": 3.2,  "amazingly":   3.1,
    "fantastically":3.4,  "kinder":      2.1,  "kindest":     2.4,
    "kindly":       2.0,  "nicer":       1.7,  "nicest":      1.9,
    "nicely":       1.7,  "brilliantly": 2.8,  "enjoyed":     2.2,
    "enjoys":       2.1,  "enjoying":    2.2,  "enjoyable":   2.3,
    "funny":        2.0,  "pleasing":    2.1,  "gratefully":  2.5,
    "perfectly":    3.0,  "superbly":    3.1,  "positively":  2.3,
    "peacefully":   2.2,  "calmer":      1.8,  "calmest":     2.0,
    "calmly":       1.8,  "deserved":    2.3,  "deserves":    2.3,
    "deserving":    2.2,  "worthier":    2.3,
    // Modern praise slang — the positive-side counterpart to the negative
    // slang added above, for the same social-media-comment context.
    "legend":       2.8,  "legendary":   3.0,  "slay":        2.6,
    "slayed":       2.6,  "fire":        2.2,  "banger":      2.4,
    "goated":       3.0,  "iconic":      2.6,
  };


  // Recover known abusive spellings only; never globally turn digits into letters.
  // Word boundaries prevent matches inside ordinary words (e.g. "class").
  const OBFUSCATED_LETTERS = {
    a: '[a4@а]', e: '[e3е]', i: '[i1!і]', o: '[o0о]',
    s: '[s5$ѕ]', t: '[t7т]', u: '[uυ]', c: '[cс]',
    p: '[pр]', x: '[xх]', y: '[yу]', b: '[b8]',
  };
  const SHORT_ABUSE = new Set(['kys', 'stfu', 'gtfo']);
  const OBFUSCATION_PATTERNS = Object.keys(LEXICON)
    .filter(word => LEXICON[word] <= -2 && (word.length >= 4 || SHORT_ABUSE.has(word)))
    .sort((a, b) => b.length - a.length)
    .map(word => ({ word, pattern: new RegExp(
      '(?<![\\p{L}\\p{N}])' + [...word].map(letter =>
        (OBFUSCATED_LETTERS[letter] || letter) + '+').join('[ \\p{P}\\p{S}]{0,4}') +
      '(?![\\p{L}\\p{N}])', 'giu') }));

  // Curated readable misspellings, not unrestricted edit-distance matching:
  // ordinary words such as "wore", "shirt", "shot", and "duck" must stay intact.
  const ABUSE_TYPOS = Object.freeze({
    stupdi: 'stupid', sutpid: 'stupid', stpuid: 'stupid',
    stuppid: 'stupid', stupidd: 'stupid', stpid: 'stupid',
    idoit: 'idiot', idoitt: 'idiot', idiiot: 'idiot', idiott: 'idiot',
    mroon: 'moron', morron: 'moron',
    worhtless: 'worthless', worthles: 'worthless', wothless: 'worthless',
    pathethic: 'pathetic', patheic: 'pathetic', pahtetic: 'pathetic',
    asshloe: 'asshole', asshoel: 'asshole', ashole: 'asshole',
    bastrad: 'bastard', bastadr: 'bastard',
    disguting: 'disgusting', disgusitng: 'disgusting',
    imbecille: 'imbecile', imbecil: 'imbecile',
  });


  // Derive variants from the lexicon instead of enumerating individual insults.
  // Ambiguous reconstructions are left unchanged; no arbitrary substitutions.
  const RECOVERY_WORDS = Object.keys(LEXICON).filter(word =>
    word.length >= 4 && LEXICON[word] <= -2);
  const RECOVERY_SAFE = new Set([
    'wore', 'shirt', 'shot', 'duck', 'class', 'classic', 'assignment',
    'wordless', 'moral', 'public', 'count', 'could', 'would', 'should',
    'cook', 'clock', 'dock', 'disk', 'fork', 'folk', 'shut', 'ship',
    'wit', 'white', 'whole', 'wholehearted', 'baster', 'bustard',
  ]);
  const RECOVERY_INDEX = new Map();
  function addRecovery(variant, word) {
    if (variant === word || variant.length < 4 || variant in LEXICON || RECOVERY_SAFE.has(variant)) return;
    if (!RECOVERY_INDEX.has(variant)) RECOVERY_INDEX.set(variant, new Set());
    RECOVERY_INDEX.get(variant).add(word);
  }
  for (const word of RECOVERY_WORDS) {
    if (word.length >= 5) {
      for (let i = 0; i < word.length - 1; i++) {
        addRecovery(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2), word);
      }
    }
    if (word.length >= 6) {
      for (let i = 1; i < word.length - 1; i++) addRecovery(word.slice(0, i) + word.slice(i + 1), word);
    }
    addRecovery(word.replace(/[aeiou]/g, ''), word);
  }
  function recoverWord(token) {
    if (RECOVERY_SAFE.has(token) || token in LEXICON) return token;
    const explicit = ABUSE_TYPOS[token];
    if (explicit) return explicit;
    const variants = RECOVERY_INDEX.get(token);
    if (variants?.size === 1) return [...variants][0];
    // Each mask stands for exactly one missing letter, with visible ends.
    if (/^[a-z][a-z*#_]{2,}[a-z]$/.test(token) && /[*#_]/.test(token)) {
      const visible = token.replace(/[*#_]/g, '').length;
      if (visible < 2 || token.length < 5) return token;
      const candidates = RECOVERY_WORDS.filter(word => word.length === token.length &&
        [...token].every((letter, i) => /[*#_]/.test(letter) || letter === word[i]));
      if (candidates.length === 1) return candidates[0];
    }
    return token;
  }

  // Compose disguises only when they lead to a known, unambiguous negative
  // word. Never apply numeric substitutions to ordinary text globally.
  const DISGUISE_MAP = Object.freeze({
    '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a',
    '5': 's', '$': 's', '7': 't', '8': 'b',
    '\u0430': 'a', '\u0435': 'e', '\u0456': 'i', '\u043e': 'o',
    '\u0455': 's', '\u0442': 't', '\u03c5': 'u', '\u0441': 'c',
    '\u0440': 'p', '\u0445': 'x', '\u0443': 'y',
  });
  function recoverDisguisedToken(token) {
    const lower = token.toLowerCase();
    if (RECOVERY_SAFE.has(lower) || lower in LEXICON) return token;
    const folded = [...lower.normalize('NFD')]
      .filter(letter => !/\p{M}/u.test(letter))
      .map(letter => DISGUISE_MAP[letter] || letter).join('');
    const candidates = new Set();
    for (const variant of [lower, folded, folded.replace(/([a-z])\1+/g, '$1')]) {
      const recovered = recoverWord(variant);
      if (LEXICON[recovered] <= -2 && (recovered.length >= 4 || SHORT_ABUSE.has(recovered))) {
        candidates.add(recovered);
      }
    }
    if (candidates.size !== 1) return token;
    const replacement = [...candidates][0];
    return /\p{Lu}/u.test(token) && token === token.toUpperCase()
      ? replacement.toUpperCase() : replacement;
  }

  function normalizeObfuscation(text) {
    let normalized = String(text || '').normalize('NFKC')
      .replace(/[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    normalized = normalized.replace(
      /(?<![\p{L}\p{N}\p{M}])[\p{L}\p{N}][\p{L}\p{N}\p{M}!*#_@$]{1,38}[\p{L}\p{N}\p{M}](?![\p{L}\p{N}\p{M}])/gu,
      recoverDisguisedToken);
    for (const { word, pattern } of OBFUSCATION_PATTERNS) {
      normalized = normalized.replace(pattern, match => {
        if (match.toLowerCase() === word) return match;
        // Keep emphasis for all-caps abuse so VADER's caps handling still applies.
        return /[A-Z]/.test(match) && match === match.toUpperCase() ? word.toUpperCase() : word;
      });
    }
    return normalized.replace(/(?<![\p{L}\p{N}])[a-z][a-z*#_]{2,18}[a-z](?![\p{L}\p{N}])/giu, token => {
      const replacement = recoverWord(token.toLowerCase());
      if (!replacement || replacement === token.toLowerCase()) return token;
      return token === token.toUpperCase() ? replacement.toUpperCase() : replacement;
    });
  }

  // ── Common joined-word slang — split before tokenizing ───────────────────
  // Handles "fuckyou" → "fuck you", "shutup" → "shut up", etc.
  const SLANG_SPLITS = {
    "fuckyou":      "fuck you",
    "fkyou":        "fuck you",
    "fukyou":       "fuck you",
    "shutup":       "shut up",
    "stfup":        "stfu",
    "killurself":   "kill yourself",
    "killyourself": "kill yourself",
    "kys":          "kill yourself",
    "godie":        "go die",
    "hateyou":      "hate you",
    "ihateyou":     "i hate you",
    "dumbass":      "dumb ass",
    "jackass":      "jack ass",
    "asshole":      "ass hole",
    "dipshit":      "dip shit",
    "motherfucker": "mother fucker",
    "mofo":         "mother fucker",
    "scumbag":      "scum bag",
    "braindead":    "brain dead",
    "douchebag":    "douche bag",
    "jerkoff":      "jerk off",
    "idiotface":    "idiot face",
    "stupidass":    "stupid ass",
    "uglyass":      "ugly ass",
    "loserface":    "loser face",
    "noob":         "stupid noob",
  };

  // ── Booster words (amplify sentiment) ─────────────────────────────────────
  const BOOSTERS = {
    "very":       0.293, "really":     0.293, "extremely":  0.439,
    "absolutely": 0.439, "incredibly": 0.439, "so":         0.293,
    "totally":    0.293, "completely": 0.439, "utterly":    0.439,
    "super":      0.293, "highly":     0.293, "deeply":     0.293,
    "seriously":  0.293, "genuinely":  0.293, "truly":      0.293,
  };

  // ── Negation words ─────────────────────────────────────────────────────────
  const NEGATE = new Set([
    "not","no","never","neither","barely","hardly","scarcely","without",
    "don't","dont","can't","cant","won't","wont","wouldn't","wouldnt",
    "shouldn't","shouldnt","isn't","isnt","aren't","arent",
    "doesn't","doesnt","didn't","didnt","haven't","havent",
  ]);

  const NEGATION_SCALAR = -0.74;
  const C_INCR          = 0.733;  // ALL CAPS boost

  // ── Sarcasm cues — mirrors vader_helper.py ───────────────────────────────
  // Catches known sarcastic phrase patterns so VADER's score can be corrected.
  const SARCASM_MARKERS = [
    "yeah right", "sure sure", "oh sure", "oh great", "oh wonderful",
    "oh awesome", "oh nice", "oh fantastic", "totally sure",
    "wow really", "real smart", "so smart", "nice job",
    "wow so", "just great", "just perfect", "just wonderful",
    "cool story", "whatever you say", "big surprise", "shocking really",
    "who would have thought", "who would've thought", "love that for you",
    "real genius", "such a genius", "what a genius",
  ];

  // These markers double as completely sincere standalone praise ("Nice
  // job!" said after someone actually did a nice job) far more often than
  // the others in the list ("yeah right", "real genius" are barely ever
  // sincere on their own). Only trust them as a sarcasm signal when the
  // comment has more to it than just the bare phrase — mockery embedded in
  // a longer comment ("nice job breaking it") still counts.
  const STANDALONE_SINCERE_MARKERS = new Set([
    "nice job", "so smart", "oh great", "oh wonderful", "oh awesome",
    "oh nice", "oh fantastic", "oh sure", "totally sure", "wow really",
  ]);

  // Strips a leading subject+copula ("you're", "that's", "she's"...) so
  // "You are so smart!" reduces to "so smart" just like the bare phrase
  // does — real compliments are almost always phrased with a subject, not
  // said as a bare two-word message.
  const LEADING_SUBJECT = /^(?:you're|you are|that'?s|he'?s|she'?s|i'?m)\s+/;

  function detectSarcasmCues(text) {
    const lower = text.toLowerCase();
    const bare  = lower.replace(/[!?.,\s]+$/g, "").trim().replace(LEADING_SUBJECT, "");
    let cue = 0;
    const matched = [];

    for (const marker of SARCASM_MARKERS) {
      if (!lower.includes(marker)) continue;
      if (STANDALONE_SINCERE_MARKERS.has(marker) && bare === marker) continue;
      cue += 0.5;
      matched.push(marker);
    }

    return { cue: Math.min(cue, 1.0), matched };
  }

  function isAllCaps(token) {
    return token.length > 1 &&
           token === token.toUpperCase() &&
           /[A-Z]/.test(token);
  }

  // ── Preprocess: expand joined slang before tokenizing ─────────────────────
  function preprocess(text) {
    let processed = text;
    for (const [joined, expanded] of Object.entries(SLANG_SPLITS)) {
      // case-insensitive replacement
      processed = processed.replace(new RegExp(`\\b${joined}\\b`, "gi"), expanded);
    }
    return processed;
  }

  // ── Tokenize ───────────────────────────────────────────────────────────────
  function tokenize(text) {
    return text.trim().split(/\s+/)
      .map(t => t.replace(/[^a-zA-Z'!?]/g, ""))
      .filter(Boolean);
  }

  // ── Backhanded insults ──────────────────────────────────────────────────
  // Detects an explicit "you are/you're <insult word>" pattern so a
  // trailing compliment can't cancel out a leading insult.
  const CONTRAST_SPLIT = /\b(?:but|however|although|though)\b/i;
  const DIRECT_INSULT_SUBJECT = /\byou\s*(?:'re|re|are)\b/i;
  const INSULT_WORDS = new Set([
    "worthless", "stupid", "idiot", "idiotic", "ugly", "pathetic", "useless",
    "dumb", "trash", "garbage", "disgusting", "loser", "moron", "incompetent",
    "pointless", "hopeless", "hideous", "repulsive", "horrible", "terrible",
    "awful", "failure", "nothing", "waste", "embarrassment", "disgrace",
  ]);

  function hasDirectInsult(clause) {
    if (!DIRECT_INSULT_SUBJECT.test(clause)) return false;
    const words = (clause.toLowerCase().match(/[a-z]+/g) || []);
    return words.some(w => INSULT_WORDS.has(w));
  }

  // Strips leading/trailing "!"/"?" before dictionary lookups, since
  // tokenize() deliberately keeps them attached for the caps/exclaim checks.
  function stripEdgePunct(token) {
    return token.replace(/^[!?]+|[!?]+$/g, "");
  }

  // ── Compute compound score for a single piece of text (no sarcasm/
  // backhanded-insult correction — analyze() applies those on top).
  // Pass trace=true to also get back which words matched and why. ──────────
  function computeCompound(text, trace) {
    const processed = preprocess(text);
    const tokens     = tokenize(processed);

    const origTokens = tokenize(text);
    const hasCaps     = origTokens.some(isAllCaps);

    let sentiments  = [];
    let matchedWords = [];

    tokens.forEach((token, i) => {
      const lower = stripEdgePunct(token.toLowerCase());
      if (!(lower in LEXICON)) return;

      const baseValence = LEXICON[lower];
      let valence  = baseValence;
      let boosted  = false;
      let negated  = false;
      let capsBoosted = false;

      // ALL CAPS boost
      if (isAllCaps(token) && hasCaps) {
        valence += valence > 0 ? C_INCR : -C_INCR;
        capsBoosted = true;
      }

      // Booster words before this token (up to 3 words back)
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const b = stripEdgePunct(tokens[j].toLowerCase());
        if (b in BOOSTERS) {
          const scalar = BOOSTERS[b] * (i - j === 1 ? 1 : 0.95);
          valence += valence > 0 ? scalar : -scalar;
          boosted = true;
        }
      }

      // Negation (1-3 words before)
      for (let n = Math.max(0, i - 3); n < i; n++) {
        if (NEGATE.has(stripEdgePunct(tokens[n].toLowerCase()))) {
          valence *= NEGATION_SCALAR;
          negated = true;
          break;
        }
      }

      sentiments.push(valence);
      if (trace) {
        matchedWords.push({ word: lower, baseValence, valence, boosted, negated, capsBoosted });
      }
    });

    // Punctuation boost — exclamation marks amplify sentiment
    const exclamations = (text.match(/!/g) || []).length;
    if (sentiments.length > 0 && exclamations > 0) {
      const sign = sentiments.reduce((s, v) => s + v, 0) >= 0 ? 1 : -1;
      sentiments.push(sign * Math.min(exclamations, 4) * 0.292);
    }

    // Aggregate into compound score [-1, +1]
    const sum      = sentiments.reduce((s, v) => s + v, 0);
    // ALPHA=15 is VADER's standard normalization constant, empirically tuned
    // for ~15-word social-media posts carrying several sentiment words. On a
    // short comment (few tokens total) it over-suppresses a lone but strong
    // signal — e.g. a single negated insult like "not beautiful" — so scale
    // it down toward ALPHA_FLOOR for shorter texts instead of always using 15.
    const ALPHA       = 15;
    const ALPHA_FLOOR = 10;
    const alpha    = Math.max(ALPHA_FLOOR, Math.min(ALPHA, tokens.length));
    const norm     = Math.sqrt(sum * sum + alpha);
    const compound = sentiments.length > 0 ? sum / norm : 0;

    return trace ? { compound, matchedWords, exclamations, sum, alpha } : compound;
  }

  // VADER compound of the whole text, unless one clause directly insults
  // "you" — in that case that clause's own compound is used instead.
  function worstClauseCompound(text) {
    const whole = computeCompound(text);
    const clauses = text.split(CONTRAST_SPLIT).map(c => c.trim()).filter(Boolean);
    if (clauses.length <= 1) return whole;

    for (const clause of clauses) {
      if (hasDirectInsult(clause)) return computeCompound(clause);
    }
    return whole;
  }

  // ── Main analyze function ──────────────────────────────────────────────────
  function analyze(text) {
    text = normalizeObfuscation(text);
    let compound = worstClauseCompound(text);

    // Sarcasm correction — positive-reading text with sarcasm cues is
    // flipped negative (sarcastic praise is aggression, not sentiment);
    // already-negative text with cues is reinforced slightly.
    const { cue } = detectSarcasmCues(text);
    if (cue > 0 && compound > 0) {
      compound = -compound - (0.4 * cue);
    } else if (cue > 0 && compound <= 0) {
      compound = compound - (0.2 * cue);
    }
    compound = Math.max(-1.0, Math.min(1.0, compound));

    // Only negative sentiment = aggression (max(0, -compound), not abs value).
    const aggressionScore = parseFloat(Math.max(0, -compound).toFixed(4));

    return {
      compound:         parseFloat(compound.toFixed(4)),
      aggression_score: aggressionScore,
    };
  }

  // ── Analyze with a full step-by-step trace ────────────────────────────────
  // Same computation as analyze(), but also reports which lexicon words
  // matched, whether the backhanded-insult clause override fired, and
  // whether a sarcasm marker flipped the score — used by the popup's
  // "how the algorithm works" demo view.
  function analyzeWithTrace(text) {
    const originalText = text;
    text = normalizeObfuscation(text);
    const wholeTrace = computeCompound(text, true);
    const clauses = text.split(CONTRAST_SPLIT).map(c => c.trim()).filter(Boolean);

    let baseCompound  = wholeTrace.compound;
    let baseTrace     = wholeTrace;
    let insultOverride = null;

    if (clauses.length > 1) {
      for (const clause of clauses) {
        if (hasDirectInsult(clause)) {
          const clauseTrace = computeCompound(clause, true);
          insultOverride = { clause, compound: parseFloat(clauseTrace.compound.toFixed(4)) };
          baseCompound = clauseTrace.compound;
          baseTrace    = clauseTrace;
          break;
        }
      }
    }

    const { cue, matched: matchedMarkers } = detectSarcasmCues(text);

    let compound = baseCompound;
    let sarcasmApplied = false;
    if (cue > 0 && compound > 0) {
      compound = -compound - (0.4 * cue);
      sarcasmApplied = true;
    } else if (cue > 0 && compound <= 0) {
      compound = compound - (0.2 * cue);
      sarcasmApplied = true;
    }
    compound = Math.max(-1.0, Math.min(1.0, compound));

    const aggressionScore = parseFloat(Math.max(0, -compound).toFixed(4));

    return {
      originalText,
      normalizedText: text,
      matchedWords: baseTrace.matchedWords,
      exclamations: baseTrace.exclamations,
      valenceSum: baseTrace.sum,
      alpha: baseTrace.alpha,
      wholeCompound: parseFloat(wholeTrace.compound.toFixed(4)),
      clauses: clauses.length > 1 ? clauses : null,
      insultOverride,
      sarcasmCue: cue,
      matchedMarkers,
      sarcasmApplied,
      compound: parseFloat(compound.toFixed(4)),
      aggression_score: aggressionScore,
    };
  }

  // Exposed for naive_bayes.js's swear-as-intensifier check — true if this
  // lexicon has the word with a positive valence (e.g. "beautiful", "great").
  function isPositiveLexiconWord(word) {
    const lower = word.toLowerCase();
    return lower in LEXICON && LEXICON[lower] > 0;
  }

  // Mirror of isPositiveLexiconWord — true for a negative-valence word (e.g.
  // "ugly", "stupid"). Used to catch the opposite noisy-NB case: a "not_X"
  // token where X is a known-negative word (e.g. "not_ugly") is a negated
  // insult and should read as safe-leaning, but NB's per-word push for it
  // is built from very few training examples (negated phrases are rare) and
  // can noisily lean "aggressive" anyway — same root cause as the positive-
  // word case above, just on the other sign.
  function isNegativeLexiconWord(word) {
    const lower = word.toLowerCase();
    return lower in LEXICON && LEXICON[lower] < 0;
  }

  // Exposes the same standalone-sincere-aware marker matching used inside
  // analyze()/analyzeWithTrace(), so naive_bayes.js's cue_X feature builder
  // can't drift out of sync with VADER's own sarcasm-cue logic again.
  function matchedSarcasmMarkers(text) {
    return detectSarcasmCues(text).matched;
  }

  return {
    analyze, analyzeWithTrace, isPositiveLexiconWord, isNegativeLexiconWord,
    SARCASM_MARKERS, matchedSarcasmMarkers, normalizeObfuscation,
  };
})();
