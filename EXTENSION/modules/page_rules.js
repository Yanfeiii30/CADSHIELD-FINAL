/**
 * DOM and location rules used to decide which page content may be scanned.
 * These rules do not perform detection and do not modify the page.
 */
globalThis.PageRules = (() => {
  const SKIP_SELECTORS = Object.freeze([
    "nav", "header", "footer", "aside",
    "[role='navigation']", "[role='banner']", "[role='menubar']",
    "[role='toolbar']", "[role='complementary']",
    "script", "style", "noscript", "input", "textarea",
    "select", "button", "code", "pre",
    "[role='button']", "[role='menu']", "[role='menuitem']",
    "[role='option']", "[role='tooltip']",
    "[data-ad]", "[aria-label='Sponsored']",
    "[class*='nav']", "[class*='menu']",
    "[class*='sidebar']", "[class*='toolbar']",
  ]);

  const META_HOSTS = Object.freeze(["facebook.com", "instagram.com"]);
  const PROFILE_CARD_TITLES = new Set([
    "intro", "personal details", "friends", "photos", "life events", "about",
    "contact info", "contact and basic info", "basic info",
    "work and education", "places lived", "check-ins",
  ]);
  const UI_LABEL_PHRASES = new Set([
    "facebook", "like", "reply", "comment", "share", "follow", "unfollow",
    "see all friends", "view more comments", "view previous comments",
    "show replies", "hide replies", "load more comments", "load more",
  ]);
  const UI_COUNTER_PATTERNS = Object.freeze([
    /^[\d.,]+[km]?\s+mutual(\s+friends?)?$/i,
    /^[\d.,]+[km]?\s+(friends?|followers?|following|likes?|reactions?|comments?|shares?|views?)$/i,
  ]);
  const RELATIVE_TIME_RE = /^\d+\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|w|mo|y|yr)$/i;
  const ABSOLUTE_TIME_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b|\bat\s+\d{1,2}:\d{2}\s*(am|pm)?\b/i;

  function manifestPatternMatchesHostname(pattern, hostname) {
    const host = pattern.replace(/^\*:\/\//, "").replace(/\/\*$/, "");
    let expression = host
      .split(".")
      .map(part => part === "*" ? "[a-z0-9-]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\.");
    if (host.startsWith("*.")) {
      const bare = expression.replace(/^\[a-z0-9-\]\+\\\./, "");
      expression = "(?:[a-z0-9-]+\\.)?" + bare;
    }
    return new RegExp("^" + expression + "$", "i").test(hostname);
  }

  function isExcludedHostname(hostname, manifest = null) {
    try {
      if (CADConfig.privacy.excludedHosts.some(host => hostname.includes(host))) return true;
      const source = manifest || chrome.runtime.getManifest();
      const patterns = source.content_scripts?.[0]?.exclude_matches || [];
      return patterns.some(pattern => manifestPatternMatchesHostname(pattern, hostname));
    } catch (error) {
      globalThis.CADDiagnostics?.warn("PageRules.isExcludedHostname", error);
      return false;
    }
  }

  function isPrivateLocation(locationLike, manifest = null) {
    const hostname = locationLike?.hostname || "";
    const pathname = locationLike?.pathname || "";
    if (isExcludedHostname(hostname, manifest)) return true;
    return CADConfig.privacy.excludedPaths.some(rule =>
      hostname.includes(rule.host) && pathname.startsWith(rule.path));
  }

  function shouldSkipElement(element) {
    return SKIP_SELECTORS.some(selector => {
      try {
        return Boolean(element.closest(selector));
      } catch (_ignoredInvalidSelector) {
        return false;
      }
    });
  }

  function isVisuallyHidden(element) {
    let node = element;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      let style;
      try {
        style = getComputedStyle(node);
      } catch (_ignoredDetachedNode) {
        return false;
      }
      if (style) {
        if (style.display === "none" || style.visibility === "hidden") return true;
        if (node.offsetWidth <= 1 && node.offsetHeight <= 1 && style.overflow === "hidden") return true;
        if (style.position === "absolute" &&
            (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)")) return true;
      }
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  function findPrecedingTimestampType(element) {
    let node = element;
    let steps = 0;
    while (node && steps < 60) {
      if (node.previousElementSibling) {
        node = node.previousElementSibling;
      } else if (node.parentElement) {
        node = node.parentElement;
        steps++;
        continue;
      } else {
        break;
      }
      steps++;
      const text = node.textContent.trim();
      if (text.length > 0 && text.length < 40) {
        if (RELATIVE_TIME_RE.test(text)) return "comment";
        if (ABSOLUTE_TIME_RE.test(text)) return "caption";
      }
    }
    return null;
  }

  function isPostCaptionNotComment(element) {
    return findPrecedingTimestampType(element) === "caption";
  }

  function isUiLabelText(text) {
    const normalized = text.trim().toLowerCase().replace(/[·•|].*$/, "").trim();
    if (UI_LABEL_PHRASES.has(normalized)) return true;
    if (/^comment as\b/.test(normalized)) return true;
    return UI_COUNTER_PATTERNS.some(pattern => pattern.test(normalized));
  }

  function looksLikeNameLink(text) {
    const words = text.trim().split(/\s+/);
    if (words.length === 0 || words.length > 5) return false;
    return words.every(word => /^[A-Z][a-zA-Z'.-]*$/.test(word));
  }

  function isInPrivateChatDock(element, locationLike = window.location) {
    const hostname = locationLike?.hostname || "";
    if (!META_HOSTS.some(host => hostname.includes(host))) return false;
    let node = element;
    let depth = 0;
    while (node && depth < 10) {
      try {
        const label = node.getAttribute && node.getAttribute("aria-label");
        if (label && /messenger|conversation/i.test(label)) return true;
        const style = window.getComputedStyle(node);
        if (style.position === "fixed") {
          const rectangle = node.getBoundingClientRect();
          const nearBottomRight = rectangle.right > window.innerWidth - 460 &&
            rectangle.bottom > window.innerHeight - 700;
          if (nearBottomRight && rectangle.width > 200 && rectangle.height > 200) return true;
        }
      } catch (_ignoredDetachedNode) {}
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  function isInFacebookProfileCard(element, locationLike = window.location) {
    const hostname = locationLike?.hostname || "";
    if (!META_HOSTS.some(host => hostname.includes(host))) return false;
    const ownerDocument = element.ownerDocument || document;
    let node = element;
    let depth = 0;
    while (node && depth < 14) {
      try {
        const children = node.children ? Array.from(node.children).slice(0, 3) : [];
        for (const child of children) {
          const text = (child.textContent || "").trim().toLowerCase();
          if (text && text.length < 40 && PROFILE_CARD_TITLES.has(text)) return true;
        }
        let label = node.getAttribute && node.getAttribute("aria-label");
        if (!label) {
          const labelledBy = node.getAttribute && node.getAttribute("aria-labelledby");
          if (labelledBy) {
            const labelElement = ownerDocument.getElementById(labelledBy.split(/\s+/)[0]);
            if (labelElement) label = labelElement.textContent;
          }
        }
        if (label && PROFILE_CARD_TITLES.has(label.trim().toLowerCase())) return true;
      } catch (_ignoredDetachedNode) {}
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  return Object.freeze({
    isExcludedHostname,
    isPrivateLocation,
    shouldSkipElement,
    isVisuallyHidden,
    findPrecedingTimestampType,
    isPostCaptionNotComment,
    isUiLabelText,
    looksLikeNameLink,
    isInPrivateChatDock,
    isInFacebookProfileCard,
  });
})();
