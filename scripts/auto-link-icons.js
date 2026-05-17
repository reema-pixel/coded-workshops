#!/usr/bin/env node
/**
 * Best-effort auto-linker: for each Course in CODED Course Catalog that has
 * a Slug (i.e. one we seeded), populate Foundations / Fields / Tools /
 * Illustration linked-record fields based on the Course's Topic + B2B Tags.
 *
 * Safe to re-run. Replaces the existing link values with the heuristic ones
 * unless you pass --skip-existing.
 *
 * Run: npm run icons:autolink
 *      npm run icons:autolink -- --skip-existing
 */

const { meta, data } = require("./lib/airtable");
const { BASE_ID, COURSE_CATALOG_TABLE_NAME, ICONS_TABLE_NAME } = require("./schema");

const SKIP_EXISTING = process.argv.includes("--skip-existing");

// tag (from B2B Tags) → icon slug(s) to link as Foundations
const TAG_TO_FOUNDATIONS = {
  "python":      ["python"],
  "sql":         ["sql"],
  "data-science":["python"],
  "ml":          ["python"],
  "powerbi":     [],
  "no-code":     [],
  "scrum":       [],
  "bootcamp":    [],
  "ai-app-builder": [],
};

// tag → icon slug(s) to link as Tools
const TAG_TO_TOOLS = {
  "n8n":         ["n8n"],
  "rag":         ["huggingface"],
  "llm":         ["openai", "anthropic"],
  "ai":          ["openai", "anthropic"],
  "agents":      ["n8n"],
  "generative":  ["openai"],
  "data":        ["pandas", "numpy"],
  "analytics":   ["pandas"],
  "sql":         ["postman"],     // close-enough placeholder until SQL tools added
  "powerbi":     ["power-bi"],
  "bi":          ["power-bi"],
  "dashboards":  ["power-bi"],
  "nvidia":      ["nvidia", "pytorch", "huggingface"],
  "finance":     [],
  "forecasting": ["pandas"],
  "automation":  ["n8n"],
  "m365":        ["sharepoint", "ms-teams"],
  "supabase":    ["supabase"],
  "data-science":["pandas", "scikit-learn", "pytorch"],
  "ml":          ["scikit-learn", "pytorch"],
  "cybersecurity":["wireshark", "burp-suite", "metasploit", "splunk"],
  "red-team":    ["nmap", "metasploit", "burp-suite"],
  "blue-team":   ["splunk", "wireshark"],
  "soc":         ["splunk", "misp"],
  "scrum":       ["scrum"],
};

// Topic → Field icon slug(s)
const TOPIC_TO_FIELDS = {
  "Agentic AI":                          ["agentic-ai", "llms", "rag"],
  "Data Science & Analysis":             ["machine-learning", "data-modeling"],
  "Cybersecurity":                       ["network-security", "offensive-security", "defensive-security", "osint"],
  "Project Management & Agile":          ["scrum"],
  "AI Automation":                       ["agentic-ai"],
  "Artificial Intelligence":             ["llms", "machine-learning"],
  "Software Development & Design":       [],
  "Digital Transformation and Management": [],
};

// Topic → Illustration slug (single)
const TOPIC_TO_ILLUSTRATION = {
  "Cybersecurity":                       "illustration-shield",
  "Agentic AI":                          "illustration-brain",
  "Artificial Intelligence":             "illustration-brain",
  "Data Science & Analysis":             "illustration-chart",
  "AI Automation":                       "illustration-gear",
  "Project Management & Agile":          "illustration-gear",
};

function log(...args) { console.log("[autolink]", ...args); }

function dedup(arr) { return [...new Set(arr)]; }

function deriveLinks(course, iconIdBySlug) {
  const tags = course.fields?.["B2B Tags"] || [];
  const topic = course.fields?.Topic || "";

  const foundationSlugs = dedup(tags.flatMap((t) => TAG_TO_FOUNDATIONS[t] || []));
  const toolSlugs       = dedup(tags.flatMap((t) => TAG_TO_TOOLS[t]       || []));
  const fieldSlugs      = dedup(TOPIC_TO_FIELDS[topic] || []);
  const illoSlug        = TOPIC_TO_ILLUSTRATION[topic] || null;

  const toIds = (slugs) => slugs.map((s) => iconIdBySlug.get(s)).filter(Boolean);

  return {
    "Foundations":  toIds(foundationSlugs),
    "Fields":       toIds(fieldSlugs),
    "Tools":        toIds(toolSlugs),
    "Illustration": illoSlug && iconIdBySlug.get(illoSlug) ? [iconIdBySlug.get(illoSlug)] : [],
  };
}

async function getTableId(name) {
  const schema = await meta.getBaseSchema(BASE_ID);
  const t = schema.tables.find((x) => x.name === name);
  if (!t) throw new Error(`Table "${name}" not found`);
  return t.id;
}

async function main() {
  const catalogTableId = await getTableId(COURSE_CATALOG_TABLE_NAME);
  const iconsTableId   = await getTableId(ICONS_TABLE_NAME);

  const icons = await data.listAll(BASE_ID, iconsTableId);
  const iconIdBySlug = new Map(icons.filter((r) => r.fields?.Slug).map((r) => [r.fields.Slug, r.id]));
  log(`Loaded ${iconIdBySlug.size} icons.`);

  const courses = await data.listAll(BASE_ID, catalogTableId);
  const ours = courses.filter((r) => r.fields?.Slug);
  log(`Linking ${ours.length} catalog courses…`);

  const updates = [];
  for (const c of ours) {
    const links = deriveLinks(c, iconIdBySlug);

    if (SKIP_EXISTING) {
      // If any of the four fields is already populated, skip the course entirely.
      const hasAny = ["Foundations", "Fields", "Tools", "Illustration"].some((k) => (c.fields?.[k] || []).length > 0);
      if (hasAny) { log(`  skip ${c.fields.Slug} (already linked)`); continue; }
    }

    const summary = `F:${links.Foundations.length} Fi:${links.Fields.length} T:${links.Tools.length} Ill:${links.Illustration.length}`;
    log(`  ${c.fields.Slug.padEnd(36)} → ${summary}`);
    updates.push({ id: c.id, fields: links });
  }

  if (!updates.length) { log("Nothing to update."); return; }
  await data.updateRecords(BASE_ID, catalogTableId, updates, { typecast: false });
  log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
