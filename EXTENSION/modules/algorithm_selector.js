/**
 * modules/algorithm_selector.js
 * Uses Hybrid for regular protection and the saved choice in Expert Mode.
 * Options: "hybrid" | "nb" | "vader"
 * Default: "hybrid"
 * @requires CADConfig
 */

const AlgorithmSelector = (() => {
  const storageKey = CADConfig.storage.mode;
  const expertKey = CADConfig.storage.panelMode;
  let _mode = CADConfig.modes.HYBRID;
  let _expertMode = false;

  function normalizeMode(value) {
    return Object.values(CADConfig.modes).includes(value) ? value : CADConfig.modes.HYBRID;
  }

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get([storageKey, expertKey], (result) => {
        _mode = normalizeMode(result[storageKey]);
        _expertMode = result[expertKey] === true;
        resolve(get());
      });
    });
  }

  function get() {
    return _expertMode ? _mode : CADConfig.modes.HYBRID;
  }

  async function set(value) {
    _mode = normalizeMode(value);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey]: _mode }, resolve);
    });
  }

  // Listen for changes from popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[storageKey]) {
      _mode = normalizeMode(changes[storageKey].newValue);
    }
    if (changes[expertKey]) _expertMode = changes[expertKey].newValue === true;
  });

  return { load, get, set };
})();
