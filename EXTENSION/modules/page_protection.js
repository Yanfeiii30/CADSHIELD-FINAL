/** Page-level warnings supplement the existing per-comment blur. */
globalThis.PageProtection = (() => {
  let seen = new WeakSet();
  let count = 0;
  let pageUrl = null;
  let host = null;
  let dialog = null;
  // Remember shown pages across scanner resets and same-document navigation.
  const warnedPages = new Set();
  let previousFocus = null;

  function removeUI() {
    if (dialog?.open) dialog.close();
    host?.remove();
    host = null;
    dialog = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function reset() {
    removeUI();
    seen = new WeakSet();
    count = 0;
    pageUrl = window.location.href;
  }

  function syncLocation() {
    if (pageUrl !== window.location.href) reset();
  }

  function show() {
    removeUI();
    host = document.createElement('div');
    host.setAttribute('data-cad-ui', 'page-protection');
    // Shadow DOM isolates warning controls from the site's styles and scanner.
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      .card { font: 14px/1.5 'Segoe UI', system-ui, sans-serif; color: #575049;
        background: #fffdf9;
        border: 1px solid #e6c58c; border-top: 6px solid #e99a16; border-radius: 16px; padding: 24px;
        box-shadow: 0 32px 100px #00000066;
        text-align: left; isolation: isolate; }
      dialog { position: fixed; inset: 0; margin: auto;
        width: min(480px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
      dialog[open] { animation: cad-enter 240ms cubic-bezier(.2,.8,.2,1) both; }
      dialog::backdrop { background: #17130fd1; backdrop-filter: blur(8px) saturate(.5); }
      .topline { display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
      .label { color: #51483c; font-size: 12px; font-weight: 800; letter-spacing: 2px; margin: 0; }
      .label::before { content: ''; display: inline-block; width: 8px; height: 8px;
        background: #c47b0b; border-radius: 50%; margin-right: 9px; box-shadow: 0 0 0 4px #c47b0b12; }
      .status { display: inline-flex; align-items: center; gap: 6px; color: #854800;
        background: #fff0ce; border: 1px solid #edcf91; border-radius: 100px;
        padding: 5px 10px; font-size: 11px; font-weight: 650; }
      .warning-icon { display: grid; place-items: center; width: 56px; height: 56px;
        border-radius: 12px; color: #854800; background: #ffedbd;
        border: 1px solid #eac16c; margin-bottom: 0; }
      .warning-icon svg { width: 36px; height: 36px; }
      .eyebrow { color: #925000; font-size: 11px; font-weight: 800; letter-spacing: 1.7px; margin: 0 0 5px; }
      h2 { margin: 0; color: #30251b; font-size: 24px; line-height: 1.2;
        letter-spacing: -.5px; font-weight: 750; max-width: 440px; text-wrap: balance; }
      p { margin: 0; }
      .heading-row { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 14px; margin-bottom: 16px; }
      .protection-note { display: flex; align-items: flex-start; gap: 12px;
        padding: 12px; background: #fff5df; border: 1px solid #edd7ab;
        border-radius: 10px; color: #644a26; font-size: 13px; margin: 16px 0 0; }
      .protection-note::before { content: '✓'; flex: none; display: grid; place-items: center;
        width: 23px; height: 23px; border-radius: 50%; background: #f5e2b9; color: #79521a; font-weight: 800; }
      .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
      button { min-width: 0; font: 650 13px/1.4 'Segoe UI', system-ui, sans-serif;
        cursor: pointer; min-height: 44px; padding: 10px 8px; border-radius: 12px;
        border: 1px solid #cec5b8; background: #fffdf9; color: #514231;
        transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
      button:first-child { background: #924b0b; border-color: #924b0b; color: #fff;
        box-shadow: 0 4px 10px #924b0b20; }
      button:hover { background: #fff0d2; transform: translateY(-1px); }
      button:first-child:hover { background: #743a06; box-shadow: 0 6px 16px #924b0b2a; }
      button:active { transform: translateY(0); }
      button:focus-visible { outline: 3px solid #a4610a; outline-offset: 4px; }
      .footnote { color: #766953; font-size: 11px; text-align: center;
        margin: 14px 0 0; padding-top: 12px; border-top: 1px solid #e9dfce; }
      @keyframes cad-enter { from { opacity: 0; transform: translateY(10px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); } }
      @media (max-width: 380px) {
        .card { padding: 18px; } h2 { font-size: 20px; }
        .label { font-size: 10px; letter-spacing: 1px; }
        .status { font-size: 10px; padding: 4px 8px; }
        .heading-row { gap: 10px; }
      }
      @media (max-height: 480px) {
        .card { padding: 16px; }
        .topline { margin-bottom: 10px; }
        .heading-row { margin-bottom: 10px; }
        .protection-note { margin-top: 10px; padding: 8px 10px; }
        .actions { margin-top: 12px; }
        .footnote { margin-top: 10px; padding-top: 8px; }
      }
      @media (prefers-reduced-motion: reduce) {
        dialog[open] { animation: none; } button { transition: none; }
        button:hover { transform: none; }
      }
    `;
    const card = document.createElement('dialog');
    card.className = 'card';
    card.setAttribute('aria-labelledby', 'cad-protection-title');
    card.setAttribute('aria-describedby', 'cad-protection-description');
    card.setAttribute('role', 'alertdialog');
    const label = document.createElement('p');
    label.className = 'label';
    label.textContent = 'CAD SHIELD';
    const topline = document.createElement('div');
    topline.className = 'topline';
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = 'Review before continuing';
    topline.append(label, status);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'CONTENT WARNING';
    const icon = document.createElement('div');
    icon.className = 'warning-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.3 4.8a2 2 0 0 1 3.4 0l12 20.2a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3L14.3 4.8Z" fill="#ffd36b" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 11v8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="23" r="1.5" fill="currentColor"/></svg>';
    const heading = document.createElement('h2');
    heading.id = 'cad-protection-title';
    heading.textContent = 'Harmful language detected';
    const description = document.createElement('p');
    description.id = 'cad-protection-description';
    description.textContent = 'At least ' + count + ' passages were flagged for potentially harmful language.' +
      ' You can leave or keep reading with protection.';
    const note = document.createElement('p');
    note.className = 'protection-note';
    note.textContent = 'Flagged text stays blurred while you read.';
    const footnote = document.createElement('p');
    footnote.className = 'footnote';
    footnote.textContent = 'Automated detection can make mistakes. You decide whether to continue.';
    const actions = document.createElement('div');
    actions.className = 'actions';
    function button(label, action) {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', action);
      actions.appendChild(element);
      return element;
    }
    button('Go back', () => {
      if (window.history.length > 1) window.history.back();
      else window.location.assign('about:blank');
    });
    button('Keep reading', removeUI);
    // Escape has the same meaning as Keep reading; the existing blur stays active.
    card.addEventListener('cancel', event => {
      event.preventDefault();
      removeUI();
    });
    dialog = card;
    previousFocus = document.activeElement;
    const headingRow = document.createElement('div');
    headingRow.className = 'heading-row';
    const titleGroup = document.createElement('div');
    titleGroup.append(eyebrow, heading);
    headingRow.append(icon, titleGroup);
    card.append(topline, headingRow, description, note, actions, footnote);
    shadow.append(style, card);
    document.documentElement.appendChild(host);
    dialog.showModal();
    warnedPages.add(pageUrl);
  }

  function record(el) {
    // Keep per-comment blurring active without displaying page-level alerts.
    if (!CADConfig.protection.enabled) return;
    syncLocation();
    if (PageRules.isPrivateLocation(window.location) || !el || el.isConnected === false || seen.has(el)) return;
    seen.add(el);
    count += 1;
    if (count >= CADConfig.protection.blockAfter && !warnedPages.has(pageUrl) && !dialog) {
      show();
    }
  }

  return Object.freeze({ record, reset, syncLocation });
})();
