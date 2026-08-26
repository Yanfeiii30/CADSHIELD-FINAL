/**
 * modules/algorithm_selector.js
 * Reads and stores the user's chosen detection algorithm.
 * Options: "hybrid" | "nb" | "vader"
 * Default: "hybrid"
 * @requires CADConfig
 */

const AlgorithmSelector = (() => {
  const storageKey = CADConfig.storage.mode;
  let _mode = CADConfig.modes.HYBRID;

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(storageKey, (result) => {
        _mode = result[storageKey] || CADConfig.modes.HYBRID;
        resolve(_mode);
      });
    });
  }

  function get() {
    return _mode;
  }

  async function set(value) {
    _mode = value;
    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey]: value }, resolve);
    });
  }

  // Listen for changes from popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[storageKey]) {
      _mode = changes[storageKey].newValue;
    }
  });

  return { load, get, set };
})();
