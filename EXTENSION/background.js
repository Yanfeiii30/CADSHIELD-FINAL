/**
 * background.js — handles tab reload requests from popup
 */
importScripts("config.js", "modules/diagnostics.js");

const { storage: STORAGE_KEYS, messages: MESSAGE_TYPES } = CADConfig;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEYS.enabled, STORAGE_KEYS.mode], (res) => {
    if (res[STORAGE_KEYS.enabled] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.enabled]: true });
    }
    if (!res[STORAGE_KEYS.mode]) {
      chrome.storage.local.set({ [STORAGE_KEYS.mode]: CADConfig.modes.HYBRID });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Reload the active tab (called by popup)
  if (msg.type === MESSAGE_TYPES.reloadTab) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id, {}, () => {
          sendResponse({ ok: true });
        });
      }
    });
    return true; // keep channel open for async
  }

  // Badge update from content.js
  if (msg.type === MESSAGE_TYPES.aggressiveFound) {
    // Wait briefly for the content script to finish writing the tab count.
    setTimeout(() => {
      chrome.storage.local.get(STORAGE_KEYS.totalAggressive, (res) => {
        const count = (res[STORAGE_KEYS.totalAggressive] || 0);
        if (sender.tab) {
          chrome.action.setBadgeText({ text: count > 0 ? String(count) : "", tabId: sender.tab.id });
          chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
        }
      });
    }, CADConfig.timing.badgeUpdateDelayMs);
    sendResponse({ ok: true });
    return true;
  }

  // Clear badge
  if (msg.type === MESSAGE_TYPES.clearBadge) {
    if (sender.tab) chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});

// When the user switches tabs — clear shared log and ask the new tab to push its data
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.set({
    [STORAGE_KEYS.logEntries]: [],
    [STORAGE_KEYS.totalScanned]: 0,
    [STORAGE_KEYS.totalAggressive]: 0,
  });
  chrome.action.setBadgeText({ text: "", tabId });
  chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.tabActivated }, () => {
    if (chrome.runtime.lastError) {} // tab may not have a content script — that's fine
  });
});
