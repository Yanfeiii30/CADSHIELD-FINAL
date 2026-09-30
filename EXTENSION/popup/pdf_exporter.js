/**
 * popup/pdf_exporter.js
 * Dependency-free PDF report generation for Expert Mode detection logs.
 */

(() => {
  const namespace = globalThis.CADShieldPopup || (globalThis.CADShieldPopup = {});
  const PAGE_WIDTH = 595;
  const PAGE_HEIGHT = 842;
  const PAGE_MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN * 2);
  const FOOTER_TOP = 806;

  const COLORS = Object.freeze({
    paper: [0.973, 0.984, 0.976],
    white: [1, 1, 1],
    ink: [0.075, 0.102, 0.086],
    muted: [0.36, 0.42, 0.39],
    line: [0.84, 0.88, 0.85],
    green: [0.055, 0.46, 0.23],
    deepGreen: [0.035, 0.29, 0.15],
    mint: [0.81, 0.97, 0.87],
    safeSurface: [0.93, 0.985, 0.95],
    red: [0.79, 0.12, 0.16],
    redSurface: [1, 0.94, 0.945],
    neutralSurface: [0.925, 0.945, 0.932],
  });

  function toAscii(value) {
    return String(value ?? "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\u2192/g, "->")
      .replace(/[\u2022\u00b7]/g, "-")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "?");
  }

  function escapePdfText(value) {
    return toAscii(value)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function wrapText(value, maxCharacters = 86) {
    const paragraphs = toAscii(value).split(/\r?\n/);
    const lines = [];
    paragraphs.forEach(paragraph => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        return;
      }
      let current = "";
      words.forEach(originalWord => {
        let word = originalWord;
        while (word.length > maxCharacters) {
          if (current) {
            lines.push(current);
            current = "";
          }
          lines.push(word.slice(0, maxCharacters));
          word = word.slice(maxCharacters);
        }
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxCharacters && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) lines.push(current);
    });
    return lines.length > 0 ? lines : [""];
  }

  function color(values) {
    return values.map(value => Number(value.toFixed(3))).join(" ");
  }

  function approximateTextWidth(text, size, bold = false) {
    return toAscii(text).length * size * (bold ? 0.56 : 0.5);
  }

  function drawRect(commands, x, top, width, height, fill) {
    commands.push(
      "q",
      `${color(fill)} rg`,
      `${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re f`,
      "Q",
    );
  }

  function drawLine(commands, x1, top1, x2, top2, stroke, width = 1) {
    commands.push(
      "q",
      `${color(stroke)} RG`,
      `${width} w`,
      `${x1} ${PAGE_HEIGHT - top1} m ${x2} ${PAGE_HEIGHT - top2} l S`,
      "Q",
    );
  }

  function drawText(commands, text, x, top, options = {}) {
    const size = options.size || 9;
    const bold = options.bold === true;
    let drawX = x;
    if (options.align === "right") {
      drawX -= approximateTextWidth(text, size, bold);
    }
    commands.push(
      "BT",
      `/${bold ? "F2" : "F1"} ${size} Tf`,
      `${color(options.color || COLORS.ink)} rg`,
      `1 0 0 1 ${Number(drawX.toFixed(2))} ${PAGE_HEIGHT - top} Tm`,
      `(${escapePdfText(text)}) Tj`,
      "ET",
    );
  }

  function drawLabel(commands, text, x, top, options = {}) {
    const width = options.width || 52;
    const height = options.height || 17;
    const size = options.size || 7;
    const label = toAscii(text).toUpperCase();
    drawRect(commands, x, top, width, height, options.fill || COLORS.green);
    const textWidth = approximateTextWidth(label, size, true);
    drawText(commands, label, x + ((width - textWidth) / 2), top + 11.5, {
      size,
      bold: true,
      color: options.color || COLORS.white,
    });
  }

  function isBlocked(entry) {
    if (typeof entry.is_aggressive === "boolean") return entry.is_aggressive;
    const mode = entry.mode || "hybrid";
    const threshold = globalThis.CADConfig?.thresholdForMode
      ? globalThis.CADConfig.thresholdForMode(mode)
      : 0.5;
    return Number(entry.score || 0) >= threshold;
  }

  function normalizeReport(report) {
    const entries = Array.isArray(report.entries) ? [...report.entries].reverse() : [];
    const total = Math.max(0, Number(report.total) || 0);
    const aggressive = Math.max(0, Number(report.aggressive) || 0);
    const generatedAt = report.generatedAt instanceof Date
      ? report.generatedAt
      : new Date(report.generatedAt || Date.now());
    return {
      entries,
      total,
      aggressive,
      safe: Math.max(0, total - aggressive),
      generatedAt,
      generatedLabel: Number.isNaN(generatedAt.getTime())
        ? "Unknown"
        : generatedAt.toLocaleString("en-US"),
      platform: toAscii(report.platform || "Active tab"),
      mode: toAscii(report.mode || "hybrid").toUpperCase(),
    };
  }

  function prepareEntry(entry, index) {
    const blocked = isBlocked(entry);
    const score = Number(entry.score || 0);
    const textLines = wrapText(entry.text || "(empty)", 91);
    return {
      number: String(index + 1).padStart(3, "0"),
      blocked,
      verdict: blocked ? "BLOCKED" : "SAFE",
      percentage: Number.isFinite(score) ? `${(score * 100).toFixed(1)}%` : "0.0%",
      mode: toAscii(entry.mode || "hybrid").toUpperCase(),
      time: toAscii(entry.time || "Time unavailable"),
      textLines,
      height: 46 + (Math.max(1, textLines.length) - 1) * 11,
    };
  }

  function createPage() {
    const commands = [];
    drawRect(commands, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.paper);
    return { commands, nextTop: 0 };
  }

  function drawBrandMark(commands, x, top, compact = false) {
    const size = compact ? 25 : 32;
    drawRect(commands, x, top, size, size, COLORS.mint);
    drawText(commands, "CS", x + (compact ? 5.5 : 7), top + (compact ? 17 : 21), {
      size: compact ? 9 : 11,
      bold: true,
      color: COLORS.deepGreen,
    });
  }

  function drawFirstPageHeader(page, report) {
    const { commands } = page;
    drawRect(commands, 0, 0, PAGE_WIDTH, 132, COLORS.deepGreen);
    drawRect(commands, 0, 0, 9, 132, COLORS.green);
    drawBrandMark(commands, PAGE_MARGIN, 25);
    drawText(commands, "CAD SHIELD", 84, 39, {
      size: 10,
      bold: true,
      color: COLORS.mint,
    });
    drawText(commands, "EXPERT MODE REPORT", PAGE_WIDTH - PAGE_MARGIN, 39, {
      size: 8,
      bold: true,
      color: COLORS.mint,
      align: "right",
    });
    drawText(commands, "Detection Activity Report", PAGE_MARGIN, 83, {
      size: 23,
      bold: true,
      color: COLORS.white,
    });
    drawText(commands, `CAD Shield - Detection Log  /  ${report.platform}  /  ${report.mode}`, PAGE_MARGIN, 108, {
      size: 9,
      color: COLORS.mint,
    });
  }

  function drawSummaryCard(commands, x, top, width, label, value, accent, surface) {
    drawRect(commands, x, top, width, 58, COLORS.white);
    drawRect(commands, x, top, 4, 58, accent);
    drawRect(commands, x + 4, top, width - 4, 3, surface);
    drawText(commands, label.toUpperCase(), x + 14, top + 20, {
      size: 7,
      bold: true,
      color: COLORS.muted,
    });
    drawText(commands, String(value), x + 14, top + 45, {
      size: 18,
      bold: true,
      color: accent,
    });
  }

  function drawFirstPageSummary(page, report) {
    const { commands } = page;
    const gap = 8;
    const cardWidth = (CONTENT_WIDTH - (gap * 3)) / 4;
    const cards = [
      ["Scanned", report.total, COLORS.ink, COLORS.neutralSurface],
      ["Blocked", report.aggressive, COLORS.red, COLORS.redSurface],
      ["Safe", report.safe, COLORS.green, COLORS.safeSurface],
      ["Stored", report.entries.length, COLORS.deepGreen, COLORS.mint],
    ];
    cards.forEach((card, index) => {
      drawSummaryCard(commands, PAGE_MARGIN + (index * (cardWidth + gap)), 150, cardWidth, ...card);
    });

    drawRect(commands, PAGE_MARGIN, 220, CONTENT_WIDTH, 30, COLORS.neutralSurface);
    drawText(commands, `Generated ${report.generatedLabel}`, PAGE_MARGIN + 12, 239, {
      size: 8,
      color: COLORS.muted,
    });
    drawText(commands, "Newest records first - maximum 200 stored", PAGE_WIDTH - PAGE_MARGIN - 12, 239, {
      size: 8,
      color: COLORS.muted,
      align: "right",
    });

    drawText(commands, "DETECTION ACTIVITY", PAGE_MARGIN, 279, {
      size: 10,
      bold: true,
      color: COLORS.deepGreen,
    });
    drawText(commands, `${report.entries.length} RECORDS`, PAGE_WIDTH - PAGE_MARGIN, 279, {
      size: 8,
      bold: true,
      color: COLORS.muted,
      align: "right",
    });
    drawTableHeader(commands, 294);
    page.nextTop = 326;
  }

  function drawContinuationHeader(page, report) {
    const { commands } = page;
    drawRect(commands, 0, 0, PAGE_WIDTH, 68, COLORS.deepGreen);
    drawBrandMark(commands, PAGE_MARGIN, 21, true);
    drawText(commands, "CAD SHIELD / DETECTION ACTIVITY", 76, 38, {
      size: 10,
      bold: true,
      color: COLORS.white,
    });
    drawText(commands, `${report.platform} / ${report.mode}`, PAGE_WIDTH - PAGE_MARGIN, 38, {
      size: 8,
      color: COLORS.mint,
      align: "right",
    });
    drawText(commands, "DETECTION ACTIVITY / CONTINUED", PAGE_MARGIN, 98, {
      size: 9,
      bold: true,
      color: COLORS.deepGreen,
    });
    drawTableHeader(commands, 112);
    page.nextTop = 144;
  }

  function drawTableHeader(commands, top) {
    drawRect(commands, PAGE_MARGIN, top, CONTENT_WIDTH, 24, COLORS.neutralSurface);
    drawText(commands, "NO.", PAGE_MARGIN + 9, top + 16, { size: 7, bold: true, color: COLORS.muted });
    drawText(commands, "STATUS", PAGE_MARGIN + 43, top + 16, { size: 7, bold: true, color: COLORS.muted });
    drawText(commands, "SCORE", PAGE_MARGIN + 105, top + 16, { size: 7, bold: true, color: COLORS.muted });
    drawText(commands, "METHOD", PAGE_MARGIN + 164, top + 16, { size: 7, bold: true, color: COLORS.muted });
    drawText(commands, "COMMENT / SOURCE TEXT", PAGE_MARGIN + 226, top + 16, { size: 7, bold: true, color: COLORS.muted });
    drawText(commands, "TIME", PAGE_WIDTH - PAGE_MARGIN - 9, top + 16, {
      size: 7,
      bold: true,
      color: COLORS.muted,
      align: "right",
    });
  }

  function drawEntry(page, entry) {
    const { commands } = page;
    const top = page.nextTop;
    const cardHeight = entry.height - 6;
    const accent = entry.blocked ? COLORS.red : COLORS.green;
    const surface = entry.blocked ? COLORS.redSurface : COLORS.safeSurface;
    drawRect(commands, PAGE_MARGIN, top, CONTENT_WIDTH, cardHeight, surface);
    drawRect(commands, PAGE_MARGIN, top, 4, cardHeight, accent);
    drawText(commands, entry.number, PAGE_MARGIN + 9, top + 17, {
      size: 7.5,
      bold: true,
      color: COLORS.muted,
    });
    drawLabel(commands, entry.verdict, PAGE_MARGIN + 42, top + 5, {
      width: 51,
      fill: accent,
    });
    drawText(commands, entry.percentage, PAGE_MARGIN + 105, top + 17, {
      size: 8,
      bold: true,
      color: accent,
    });
    drawText(commands, entry.mode, PAGE_MARGIN + 164, top + 17, {
      size: 7.5,
      bold: true,
      color: COLORS.muted,
    });
    drawText(commands, entry.time, PAGE_WIDTH - PAGE_MARGIN - 9, top + 17, {
      size: 7.5,
      color: COLORS.muted,
      align: "right",
    });
    entry.textLines.forEach((text, index) => {
      drawText(commands, text, PAGE_MARGIN + 42, top + 33 + (index * 11), {
        size: 8.5,
        color: COLORS.ink,
      });
    });
    page.nextTop += entry.height;
  }

  function drawEmptyState(page) {
    const { commands } = page;
    drawRect(commands, PAGE_MARGIN, page.nextTop, CONTENT_WIDTH, 94, COLORS.white);
    drawLabel(commands, "READY", PAGE_MARGIN + 18, page.nextTop + 20, {
      width: 50,
      fill: COLORS.green,
    });
    drawText(commands, "No detection records yet", PAGE_MARGIN + 82, page.nextTop + 33, {
      size: 12,
      bold: true,
      color: COLORS.ink,
    });
    drawText(commands, "Browse a supported page and export again after CAD Shield scans visible content.", PAGE_MARGIN + 82, page.nextTop + 54, {
      size: 8.5,
      color: COLORS.muted,
    });
  }

  function drawFooter(page, pageNumber, pageCount) {
    const { commands } = page;
    drawLine(commands, PAGE_MARGIN, FOOTER_TOP, PAGE_WIDTH - PAGE_MARGIN, FOOTER_TOP, COLORS.line, 0.7);
    drawText(commands, "CAD Shield / Expert Mode / Local report", PAGE_MARGIN, 826, {
      size: 7.5,
      color: COLORS.muted,
    });
    drawText(commands, `PAGE ${pageNumber} OF ${pageCount}`, PAGE_WIDTH - PAGE_MARGIN, 826, {
      size: 7.5,
      bold: true,
      color: COLORS.deepGreen,
      align: "right",
    });
  }

  function layoutPages(report) {
    const pages = [createPage()];
    drawFirstPageHeader(pages[0], report);
    drawFirstPageSummary(pages[0], report);

    if (report.entries.length === 0) {
      drawEmptyState(pages[0]);
    } else {
      report.entries.map(prepareEntry).forEach(entry => {
        let page = pages[pages.length - 1];
        if (page.nextTop + entry.height > FOOTER_TOP - 8) {
          page = createPage();
          pages.push(page);
          drawContinuationHeader(page, report);
        }
        drawEntry(page, entry);
      });
    }

    pages.forEach((page, index) => drawFooter(page, index + 1, pages.length));
    return pages;
  }

  function contentStream(page) {
    return page.commands.join("\n");
  }

  function encodeAscii(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 0xff;
    return bytes;
  }

  function buildPdf(sourceReport = {}) {
    const report = normalizeReport(sourceReport);
    const pages = layoutPages(report);
    const objects = new Map();
    objects.set(1, "<< /Type /Catalog /Pages 2 0 R /PageLayout /SinglePage /ViewerPreferences << /DisplayDocTitle true >> >>");
    objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    objects.set(5,
      `<< /Title (${escapePdfText("CAD Shield - Detection Activity Report")}) ` +
      `/Author (${escapePdfText("CAD Shield")}) /Subject (${escapePdfText("Expert Mode detection log")}) >>`);

    const pageIds = [];
    pages.forEach((page, index) => {
      const pageId = 6 + (index * 2);
      const streamId = pageId + 1;
      const stream = contentStream(page);
      pageIds.push(pageId);
      objects.set(pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
      objects.set(streamId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    objects.set(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

    const maxId = Math.max(...objects.keys());
    let pdf = "%PDF-1.4\n%CADShield\n";
    const offsets = new Array(maxId + 1).fill(0);
    for (let id = 1; id <= maxId; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let id = 1; id <= maxId; id++) {
      pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return encodeAscii(pdf);
  }

  function filenameFor(date = new Date()) {
    const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    return `cad-shield-detection-log-${safeDate.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.pdf`;
  }

  function download(report = {}) {
    const generatedAt = report.generatedAt instanceof Date ? report.generatedAt : new Date();
    const bytes = buildPdf({ ...report, generatedAt });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filenameFor(generatedAt);
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { filename: anchor.download, bytes };
  }

  namespace.PdfExporter = Object.freeze({ buildPdf, download, filenameFor, toAscii });
})();
