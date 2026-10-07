"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const EXTENSION_ROOT = path.join(ROOT, "EXTENSION");

function extensionPath(relativePath) {
  return path.join(EXTENSION_ROOT, ...relativePath.split("/"));
}

function makeStorage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = [];

  function select(keys) {
    if (keys == null) return structuredClone(data);
    if (typeof keys === "string") {
      return Object.hasOwn(data, keys) ? { [keys]: structuredClone(data[keys]) } : {};
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(
        keys.filter((key) => Object.hasOwn(data, key))
          .map((key) => [key, structuredClone(data[key])]),
      );
    }
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        Object.hasOwn(data, key) ? structuredClone(data[key]) : structuredClone(fallback),
      ]),
    );
  }

  const local = {
    get(keys, callback) {
      callback(select(keys));
    },
    set(values, callback = () => {}) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        const oldValue = Object.hasOwn(data, key) ? structuredClone(data[key]) : undefined;
        data[key] = structuredClone(value);
        changes[key] = { oldValue, newValue: structuredClone(value) };
      }
      if (Object.keys(changes).length > 0) {
        for (const listener of listeners) listener(changes, "local");
      }
      callback();
    },
  };

  return {
    local,
    onChanged: {
      addListener(listener) {
        listeners.push(listener);
      },
    },
    snapshot() {
      return structuredClone(data);
    },
    simulateExternalChange(values) {
      local.set(values);
    },
  };
}

function makeChrome(storage) {
  const runtimeMessageListeners = [];
  const sentMessages = [];
  return {
    storage: {
      local: storage.local,
      onChanged: storage.onChanged,
    },
    runtime: {
      getURL(relativePath) {
        return extensionPath(relativePath);
      },
      getManifest() {
        return JSON.parse(fs.readFileSync(extensionPath("manifest.json"), "utf8"));
      },
      onMessage: {
        addListener(listener) {
          runtimeMessageListeners.push(listener);
        },
      },
      sendMessage(message) {
        sentMessages.push(structuredClone(message));
      },
    },
    __runtimeMessageListeners: runtimeMessageListeners,
    __sentMessages: sentMessages,
  };
}

class LocalJsonXMLHttpRequest {
  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send() {
    try {
      this.status = 200;
      this.response = JSON.parse(fs.readFileSync(this.url, "utf8"));
      this.onload?.();
    } catch (error) {
      this.status = 0;
      this.error = error;
      this.onerror?.(error);
    }
  }
}

function createContext(initialStorage = {}) {
  const storage = makeStorage(initialStorage);
  const chrome = makeChrome(storage);
  const quietConsole = {
    log() {},
    warn() {},
    error() {},
    info() {},
  };

  const context = vm.createContext({
    chrome,
    console: quietConsole,
    XMLHttpRequest: LocalJsonXMLHttpRequest,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
  });

  return { context, storage, chrome };
}

function runExtensionScript(context, relativePath) {
  const filename = extensionPath(relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return vm.runInContext(source, context, { filename });
}

function getBinding(context, expression) {
  return vm.runInContext(expression, context);
}

async function loadAlgorithms() {
  const harness = createContext();
  runExtensionScript(harness.context, "lib/naive_bayes.js");
  runExtensionScript(harness.context, "lib/vader.js");
  const VADER = getBinding(harness.context, "VADER");
  const NaiveBayes = getBinding(harness.context, "NaiveBayes");
  await NaiveBayes.load();
  return { ...harness, VADER, NaiveBayes };
}

function makeDocumentStub() {
  return {
    body: {},
    documentElement: {},
    querySelectorAll() {
      return [];
    },
  };
}

function makeResultDisplaySpy() {
  const calls = { blur: [], reveal: [], annotate: [] };
  return {
    calls,
    api: {
      blur(...args) { calls.blur.push(args); },
      reveal(...args) { calls.reveal.push(args); },
      annotate(...args) { calls.annotate.push(args); },
    },
  };
}

function makeElement() {
  const attributes = new Map();
  const classes = new Set();
  return {
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    hasAttribute(name) { return attributes.has(name); },
    removeAttribute(name) { attributes.delete(name); },
    closest() { return null; },
    __attributes: attributes,
    __classes: classes,
  };
}

async function loadDetectionRuntime(initialStorage = {}) {
  const harness = createContext(initialStorage);
  const { context } = harness;
  const display = makeResultDisplaySpy();

  const privateLocation = { hostname: "messenger.com", pathname: "/" };
  Object.assign(context, {
    document: makeDocumentStub(),
    window: { addEventListener() {}, location: privateLocation },
    location: privateLocation,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    ResultDisplay: display.api,
  });

  // These are the same deployed files used by manifest.json. The private-site
  // location prevents content.js's boot routine from scheduling page scans;
  // individual analysis calls can then be exercised deterministically.
  runExtensionScript(context, "config.js");
  runExtensionScript(context, "modules/diagnostics.js");
  runExtensionScript(context, "lib/vader.js");
  runExtensionScript(context, "lib/naive_bayes.js");
  runExtensionScript(context, "modules/detection_policy.js");
  runExtensionScript(context, "modules/page_rules.js");
  runExtensionScript(context, "modules/detection_log.js");
  runExtensionScript(context, "modules/algorithm_selector.js");
  runExtensionScript(context, "modules/custom_filter.js");
  runExtensionScript(context, "modules/page_protection.js");
  runExtensionScript(context, "content.js");

  const NaiveBayes = getBinding(context, "NaiveBayes");
  const AlgorithmSelector = getBinding(context, "AlgorithmSelector");
  const CustomFilter = getBinding(context, "CustomFilter");
  await NaiveBayes.load();
  await AlgorithmSelector.load();
  await CustomFilter.load();
  await new Promise((resolve) => setImmediate(resolve));

  return {
    ...harness,
    display,
    NaiveBayes,
    VADER: getBinding(context, "VADER"),
    AlgorithmSelector,
    CustomFilter,
    analyzeElement: getBinding(context, "analyzeElement"),
    config: getBinding(context, `({
      THRESHOLD: CADConfig.detection.threshold,
      HYBRID_THRESHOLD: CADConfig.detection.hybridThreshold,
      HYBRID_NB_WEIGHT: CADConfig.detection.hybridNaiveBayesWeight,
      HYBRID_VADER_WEIGHT: CADConfig.detection.hybridVaderWeight,
      MAX_TOKENS: CADConfig.detection.maximumTokens,
      SELF_DISTRESS_DAMPEN: CADConfig.detection.selfDistressDampen
    })`),
  };
}

module.exports = {
  ROOT,
  EXTENSION_ROOT,
  extensionPath,
  createContext,
  runExtensionScript,
  getBinding,
  loadAlgorithms,
  loadDetectionRuntime,
  makeElement,
};
