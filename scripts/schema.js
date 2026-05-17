/**
 * Single source of truth for the catalog tables in the existing
 * `CODED Landing Page CMS` Airtable base (appauC0auHC017I1X).
 *
 * The base already has a designed schema:
 *   ✓ CODED Course Catalog  (21 fields, ~30 rows of existing courses)
 *   ✓ Cohorts               (date instances; will be back-linked to Course Catalog)
 *   ✓ Catalog Section       (visual grouping)
 *   ✓ PDFs                  (brochure attachments + FlyerRequest leads)
 *   ✓ CatalogRequest / FlyerRequest  (lead-capture for downloads)
 *   ✓ 🔐 PRODUCTS / 🔐 COHORTS       (locked sync tables from another system)
 *
 * Our job is to FIT INTO this base, not duplicate it:
 *   - Extend `CODED Course Catalog` with the marketing fields needed for the
 *     unified catalog page (Slug, Status, One Liner, FAQ, instructor, etc.).
 *   - Add a `Course` back-link on `Cohorts` so they're no longer orphaned.
 *   - Add 2 new tables: `Icons` (the reusable library) and `Curriculum`
 *     (the per-module phases that don't fit into the existing `Outline`
 *     rich-text field cleanly).
 */

// Existing table IDs in CODED Landing Page CMS (appauC0auHC017I1X)
const COURSE_CATALOG_TABLE_ID = "tblqLLqzh25R9ewoK";
const COHORTS_TABLE_ID        = "tbllDDGTfe8a2q5aB";
const CATALOG_SECTION_TABLE_ID= "tblxn1EKz7bp2R90r";
const PDFS_TABLE_ID           = "tblsX5kbMwyAIcwfJ";

// ── Choices ──────────────────────────────────────────────────────────────────

const TOPIC_CHOICES = [
  // Aligns with existing Catalog Section names so they map 1:1.
  "Software Development & Design",
  "Cybersecurity",
  "Artificial Intelligence",
  "Digital Transformation and Management",
  "Data Science & Analysis",
  // Extra B2B topics from the hardcoded catalog:
  "Agentic AI",
  "AI Automation",
  "Project Management & Agile",
];

const STATUS_CHOICES = ["Draft", "Published", "Archived"];
const SHIFT_CHOICES = ["Morning", "Evening", "Both"];
const DELIVERY_CHOICES = ["In person", "Remote", "Hybrid"];
const AUDIENCE_CHOICES = [
  "Technical / IT",
  "Data & Analytics",
  "Finance & Accounting",
  "Marketing & Content",
  "Non-Technical",
  "Leadership",
  "HR & People Ops",
];
const ICON_CATEGORY_CHOICES = ["Foundation", "Field", "Tool", "Illustration"];

const TAG_CHOICES = [
  "ai","agents","n8n","rag","llm","marketing","content","generative","sql","analytics",
  "data","nvidia","certification","finance","fpa","forecasting","powerbi","bi","dashboards",
  "scrum","psm","agile","automation","m365","no-code","bootcamp","ai-app-builder","supabase",
  "data-science","ml","python","cybersecurity","red-team","blue-team","soc",
];

// ── Fields to ADD to the existing `CODED Course Catalog` table ───────────────
//
// Anything in this list that doesn't already exist on the table will be created
// by airtable-setup.js. Existing fields (Course Title, Description, Outline,
// Icon, PDF, Duration, Course Type, Target Audience, Tag, etc.) are left alone.
const COURSE_CATALOG_ADDITIONAL_FIELDS = [
  { name: "Slug", type: "singleLineText", description: "URL slug. Becomes the PDF filename and /catalog/<slug>." },
  { name: "Status", type: "singleSelect", options: { choices: STATUS_CHOICES.map((name) => ({ name })) }, description: "Draft = WIP, Published = on the public catalog, Archived = hidden." },
  { name: "One Liner", type: "multilineText", description: "A short pitch line (≤2 sentences). Used as the catalog page subheading." },
  { name: "Overview", type: "multilineText", description: "Long-form description (3–6 sentences). Used as the catalog page lede." },
  { name: "Outcomes", type: "multilineText", description: "One per line. Rendered as bullets." },
  { name: "FAQ", type: "multilineText", description: "Q: …\\nA: …\\n\\nQ: …\\nA: …" },
  { name: "Topic", type: "singleSelect", options: { choices: TOPIC_CHOICES.map((name) => ({ name })) }, description: "Marketing topic for filtering. Mirrors the existing Catalog Section names plus extras." },
  { name: "Audience Detail", type: "multilineText" },
  { name: "Audience B2B", type: "multipleSelects", options: { choices: AUDIENCE_CHOICES.map((name) => ({ name })) }, description: "B2B audience taxonomy (distinct from the existing Target Audience which is broader)." },
  { name: "Shift", type: "singleSelect", options: { choices: SHIFT_CHOICES.map((name) => ({ name })) } },
  { name: "Prereq Label", type: "singleLineText" },
  { name: "Start Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "End Date", type: "date", options: { dateFormat: { name: "iso" } } },
  { name: "Duration Label", type: "singleLineText", description: "Human-readable like \"10 weeks\" or \"1 week (5 days)\"." },
  { name: "Total Hours", type: "number", options: { precision: 0 } },
  { name: "Session Pattern", type: "singleLineText" },
  { name: "Delivery Mode", type: "singleSelect", options: { choices: DELIVERY_CHOICES.map((name) => ({ name })) } },
  { name: "Location", type: "singleLineText" },
  { name: "Location Full", type: "singleLineText" },
  { name: "Location URL", type: "url" },
  { name: "Price Per Seat (KWD)", type: "currency", options: { precision: 0, symbol: "KWD " } },
  { name: "Group Rates", type: "checkbox", options: { icon: "check", color: "greenBright" } },
  { name: "Classroom", type: "singleLineText" },
  { name: "B2B Tags", type: "multipleSelects", options: { choices: TAG_CHOICES.map((name) => ({ name })) }, description: "B2B-only tagging (the existing Tag/Keywords fields are broader)." },
  { name: "Instructor Name", type: "singleLineText" },
  { name: "Instructor Role", type: "singleLineText" },
  { name: "Instructor Bio", type: "multilineText" },
  // Linked-record fields added in setup's second pass once Icons + Curriculum exist:
  //   Foundations, Fields, Tools, Illustration (→ Icons)
  //   Curriculum (→ Curriculum), Catalog Cohorts (→ Cohorts)
];

// ── Fields to ADD to the existing `Cohorts` table ────────────────────────────
const COHORTS_ADDITIONAL_FIELDS = [
  { name: "Dates", type: "singleLineText", description: "Human-readable display string, e.g. \"May 17 – Jul 23, 2026\"." },
  { name: "Cohort Status", type: "singleSelect", options: { choices: ["Open", "Filling", "Closed", "Past"].map((name) => ({ name })) }, description: "Public-facing cohort availability (distinct from the existing Status field)." },
  { name: "Order", type: "number", options: { precision: 0 } },
  // Course back-link added in setup's second pass.
];

// ── New tables we create ─────────────────────────────────────────────────────

const ICONS_TABLE = {
  name: "Icons",
  description: "Reusable icon library (logos + illustrations) used by catalog pages and PDFs. Programs link to icons via Foundations/Fields/Tools/Illustration.",
  fields: [
    { name: "Name", type: "singleLineText" },
    { name: "Slug", type: "singleLineText", description: "Lowercase, hyphenated. Becomes the filename." },
    { name: "Category", type: "singleSelect", options: { choices: ICON_CATEGORY_CHOICES.map((name) => ({ name })) } },
    { name: "Image", type: "multipleAttachments" },
    { name: "Source URL", type: "url" },
    { name: "Notes", type: "multilineText" },
  ],
};

const CURRICULUM_TABLE = {
  name: "Curriculum",
  description: "Curriculum modules / phases per course (richer structure than the existing Outline rich-text field).",
  fields: [
    { name: "Title", type: "singleLineText", description: "e.g. \"Day 1, From LLMs to Agents\" or \"Module 1: The UI Architect\"." },
    { name: "Focus", type: "multilineText" },
    { name: "Hours", type: "number", options: { precision: 0 } },
    { name: "Sessions", type: "number", options: { precision: 0 } },
    { name: "Order", type: "number", options: { precision: 0 } },
    // Course link added in setup's second pass.
  ],
};

// Linked-record fields added on Course Catalog after dependent tables exist.
const COURSE_CATALOG_LINK_FIELDS = [
  { name: "Foundations",   links: "Icons", description: "Icons in the Foundations row (languages, runtimes)." },
  { name: "Fields",        links: "Icons", description: "Icons in the Fields row (abstract topics)." },
  { name: "Tools",         links: "Icons", description: "Icons in the Tools row (products/logos)." },
  { name: "Illustration",  links: "Icons", description: "Hero illustration. Usually one icon." },
  { name: "Curriculum",    links: "Curriculum" },
  { name: "Catalog Cohorts", links: "Cohorts", description: "Set-date cohorts for this course. Renames \"Cohorts\" link to avoid colliding with the existing one." },
];

// Reverse links on child tables.
const CHILD_LINK_FIELDS = [
  { table: "Cohorts",    name: "Course", links: "CODED Course Catalog" },
  { table: "Curriculum", name: "Course", links: "CODED Course Catalog" },
];

module.exports = {
  BASE_ID: process.env.CATALOG_AIRTABLE_BASE_ID || "appauC0auHC017I1X",
  BASE_NAME: "CODED Landing Page CMS",
  EXISTING_TABLES: {
    CourseCatalog:  COURSE_CATALOG_TABLE_ID,
    Cohorts:        COHORTS_TABLE_ID,
    CatalogSection: CATALOG_SECTION_TABLE_ID,
    PDFs:           PDFS_TABLE_ID,
  },

  // Field extensions applied to existing tables.
  EXISTING_TABLE_EXTENSIONS: {
    "CODED Course Catalog": COURSE_CATALOG_ADDITIONAL_FIELDS,
    "Cohorts":              COHORTS_ADDITIONAL_FIELDS,
  },

  // Tables to create from scratch.
  NEW_TABLES: {
    "Icons":      ICONS_TABLE,
    "Curriculum": CURRICULUM_TABLE,
  },

  COURSE_CATALOG_TABLE_NAME: "CODED Course Catalog",
  COHORTS_TABLE_NAME:        "Cohorts",
  CURRICULUM_TABLE_NAME:     "Curriculum",
  ICONS_TABLE_NAME:          "Icons",

  COURSE_CATALOG_LINK_FIELDS,
  CHILD_LINK_FIELDS,

  CHOICES: {
    TOPIC: TOPIC_CHOICES, STATUS: STATUS_CHOICES, SHIFT: SHIFT_CHOICES,
    DELIVERY: DELIVERY_CHOICES, AUDIENCE: AUDIENCE_CHOICES, ICON_CATEGORY: ICON_CATEGORY_CHOICES,
  },
};
