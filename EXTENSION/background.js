/**
 * background.js — activates scanners without navigating the host page
 */
importScripts("config.js", "modules/diagnostics.js");

const { storage: STORAGE_KEYS, messages: MESSAGE_TYPES } = CADConfig;

const MANIFEST_CONTENT_SCRIPT = chrome.runtime.getManifest().content_scripts?.[0] || {};
const CONTENT_SCRIPT_FILES = Object.freeze([...(MANIFEST_CONTENT_SCRIPT.js || [])]);
const CONTENT_STYLE_FILES = Object.freeze([...(MANIFEST_CONTENT_SCRIPT.css || [])]);
const injectingTabs = new Set();

function isPrivateUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (CADConfig.privacy.excludedHosts.some(host =>
      hostname === host || hostname.endsWith(`.${host}`))) return true;
    return CADConfig.privacy.excludedPaths.some(rule =>
      (hostname === rule.host || hostname.endsWith(`.${rule.host}`)) &&
      url.pathname.toLowerCase().startsWith(rule.path));
  } catch (_) {
    return true;
  }
}

function canInjectScanner(tab) {
  if (!tab?.id || !/^(https?|file):/i.test(tab.url || "")) return false;
  return !isPrivateUrl(tab.url);
}

function injectScanner(tab) {
  if (!canInjectScanner(tab) || injectingTabs.has(tab.id)) return;
  injectingTabs.add(tab.id);
  const target = { tabId: tab.id };

  chrome.scripting.insertCSS({ target, files: CONTENT_STYLE_FILES }, () => {
    const cssError = chrome.runtime.lastError?.message;
    if (cssError) {
      injectingTabs.delete(tab.id);
      CADDiagnostics.warn("Background.injectScanner.css", cssError, { tabId: tab.id });
      return;
    }

    chrome.scripting.executeScript({ target, files: CONTENT_SCRIPT_FILES }, () => {
      const scriptError = chrome.runtime.lastError?.message;
      injectingTabs.delete(tab.id);
      if (scriptError) {
        CADDiagnostics.warn("Background.injectScanner.script", scriptError, { tabId: tab.id });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.tabActivated }, () => {
        if (chrome.runtime.lastError) {} // injected boot will still start scanning
      });
    });
  });
}

function ensureScanner(tabId, retry = true) {
  chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.tabActivated }, () => {
    const receiverMissing = Boolean(chrome.runtime.lastError);
    if (!receiverMissing) return;

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !canInjectScanner(tab) || tab.status !== "complete") return;
      if (retry) {
        setTimeout(() => ensureScanner(tabId, false), CADConfig.timing.scannerActivationRetryMs);
        return;
      }
      injectScanner(tab);
    });
  });
}

function activateOpenTabs() {
  chrome.tabs.query({ active: true }, (tabs) => {
    tabs.forEach(tab => ensureScanner(tab.id));
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEYS.enabled, STORAGE_KEYS.mode], (res) => {
    if (res[STORAGE_KEYS.enabled] === undefined) {
      chrome.storage.local.set({ [STORAGE_KEYS.enabled]: true });
    }
    if (!res[STORAGE_KEYS.mode]) {
      chrome.storage.local.set({ [STORAGE_KEYS.mode]: CADConfig.modes.HYBRID });
    }
  });
  activateOpenTabs();
});

chrome.runtime.onStartup.addListener(activateOpenTabs);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Reuse the content script, or inject it into an already-open supported tab.
  if (msg.type === MESSAGE_TYPES.activateScanner) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) ensureScanner(tabs[0].id);
      sendResponse({ ok: Boolean(tabs[0]) });
    });
    return true;
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

  // Clear the active tab's live in-memory counters as well as its badge.
  // Resetting storage alone is temporary because the content script owns the
  // authoritative running totals and would publish them again on its next hit.
  if (msg.type === MESSAGE_TYPES.clearDetections) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false });
        return;
      }
      chrome.action.setBadgeText({ text: "", tabId: tab.id });
      chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.clearDetections }, () => {
        if (chrome.runtime.lastError) {} // excluded pages have no content script
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
  // Manifest injection covers newly loaded pages. This fallback also handles
  // existing tabs and single-page-app route changes without a manual reload.
  if (changeInfo.status === "complete" || changeInfo.url) ensureScanner(tabId);
});

// When the user switches tabs — clear shared log and ask the new tab to push its data
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.set({
    [STORAGE_KEYS.logEntries]: [],
    [STORAGE_KEYS.totalScanned]: 0,
    [STORAGE_KEYS.totalAggressive]: 0,
  });
  chrome.action.setBadgeText({ text: "", tabId });
  ensureScanner(tabId);
});
