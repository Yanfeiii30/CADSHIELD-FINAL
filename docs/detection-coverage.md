# Detection coverage

The browser detector normalizes known disguised words before Naive Bayes and
VADER scoring. The live scanner and popup use the same normalization. It handles
numbers and selected Unicode look-alikes, repeated letters, bounded inserted
punctuation, selected invisible characters, and combining marks on recoverable
words. Recovery also supports unambiguous masks, selected misspellings, missing
vowels, and combinations such as `stup1dd`, `1d0it`, and `m0r*n`.

The lexicon includes additional explicit insults and plural forms. Disguised
`kys`, `stfu`, and `gtfo` are supported. Common English chat forms such as `u`,
`ur`, and `r` count as English-language evidence; they do not independently
increase aggression scores.

Recovery is restricted to known negative vocabulary. Ambiguous masks, unknown
slang, and arbitrary substitutions remain unresolved. Context and the configured
decision threshold still determine the final verdict. This is not universal
aggression detection: implicit threats, unfamiliar expressions, images, other
languages, and context requiring earlier messages can still be missed. Existing
private-page exclusions, whitelist rules, and the 128-token scoring limit remain.

Run `npm run check` for static and behavioral checks. Obfuscation tests compare
disguised and plain scores, trace consistency, live Hybrid decisions, negation,
and selected harmless examples. Passing these tests does not establish accuracy
on unseen comments. The saved training evaluation has not been rerun for these
runtime changes, so its metrics should not be presented as validation of this
expanded coverage.
