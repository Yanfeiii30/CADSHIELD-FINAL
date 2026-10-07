"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { extensionPath } = require('./support/browser-harness.cjs');

test('on/off handler saves the setting and activates the scanner without navigation', () => {
  const source = fs.readFileSync(extensionPath('popup/popup.js'), 'utf8');
  const helper = source.match(/  function activateScanner\(\) \{[\s\S]*?\n  \}/)[0];
  const handler = source.match(/  toggleEnabled.addEventListener\("change", \(\) => \{[\s\S]*?\n  \}\);/)[0];
  for (const enabled of [true, false]) {
    let onChange;
    const saved = [];
    const messages = [];
    const context = vm.createContext({
      STORAGE_KEYS: { enabled: 'enabled' },
      MESSAGE_TYPES: { activateScanner: 'ACTIVATE_SCANNER' },
      toggleEnabled: { checked: enabled, addEventListener(_event, callback) { onChange = callback; } },
      updateStatus() {},
      chrome: {
        storage: { local: { set(value, callback) { saved.push(value.enabled); callback(); } } },
        runtime: { sendMessage(message, callback) { messages.push(message.type); callback(); } },
      },
    });
    vm.runInContext(helper + '\n' + handler, context);
    onChange();
    assert.deepEqual(saved, [enabled]);
    assert.deepEqual(messages, ['ACTIVATE_SCANNER']);
  }
});

test('popup settings and background contain no page-reload path', () => {
  for (const file of ['popup/popup.js', 'background.js']) {
    const source = fs.readFileSync(extensionPath(file), 'utf8');
    assert.doesNotMatch(source, /reloadTab|RELOAD_TAB|\.reload\s*\(/);
  }
});
