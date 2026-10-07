"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const { extensionPath } = require("./support/browser-harness.cjs");

function eventSlot() {
  const listeners = [];
  return {
    listeners,
    api: { addListener(listener) { listeners.push(listener); } },
  };
}

function loadBackground(tab) {
  const installed = eventSlot();
  const startup = eventSlot();
  const messages = eventSlot();
  const activated = eventSlot();
  const updated = eventSlot();
  const calls = { messages: [], scripts: [], styles: [], reloads: [] };
  let receiverReady = false;

  const runtime = {
    lastError: undefined,
    getManifest() {
      return JSON.parse(fs.readFileSync(extensionPath("manifest.json"), "utf8"));
    },
    onInstalled: installed.api,
    onStartup: startup.api,
    onMessage: messages.api,
  };
  const chrome = {
    runtime,
    storage: {
      local: {
        get(_keys, callback) { callback({ enabled: true, mode: "hybrid" }); },
        set(_values, callback = () => {}) { callback(); },
      },
    },
    tabs: {
      onActivated: activated.api,
      onUpdated: updated.api,
      query(_query, callback) { callback(tab ? [{ ...tab }] : []); },
      get(_tabId, callback) {
        runtime.lastError = undefined;
        callback({ ...tab });
      },
      sendMessage(tabId, message, callback = () => {}) {
        calls.messages.push({ tabId, message });
        runtime.lastError = receiverReady ? undefined : { message: "Receiving end does not exist" };
        callback();
        runtime.lastError = undefined;
      },
      reload(tabId, _options, callback = () => {}) { calls.reloads.push(tabId); callback(); },
    },
    scripting: {
      insertCSS(details, callback) {
        calls.styles.push(details);
        callback();
      },
      executeScript(details, callback) {
        calls.scripts.push(details);
        receiverReady = true;
        callback();
      },
    },
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {},
    },
  };

  const context = vm.createContext({
    chrome,
    console: { log() {}, warn() {}, error() {} },
    URL,
    Date,
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  });
  context.importScripts = (...files) => {
    files.forEach(file => vm.runInContext(
      fs.readFileSync(extensionPath(file), "utf8"),
      context,
      { filename: extensionPath(file) },
    ));
  };
  vm.runInContext(
    fs.readFileSync(extensionPath("background.js"), "utf8"),
    context,
    { filename: extensionPath("background.js") },
  );

  return {
    calls,
    activate: activated.listeners[0],
    message: messages.listeners[0],
    setReceiverReady(value) { receiverReady = value; },
  };
}

test("switching to an existing supported tab injects and activates its scanner", () => {
  const runtime = loadBackground({
    id: 17,
    url: "https://www.facebook.com/groups/example",
    status: "complete",
  });

  runtime.activate({ tabId: 17 });

  assert.equal(runtime.calls.styles.length, 1);
  assert.deepEqual(Array.from(runtime.calls.styles[0].files), ["styles.css"]);
  assert.equal(runtime.calls.scripts.length, 1);
  assert.deepEqual(Array.from(runtime.calls.scripts[0].files), [
    "config.js",
    "modules/diagnostics.js",
    "lib/vader.js",
    "lib/naive_bayes.js",
    "modules/detection_policy.js",
    "modules/page_rules.js",
    "modules/detection_log.js",
    "modules/algorithm_selector.js",
    "modules/custom_filter.js",
    "modules/result_display.js",
    "modules/page_protection.js",
    "content.js",
  ]);
  assert.equal(runtime.calls.messages.at(-1).message.type, "TAB_ACTIVATED");
});

test("tab activation reuses a running scanner and never injects on private tabs", () => {
  for (const hostname of ["ienrol.pnc.edu.ph", "www.ienrol.pnc.edu.ph", "pinnacle.pnc.edu.ph", "www.pinnacle.pnc.edu.ph"]) {
    const runtime = loadBackground({
      id: 23,
      url: `https://${hostname}/student/grades-semester`,
      status: "complete",
    });
    runtime.activate({ tabId: 23 });
    assert.equal(runtime.calls.scripts.length, 0);
    assert.equal(runtime.calls.styles.length, 0);
  }
  const supported = loadBackground({
    id: 21,
    url: "https://www.reddit.com/r/example",
    status: "complete",
  });
  supported.setReceiverReady(true);
  supported.activate({ tabId: 21 });
  assert.equal(supported.calls.scripts.length, 0);
  assert.equal(supported.calls.messages.length, 1);

  const privateTab = loadBackground({
    id: 22,
    url: "https://www.messenger.com/t/example",
    status: "complete",
  });
  privateTab.activate({ tabId: 22 });
  assert.equal(privateTab.calls.scripts.length, 0);
  assert.equal(privateTab.calls.styles.length, 0);
});

 test("popup activation injects or reuses a scanner without reloading the comment page", () => {
  for (const ready of [false, true]) {
    const runtime = loadBackground({ id: 31, url: 'https://www.facebook.com/posts/123?comment_id=456', status: 'complete' });
    runtime.setReceiverReady(ready);
    let response;
    runtime.message({ type: 'ACTIVATE_SCANNER' }, {}, value => { response = value; });
    assert.equal(response.ok, true);
    assert.equal(runtime.calls.reloads.length, 0);
    assert.equal(runtime.calls.scripts.length, ready ? 0 : 1);
    assert.equal(runtime.calls.messages.at(-1).message.type, 'TAB_ACTIVATED');
  }
});

test("popup activation respects private-site exclusions", () => {
  const runtime = loadBackground({ id: 32, url: 'https://messenger.com/t/123', status: 'complete' });
  runtime.message({ type: 'ACTIVATE_SCANNER' }, {}, () => {});
  assert.equal(runtime.calls.scripts.length, 0);
  assert.equal(runtime.calls.reloads.length, 0);
});
