#!/usr/bin/env node
/**
 * Render every Published program's catalog page (#/catalog/<slug>) to PDF
 * via Puppeteer. PDFs land in assets/pdfs/<slug>.pdf, replacing the legacy
 * ReportLab output.
 *
 * Workflow:
 *   1. Boot a tiny static HTTP server on the project root.
 *   2. Launch headless Chromium.
 *   3. For each Published program, navigate to its catalog hash route,
 *      wait for the body[data-catalog-ready] sentinel, capture A4 PDF.
 *   4. Tear down the server + browser.
 *
 * Run: npm run pdfs                  (all published programs)
 *      npm run pdfs -- <slug>        (just one)
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "pdfs");
const PROGRAMS_JS = path.join(ROOT, "assets", "programs.js");

const SLUG_FILTER = process.argv[2] || null;
const PORT = Number(process.env.PDF_GEN_PORT || 7777);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf":  "application/pdf",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ico":  "image/x-icon",
};

function log(...args) { console.log("[pdfs]", ...args); }

function loadPrograms() {
  const code = fs.readFileSync(PROGRAMS_JS, "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx, { filename: "programs.js" });
  return ctx.window.CODED_PROGRAMS || [];
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      const filePath = path.normalize(path.join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      fs.readFile(filePath, (err, buf) => {
        if (err) { res.writeHead(404).end(`Not found: ${urlPath}`); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function renderOne(browser, slug) {
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${PORT}/index.html#/catalog/${slug}`;

  // A4 viewport so the on-page layout reflects what the PDF will look like.
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

  page.on("pageerror", (err) => log(`! ${slug}: page error: ${err.message}`));
  page.on("requestfailed", (req) => {
    // SimpleIcons + cdn fetches aren't relevant; only flag local 404s.
    if (req.url().includes("127.0.0.1")) {
      log(`! ${slug}: failed ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
  // The catalog renderer sets data-catalog-ready after the next animation frame.
  await page.waitForSelector('body[data-catalog-ready="true"]', { timeout: 10_000 });
  // Give web fonts and any decoded images one extra paint so subpixel alignment is stable.
  await new Promise((r) => setTimeout(r, 300));

  const out = path.join(OUT_DIR, `${slug}.pdf`);
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  await page.close();
  log(`✓ ${slug}.pdf`);
}

async function main() {
  const puppeteer = (() => {
    try { return require("puppeteer"); }
    catch {
      console.error("Missing dependency: puppeteer. Run `npm install` first.");
      process.exit(1);
    }
  })();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const programs = loadPrograms()
    .filter((p) => p.status === "Published")
    .filter((p) => !SLUG_FILTER || p.slug === SLUG_FILTER);

  if (!programs.length) {
    console.error(SLUG_FILTER ? `No published program with slug "${SLUG_FILTER}"` : "No published programs found.");
    process.exit(1);
  }

  log(`Booting static server on http://127.0.0.1:${PORT}`);
  const server = await startServer();

  log("Launching headless Chromium…");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  log(`Rendering ${programs.length} catalog PDF${programs.length === 1 ? "" : "s"}…`);
  try {
    for (const p of programs) {
      try { await renderOne(browser, p.slug); }
      catch (err) { log(`! ${p.slug}: ${err.message}`); }
    }
  } finally {
    await browser.close();
    server.close();
  }

  log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
