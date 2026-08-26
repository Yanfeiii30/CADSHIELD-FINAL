/**
 * modules/custom_filter.js
 * Manages user-defined custom keywords (blocklist).
 * Any text containing these words is immediately flagged as aggressive.
 * @requires CADConfig
 */

const CustomFilter = (() => {
  const storageKey = CADConfig.storage.blocklist;
  let _keywords = [];

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(storageKey, (result) => {
        _keywords = result[storageKey] || [];
        resolve(_keywords);
      });
    });
  }

  /**
   * Returns true if text contains any custom keyword
   * Matching is case-insensitive and supports substrings and phrases.
   */
  function matches(text) {
    if (!text || _keywords.length === 0) return false;
    const lower = text.toLowerCase();
    return _keywords.some(kw => {
      if (!kw) return false;
      return lower.includes(kw.toLowerCase());
    });
  }

  async function add(keyword) {
    keyword = keyword.trim().toLowerCase();
    if (keyword && !_keywords.includes(keyword)) {
      _keywords.push(keyword);
      await _save();
    }
  }

  async function remove(keyword) {
    _keywords = _keywords.filter(k => k !== keyword.toLowerCase());
    await _save();
  }

  function getAll() {
    return [..._keywords];
  }

  function _save() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey]: _keywords }, resolve);
    });
  }

  // Sync when changed from popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[storageKey]) {
      _keywords = changes[storageKey].newValue || [];
    }
  });

  return { load, matches, add, remove, getAll };
})();
