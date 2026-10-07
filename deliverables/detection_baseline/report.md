# Detection baseline

Hand-authored diagnostic examples. Expected labels distinguish targeted aggression from criticism, reporting, negation, and harmless profanity. Some labels depend on context and should be reviewed. Existing regression examples overlap this set; these are not independent test data or production accuracy estimates.

Mode: Hybrid; shipped model and thresholds; empty whitelist/blocklist. Each result was checked against the content script analysis function. DOM collection and actual page rendering are outside this evaluation. Extension-file hashes were verified unchanged.

Cases: 68. Aggressive caught: 25/35. Aggressive missed: 10. Harmless falsely flagged: 6/33.

| Category | Cases | Caught aggression | Missed aggression | Harmless flagged | Harmless accepted |
|---|---:|---:|---:|---:|---:|
| direct_insults | 6 | 3 | 0 | 0 | 3 |
| threats | 6 | 1 | 2 | 0 | 3 |
| exclusion_and_harm | 6 | 2 | 1 | 0 | 3 |
| slang | 6 | 2 | 1 | 1 | 2 |
| negation | 6 | 3 | 0 | 1 | 2 |
| quotation_and_reporting | 6 | 3 | 0 | 3 | 0 |
| praise_and_profanity | 6 | 2 | 1 | 0 | 3 |
| ordinary_words | 6 | 0 | 0 | 1 | 5 |
| obfuscation | 16 | 9 | 3 | 0 | 4 |
| long_text | 4 | 0 | 2 | 0 | 2 |

## Missed aggressive messages

| ID | Message | Hybrid score | Truncated | English accepted |
|---|---|---:|---|---|
| threats-01 | I will find you and break your neck. | 0.1631 | false | true |
| threats-03 | I know where you live. You will not make it home tonight. | 0.2163 | false | true |
| exclusion_and_harm-03 | Do everyone a favor and end your life. | 0.3790 | false | true |
| slang-03 | You are a total waste of oxygen. | 0.4734 | false | true |
| praise_and_profanity-02 | You are pathetic, but your presentation looks great. | 0.4657 | false | true |
| obfuscation-08 | You are a \|d\|ot. | 0.0812 | false | true |
| obfuscation-09 | You are a stup!d-m0r0n. | 0.0000 | false | true |
| obfuscation-11 | You are a stvp1d person. | 0.1717 | false | true |
| long_text-01 | [Long message; full text in results.csv] ng is scheduled for Monday and the agenda is available online. You are a worthless disgusting idiot. | 0.0000 | true | true |
| long_text-02 | [Long message; full text in results.csv] agenda is available online. The meeting is scheduled for Monday and the agenda is available online.  | 0.3687 | true | true |

## Harmless messages falsely flagged

| ID | Message | Hybrid score |
|---|---|---:|
| slang-05 | That joke has me dead, so funny. | 0.5454 |
| negation-06 | Never call someone a moron. | 0.8711 |
| quotation_and_reporting-04 | Someone called me a worthless idiot and I need help reporting it. | 0.8908 |
| quotation_and_reporting-05 | The moderator removed a comment that said "go kill yourself". | 0.8921 |
| quotation_and_reporting-06 | Calling people stupid is unacceptable. | 0.8216 |
| ordinary_words-05 | This awful weather ruined my picnic. | 0.5877 |

## Diagnostic mode comparison

Same examples across modes; do not select a winner from this small constructed sample.

| Mode | Caught | Missed | Harmless flagged | Harmless accepted |
|---|---:|---:|---:|---:|
| hybrid | 25 | 10 | 6 | 27 |
| nb | 26 | 9 | 10 | 23 |
| vader | 25 | 10 | 5 | 28 |

Reproduce: `node scripts/evaluate-detection-baseline.cjs`. Complete inputs, normalized/scored text, scores, configuration, and source hashes are in results.json. Evaluation does not retrain the model or alter detection rules.
