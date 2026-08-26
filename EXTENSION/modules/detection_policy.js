/**
 * Pure detection-policy helpers shared by live scanning and the Test tab.
 * Algorithm implementations remain in lib/naive_bayes.js and lib/vader.js.
 *
 * @requires CADConfig
 */
globalThis.DetectionPolicy = (() => {
  const COMMON_ENGLISH_WORDS = new Set([
    "the","be","to","of","and","a","in","that","have","i","it","for","not","on","with",
    "he","as","you","do","at","this","but","his","by","from","they","we","say","her",
    "she","or","an","will","my","one","all","would","there","their","what","so","up",
    "out","if","about","who","get","which","go","me","when","make","can","like","time",
    "no","just","him","know","take","people","into","year","your","good","some","could",
    "them","see","other","than","then","now","look","only","come","its","over","think",
    "also","back","after","use","two","how","our","work","first","well","way","even",
    "new","want","because","any","these","give","day","most","us","is","are","was","were",
    "been","being","did","does","doing","had","has","having","am","yes","really","much",
    "very","too","here","how's","thank","thanks","please","sorry",
  ]);

  const COMMON_TAGALOG_WORDS = new Set([
    "ang","ng","mga","na","ay","ako","ikaw","siya","kami","tayo","kayo","sila",
    "mo","ko","niya","natin","namin","nila","akin","iyo","kanya",
    "hindi","oo","opo","po","ito","iyan","iyon","yun","yung","dito","diyan","doon",
    "din","rin","lang","pa","muna","kasi","kung","pero","para","dahil",
    "may","meron","mayroon","wala","gusto","ayaw","salamat","paalam","kumusta",
    "maganda","mahal","araw","gabi","umaga","hapon","ngayon","bukas","kahapon",
    "talaga","naman","sobrang","grabe","pagod","saya","masaya","sarap","masarap",
    "tara","paano","bakit","sino","ano","kailan","saan","alin","sana","siguro","baka","lahat","yata",
  ]);

  const SECOND_PERSON_WORDS = new Set(["you","youre","your","yours","yourself","u","ur"]);
  const THIRD_PARTY_MARKERS = new Set([
    "he","hes","she","shes","they","theyre","them",
    "admin","admins","people","wikipedia","wikipedians",
    "everyone","everybody","somebody",
  ]);
  const EXTRA_PROFANITY = new Set([
    "cunt","bitch","dick","dickhead","cock","pussy","fag","faggot",
    "phalus","penis","whore","slut","nigga","nigger","pissed","ass","asshole",
  ]);
  const SWEAR_WORDS_FOR_DISTRESS_GATE = new Set([
    "fucking","fuckin","fuck","shit","shitty","damn","goddamn",
    "hella","freaking","frickin","bloody","effing",
  ]);

  const SELF_REFERENCE_PATTERN = /\bi\s*(?:'?m|am|feel|feels|felt|think|thought|hate)\b|\bmyself\b/;
  const SELF_REFERENCE_IDIOM_EXCLUSION = /\bi(?:'?ve| have)\s+(?:ever\s+)?(?:seen|read|heard|watched|played|experienced|had)\b/;
  const QUESTION_STARTERS = Object.freeze([
    "am i","is it","are you","do you","what is","what are",
    "why is","why are","how do","how is","can i","can you",
    "should i","would you","does it","who is","where is",
    "when is","which is","will you","have you","did you",
  ]);

  function truncateTokens(text, maxTokens = CADConfig.detection.maximumTokens) {
    const words = text.split(/\s+/);
    return words.length <= maxTokens ? text : words.slice(0, maxTokens).join(" ");
  }

  function looksEnglish(text, minRatio = 0.15) {
    const words = text.toLowerCase().match(/[a-z']+/g) || [];
    if (words.length < 3) return true;
    const tagalogHits = words.filter(word => COMMON_TAGALOG_WORDS.has(word)).length;
    if ((tagalogHits / words.length) >= minRatio) return false;
    const englishHits = words.filter(word => COMMON_ENGLISH_WORDS.has(word)).length;
    return (englishHits / words.length) >= minRatio;
  }

  function isSelfDirectedDistress(text) {
    const lower = text.toLowerCase().replace(/'/g, "");
    const words = lower.match(/[a-z]+/g) || [];
    if (words.length === 0) return false;
    if (words.some(word => SECOND_PERSON_WORDS.has(word))) return false;
    if (words.some(word => THIRD_PARTY_MARKERS.has(word))) return false;
    if (words.some(word => SWEAR_WORDS_FOR_DISTRESS_GATE.has(word))) return false;
    if (words.some(word => EXTRA_PROFANITY.has(word))) return false;
    if (SELF_REFERENCE_IDIOM_EXCLUSION.test(lower)) return false;
    return SELF_REFERENCE_PATTERN.test(lower);
  }

  function isQuestion(text) {
    const normalized = text.trim().toLowerCase();
    if (normalized.endsWith("?")) return true;
    return QUESTION_STARTERS.some(starter => normalized.startsWith(starter));
  }

  function scoreForMode({ mode, naiveBayesScore, vaderScore, useVaderOnly = false, text }) {
    const threshold = CADConfig.thresholdForMode(mode);
    let score;
    const isSingleAlgorithm = mode === CADConfig.modes.NAIVE_BAYES || mode === CADConfig.modes.VADER;

    if (mode === CADConfig.modes.NAIVE_BAYES) {
      score = naiveBayesScore;
    } else if (mode === CADConfig.modes.VADER) {
      score = vaderScore;
    } else if (useVaderOnly) {
      score = vaderScore;
    } else {
      score = (CADConfig.detection.hybridNaiveBayesWeight * naiveBayesScore) +
        (CADConfig.detection.hybridVaderWeight * vaderScore);
    }

    if (!isSingleAlgorithm && score >= threshold && !looksEnglish(text)) {
      score = 0;
    }
    if (!isSingleAlgorithm && score >= threshold && isSelfDirectedDistress(text)) {
      score *= CADConfig.detection.selfDistressDampen;
    }

    return Object.freeze({ score, threshold, isAggressive: score >= threshold });
  }

  return Object.freeze({ truncateTokens, looksEnglish, isSelfDirectedDistress, isQuestion, scoreForMode });
})();
