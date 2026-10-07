"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { createContext, runExtensionScript, getBinding, loadDetectionRuntime, makeElement } = require('./support/browser-harness.cjs');

function setup(context) {
  const nodes = [];
  function element(tag) {
    const node = { tag, children: [], listeners: {}, isConnected: true, open: false,
      setAttribute() {},
      append(...items) { this.children.push(...items); },
      appendChild(item) { this.append(item); },
      attachShadow() { this.shadow = element('shadow'); return this.shadow; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      remove() { this.isConnected = false; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      focus() {},
    };
    nodes.push(node);
    return node;
  }
  let backs = 0;
  const location = { href: 'https://example.com/posts', hostname: 'example.com', pathname: '/posts', assign(url) { this.href = url; } };
  context.window.location = location;
  context.window.history = { length: 2, back() { backs++; } };
  Object.assign(context.document, { createElement: element, documentElement: element('html') });
  const protection = getBinding(context, 'PageProtection');
  const current = tag => nodes.filter(n => n.tag === tag).at(-1);
  const click = text => nodes.filter(n => n.tag === 'button' && n.textContent === text).at(-1).listeners.click();
  return { protection, nodes, current, click, location, backs: () => backs };
}
function harness() {
  const { context } = createContext();
  context.window = { location: {} };
  context.document = {};
  for (const file of ['config.js', 'modules/page_rules.js', 'modules/page_protection.js']) runExtensionScript(context, file);
  return { context, ...setup(context) };
}
function flag(h, n) { for (let i = 0; i < n; i++) h.protection.record({ isConnected: true }); }

test('explicitly disabled page alerts keep blurring without notifications or dialogs', async () => {
  const runtime = await loadDetectionRuntime({ enabled: true, custom_keywords: ['forced block'] });
  runtime.context.CADConfig = { ...runtime.context.CADConfig,
    protection: { ...runtime.context.CADConfig.protection, enabled: false } };
  const h = setup(runtime.context);
  for (let i = 0; i < 10; i++) await runtime.analyzeElement(makeElement(), 'This is a forced block');
  assert.equal(runtime.display.calls.blur.length, 10);
  assert.equal(h.current('section'), undefined);
  assert.equal(h.current('dialog'), undefined);
  h.location.href = 'https://example.com/next';
  flag(h, 10);
  assert.equal(h.current('section'), undefined);
  assert.equal(h.current('dialog'), undefined);
});

test('defaults show only the protection dialog at three distinct blocks without duplicate counts', () => {
  const h = harness();
  const same = {};
  for (let i = 0; i < 10; i++) h.protection.record(same);
  assert.equal(h.current('dialog'), undefined);
  flag(h, 1);
  assert.equal(h.current('section'), undefined);
  assert.equal(h.current('dialog'), undefined);
  flag(h, 1);
  assert.equal(h.current('section'), undefined);
  assert.equal(h.current('dialog').open, true);
  h.click('Keep reading');
  assert.equal(h.current('dialog').open, false);
  flag(h, 10);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 1);
});

test('Escape and scanner resets preserve once-per-page warnings while new pages can warn', () => {
  const h = harness();
  flag(h, 3);
  let prevented = false;
  h.current('dialog').listeners.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.current('dialog').open, false);
  h.protection.reset();
  flag(h, 10);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 1);
  h.location.href = 'https://example.com/next';
  h.protection.syncLocation();
  flag(h, 2);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 1);
  flag(h, 1);
  assert.equal(h.current('dialog').open, true);
  h.protection.reset();
  assert.equal(h.current('dialog').open, false);
  flag(h, 10);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 2);
  h.location.href = 'https://example.com/posts';
  flag(h, 10);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 2);
});

test('Keep reading remains respected after restarting the scanner', () => {
  const h = harness();
  flag(h, 3);
  h.click('Keep reading');
  h.protection.reset();
  flag(h, 10);
  assert.equal(h.current('dialog').open, false);
  assert.equal(h.nodes.filter(n => n.tag === 'dialog').length, 1);
});

test('private pages and detached nodes do not trigger warnings; back has a fallback', () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.protection.record({ isConnected: false });
  h.location.hostname = 'messenger.com';
  flag(h, 10);
  assert.equal(h.current('section'), undefined);
  h.location.hostname = 'example.com';
  flag(h, 3);
  h.click('Go back');
  assert.equal(h.backs(), 1);
  h.context.window.history.length = 1;
  h.click('Go back');
  assert.equal(h.location.href, 'about:blank');
});

test('live custom-keyword detection protects the page and disabling removes the modal', async () => {
  const runtime = await loadDetectionRuntime({ enabled: true, custom_keywords: ['forced block'] });
  const h = setup(runtime.context);
  for (let i = 0; i < 3; i++) await runtime.analyzeElement(makeElement(), 'This is a forced block');
  assert.equal(runtime.display.calls.blur.length, 3);
  assert.equal(h.current('dialog').open, true);
  runtime.context.window.removeEventListener = () => {};
  runtime.storage.simulateExternalChange({ enabled: false });
  assert.equal(h.current('dialog').open, false);
});

test('pending analysis cannot restore protection after the user disables it', async () => {
  const runtime = await loadDetectionRuntime({ enabled: true, custom_keywords: ['forced block'] });
  setup(runtime.context);
  runtime.context.window.removeEventListener = () => {};
  const pending = runtime.analyzeElement(makeElement(), 'forced block');
  runtime.storage.simulateExternalChange({ enabled: false });
  await pending;
  assert.equal(runtime.display.calls.blur.length, 0);
});

test('shadow-root scanning skips extension warning UI', async () => {
  const runtime = await loadDetectionRuntime();
  let walks = 0;
  runtime.context.document.createTreeWalker = () => { walks++; return { nextNode() { return null; } }; };
  getBinding(runtime.context, 'scanShadowRoots')({ shadowRoot: {}, closest() { return this; } });
  assert.equal(walks, 0);
});
