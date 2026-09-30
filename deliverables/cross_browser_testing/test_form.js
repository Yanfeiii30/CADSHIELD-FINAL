'use strict';
(async function () {
  const response = await fetch('test_definitions.json');
  if (!response.ok) throw new Error('Cannot load test definitions. Open this form through the local test server.');
  const definitions = await response.json();
  const statuses = ['Not Tested', 'Pass', 'Fail'];
  const fields = ['testDate', 'testerName', 'operatingSystem', 'extensionVersion', 'observations'];
  const key = 'cad-cross-browser-results-v1';
  let inventory = null;
  const byId = id => document.getElementById(id);
  function element(tag, text) { const el = document.createElement(tag); if (text) el.textContent = text; return el; }
  for (const browser of definitions.browsers) {
    const group = element('fieldset'); group.append(element('legend', browser.name));
    const note = element('p', 'Not Tested — no results recorded.'); note.id = `summary-${browser.id}`; group.append(note);
    const wrap = element('div'); wrap.className = 'table-wrap';
    const table = element('table'), head = element('thead'), header = element('tr');
    for (const title of ['Required test', 'Result', 'Observations / errors', 'Screenshot filename']) header.append(element('th', title));
    head.append(header); table.append(head); const body = element('tbody');
    for (const test of definitions.tests) {
      const row = element('tr'); row.append(element('td', `${test.id}. ${test.label}`));
      for (const field of ['status', 'note', 'screenshot']) {
        const cell = element('td'); const control = element(field === 'status' ? 'select' : field === 'note' ? 'textarea' : 'input');
        control.id = `${browser.id}-${test.id}-${field}`;
        control.setAttribute('aria-label', `${browser.name}, test ${test.id}, ${field}`);
        if (field === 'status') for (const status of statuses) control.append(element('option', status));
        if (field === 'screenshot') control.placeholder = 'Optional additional PNG';
        cell.append(control); row.append(cell);
      }
      body.append(row);
    }
    table.append(body); wrap.append(table); group.append(wrap);
    const screenshotLabel = element('label', 'Main screenshot filename (a filename is not proof that a file exists)');
    const screenshot = element('input'); screenshot.id = `${browser.id}-screenshot`; screenshot.value = browser.screenshot;
    screenshotLabel.append(screenshot); group.append(screenshotLabel);
    const observations = element('label', 'Browser observations and encountered problems');
    const notes = element('textarea'); notes.id = `${browser.id}-observations`; observations.append(notes); group.append(observations);
    byId('browser-forms').append(group);
  }
  function collect() {
    return {schemaVersion:1, runId:inventory?.runId || '', exportedAt:new Date().toISOString(),
      inventory, environment:Object.fromEntries(fields.map(f => [f, byId(f).value])),
      browsers:definitions.browsers.map(b => ({id:b.id, name:b.name, screenshot:byId(`${b.id}-screenshot`).value,
        observations:byId(`${b.id}-observations`).value,
        tests:definitions.tests.map(t => ({id:t.id, label:t.label, status:byId(`${b.id}-${t.id}-status`).value,
          observations:byId(`${b.id}-${t.id}-note`).value, screenshot:byId(`${b.id}-${t.id}-screenshot`).value}))}))};
  }
  function summary() {
    for (const browser of collect().browsers) {
      const counts = Object.fromEntries(statuses.map(s => [s, browser.tests.filter(t => t.status === s).length]));
      byId(`summary-${browser.id}`).textContent = `${counts.Pass === 12 ? 'Passed' : counts.Fail ? 'Failed' : 'Not Tested'} — ${counts.Pass} Passed, ${counts.Fail} Failed, ${counts['Not Tested']} Not Tested`;
    }
  }
  function inventoryInfo() { byId('inventory-info').textContent = inventory ? `Inventory run: ${inventory.runId} | Captured: ${inventory.capturedAt}` : 'No browser inventory loaded.'; }
  function validateInventory(value) {
    if (value.schemaVersion !== 1 || !value.runId || !Array.isArray(value.browsers)) throw new Error('Invalid browser inventory.');
    for (const b of definitions.browsers) if (value.browsers.filter(x => x.id === b.id).length !== 1) throw new Error('Inventory must contain each of the four browsers exactly once.');
  }
  function restore(data) {
    if (data.schemaVersion !== 1 || !Array.isArray(data.browsers)) throw new Error('Invalid results format.');
    if (data.inventory) validateInventory(data.inventory);
    for (const b of definitions.browsers) {
      const matches = data.browsers.filter(x => x.id === b.id);
      if (matches.length !== 1) throw new Error(`Missing or duplicate browser: ${b.name}`);
      for (const t of definitions.tests) {
        const matchesT = (matches[0].tests || []).filter(x => x.id === t.id);
        if (matchesT.length !== 1 || !statuses.includes(matchesT[0].status)) throw new Error(`Invalid test ${t.id} for ${b.name}`);
      }
    }
    inventory = data.inventory || null; inventoryInfo();
    fields.forEach(f => byId(f).value = data.environment?.[f] || '');
    for (const b of data.browsers.filter(b => definitions.browsers.some(x => x.id === b.id))) {
      byId(`${b.id}-screenshot`).value = b.screenshot || '';
      byId(`${b.id}-observations`).value = b.observations || '';
      for (const t of b.tests.filter(t => definitions.tests.some(x => x.id === t.id))) {
        byId(`${b.id}-${t.id}-status`).value = t.status;
        byId(`${b.id}-${t.id}-note`).value = t.observations || '';
        byId(`${b.id}-${t.id}-screenshot`).value = t.screenshot || '';
      }
    }
    summary();
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(collect())); byId('message').textContent = 'Draft saved in this browser. Export JSON for a portable copy.'; }
    catch (e) { byId('message').textContent = 'Draft storage unavailable. Export JSON instead. ' + e.message; }
  }
  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], {type:mime})); const anchor = element('a'); anchor.href=url; anchor.download=name;
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  byId('json').onclick = () => download('cross_browser_results.json', JSON.stringify(collect(), null, 2), 'application/json');
  byId('csv').onclick = () => {
    const data=collect(), e=data.environment;
    const headers=['schemaVersion','runId','testDate','testerName','operatingSystem','extensionVersion','generalObservations','browserId','browserName','browserObservations','browserScreenshot','testId','testLabel','status','observations','screenshot'];
    // Prefix formula-like free text so spreadsheet applications will not execute it.
    const cell = value => { let s=String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; };
    const rows=data.browsers.flatMap(b => b.tests.map(t => [1,data.runId,e.testDate,e.testerName,e.operatingSystem,e.extensionVersion,e.observations,b.id,b.name,b.observations,b.screenshot,t.id,t.label,t.status,t.observations,t.screenshot]));
    download('cross_browser_results.csv','\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  byId('save').onclick=save;
  document.querySelector('main').addEventListener('change', e => { if(e.target.type !== 'file') {summary();save();} });
  byId('inventory-file').onchange=async e=>{try {
    const value=JSON.parse(await e.target.files[0].text());validateInventory(value);
    if(inventory && inventory.runId!==value.runId && !confirm('Switch inventory runs? Existing test results will be reset to Not Tested. Export first if needed.')) return;
    if(inventory && inventory.runId!==value.runId) for(const b of definitions.browsers) {
      byId(`${b.id}-observations`).value=''; byId(`${b.id}-screenshot`).value=b.screenshot;
      for(const t of definitions.tests) {byId(`${b.id}-${t.id}-status`).value='Not Tested';byId(`${b.id}-${t.id}-note`).value='';byId(`${b.id}-${t.id}-screenshot`).value='';}
    }
    inventory=value;inventoryInfo();byId('operatingSystem').value=value.operatingSystem || '';byId('extensionVersion').value=value.extensionVersion || '';summary();save();
  }catch(err){byId('message').textContent=err.message;}};
  byId('results-file').onchange=async e=>{try {if(!confirm('Replace this form with the imported results?'))return;restore(JSON.parse(await e.target.files[0].text()));save();}catch(err){byId('message').textContent=err.message;}};
  try {const draft=localStorage.getItem(key);if(draft)restore(JSON.parse(draft));}catch(e){byId('message').textContent='Could not restore draft: '+e.message;}
  summary();
})().catch(e=>document.getElementById('message').textContent=e.message);
