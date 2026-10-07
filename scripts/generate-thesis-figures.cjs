"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const ROOT = path.resolve(__dirname, "..");
const MODEL_DIR = path.join(ROOT, "TRAINING", "model");
const DATASET = path.join(ROOT, "TRAINING", "data", "dataset.csv");
const OUTPUT_DIR = path.join(ROOT, "deliverables", "SOP1_SOP2", "thesis_figures");
const WIDTH = 1600;
const HEIGHT = 1000;
:
const COLORS = {
  ink: "#172033",
  muted: "#64748b",
  grid: "#dbe3ee",
  panel: "#f8fafc",
  blue: "#2563eb",
  cyan: "#0891b2",
  amber: "#d97706",
  purple: "#7c3aed",
  green: "#059669",
  red: "#dc2626",
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...records] = rows;
  return records
    .filter(record => record.length === header.length && record.some(Boolean))
    .map(record => Object.fromEntries(header.map((column, index) => [column, record[index]])));
}

function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function comma(value) {
  return Number(value).toLocaleString("en-US");
}

function percent(value, digits = 2) {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function svgFrame(title, subtitle, body, footer) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  <style>
    text { font-family: Arial, Helvetica, sans-serif; fill: ${COLORS.ink}; }
    .title { font-size: 44px; font-weight: 700; }
    .subtitle { font-size: 22px; fill: ${COLORS.muted}; }
    .axis { font-size: 19px; fill: ${COLORS.muted}; }
    .label { font-size: 22px; font-weight: 600; }
    .value { font-size: 22px; font-weight: 700; }
    .small { font-size: 17px; fill: ${COLORS.muted}; }
  </style>
  <text x="90" y="82" class="title">${escapeXml(title)}</text>
  <text x="90" y="122" class="subtitle">${escapeXml(subtitle)}</text>
  ${body}
  <line x1="90" y1="935" x2="1510" y2="935" stroke="${COLORS.grid}" stroke-width="2"/>
  <text x="90" y="972" class="small">${escapeXml(footer)}</text>
</svg>`;
}

function datasetComposition(records) {
  const counts = records.reduce((result, record) => {
    result[record.label] = (result[record.label] || 0) + 1;
    return result;
  }, {});
  const nonAggressive = counts["0"] || 0;
  const aggressive = counts["1"] || 0;
  const total = nonAggressive + aggressive;
  const aggressiveShare = aggressive / total;
  const radius = 220;
  const circumference = 2 * Math.PI * radius;
  const aggressiveDash = circumference * aggressiveShare;
  const body = `
    <rect x="90" y="175" width="1420" height="700" rx="28" fill="${COLORS.panel}" stroke="${COLORS.grid}" stroke-width="2"/>
    <circle cx="500" cy="525" r="${radius}" fill="none" stroke="${COLORS.blue}" stroke-width="92"/>
    <circle cx="500" cy="525" r="${radius}" fill="none" stroke="${COLORS.amber}" stroke-width="92"
      stroke-dasharray="${aggressiveDash} ${circumference - aggressiveDash}" transform="rotate(-90 500 525)"/>
    <circle cx="500" cy="525" r="142" fill="#ffffff"/>
    <text x="500" y="510" text-anchor="middle" style="font-size:54px;font-weight:700">${comma(total)}</text>
    <text x="500" y="552" text-anchor="middle" class="subtitle">total comments</text>
    <rect x="870" y="355" width="36" height="36" rx="7" fill="${COLORS.blue}"/>
    <text x="930" y="383" class="label">Non-aggressive</text>
    <text x="930" y="438" style="font-size:44px;font-weight:700">${comma(nonAggressive)}</text>
    <text x="930" y="476" class="subtitle">${percent(nonAggressive / total, 0)} of the dataset</text>
    <rect x="870" y="575" width="36" height="36" rx="7" fill="${COLORS.amber}"/>
    <text x="930" y="603" class="label">Aggressive</text>
    <text x="930" y="658" style="font-size:44px;font-weight:700">${comma(aggressive)}</text>
    <text x="930" y="696" class="subtitle">${percent(aggressive / total, 0)} of the dataset</text>
    <text x="870" y="790" class="small">Class ratio: 3 non-aggressive comments for every 1 aggressive comment</text>`;
  return svgFrame(
    "Dataset Composition",
    "Distribution of aggressive and non-aggressive comments in the complete dataset",
    body,
    "Source: TRAINING/data/dataset.csv"
  );
}

function overallMetrics(metrics) {
  const series = [
    { key: "precision", label: "Precision", color: COLORS.blue },
    { key: "recall", label: "Recall", color: COLORS.amber },
    { key: "f1_score", label: "F1-score", color: COLORS.purple },
  ];
  const names = ["Naive Bayes", "VADER", "Hybrid (60/40)"];
  const left = 175;
  const top = 220;
  const chartHeight = 590;
  const baseline = top + chartHeight;
  let marks = "";
  for (let tick = 0; tick <= 100; tick += 20) {
    const y = baseline - (tick / 100) * chartHeight;
    marks += `<line x1="${left}" y1="${y}" x2="1510" y2="${y}" stroke="${COLORS.grid}" stroke-width="2"/>`;
    marks += `<text x="145" y="${y + 7}" text-anchor="end" class="axis">${tick}%</text>`;
  }
  metrics.forEach((row, modelIndex) => {
    const groupX = 290 + modelIndex * 440;
    series.forEach((item, metricIndex) => {
      const value = Number(row[item.key]);
      const barHeight = value * chartHeight;
      const x = groupX + metricIndex * 104;
      const y = baseline - barHeight;
      marks += `<rect x="${x}" y="${y}" width="78" height="${barHeight}" rx="10" fill="${item.color}"/>`;
      marks += `<text x="${x + 39}" y="${y - 14}" text-anchor="middle" class="value">${percent(value)}</text>`;
    });
    marks += `<text x="${groupX + 143}" y="855" text-anchor="middle" class="label">${escapeXml(names[modelIndex])}</text>`;
  });
  const legend = series.map((item, index) => {
    const x = 500 + index * 230;
    return `<rect x="${x}" y="163" width="25" height="25" rx="5" fill="${item.color}"/><text x="${x + 38}" y="183" class="axis">${item.label}</text>`;
  }).join("");
  return svgFrame(
    "Overall Precision, Recall, and F1-score",
    "Aggressive class results on the same 12,980-comment test set",
    `${legend}${marks}<text x="55" y="520" transform="rotate(-90 55 520)" text-anchor="middle" class="axis">Score (%)</text>`,
    "Decision threshold = 0.50; blocklist and whitelist overrides disabled"
  );
}

function blueShade(value, maximum) {
  const ratio = Math.sqrt(value / maximum);
  const lightness = 96 - ratio * 55;
  return `hsl(217 83% ${lightness}%)`;
}

function confusionMatrix(title, modelLabel, row) {
  const values = [
    [Number(row.true_negative), Number(row.false_positive)],
    [Number(row.false_negative), Number(row.true_positive)],
  ];
  const maximum = Math.max(...values.flat());
  const matrixX = 520;
  const matrixY = 265;
  const cellW = 400;
  const cellH = 255;
  let cells = "";
  values.forEach((matrixRow, rowIndex) => {
    const rowTotal = matrixRow[0] + matrixRow[1];
    matrixRow.forEach((value, columnIndex) => {
      const x = matrixX + columnIndex * cellW;
      const y = matrixY + rowIndex * cellH;
      const textColor = value / maximum > 0.42 ? "#ffffff" : COLORS.ink;
      cells += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${blueShade(value, maximum)}" stroke="#ffffff" stroke-width="8" rx="17"/>`;
      cells += `<text x="${x + cellW / 2}" y="${y + 115}" text-anchor="middle" style="font-size:56px;font-weight:700;fill:${textColor}">${comma(value)}</text>`;
      cells += `<text x="${x + cellW / 2}" y="${y + 162}" text-anchor="middle" style="font-size:22px;fill:${textColor}">${percent(value / rowTotal)} of actual class</text>`;
      const cellName = [["True negative", "False positive"], ["False negative", "True positive"]][rowIndex][columnIndex];
      cells += `<text x="${x + cellW / 2}" y="${y + 207}" text-anchor="middle" style="font-size:19px;font-weight:600;fill:${textColor}">${cellName}</text>`;
    });
  });
  const accuracy = Number(row.accuracy);
  const body = `
    <text x="920" y="196" text-anchor="middle" class="label">Predicted class</text>
    <text x="720" y="244" text-anchor="middle" class="axis">Non-aggressive</text>
    <text x="1120" y="244" text-anchor="middle" class="axis">Aggressive</text>
    <text x="160" y="520" transform="rotate(-90 160 520)" text-anchor="middle" class="label">Actual class</text>
    <text x="480" y="400" text-anchor="end" class="axis">Non-aggressive</text>
    <text x="480" y="655" text-anchor="end" class="axis">Aggressive</text>
    ${cells}
    <rect x="520" y="815" width="800" height="64" rx="15" fill="${COLORS.panel}" stroke="${COLORS.grid}" stroke-width="2"/>
    <text x="920" y="856" text-anchor="middle" class="label">Accuracy: ${percent(accuracy)}  •  Test samples: 12,980</text>`;
  return svgFrame(
    title,
    `${modelLabel} predictions at the fixed 0.50 decision threshold`,
    body,
    "Rows show actual labels; columns show predicted labels"
  );
}

function weightComparison(weights) {
  const rows = [...weights].sort((a, b) => Number(a["NB Weight"]) - Number(b["NB Weight"]));
  const series = [
    { key: "Precision", label: "Precision", color: COLORS.blue },
    { key: "Recall", label: "Recall", color: COLORS.amber },
    { key: "F1", label: "F1-score", color: COLORS.purple },
  ];
  const left = 175;
  const right = 1490;
  const top = 260;
  const bottom = 800;
  const minimum = 0.55;
  const maximum = 0.95;
  const xFor = weight => left + Number(weight) * (right - left);
  const yFor = score => bottom - ((Number(score) - minimum) / (maximum - minimum)) * (bottom - top);
  let grid = "";
  for (let tick = 55; tick <= 95; tick += 10) {
    const y = yFor(tick / 100);
    grid += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${COLORS.grid}" stroke-width="2"/>`;
    grid += `<text x="145" y="${y + 7}" text-anchor="end" class="axis">${tick}%</text>`;
  }
  for (let tick = 0; tick <= 100; tick += 10) {
    const x = xFor(tick / 100);
    grid += `<line x1="${x}" y1="${bottom}" x2="${x}" y2="${bottom + 9}" stroke="${COLORS.ink}" stroke-width="2"/>`;
    grid += `<text x="${x}" y="${bottom + 40}" text-anchor="middle" class="axis">${tick}%</text>`;
  }
  const lines = series.map(item => {
    const points = rows.map(row => `${xFor(row["NB Weight"])},${yFor(row[item.key])}`).join(" ");
    const dots = rows.map(row => `<circle cx="${xFor(row["NB Weight"])}" cy="${yFor(row[item.key])}" r="6" fill="${item.color}" stroke="#ffffff" stroke-width="2"/>`).join("");
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join("");
  const selected = rows.find(row => Number(row["NB Weight"]) === 0.6);
  const best = rows.reduce((winner, row) => Number(row.F1) > Number(winner.F1) ? row : winner, rows[0]);
  const selectedX = xFor(selected["NB Weight"]);
  const bestX = xFor(best["NB Weight"]);
  const bestY = yFor(best.F1);
  const legend = series.map((item, index) => {
    const x = 235 + index * 190;
    return `<line x1="${x}" y1="186" x2="${x + 42}" y2="186" stroke="${item.color}" stroke-width="7"/><circle cx="${x + 21}" cy="186" r="6" fill="${item.color}"/><text x="${x + 57}" y="193" class="axis">${item.label}</text>`;
  }).join("");
  const selectedDots = series.map(item => `<circle cx="${selectedX}" cy="${yFor(selected[item.key])}" r="13" fill="${item.color}" stroke="#ffffff" stroke-width="4"/>`).join("");
  const body = `
    ${legend}
    <rect x="900" y="148" width="500" height="82" rx="14" fill="#f3e8ff" stroke="${COLORS.purple}" stroke-width="2"/>
    <text x="925" y="179" class="label" style="fill:${COLORS.purple}">Implemented: 60% NB / 40% VADER</text>
    <text x="925" y="211" class="axis">P ${percent(selected.Precision)}  •  R ${percent(selected.Recall)}  •  F1 ${percent(selected.F1)}</text>
    ${grid}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${COLORS.ink}" stroke-width="3"/>
    ${lines}
    <line x1="${selectedX}" y1="${top}" x2="${selectedX}" y2="${bottom}" stroke="${COLORS.purple}" stroke-width="3" stroke-dasharray="10 10"/>
    ${selectedDots}
    <circle cx="${bestX}" cy="${bestY}" r="16" fill="none" stroke="${COLORS.green}" stroke-width="6"/>
    <text x="${bestX + 24}" y="${bestY - 16}" class="small" style="fill:${COLORS.green};font-weight:700">Highest F1: 65/35 (${percent(best.F1)})</text>
    <text x="${(left + right) / 2}" y="890" text-anchor="middle" class="label">Naive Bayes weight (VADER receives the remaining weight)</text>
    <text x="55" y="520" transform="rotate(-90 55 520)" text-anchor="middle" class="axis">Metric score (%)</text>`;
  return svgFrame(
    "Hybrid-weight Metrics Comparison",
    "Precision, recall, and F1-score across 21 Naive Bayes–VADER weight combinations",
    body,
    "Weights were ranked by F1; 60/40 was retained as the implemented, interpretable balance"
  );
}

function writeWeightMetricsTable(weights) {
  const rows = [...weights].sort((a, b) => Number(a["NB Weight"]) - Number(b["NB Weight"]));
  const rankFor = key => new Map(
    [...rows]
      .sort((a, b) => Number(b[key]) - Number(a[key]))
      .map((row, index) => [row["Weight Split"], index + 1]),
  );
  const precisionRanks = rankFor("Precision");
  const recallRanks = rankFor("Recall");
  const f1Ranks = rankFor("F1");
  const headers = [
    "Weight Split", "NB Weight", "VADER Weight",
    "Precision", "Precision Rank", "Recall", "Recall Rank",
    "F1", "F1 Rank", "Result Note",
  ];
  const csvRows = rows.map(row => {
    const notes = [];
    if (Number(row["NB Weight"]) === 0.60) notes.push("Implemented split");
    if (precisionRanks.get(row["Weight Split"]) === 1) notes.push("Highest precision");
    if (recallRanks.get(row["Weight Split"]) === 1) notes.push("Highest recall");
    if (f1Ranks.get(row["Weight Split"]) === 1) notes.push("Highest F1");
    return [
      row["Weight Split"], row["NB Weight"], row["VADER Weight"],
      row.Precision, precisionRanks.get(row["Weight Split"]),
      row.Recall, recallRanks.get(row["Weight Split"]),
      row.F1, f1Ranks.get(row["Weight Split"]), notes.join("; "),
    ];
  });
  const escapeCsv = value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers, ...csvRows]
    .map(row => row.map(escapeCsv).join(","))
    .join("\r\n") + "\r\n";
  fs.writeFileSync(path.join(OUTPUT_DIR, "Table_20_Hybrid_Weight_All_Metrics.csv"), csv, "utf8");
}

function findBrowser() {
  return [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(candidate => fs.existsSync(candidate));
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, description, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close() {
    this.socket.close();
  }
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function renderAllPng(figures, browserPath) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "cad-thesis-figures-"));
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-extensions",
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-port=0",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let browserErrors = "";
  let browserClient;
  browser.stderr.on("data", chunk => { browserErrors += chunk.toString(); });
  try {
    const debugPort = await waitFor(() => {
      const portFile = path.join(profileDir, "DevToolsActivePort");
      if (!fs.existsSync(portFile)) return null;
      return Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    }, "the browser debugging port");
    const browserInfo = await getJson(`http://127.0.0.1:${debugPort}/json/version`);
    browserClient = new CdpClient(browserInfo.webSocketDebuggerUrl);

    for (const [name] of figures) {
      const svgPath = path.join(OUTPUT_DIR, `${name}.svg`);
      const pngPath = path.join(OUTPUT_DIR, `${name}.png`);
      const url = pathToFileURL(svgPath).href;
      const target = await getJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      const page = new CdpClient(target.webSocketDebuggerUrl);
      await page.send("Page.enable");
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitFor(async () => {
        const result = await page.send("Runtime.evaluate", {
          expression: "document.readyState === 'complete'",
          returnByValue: true,
        });
        return result.result?.value;
      }, `${name} to load`);
      const { data } = await page.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      });
      fs.writeFileSync(pngPath, Buffer.from(data, "base64"));
      await page.send("Page.close").catch(() => {});
      page.close();
      process.stdout.write(`Created ${path.relative(ROOT, pngPath)}\n`);
    }
  } catch (error) {
    if (browserErrors.trim()) process.stderr.write(browserErrors.slice(-4000));
    throw error;
  } finally {
    if (browserClient) {
      await browserClient.send("Browser.close").catch(() => {});
      browserClient.close();
    } else if (!browser.killed) {
      browser.kill();
    }
    if (browser.exitCode === null) {
      await Promise.race([once(browser, "exit"), delay(5_000)]);
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 9) process.stderr.write(`Warning: ${error.message}\n`);
        else await delay(250);
      }
    }
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const dataset = readCsv(DATASET);
  const metrics = readCsv(path.join(MODEL_DIR, "sop2_metrics_from_predictions.csv"));
  const weights = readCsv(path.join(MODEL_DIR, "hybrid_weight_ranking.csv"));
  const nb = metrics.find(row => row.model === "Naive Bayes");
  const vader = metrics.find(row => row.model === "VADER");
  const hybrid = metrics.find(row => row.model.startsWith("Hybrid"));
  const figures = [
    ["Figure_15_Dataset_Composition", datasetComposition(dataset)],
    ["Figure_16_Overall_Precision_Recall_F1", overallMetrics(metrics)],
    ["Figure_17_Naive_Bayes_Confusion_Matrix", confusionMatrix("Naive Bayes Confusion Matrix", "Naive Bayes", nb)],
    ["Figure_18_VADER_Confusion_Matrix", confusionMatrix("VADER Confusion Matrix", "VADER", vader)],
    ["Figure_19_Hybrid_Confusion_Matrix", confusionMatrix("Hybrid Confusion Matrix", "60% Naive Bayes + 40% VADER", hybrid)],
    ["Figure_20_Hybrid_Weight_Comparison", weightComparison(weights)],
  ];
  for (const [name, svg] of figures) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${name}.svg`), svg, "utf8");
  }
  writeWeightMetricsTable(weights);

  if (!process.argv.includes("--browser-png")) {
    process.stdout.write(`Created ${figures.length} SVG figures and the complete weight-metrics table. Use render-thesis-figures.ps1 for the PNG copies.\n`);
    return;
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    process.stdout.write(`Created ${figures.length} SVG figures. No supported browser was found for PNG rendering.\n`);
    return;
  }
  await renderAllPng(figures, browserPath);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
