"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const { EXTENSION_ROOT, extensionPath } = require("./support/browser-harness.cjs");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

test("every shipped JavaScript file parses successfully", async (t) => {
  const scripts = walk(EXTENSION_ROOT).filter((file) => file.endsWith(".js"));
  assert.ok(scripts.length > 0);

  for (const filename of scripts) {
    await t.test(path.relative(EXTENSION_ROOT, filename), () => {
      assert.doesNotThrow(
        () => new vm.Script(fs.readFileSync(filename, "utf8"), { filename }),
      );
    });
  }
});

test("manifest and Naive Bayes vocabulary remain valid JSON", () => {
  const manifest = JSON.parse(fs.readFileSync(extensionPath("manifest.json"), "utf8"));
  const vocabulary = JSON.parse(fs.readFileSync(extensionPath("lib/vocab.json"), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.version);
  assert.ok(vocabulary.vocab_size > 0);
  assert.equal(Object.keys(vocabulary.log_likelihood[0]).length, vocabulary.vocab_size);
  assert.equal(Object.keys(vocabulary.log_likelihood[1]).length, vocabulary.vocab_size);
});

test("background worker imports shared dependencies before using them", () => {
  const source = fs.readFileSync(extensionPath("background.js"), "utf8");
  const importPosition = source.indexOf('importScripts("config.js", "modules/diagnostics.js")');
  const configUsePosition = source.indexOf("CADConfig");

  assert.ok(importPosition >= 0, "background.js must import config and diagnostics");
  assert.ok(importPosition < configUsePosition, "imports must precede CADConfig usage");
});

test("dark theme uses near-black surfaces and the Hybrid green accent", () => {
  const css = fs.readFileSync(extensionPath("popup/popup.css"), "utf8");
  const lightTheme = css.match(/^:root\s*\{([\s\S]*?)\n\}/);
  const darkTheme = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);

  assert.ok(lightTheme, "popup CSS must define light-theme color tokens");
  assert.ok(darkTheme, "popup CSS must define dark-theme color tokens");
  assert.match(lightTheme[1], /--ink-900:\s*#111111/);
  assert.match(lightTheme[1], /--ink-400:\s*#525252/);
  assert.match(darkTheme[1], /--line-soft:\s*#18181b/);
  assert.match(darkTheme[1], /--surface:\s*#26262a/);
  assert.match(darkTheme[1], /--surface-sunk:\s*#18181b/);
  assert.match(darkTheme[1], /--surface-raised:\s*#303036/);
  assert.match(darkTheme[1], /--ink-900:\s*#ffffff/);
  assert.match(darkTheme[1], /--ink-400:\s*#d4d4d8/);
  assert.match(darkTheme[1], /--green-700:\s*#4ade80/);
  assert.match(darkTheme[1], /--green-600:\s*#4ade80/);
  assert.match(darkTheme[1], /--green-200:\s*#4ade80/);
  assert.match(darkTheme[1], /--green-solid:\s*#15803d/);
  assert.match(darkTheme[1], /--green-on-solid:\s*#fff/);
  assert.match(css, /--green-header-start:\s*var\(--green-solid\)/);
  assert.match(css, /--green-header-end:\s*var\(--green-solid\)/);
  assert.match(css, /--green-on-header:\s*var\(--green-on-solid\)/);
  assert.match(darkTheme[1], /--red-600:\s*#fda4af/);
  assert.match(darkTheme[1], /--red-solid:\s*#dc2626/);
  assert.match(css, /\.full-btn\s*\{[\s\S]*?background:\s*var\(--green-solid\);\s*color:\s*var\(--green-on-solid\)/);
  assert.match(css, /\.log-agg\s+\.log-badge\s*\{\s*background:\s*var\(--red-solid\);\s*color:\s*var\(--red-on-solid\)/);
});

test("popup exposes searchable word lists and Expert Mode PDF export", () => {
  const html = fs.readFileSync(extensionPath("popup/popup.html"), "utf8");

  assert.match(html, /role="tablist"\s+aria-label="Custom word lists"/);
  assert.match(html, /data-word-tab="whitelist"/);
  assert.match(html, /data-word-tab="blocklist"/);
  assert.match(html, /id="whitelistSearch"/);
  assert.match(html, /id="blocklistSearch"/);
  assert.match(html, /data-word-panel="whitelist"/);
  assert.match(html, /data-word-panel="blocklist"/);

  const popup = fs.readFileSync(extensionPath("popup/popup.js"), "utf8");

  assert.match(html, /id="exportPdf"[^>]*class="[^"]*expert-only[^"]*hidden|class="[^"]*expert-only[^"]*hidden[^>]*id="exportPdf"/);
  assert.match(html, /<script src="pdf_exporter\.js"><\/script>/);
  assert.match(popup, /expertOnlyItems\.forEach\(item => item\.classList\.toggle\("hidden", !enabled\)\)/);
  assert.match(popup, /CADShieldPopup\.PdfExporter\.download\(\{/);
});
