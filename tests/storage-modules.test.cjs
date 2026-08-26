"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createContext,
  runExtensionScript,
  getBinding,
} = require("./support/browser-harness.cjs");

test("AlgorithmSelector loads, persists, and observes the selected mode", async () => {
  const { context, storage } = createContext({ mode: "vader" });
  runExtensionScript(context, "config.js");
  runExtensionScript(context, "modules/algorithm_selector.js");
  const selector = getBinding(context, "AlgorithmSelector");

  assert.equal(await selector.load(), "vader");
  assert.equal(selector.get(), "vader");

  await selector.set("nb");
  assert.equal(storage.snapshot().mode, "nb");
  assert.equal(selector.get(), "nb");

  storage.simulateExternalChange({ mode: "hybrid" });
  assert.equal(selector.get(), "hybrid");
});

test("AlgorithmSelector defaults to hybrid when no mode is stored", async () => {
  const { context } = createContext();
  runExtensionScript(context, "config.js");
  runExtensionScript(context, "modules/algorithm_selector.js");
  const selector = getBinding(context, "AlgorithmSelector");

  assert.equal(await selector.load(), "hybrid");
  assert.equal(selector.get(), "hybrid");
});

test("CustomFilter normalizes, de-duplicates, persists, matches, and removes keywords", async () => {
  const { context, storage } = createContext({ custom_keywords: [] });
  runExtensionScript(context, "config.js");
  runExtensionScript(context, "modules/custom_filter.js");
  const filter = getBinding(context, "CustomFilter");

  await filter.load();
  await filter.add("  Toxic Phrase  ");
  await filter.add("toxic phrase");

  assert.deepEqual(Array.from(filter.getAll()), ["toxic phrase"]);
  assert.deepEqual(storage.snapshot().custom_keywords, ["toxic phrase"]);
  assert.equal(filter.matches("That is a TOXIC PHRASE to use."), true);
  assert.equal(filter.matches("This is ordinary content."), false);

  await filter.remove("TOXIC PHRASE");
  assert.deepEqual(Array.from(filter.getAll()), []);
  assert.equal(filter.matches("toxic phrase"), false);
});

test("CustomFilter observes blocklist changes made outside the content script", async () => {
  const { context, storage } = createContext();
  runExtensionScript(context, "config.js");
  runExtensionScript(context, "modules/custom_filter.js");
  const filter = getBinding(context, "CustomFilter");
  await filter.load();

  storage.simulateExternalChange({ custom_keywords: ["blocked"] });

  assert.deepEqual(Array.from(filter.getAll()), ["blocked"]);
  assert.equal(filter.matches("This word is blocked here"), true);
});
