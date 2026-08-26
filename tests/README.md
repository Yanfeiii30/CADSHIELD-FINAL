# Automated JavaScript tests

These tests execute the JavaScript that is shipped in `EXTENSION/`. They use
only Node's built-in test runner, assertions, filesystem API, and VM API. No
package installation or network access is required.

Run all static checks and automated tests from the repository root with Node
18 or newer:

```powershell
npm run check
```

To run only the automated tests without the static project checks:

```powershell
node --test tests\*.test.cjs
```

The suite covers:

- the shipped Naive Bayes model and `vocab.json`;
- VADER scoring, negation, joined slang, sarcasm, and trace parity;
- hybrid scoring rules and shared detection configuration;
- live-content and popup Test-tab scoring parity, including 128-token truncation;
- independent Naive Bayes and VADER modes;
- blocklist and whitelist precedence;
- algorithm-mode and custom-filter storage synchronization;
- manifest and popup dependency ordering;
- page/privacy rules, per-tab detection logs, and diagnostics; and
- JavaScript syntax plus manifest/vocabulary JSON integrity.

`support/browser-harness.cjs` supplies small Chrome Storage, Runtime, XHR, and
DOM test doubles. The runtime tests load the real browser scripts into an
isolated Node VM rather than maintaining a second implementation of the
algorithms.

These automated tests do not replace a browser smoke test. Installation,
popup layout, real MutationObserver scanning, and blur/reveal rendering still
need to be checked in each supported browser because Node does not provide a
real extension host or rendering engine.
