# Detection sample results

79 examples, each run in Hybrid, Naive Bayes and VADER (237 checks). Protection enabled; empty custom lists. Results measure calls to ResultDisplay.blur from the live analyzeElement controller in the automated harness, not visual rendering or website DOM extraction.

| # | Scenario | Exact input | Hybrid | Naive Bayes | VADER |
|---|---|---|---|---|---|
| 1 | Normal insult | `You are a worthless idiot.` | Blur | Blur | Blur |
| 2 | Normal insult | `You are a stupid moron.` | Blur | Blur | Blur |
| 3 | Targeted insult | `You are pathetic and disgusting.` | Blur | Blur | Blur |
| 4 | Threat | `I will kill you.` | Blur | Blur | Blur |
| 5 | Hostile instruction | `Go kill yourself.` | Blur | Blur | Blur |
| 6 | Slang | `stfu` | Blur | Blur | Blur |
| 7 | Joined slang | `fuckyou` | Blur | Blur | Blur |
| 8 | Numbers | `You are stup1d.` | Blur | Blur | Blur |
| 9 | Numbers | `You are a worthless 1d10t.` | Blur | Blur | Blur |
| 10 | Symbols | `You are $tupid.` | Blur | Blur | Blur |
| 11 | Repeated letters | `You are stuuupid.` | Blur | Blur | Blur |
| 12 | Spaced letters | `You are an i d i o t.` | Blur | Blur | Blur |
| 13 | Spaced letters | `u are u g l y bithc` | Blur | Blur | Blur |
| 14 | Dots | `You are an i.d.i.o.t.` | Blur | Blur | Blur |
| 15 | Hyphens | `You are s-t-u-p-i-d.` | Blur | Blur | Blur |
| 16 | Underscores | `You are s_t_u_p_i_d.` | Blur | Blur | Blur |
| 17 | Bracket | `You are stu[pid.` | Blur | Blur | Blur |
| 18 | Parenthesis | `You are stu(pid.` | Blur | Blur | Blur |
| 19 | Slash | `You are stu/pid.` | Blur | Blur | Blur |
| 20 | Asterisk | `You are stu*pid.` | Blur | Blur | Blur |
| 21 | Full-width | `You are ｓｔｕｐｉｄ.` | Blur | Blur | Blur |
| 22 | Lookalike | `You are stupіd.` | Blur | Blur | Blur |
| 23 | Hidden character | `You are stu​pid.` | Blur | Blur | Blur |
| 24 | Typo | `You are sutpid.` | Blur | Blur | Blur |
| 25 | Typo | `You are stpuid.` | Blur | Blur | Blur |
| 26 | Missing letter | `You are stpid.` | Blur | Blur | Blur |
| 27 | Typo | `You are an idoit.` | Blur | Blur | Blur |
| 28 | Typo | `You are worhtless.` | Blur | Blur | Blur |
| 29 | Typo | `You are pathethic.` | Blur | Blur | Blur |
| 30 | Typo | `You are an asshloe.` | Blur | Blur | Blur |
| 31 | Typo | `You are disgusitng.` | Blur | Blur | Blur |
| 32 | Unsupported typo | `You are a bithc.` | No blur | Blur | No blur |
| 33 | Combined | `You are a stuuup1d 1d10t.` | Blur | Blur | Blur |
| 34 | Negation | `You are not stupid.` | No blur | Blur | No blur |
| 35 | Negated obfuscation | `You are not stup1d.` | No blur | Blur | No blur |
| 36 | Negated typo | `You are not an idoit.` | No blur | Blur | No blur |
| 37 | Positive profanity | `That is fucking beautiful.` | No blur | No blur | No blur |
| 38 | Praise | `You are so smart!` | No blur | No blur | No blur |
| 39 | Harmless | `Thank you for helping with my class assignment.` | No blur | No blur | No blur |
| 40 | Harmless similar words | `I wore a shirt and saw a duck.` | No blur | No blur | No blur |
| 41 | Context | `The word idiot is an insult.` | Blur | Blur | Blur |
| 42 | Reported abuse | `Someone called me an idiot.` | Blur | Blur | Blur |
| 43 | Mixed context | `You are stupid but your work is great.` | Blur | Blur | Blur |
| 44 | Normal | `You are a disgusting coward.` | Blur | Blur | Blur |
| 45 | Normal | `You are a useless loser.` | Blur | Blur | Blur |
| 46 | Normal | `You are an incompetent fool.` | Blur | Blur | Blur |
| 47 | Numbers | `You are a m0r0n.` | Blur | Blur | Blur |
| 48 | Numbers | `You are an a55hole.` | Blur | Blur | Blur |
| 49 | Numbers | `You are a b1tch.` | Blur | Blur | Blur |
| 50 | Symbols | `You are a b!tch.` | Blur | Blur | Blur |
| 51 | Spaced letters | `You are a b i t c h.` | Blur | Blur | Blur |
| 52 | Spaced letters | `You are w o r t h l e s s.` | Blur | Blur | Blur |
| 53 | Dots | `You are a m.o.r.o.n.` | Blur | Blur | Blur |
| 54 | Brackets | `You are an id[iot.` | Blur | Blur | Blur |
| 55 | Braces | `You are a mor{on.` | Blur | Blur | Blur |
| 56 | Slash | `You are a bi/tch.` | Blur | Blur | Blur |
| 57 | Repeated | `You are a looooser.` | Blur | Blur | Blur |
| 58 | Repeated | `You are an idiooot.` | Blur | Blur | Blur |
| 59 | Typo | `You are an asshoel.` | Blur | Blur | Blur |
| 60 | Typo | `You are a bastrad.` | Blur | Blur | Blur |
| 61 | Typo | `You are wothless.` | Blur | Blur | Blur |
| 62 | Typo | `You are a morron.` | Blur | Blur | Blur |
| 63 | Typo | `You are an imbecille.` | Blur | Blur | Blur |
| 64 | Typo | `You are disguting.` | Blur | Blur | Blur |
| 65 | Unsupported typo | `You are stpd.` | No blur | No blur | No blur |
| 66 | Masked letters | `You are a b***h.` | No blur | No blur | No blur |
| 67 | Masked letters | `You are an id**t.` | No blur | No blur | No blur |
| 68 | Combined | `You are a st.u.p1d m0r0n.` | Blur | Blur | Blur |
| 69 | Combined | `You are a w o r t h l e s s idoit.` | Blur | Blur | Blur |
| 70 | Negation | `You are not a m0r0n.` | No blur | Blur | No blur |
| 71 | Negation | `You are not worhtless.` | No blur | No blur | No blur |
| 72 | Reassurance | `Do not call yourself stupid.` | Blur | Blur | No blur |
| 73 | Reported abuse | `He called me a b1tch yesterday.` | Blur | Blur | Blur |
| 74 | Educational | `Please explain why calling someone stupid is hurtful.` | Blur | Blur | Blur |
| 75 | Ordinary | `The classic assignment is about butterflies.` | No blur | No blur | No blur |
| 76 | Positive | `You did a wonderful job today.` | No blur | No blur | No blur |
| 77 | Ambiguous | `That idea is stupid.` | Blur | Blur | Blur |
| 78 | Slang | `kys` | Blur | Blur | Blur |
| 79 | Slang | `gtfo` | Blur | Blur | Blur |

Limits: unsupported typos and masked letters can be missed. Negation, educational mentions, and reported abuse can produce false positives. The hidden-character case uses U+200B; the lookalike case uses Cyrillic і. These examples are not an accuracy benchmark or exhaustive coverage.
