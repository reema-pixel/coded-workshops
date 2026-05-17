#!/usr/bin/env node
/**
 * Seed the existing `CODED Course Catalog` + `Cohorts` + new `Curriculum`
 * tables from the current assets/programs.js.
 *
 * Idempotent on Slug: existing rows (matched by Slug) are updated, new ones
 * inserted. Cohorts + Curriculum children are wiped-and-recreated per program
 * so the Airtable state mirrors programs.js exactly on every run.
 *
 * Pre-existing rows in CODED Course Catalog WITHOUT a matching Slug are left
 * untouched. So the 30 existing courses stay; we add ours alongside them.
 *
 * Run: npm run airtable:seed
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { meta, data } = require("./lib/airtable");
const { BASE_ID, COURSE_CATALOG_TABLE_NAME, COHORTS_TABLE_NAME, CURRICULUM_TABLE_NAME } = require("./schema");

const PROGRAMS_JS = path.join(__dirname, "..", "assets", "programs.js");

// Map programs.js topic strings → the singleSelect options we defined in the
// `Topic` field on CODED Course Catalog (which mirrors Catalog Section names).
const TOPIC_MAP = {
  "Agentic AI":                 "Agentic AI",
  "Data & Analytics":           "Data Science & Analysis",
  "Cybersecurity":              "Cybersecurity",
  "Project Management & Agile": "Project Management & Agile",
  "AI Automation":              "AI Automation",
  "Business Intelligence":      "Data Science & Analysis",
};

// Existing Course Type singleSelect: Workshop, Mid Course, Bootcamp.
const COURSE_TYPE_MAP = {
  "Workshop":      "Workshop",
  "Bootcamp":      "Bootcamp",
  "Certification": "Workshop",
};

function log(...args) { console.log("[seed]", ...args); }

function loadPrograms() {
  const code = fs.readFileSync(PROGRAMS_JS, "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx, { filename: "programs.js" });
  return ctx.window.CODED_PROGRAMS || [];
}

const outcomesToText = (arr) => Array.isArray(arr) ? arr.join("\n") : "";
const faqToText = (arr) => Array.isArray(arr) ? arr.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n") : "";
const stripUndefined = (obj) => { for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k]; return obj; };

function programToFields(p) {
  return stripUndefined({
    // Primary + new editorial fields:
    "Course Title": p.name,
    "Slug": p.slug,
    "Status": p.status || "Draft",
    "One Liner": p.one_liner || "",
    "Overview": p.overview || "",
    "Outcomes": outcomesToText(p.outcomes),
    "FAQ": faqToText(p.faq),
    "Topic": TOPIC_MAP[p.topic] || undefined,
    "Audience Detail": p.audience_detail || "",
    "Audience B2B": Array.isArray(p.audience) ? p.audience : [],
    "Shift": p.shift || undefined,
    "Prereq Label": p.prereq_label || "",
    "Start Date": p.start_date || null,
    "End Date": p.end_date || null,
    "Duration Label": p.duration_label || "",
    "Total Hours": typeof p.total_hours === "number" ? p.total_hours : undefined,
    "Session Pattern": p.session_pattern || "",
    "Delivery Mode": p.delivery_mode || undefined,
    "Location": p.location || "",
    "Location Full": p.location_full || "",
    "Location URL": p.location_url || "",
    "Price Per Seat (KWD)": typeof p.price_per_seat_kwd === "number" ? p.price_per_seat_kwd : undefined,
    "Group Rates": !!p.group_rates,
    "Classroom": p.classroom || "",
    "B2B Tags": Array.isArray(p.tags) ? p.tags : [],
    "Instructor Name": p.instructor?.name || "",
    "Instructor Role": p.instructor?.role || "",
    "Instructor Bio": p.instructor?.bio || "",
    // Existing fields we can sensibly populate:
    "Course Type": COURSE_TYPE_MAP[p.format] || undefined,
  });
}

function iterationToCohort(p, it, idx, courseRecordId) {
  return {
    fields: stripUndefined({
      // Existing primary on Cohorts is `Name`.
      "Name": `${p.name} · Cohort ${idx + 1}`,
      "Dates": it.dates || "",
      "Start Date": idx === 0 ? p.start_date || null : null,
      "End date":   idx === 0 ? p.end_date   || null : null,   // sic — existing field name
      "Cohort Status": idx === 0 ? "Open" : "Filling",
      "Order": idx + 1,
      "Course": [courseRecordId],
    }),
  };
}

function phaseToCurriculum(p, phase, idx, courseRecordId) {
  return {
    fields: stripUndefined({
      "Title": phase.phase_name || `Module ${idx + 1}`,
      "Focus": phase.focus || "",
      "Hours":    typeof phase.hours    === "number" ? phase.hours    : undefined,
      "Sessions": typeof phase.sessions === "number" ? phase.sessions : undefined,
      "Order": idx + 1,
      "Course": [courseRecordId],
    }),
  };
}

async function getTableId(name) {
  const schema = await meta.getBaseSchema(BASE_ID);
  const t = schema.tables.find((x) => x.name === name);
  if (!t) throw new Error(`Table "${name}" not found in base ${BASE_ID}. Run airtable:setup first.`);
  return t.id;
}

async function deleteRecords(tableId, recordIds) {
  if (!recordIds.length) return;
  for (let i = 0; i < recordIds.length; i += 10) {
    const batch = recordIds.slice(i, i + 10);
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    for (const id of batch) url.searchParams.append("records[]", id);
    const r = await fetch(url.toString(), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.CATALOG_AIRTABLE_PAT}` },
    });
    if (!r.ok) throw new Error(`Delete failed: ${r.status} ${await r.text()}`);
    await new Promise((res) => setTimeout(res, 250));
  }
}

async function main() {
  const programs = loadPrograms();
  log(`Loaded ${programs.length} programs from assets/programs.js`);

  const courseCatalogTableId = await getTableId(COURSE_CATALOG_TABLE_NAME);
  const cohortsTableId       = await getTableId(COHORTS_TABLE_NAME);
  const curriculumTableId    = await getTableId(CURRICULUM_TABLE_NAME);

  const existing = await data.listAll(BASE_ID, courseCatalogTableId);
  const bySlug = new Map(existing.filter((r) => r.fields?.Slug).map((r) => [r.fields.Slug, r]));
  log(`Catalog has ${existing.length} rows; ${bySlug.size} already have a Slug.`);

  // 1. Upsert courses by Slug.
  const toCreate = [];
  const toUpdate = [];
  for (const p of programs) {
    const fields = programToFields(p);
    if (bySlug.has(p.slug)) toUpdate.push({ id: bySlug.get(p.slug).id, fields });
    else                    toCreate.push({ fields });
  }
  let created = [];
  if (toCreate.length) { log(`Creating ${toCreate.length} course(s)…`); created = await data.createRecords(BASE_ID, courseCatalogTableId, toCreate); }
  if (toUpdate.length) { log(`Updating ${toUpdate.length} course(s)…`); await data.updateRecords(BASE_ID, courseCatalogTableId, toUpdate); }
  for (const rec of created) bySlug.set(rec.fields.Slug, rec);

  // 2. Wipe + recreate Cohorts + Curriculum for these courses ONLY.
  const allCohorts    = await data.listAll(BASE_ID, cohortsTableId);
  const allCurriculum = await data.listAll(BASE_ID, curriculumTableId);

  // Only delete child rows that link to one of our courses (don't touch any
  // unrelated cohorts attached to pre-existing courses we didn't seed).
  const ourCourseIds = new Set([...bySlug.values()].map((r) => r.id));
  const groupOurs = (records) => {
    const m = new Map();
    for (const r of records) {
      const link = r.fields?.Course?.[0];
      if (!link || !ourCourseIds.has(link)) continue;
      if (!m.has(link)) m.set(link, []);
      m.get(link).push(r.id);
    }
    return m;
  };
  const cohortsByCourse    = groupOurs(allCohorts);
  const curriculumByCourse = groupOurs(allCurriculum);

  const newCohorts = [];
  const newCurriculum = [];
  for (const p of programs) {
    const rec = bySlug.get(p.slug);
    if (!rec) continue;
    const cid = rec.id;
    if (cohortsByCourse.has(cid))    await deleteRecords(cohortsTableId,    cohortsByCourse.get(cid));
    if (curriculumByCourse.has(cid)) await deleteRecords(curriculumTableId, curriculumByCourse.get(cid));
    (p.iterations || []).forEach((it, i) => newCohorts.push(iterationToCohort(p, it, i, cid)));
    (p.structure  || []).forEach((ph, i) => newCurriculum.push(phaseToCurriculum(p, ph, i, cid)));
  }
  if (newCohorts.length)    { log(`Creating ${newCohorts.length} cohort(s)…`);    await data.createRecords(BASE_ID, cohortsTableId,    newCohorts); }
  if (newCurriculum.length) { log(`Creating ${newCurriculum.length} curriculum row(s)…`); await data.createRecords(BASE_ID, curriculumTableId, newCurriculum); }

  log("Seed complete.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
