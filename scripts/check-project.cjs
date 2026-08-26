"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const extensionRoot = path.join(root, "EXTENSION");
const failures = [];

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function requireFile(file, source) {
  if (!fs.existsSync(file)) failures.push(`${source} references missing file: ${relative(file)}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
} catch (error) {
  failures.push(`EXTENSION/manifest.json is invalid: ${error.message}`);
  manifest = {};
}

for (const script of manifest.content_scripts?.flatMap(entry => entry.js || []) || []) {
  requireFile(path.join(extensionRoot, script), "manifest.json");
}
for (const stylesheet of manifest.content_scripts?.flatMap(entry => entry.css || []) || []) {
  requireFile(path.join(extensionRoot, stylesheet), "manifest.json");
}
for (const resource of manifest.web_accessible_resources?.flatMap(entry => entry.resources || []) || []) {
  requireFile(path.join(extensionRoot, resource), "manifest.json");
}
if (manifest.background?.service_worker) {
  requireFile(path.join(extensionRoot, manifest.background.service_worker), "manifest.json");
}
if (manifest.action?.default_popup) {
  requireFile(path.join(extensionRoot, manifest.action.default_popup), "manifest.json");
}
for (const icon of Object.values(manifest.icons || {})) {
  requireFile(path.join(extensionRoot, icon), "manifest.json");
}
for (const icon of Object.values(manifest.action?.default_icon || {})) {
  requireFile(path.join(extensionRoot, icon), "manifest.json");
}

const popupFile = path.join(extensionRoot, manifest.action?.default_popup || "popup/popup.html");
if (fs.existsSync(popupFile)) {
  const popupHtml = fs.readFileSync(popupFile, "utf8");
  const localReferences = [
    ...popupHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
    ...popupHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi),
  ].map(match => match[1]).filter(reference => !/^(?:[a-z]+:|\/\/|#)/i.test(reference));
  for (const reference of localReferences) {
    requireFile(path.resolve(path.dirname(popupFile), reference), relative(popupFile));
  }
}

const backgroundFile = path.join(extensionRoot, manifest.background?.service_worker || "background.js");
if (fs.existsSync(backgroundFile)) {
  const backgroundSource = fs.readFileSync(backgroundFile, "utf8");
  for (const call of backgroundSource.matchAll(/importScripts\(([^)]+)\)/g)) {
    for (const quoted of call[1].matchAll(/["']([^"']+)["']/g)) {
      requireFile(path.resolve(path.dirname(backgroundFile), quoted[1]), relative(backgroundFile));
    }
  }
}

for (const file of walk(extensionRoot).filter(file => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${relative(file)}: ${result.stderr.trim()}`);
}

if (failures.length > 0) {
  console.error("Static checks failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Static checks passed: manifest, referenced assets, popup dependencies, and JavaScript syntax.");
}
