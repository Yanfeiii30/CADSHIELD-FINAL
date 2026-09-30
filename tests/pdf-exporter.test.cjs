"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createContext,
  runExtensionScript,
  getBinding,
} = require("./support/browser-harness.cjs");

function loadExporter() {
  const harness = createContext();
  runExtensionScript(harness.context, "config.js");
  runExtensionScript(harness.context, "popup/pdf_exporter.js");
  return getBinding(harness.context, "CADShieldPopup.PdfExporter");
}

test("PDF exporter creates a downloadable multi-page detection report", () => {
  const exporter = loadExporter();
  const entries = Array.from({ length: 90 }, (_, index) => ({
    text: `Example comment ${index + 1} with enough content to appear in the exported detection report.`,
    score: index % 3 === 0 ? 0.82 : 0.18,
    is_aggressive: index % 3 === 0,
    mode: "hybrid",
    time: "8:58:17 PM",
  }));
  const bytes = exporter.buildPdf({
    entries,
    total: 100,
    aggressive: 30,
    mode: "hybrid",
    platform: "Facebook",
    generatedAt: new Date("2026-09-02T03:04:00.000Z"),
  });
  const source = Buffer.from(bytes).toString("latin1");

  assert.match(source, /^%PDF-1\.4/);
  assert.match(source, /Detection Activity Report/);
  assert.match(source, /CAD Shield - Detection Log  \/  Facebook  \/  HYBRID/);
  assert.match(source, /\(SCANNED\)[\s\S]*\(100\)/);
  assert.match(source, /\(BLOCKED\)[\s\S]*\(30\)/);
  assert.match(source, /\(SAFE\)[\s\S]*\(70\)/);
  assert.match(source, /\(COMMENT \/ SOURCE TEXT\)/);
  assert.match(source, /\(PAGE 1 OF \d+\)/);
  const pageCount = Number(source.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/)?.[1]);
  assert.ok(pageCount > 1, "a long log should be split across PDF pages");
  assert.match(source, /xref\n/);
  assert.match(source, /%%EOF\n$/);
});

test("PDF exporter escapes log text and creates stable PDF filenames", () => {
  const exporter = loadExporter();
  const bytes = exporter.buildPdf({
    entries: [{
      text: "Cafe (test) \\ sample — okay",
      score: 0.1,
      is_aggressive: false,
      mode: "vader",
      time: "9:00:00 AM",
    }],
    total: 1,
    aggressive: 0,
    generatedAt: new Date("2026-09-02T03:04:00.000Z"),
  });
  const source = Buffer.from(bytes).toString("latin1");

  assert.ok(source.includes("Cafe \\(test\\) \\\\ sample - okay"));
  assert.equal(
    exporter.filenameFor(new Date("2026-09-02T03:04:00.000Z")),
    "cad-shield-detection-log-2026-09-02-03-04.pdf",
  );
});
