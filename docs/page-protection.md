# Page protection

The page protection dialog is enabled by default. CAD Shield blurs flagged text and shows one centered harmful-language dialog at three distinct flagged text blocks. There is no earlier warning card.

The dialog can be disabled through CADConfig.protection.enabled in EXTENSION/config.js. Its threshold is configurable through CADConfig.protection.blockAfter. Model detections and custom keyword matches both count. Existing whitelist precedence and private-site exclusions apply.

Go back returns to the previous history entry (or a blank page if none exists). Keep reading and Escape dismiss the modal while keeping individual blur controls active. The dialog appears only once per URL during the current document's lifetime, including across scanner resets, settings changes, and same-document navigation back to that URL. A full page reload starts a new visit. Disabling the extension removes the protection screen.

Counts track distinct DOM elements, not individual malicious words. Rescanning an element does not increase the count; replacement elements can count again. URL changes reset page-level counts when the scanner next runs.

Protection activates after loaded text is classified; it does not cancel network loading or guarantee text is never visible before detection.

Reload the unpacked extension and refresh the page. To test the default behavior, add three separate paragraphs containing a custom blocked phrase on a public test page. Expect individual blurs with no dialog before three, then a centered modal with Go back and Keep reading. Keep reading should preserve individual blurs. Reload to test Go back. With page alerts explicitly disabled, expect only individual blurs.
