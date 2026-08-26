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
