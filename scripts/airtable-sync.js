#!/usr/bin/env node
/**
 * Pulls the Airtable base back into the codebase as build artefacts:
 *
 *   assets/data/programs.json   structured JSON (used by PDF generator + future tooling)
 *   assets/programs.js          regenerated JS that sets window.CODED_PROGRAMS (used by app.js)
 *   assets/data/icons.json      Icons catalogue with local paths
 *   assets/icons/<slug>.<ext>   downloaded icon files
 *
 * Run before each deploy (or via the deploy hook). Never edit the generated
 * files by hand — they will be overwritten.
 *
 * Run: npm run airtable:sync
 */

const fs = require("node:fs");
const path = require("node:path");
const { meta, data } = require("./lib/airtable");
const { BASE_ID, COURSE_CATALOG_TABLE_NAME, COHORTS_TABLE_NAME, CURRICULUM_TABLE_NAME, ICONS_TABLE_NAME } = require("./schema");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ICONS_DIR = path.join(ASSETS, "icons");
const DATA_DIR = path.join(ASSETS, "data");

fs.mkdirSync(ICONS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function log(...args) { console.log("[sync]", ...args); }

function parseFaq(text) {
  if (!text) return [];
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const qm = block.match(/^Q:\s*([\s\S]+?)\n\s*A:\s*([\s\S]+)$/i);
    if (qm) return { question: qm[1].trim(), answer: qm[2].trim() };
    return { question: block, answer: "" };
  });
}

function parseOutcomes(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

async function fetchTables() {
  const schema = await meta.getBaseSchema(BASE_ID);
  const tables = {};
  for (const t of schema.tables) tables[t.name] = t;
  return tables;
}

async function downloadIcon(rec) {
  const slug = rec.fields?.Slug || rec.fields?.Name?.toLowerCase().replace(/\s+/g, "-");
  if (!slug) return null;
  const attachments = rec.fields?.Image || [];

  // 1. Airtable attachment present → download it (this wins over any local file).
  if (attachments.length) {
    const att = attachments[0];
    const ext = (() => {
      const m = (att.filename || "").match(/\.([a-z0-9]+)$/i);
      if (m) return m[1].toLowerCase();
      if (att.type?.includes("svg")) return "svg";
      if (att.type?.includes("png")) return "png";
      return "img";
    })();
    const filename = `${slug}.${ext}`;
    const target = path.join(ICONS_DIR, filename);
    if (fs.existsSync(target) && att.size && fs.statSync(target).size === att.size) {
      return { slug, filename, path: `assets/icons/${filename}` };
    }
    const r = await fetch(att.url);
    if (!r.ok) { log(`! failed to download ${att.url} for ${slug}`); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(target, buf);
    log(`↓ ${filename} (${buf.length} bytes, from Airtable)`);
    return { slug, filename, path: `assets/icons/${filename}` };
  }

  // 2. Fall back to a local file laid down by icons-bootstrap (SimpleIcons SVGs).
  for (const ext of ["svg", "png", "jpg", "webp"]) {
    const target = path.join(ICONS_DIR, `${slug}.${ext}`);
    if (fs.existsSync(target)) return { slug, filename: `${slug}.${ext}`, path: `assets/icons/${slug}.${ext}` };
  }

  // 3. Nothing on disk and nothing in Airtable.
  return null;
}

function flattenLinks(field) {
  return Array.isArray(field) ? field : [];
}

async function main() {
  log("Fetching base schema…");
  const tables = await fetchTables();

  log("Fetching records…");
  const tableNames = [COURSE_CATALOG_TABLE_NAME, COHORTS_TABLE_NAME, CURRICULUM_TABLE_NAME, ICONS_TABLE_NAME];
  const missing = tableNames.filter((n) => !tables[n]);
  if (missing.length) {
    console.error(`Missing tables in base ${BASE_ID}: ${missing.join(", ")}. Run airtable:setup first.`);
    process.exit(1);
  }
  const [programsRaw, cohortsRaw, modulesRaw, iconsRaw] = await Promise.all([
    data.listAll(BASE_ID, tables[COURSE_CATALOG_TABLE_NAME].id),
    data.listAll(BASE_ID, tables[COHORTS_TABLE_NAME].id),
    data.listAll(BASE_ID, tables[CURRICULUM_TABLE_NAME].id),
    data.listAll(BASE_ID, tables[ICONS_TABLE_NAME].id),
  ]);

  log(`  courses:    ${programsRaw.length}`);
  log(`  cohorts:    ${cohortsRaw.length}`);
  log(`  curriculum: ${modulesRaw.length}`);
  log(`  icons:      ${iconsRaw.length}`);

  // ── Icons: download to disk + build slug-keyed lookup ─────────────────────
  log("Downloading icons…");
  const iconsById = new Map();
  const iconsCatalogue = [];
  for (const rec of iconsRaw) {
    const downloaded = await downloadIcon(rec);
    const entry = {
      id: rec.id,
      name: rec.fields?.Name || "",
      slug: rec.fields?.Slug || "",
      category: rec.fields?.Category || "",
      path: downloaded?.path || null,
      source_url: rec.fields?.["Source URL"] || null,
    };
    iconsById.set(rec.id, entry);
    iconsCatalogue.push(entry);
  }

  // ── Cohorts + Curriculum: group by Course record ID ──────────────────────
  // Cohorts table is shared with non-catalog courses too, so skip any rows
  // whose Course link isn't to one of our catalog records.
  const cohortsByCourse = new Map();
  for (const rec of cohortsRaw) {
    const pid = rec.fields?.Course?.[0];
    if (!pid) continue;
    const arr = cohortsByCourse.get(pid) || [];
    arr.push({
      label: rec.fields?.Name || "",
      dates: rec.fields?.Dates || "",
      start_date: rec.fields?.["Start Date"] || null,
      end_date: rec.fields?.["End date"] || null,   // sic: existing field is "End date" not "End Date"
      status: rec.fields?.["Cohort Status"] || "Open",
      order: rec.fields?.Order ?? 0,
    });
    cohortsByCourse.set(pid, arr);
  }
  for (const arr of cohortsByCourse.values()) arr.sort((a, b) => a.order - b.order);

  const curriculumByCourse = new Map();
  for (const rec of modulesRaw) {
    const pid = rec.fields?.Course?.[0];
    if (!pid) continue;
    const arr = curriculumByCourse.get(pid) || [];
    arr.push({
      title: rec.fields?.Title || "",
      focus: rec.fields?.Focus || "",
      hours: rec.fields?.Hours ?? null,
      sessions: rec.fields?.Sessions ?? null,
      order: rec.fields?.Order ?? 0,
    });
    curriculumByCourse.set(pid, arr);
  }
  for (const arr of curriculumByCourse.values()) arr.sort((a, b) => a.order - b.order);

  // Keep legacy variable names so the rest of the function reads cleanly.
  const cohortsByProgram = cohortsByCourse;
  const modulesByProgram = curriculumByCourse;

  // ── Courses: flatten into the shape app.js + catalog.js expect ──────────
  // Filter to rows that have our Slug field set — leaves the pre-existing 30
  // CMS rows untouched until they're explicitly published into the B2B catalog.
  const programs = programsRaw.filter((rec) => rec.fields?.Slug).map((rec) => {
    const f = rec.fields || {};
    const linkIcons = (ids) => flattenLinks(ids).map((id) => iconsById.get(id)).filter(Boolean);
    return {
      id: rec.id,
      slug: f.Slug || "",
      name: f["Course Title"] || "",
      status: f.Status || "Draft",
      one_liner: f["One Liner"] || "",
      overview: f.Overview || "",
      topic: f.Topic || "",
      format: f["Course Type"] || "",
      shift: f.Shift || "",
      prereq_label: f["Prereq Label"] || "",
      audience: f["Audience B2B"] || [],
      audience_detail: f["Audience Detail"] || "",
      start_date: f["Start Date"] || "",
      end_date: f["End Date"] || "",
      duration_label: f["Duration Label"] || "",
      total_hours: f["Total Hours"] ?? null,
      session_pattern: f["Session Pattern"] || "",
      delivery_mode: f["Delivery Mode"] || "",
      location: f.Location || "",
      location_full: f["Location Full"] || "",
      location_url: f["Location URL"] || "",
      price_per_seat_kwd: f["Price Per Seat (KWD)"] ?? null,
      group_rates: !!f["Group Rates"],
      classroom: f.Classroom || "",
      outcomes: parseOutcomes(f.Outcomes),
      faq: parseFaq(f.FAQ),
      tags: f["B2B Tags"] || [],
      instructor: f["Instructor Name"]
        ? { name: f["Instructor Name"], role: f["Instructor Role"] || "", bio: f["Instructor Bio"] || "" }
        : null,
      // legacy shape for current app.js
      iterations: (cohortsByProgram.get(rec.id) || []).map((c) => ({ dates: c.dates })),
      structure: (modulesByProgram.get(rec.id) || []).map((m) => ({
        phase_name: m.title,
        sessions: m.sessions,
        hours: m.hours,
        focus: m.focus,
      })),
      cohorts: cohortsByProgram.get(rec.id) || [],
      modules: modulesByProgram.get(rec.id) || [],
      foundations: linkIcons(f.Foundations),
      fields: linkIcons(f.Fields),
      tools: linkIcons(f.Tools),
      illustration: linkIcons(f.Illustration)[0] || null,
    };
  })
  // Sort: Published before Draft, then by start_date ascending.
  .sort((a, b) => {
    if (a.status !== b.status) return a.status === "Published" ? -1 : 1;
    return (a.start_date || "").localeCompare(b.start_date || "");
  });

  // ── Write artefacts ────────────────────────────────────────────────────────
  const jsonPath = path.join(DATA_DIR, "programs.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ generated_at: new Date().toISOString(), programs }, null, 2));
  log(`✓ wrote ${path.relative(ROOT, jsonPath)} (${programs.length} programs)`);

  fs.writeFileSync(
    path.join(DATA_DIR, "icons.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), icons: iconsCatalogue }, null, 2),
  );
  log(`✓ wrote assets/data/icons.json (${iconsCatalogue.length} icons)`);

  // Regenerate assets/programs.js so the existing site keeps working unchanged.
  const banner = `// GENERATED FILE — do not edit by hand.
// Source: Airtable base ${BASE_ID}
// Regenerate: npm run airtable:sync
`;
  const js = `${banner}\nwindow.CODED_PROGRAMS = ${JSON.stringify(programs, null, 2)};\n`;
  fs.writeFileSync(path.join(ASSETS, "programs.js"), js);
  log(`✓ wrote assets/programs.js`);

  log("Sync complete.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
