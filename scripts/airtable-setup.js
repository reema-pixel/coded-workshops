#!/usr/bin/env node
/**
 * Idempotent schema setup for the catalog feature in the
 * `CODED Landing Page CMS` Airtable base.
 *
 * Behaviour:
 *   1. Read the current schema.
 *   2. For each EXISTING table being extended (CODED Course Catalog, Cohorts):
 *      add only the fields that don't already exist. Never modify or remove
 *      existing fields.
 *   3. For each NEW table (Icons, Curriculum): create it if it doesn't exist.
 *   4. Add linked-record fields in a second pass once dependent tables exist.
 *
 * Run: npm run airtable:setup
 */

const { meta } = require("./lib/airtable");
const {
  BASE_ID, BASE_NAME,
  EXISTING_TABLE_EXTENSIONS, NEW_TABLES,
  COURSE_CATALOG_LINK_FIELDS, CHILD_LINK_FIELDS,
  COURSE_CATALOG_TABLE_NAME,
} = require("./schema");

function log(...args) { console.log("[setup]", ...args); }

async function loadSchema() {
  const schema = await meta.getBaseSchema(BASE_ID);
  return new Map(schema.tables.map((t) => [t.name, t]));
}

async function ensureNewTables(tables) {
  for (const [name, spec] of Object.entries(NEW_TABLES)) {
    if (tables.has(name)) { log(`✓ "${name}" exists (${tables.get(name).id})`); continue; }
    log(`+ creating "${name}"…`);
    try {
      const created = await meta.createTable(BASE_ID, spec);
      tables.set(name, created);
    } catch (err) {
      if (err.status === 403) {
        log("");
        log("✗ 403 from createTable. The PAT lacks schema.bases:write on this base.");
        log("  Open https://airtable.com/create/tokens, edit your PAT, add the scope,");
        log("  confirm access to the base, and re-run.");
        process.exit(1);
      }
      throw err;
    }
  }
}

async function extendExistingTables(tables) {
  for (const [tableName, additions] of Object.entries(EXISTING_TABLE_EXTENSIONS)) {
    const table = tables.get(tableName);
    if (!table) { log(`! existing table "${tableName}" not found — skipping`); continue; }
    const existingFields = new Set(table.fields.map((f) => f.name));
    for (const field of additions) {
      if (existingFields.has(field.name)) continue;
      log(`+ ${tableName}.${field.name}`);
      try { await meta.createField(BASE_ID, table.id, field); }
      catch (err) {
        if (err.status === 422 && /already exists|cannot/i.test(err.body || "")) {
          log(`  (skipped: already present)`); continue;
        }
        throw err;
      }
    }
  }
}

async function ensureLinkFields() {
  const fresh = new Map((await meta.getBaseSchema(BASE_ID)).tables.map((t) => [t.name, t]));

  // CODED Course Catalog → Icons / Curriculum / Cohorts
  const catalog = fresh.get(COURSE_CATALOG_TABLE_NAME);
  const existing = new Set(catalog.fields.map((f) => f.name));
  for (const { name, links, description } of COURSE_CATALOG_LINK_FIELDS) {
    if (existing.has(name)) continue;
    const target = fresh.get(links);
    if (!target) { log(`! cannot link ${COURSE_CATALOG_TABLE_NAME}.${name} — target ${links} missing`); continue; }
    log(`+ ${COURSE_CATALOG_TABLE_NAME}.${name} → ${links}`);
    await meta.createField(BASE_ID, catalog.id, {
      name, type: "multipleRecordLinks",
      options: { linkedTableId: target.id },
      ...(description ? { description } : {}),
    });
  }

  // Reverse links on child tables (Cohorts.Course, Curriculum.Course)
  for (const { table, name, links } of CHILD_LINK_FIELDS) {
    const child = fresh.get(table);
    if (!child) continue;
    if (new Set(child.fields.map((f) => f.name)).has(name)) continue;
    const target = fresh.get(links);
    if (!target) continue;
    log(`+ ${table}.${name} → ${links}`);
    await meta.createField(BASE_ID, child.id, {
      name, type: "multipleRecordLinks", options: { linkedTableId: target.id },
    });
  }
}

async function main() {
  const tables = await loadSchema();
  log(`Base "${BASE_NAME}" (${BASE_ID}) has ${tables.size} existing tables.`);
  await ensureNewTables(tables);
  await extendExistingTables(await loadSchema());
  await ensureLinkFields();
  log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
