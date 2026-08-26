/**
 * popup/theme_controller.js
 * Light, dark, and system-theme behavior for the popup header control.
 * @requires CADConfig
 */

(() => {
  const namespace = globalThis.CADShieldPopup || (globalThis.CADShieldPopup = {});

  const THEME_ORDER = ["light", "dark", "auto"];
  const THEME_LABELS = { light: "Light", dark: "Dark", auto: "Auto" };
  const THEME_ICONS = {
    light: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    dark:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.7A5.8 5.8 0 0 1 6.3 2.5a5.8 5.8 0 1 0 7.2 7.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    auto:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="9" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 14.5h5M8 12v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  function create(button, storageArea) {
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = "auto";

    function resolveTheme(pref) {
      return pref === "auto" ? (themeMedia.matches ? "dark" : "light") : pref;
    }

    function applyTheme(pref) {
      document.documentElement.setAttribute("data-theme", resolveTheme(pref));
      if (button) {
        button.innerHTML = THEME_ICONS[pref];
        button.title = `Theme: ${THEME_LABELS[pref]} (click to change)`;
      }
    }

    themeMedia.addEventListener("change", () => {
      if (preference === "auto") applyTheme("auto");
    });

    applyTheme(preference);

    if (button) {
      button.addEventListener("click", () => {
        preference = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length];
        applyTheme(preference);
        storageArea.set({ [CADConfig.storage.theme]: preference });
      });
    }

    return Object.freeze({
      setPreference(pref) {
        preference = pref;
        applyTheme(preference);
      },
    });
  }

  namespace.ThemeController = Object.freeze({ create });
})();
