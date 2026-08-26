/**
 * popup/expert_layout.js
 * One-time DOM preparation for the expandable Expert Mode sections.
 */

(() => {
  const namespace = globalThis.CADShieldPopup || (globalThis.CADShieldPopup = {});

  function setupEvaluationSections() {
    const panel = document.getElementById("tab-sop2");
    if (!panel) return;
    const headings = [...panel.querySelectorAll(":scope > .section-title")];
    headings.forEach(heading => {
      const section = document.createElement("details");
      section.className = "eval-section";
      section.open = heading.textContent.includes("Hybrid Weight Comparison");

      const summary = document.createElement("summary");
      summary.textContent = heading.textContent;
      const body = document.createElement("div");
      body.className = "eval-section-body";

      panel.insertBefore(section, heading);
      section.append(summary, body);
      let sibling = heading.nextSibling;
      heading.remove();
      while (sibling) {
        const next = sibling.nextSibling;
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.classList.contains("section-title")) break;
        body.appendChild(sibling);
        sibling = next;
      }
    });
  }

  function setupAlgorithmSections() {
    const panel = document.getElementById("tab-algorithms");
    if (!panel) return;
    [...panel.querySelectorAll(":scope > .algo-card")].forEach((card, index) => {
      const title = card.querySelector(":scope > .algo-card-title");
      const body = card.querySelector(":scope > .algo-card-body");
      if (!title || !body) return;

      const section = document.createElement("details");
      section.className = "algo-card";
      section.open = index === 0;
      const summary = document.createElement("summary");
      summary.className = "algo-card-title";
      summary.textContent = title.textContent;

      card.replaceWith(section);
      section.append(summary, body);
    });
  }

  namespace.ExpertLayout = Object.freeze({
    setup() {
      setupEvaluationSections();
      setupAlgorithmSections();
    },
  });
})();
