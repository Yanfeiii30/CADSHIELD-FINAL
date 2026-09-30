"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const ROOT = path.resolve(__dirname, "..");
const EXTENSION_DIR = path.join(ROOT, "EXTENSION");
const FIXTURE = path.join(ROOT, "docs", "system-screenshot-fixture.html");
const OUTPUT_DIR = path.join(ROOT, "deliverables", "SOP1_SOP2", "screenshots");
const DEFAULT_BROWSER = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, description, timeout = 20_000) {
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

async function openTarget(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open ${url}: HTTP ${response.status}`);
  return response.json();
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`Could not list browser targets: HTTP ${response.status}`);
  return response.json();
}

async function browserTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error(`Could not inspect the browser target: HTTP ${response.status}`);
  return response.json();
}

async function capture(client, fileName, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(500);
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), Buffer.from(data, "base64"));
  process.stdout.write(`Captured ${fileName}\n`);
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function run() {
  const browserPath = process.argv[2] || DEFAULT_BROWSER;
  if (!fs.existsSync(browserPath)) throw new Error(`Browser not found: ${browserPath}`);
  if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture not found: ${FIXTURE}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const fixtureHtml = fs.readFileSync(FIXTURE);
  const server = http.createServer((request, response) => {
    if (request.url === "/" || request.url === "/system-screenshot-fixture.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fixtureHtml);
      return;
    }
    response.writeHead(404);
    response.end("Not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const fixturePort = server.address().port;

  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cad-shots-"));
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    `--user-data-dir=${profileDirectory}`,
    "--remote-debugging-port=0",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

  let browserErrors = "";
  let browserClient = null;
  let serviceWorker = null;
  browser.stderr.on("data", chunk => { browserErrors += chunk.toString(); });

  try {
    const debugPort = await waitFor(() => {
      const activePortPath = path.join(profileDirectory, "DevToolsActivePort");
      if (!fs.existsSync(activePortPath)) return null;
      return Number(fs.readFileSync(activePortPath, "utf8").split(/\r?\n/)[0]);
    }, "the browser debugging port");

    const browserInfo = await browserTarget(debugPort);
    browserClient = new CdpClient(browserInfo.webSocketDebuggerUrl);

    const extensionTarget = await waitFor(async () => {
      const targets = await listTargets(debugPort);
      return targets.find(target => /^chrome-extension:\/\/[^/]+\/background\.js/.test(target.url));
    }, "the CAD Shield extension service worker");

    const extensionId = new URL(extensionTarget.url).hostname;
    serviceWorker = new CdpClient(extensionTarget.webSocketDebuggerUrl);
    await serviceWorker.send("Runtime.enable");
    const storageValues = {
      enabled: true,
      mode: "hybrid",
      panel_mode: true,
      theme: "light",
      whitelist: ["super", "approved phrase"],
      custom_keywords: ["ugly", "forced block"],
    };
    await evaluate(
      serviceWorker,
      `new Promise(resolve => chrome.storage.local.set(${JSON.stringify(storageValues)}, resolve))`,
    );
    const fixtureUrl = `http://127.0.0.1:${fixturePort}/system-screenshot-fixture.html`;
    const pageTarget = await openTarget(debugPort, fixtureUrl);
    const page = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await delay(7_000);
    const partialCount = await evaluate(
      page,
      "document.querySelectorAll('.cad-partial-blurred').length",
    );
    const fullBlurCount = await evaluate(
      page,
      "document.querySelectorAll('.cad-blurred').length",
    );
    if (partialCount < 1 || fullBlurCount < 1) {
      throw new Error(
        `Extension did not render expected detections (partial=${partialCount}, full=${fullBlurCount})`,
      );
    }
    await capture(page, "02-detected-and-blurred-text.png", 1400, 920);

    const revealChangedState = await evaluate(page, `(() => {
      const result = document.querySelector('.cad-partial-blurred');
      const button = result && result.nextElementSibling;
      if (!button || !button.classList.contains('cad-reveal-btn')) return false;
      button.click();
      return result.classList.contains('cad-partial-revealed');
    })()`);
    if (!revealChangedState) throw new Error("The partial-blur reveal control did not change state");
    await capture(page, "02b-reveal-control-active.png", 1400, 920);
    const reblurChangedState = await evaluate(page, `(() => {
      const result = document.querySelector('[data-cad-partial-root]');
      const button = result && result.nextElementSibling;
      if (!button || !button.classList.contains('cad-reveal-btn')) return false;
      button.click();
      return result.classList.contains('cad-partial-blurred');
    })()`);
    if (!reblurChangedState) throw new Error("The reveal control did not restore the partial blur");
    page.close();

    // Preserve the actual scan records before opening the popup as a full tab.
    // That navigation changes the active tab in an automation session, so we
    // re-publish the captured records after the popup loads for a stable image.
    const scanRecords = await evaluate(
      serviceWorker,
      `new Promise(resolve => chrome.storage.local.get(["log_entries", "stat_total", "stat_aggressive"], resolve))`,
    );
    if (!scanRecords.stat_total || !Array.isArray(scanRecords.log_entries)) {
      throw new Error("The live fixture rendered, but its detection log was not recorded");
    }

    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const popupTarget = await openTarget(debugPort, popupUrl);
    const popup = new CdpClient(popupTarget.webSocketDebuggerUrl);
    await popup.send("Page.enable");
    await popup.send("Runtime.enable");
    await delay(2_000);
    await evaluate(
      popup,
      `new Promise(resolve => chrome.storage.local.set(${JSON.stringify(scanRecords)}, resolve))`,
    );
    await delay(500);
    await capture(popup, "01-main-interface-logs-statistics.png", 520, 1000);

    await evaluate(popup, "document.querySelector('[data-tab=\"settings\"]').click()")
    await delay(500);
    await capture(popup, "03-settings-whitelist.png", 520, 1000);

    await evaluate(popup, "document.getElementById('wordTabBlocklist').click()")
    await delay(300);
    await capture(popup, "04-settings-blocklist.png", 520, 1000);

    await evaluate(popup, "document.querySelector('[data-tab=\"sop2\"]').click()")
    await delay(300);
    await capture(popup, "05-expert-mode-evaluation.png", 520, 1200);
    popup.close();
    serviceWorker.close();
    serviceWorker = null;

    process.stdout.write(`Extension ID: ${extensionId}\n`);
    process.stdout.write(`Screenshots written to ${OUTPUT_DIR}\n`);
  } catch (error) {
    if (browserErrors.trim()) process.stderr.write(browserErrors.slice(-4000));
    throw error;
  } finally {
    server.close();
    if (serviceWorker) serviceWorker.close();
    if (browserClient) {
      await browserClient.send("Browser.close").catch(() => {});
      browserClient.close();
    } else if (!browser.killed) {
      browser.kill();
    }
    if (browser.exitCode === null) {
      await Promise.race([once(browser, "exit"), delay(5_000)]);
    }
    const resolvedTemp = path.resolve(os.tmpdir()) + path.sep;
    const resolvedProfile = path.resolve(profileDirectory);
    if (resolvedProfile.startsWith(resolvedTemp) && path.basename(resolvedProfile).startsWith("cad-shots-")) {
      let removed = false;
      for (let attempt = 0; attempt < 10 && !removed; attempt++) {
        try {
          fs.rmSync(resolvedProfile, { recursive: true, force: true });
          removed = true;
        } catch (error) {
          if (attempt === 9) {
            process.stderr.write(`Warning: could not remove temporary profile ${resolvedProfile}: ${error.message}\n`);
          } else {
            await delay(250);
          }
        }
      }
    }
  }
}

run().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
