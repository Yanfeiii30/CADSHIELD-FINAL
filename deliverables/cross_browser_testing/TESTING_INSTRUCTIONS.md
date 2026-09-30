# Cross browser compatibility testing

Scope: Windows desktop Google Chrome, Microsoft Edge, Brave, and Opera only.
Use the actual `EXTENSION` source folder. This kit never installs extensions,
changes their weights, or marks browser functionality as passed automatically.

## 1. Start the kit

Open PowerShell in this folder and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start_Cross_Browser_Test.ps1
```

This command uses a process-only execution-policy setting; it does not change your
machine policy. If organizational policy blocks the script, use an approved testing machine.
No Python, Node, Word, or administrator access is needed by the kit.

The script discovers installed browser executables through App Paths registry entries
and common per-user and machine installation folders, records their exact file and
product version strings in `browser_versions.json` and `.csv`, hashes the extension
files, starts a read-only server bound to `127.0.0.1`, and requests a test tab in each
installed browser. It does not launch Opera GX.

It serves only the test page, form, form script, and test definitions. It does not serve
your repository, screenshots, or exported results. The server runs hidden until stopped.
If port 8765 is busy, run with `-Port 8766`. Use `-InventoryOnly` to collect versions
without opening browsers, or `-NoBrowserLaunch` to start the server without opening them.

For portable or nonstandard installations, explicitly select their executable paths:

```powershell
.\Start_Cross_Browser_Test.ps1 -BrowserPaths @{Chrome='D:\Apps\Chrome\chrome.exe';Opera='D:\Apps\Opera\opera.exe'}
```

Only override the browsers that need it. Copy this entire kit folder together if sharing.
If the extension is elsewhere, supply `-ExtensionPath 'C:\path\to\EXTENSION'`.

Archive the current inventory and results together before starting a new run: each
launcher run replaces `browser_versions.json` and `.csv` and creates a new run ID.
If a browser is absent, its tests must remain Not Tested unless you install it and
collect a new inventory. Verify each running browser's version using its About page;
file product versions can include a different format (especially Brave). Record the
About-page version in browser observations. If the executable changed through an
update, collect a new inventory before recording that run's results.

## 2. Load the actual extension in each browser

Use a dedicated test profile if possible. Close unrelated webpages so they do not
contribute to logs and counters. The extension toggle and lists are stored per profile.

| Browser | Extension management address |
|---|---|
| Google Chrome | `chrome://extensions` |
| Microsoft Edge | `edge://extensions` |
| Brave | `brave://extensions` |
| Opera | `opera://extensions` |

In each browser:

1. Open its extension management address.
2. Enable **Developer mode** (the switch position may differ by browser).
3. Click **Load unpacked** and select the **EXTENSION** folder that directly contains
   `manifest.json`. Do not select the repository, kit folder, or a ZIP archive.
4. Confirm **Cyber-Aggression Detector** is enabled. Inspect any errors. Pin its
   **CAD Shield** popup using the browser's extensions menu.
5. Ensure site access allows the local test URL. In Opera, also check the extension's
   site-access settings if scripts are not injected. Do not bypass organizational restrictions.
6. Open or refresh `http://127.0.0.1:8765/cross_browser_test_page.html` (use your selected
   port). Preserve the browser/run query parameters when using the launcher-created tab.
   Do not open the page as a `file://` URL; localhost avoids file-access permission differences.
7. Open the popup and check the protection switch is on. Under **Detection**, click
   **Hybrid**. If Hybrid is already selected, selecting it again does not trigger a reload;
   switch to another mode and back when explicitly testing a change.

The source fixes the weights at 0.60 NB / 0.40 VADER and threshold at 0.50 in
`EXTENSION/config.js`. Do not edit these values. Allow at least 5 seconds for the
initial scheduled scans. If detection fails, record the failure and actual delay;
waiting 5 seconds is a test procedure, not a guaranteed latency claim.

## 3. Perform the tests in this order

Before baseline testing, remove prior custom entries from both lists in the test profile.
Do not put `ugly` on both lists: adding a term may move it out of the other list.
Keep the controlled page active when changing extension settings; the active tab is reloaded.
Use the results form in a separate tab after observing each check.

| ID | Procedure and evidence required to record Pass |
|---|---|
| 1 | Confirm the actual extension is enabled, the popup opens, and no load error prevents operation. A browser window opening is not sufficient. |
| 2 | On the controlled page, switch protection off. Confirm a reload and no extension masking. Switch it on and confirm another reload and scanning resumes. |
| 3 | Select Hybrid. In **Settings**, enable **Expert Mode** to expose the **Test** and **Steps** tabs. Enter Sample A in **Test** and click **Analyze Text**; the explanation is shown in **Steps**. Inspect the displayed NB, VADER, and combined score; check the standard blend equals `0.60 * NB + 0.40 * VADER` within displayed rounding, with threshold 0.50. Capture the trace and confirm Hybrid is selected for live scanning. Selection alone does not prove the formula. Runtime guards and custom-list overrides must not be mistaken for the ordinary blend. If a guard intervenes, document it and use an ordinary eligible sample to inspect the blend, or leave this check Not Tested. |
| 4 | With protection on and baseline lists empty, confirm Sample A is detected and blurred by the extension. |
| 5 | Confirm Sample B remains visible with protection on. |
| 6 | Click the extension's eye icon beside Sample A and confirm the text becomes readable. |
| 7 | Click the same eye icon again and confirm Sample A is blurred again. Capture separate evidence for revealed and re-blurred states where possible. |
| 8 | Open **Settings > Blocklist**, enter `ugly`, and click its add button. The active test page should reload. Confirm Sample C is filtered and its log/trace identifies the custom keyword outcome; blur alone cannot prove the blocklist caused the result because the model may already flag this sample. |
| 9 | Open **Settings > Whitelist**, enter `super`, and click its add button. After reload, inspect Sample C: `super` must remain visible while non-whitelisted content remains filtered by the blocklist. Do not interpret this as exempting the whole comment. |
| 10 | In **Detection**, click **Clear** next to the log. This resets the log plus Scanned/Blocked counters and requests clearing active detections; it does not clear custom lists. Refresh the controlled page, wait for scans, and confirm new relevant log entries and counters appear. Compare the new dynamic comment against its entry and counter changes. Record before/after values; do not assume totals equal exactly three samples, because extraction can include other eligible text and logs are profile-wide. |
| 11 | Record the page's load timestamp. Click **Add dynamic aggressive comment**. Confirm a new Sample D appears and the actual extension detects/blurs it without a full reload; the load timestamp must stay the same. Confirm a corresponding log update. |
| 12 | Check that actual changes to protection, algorithm selection, and adding/removing custom-list entries reload the active page and persist afterward. The load timestamp changes and dynamically inserted samples reset on reload. Finish with protection on, Hybrid selected, `ugly` blocked, and `super` whitelisted. |

Do not use built-in offline Evaluation charts as proof of live compatibility. The test
page implements no classification, blur styling, reveal icons, or fake outcomes.

## 4. Capture evidence and complete the form

Use Windows Snipping Tool (`Win+Shift+S`) or a browser screenshot facility to capture
the actual browser and extension state. Save genuine PNG files under `screenshots`:

- `Chrome_Compatibility_Test.png`
- `Edge_Compatibility_Test.png`
- `Brave_Compatibility_Test.png`
- `Opera_Compatibility_Test.png`

Show the browser identity, controlled URL, sample states, and popup where practical.
A single screenshot cannot prove all transitions. Additional PNGs can be named, for
example, `Chrome_Test_03_Hybrid.png`, `Chrome_Test_06_Revealed.png`, and
`Chrome_Test_11_Dynamic.png`. Enter each additional filename in its test row. Never
create a placeholder screenshot or rename a non-PNG file to `.png`.

Open `http://127.0.0.1:8765/cross_browser_test_form.html`. Use one master form for
all browsers. Import `browser_versions.json`; enter the actual test date, tester name,
OS/build, and extension version. Record every item as **Pass**, **Fail**, or
**Not Tested**, adding observations, errors, About-page versions, and screenshot filenames.
Leave unperformed checks Not Tested. Screenshot filenames alone are not evidence.

The form saves a draft locally in that browser. It does not sync between browsers.
Export JSON to transfer a master form to another browser, then import it there to
continue; importing replaces the form rather than merging conflicting results.
Export **JSON** and **CSV** when finished and move the downloaded files into this
kit folder as `cross_browser_results.json` and `cross_browser_results.csv`.

## 5. Generate and review the report

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Generate_Cross_Browser_Report.ps1
```

This creates `Cross_Browser_Compatibility_Test_Report.docx` and a machine-readable
`.summary.json`. The default inputs are `browser_versions.json`,
`cross_browser_results.json`, and the `screenshots` folder. JSON preserves the full
inventory metadata and is preferred. CSV results are also accepted:

```powershell
.\Generate_Cross_Browser_Report.ps1 -ResultsPath .\cross_browser_results.csv
```

Use `-InventoryPath`, `-ScreenshotDirectory`, and `-OutputPath` for archived runs.
Inventory CSV is accepted, but contains less environment metadata than inventory JSON.
Do not combine files from different runs; the generator rejects mismatched run IDs.
Missing files produce Not Tested or No evidence provided. Invalid statuses become
Not Tested, and duplicate tests are rejected. Overall Passed requires 12/12 Passed;
any Fail yields Failed; incomplete results yield Not Tested.

Open the DOCX in Word or LibreOffice before submission and inspect all pages,
tables, captions, and screenshots. Long observations may add pages. The report is
an evidence record, not independent verification of tester assertions. Do not submit
an all-Not-Tested report as a completed compatibility evaluation.

Stop the hidden server after testing:

```powershell
.\Stop_Cross_Browser_Test.ps1
```

If using several ports, run `Start_Cross_Browser_Test.ps1 -Serve -Port <port>` in a
dedicated terminal instead and stop each foreground server with Ctrl+C.

## Source checks

The procedures reflect `config.js` (fixed weights, threshold, initial scan timing),
`content.js` (DOM additions, blocklist precedence, whitelist ranges),
`background.js` and `popup/popup.js` (active-tab reload and Clear), and
`modules/result_display.js` (eye controls, traces, and partial masking).
No extension source is modified by this kit. Actual browser functionality is left
for the tester to evaluate; browser version detection is not a test pass.
