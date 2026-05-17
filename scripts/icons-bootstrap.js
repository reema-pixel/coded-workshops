#!/usr/bin/env node
/**
 * Bootstrap the Icons table with a curated set of logos.
 *
 *   SimpleIcons logos  → downloaded to assets/icons/<slug>.svg locally.
 *                        An Airtable row is created with Name/Slug/Category/Source URL
 *                        (no Image attachment — Airtable silently rejects SVG-by-URL).
 *
 *   Abstract / hero    → row created with empty Image. You upload custom artwork
 *                        in the Airtable UI; sync.js downloads it to assets/icons/.
 *
 * Catalog rendering precedence (in catalog.js):
 *   1. Airtable Image attachment (if user uploaded)        → assets/icons/<slug>.<ext>
 *   2. Local SimpleIcons SVG (bootstrapped here)           → assets/icons/<slug>.svg
 *   3. Ghost tile placeholder
 *
 * Idempotent on Slug. Re-run any time you add/edit ICONS.
 *
 * Run: npm run icons:bootstrap
 */

const fs = require("node:fs");
const path = require("node:path");
const { meta, data } = require("./lib/airtable");
const { BASE_ID, ICONS_TABLE_NAME } = require("./schema");

const NAVY_HEX = "11213D";
const si = (slug) => `https://cdn.simpleicons.org/${slug}/${NAVY_HEX}`;
// Lucide icons via the unpkg CDN. We post-process to recolor stroke to navy.
const lu = (name) => `https://unpkg.com/lucide-static@latest/icons/${name}.svg`;

const ICONS_DIR = path.join(__dirname, "..", "assets", "icons");
fs.mkdirSync(ICONS_DIR, { recursive: true });

// Curated library. Edit here, re-run.
//   source: "simpleicons" → SVG fetched from cdn.simpleicons.org/<siSlug>/<hex>
//   source: "lucide"      → SVG fetched from Lucide; stroke recolored to brand navy
//   source: "manual"      → row only; upload artwork via Airtable UI
const ICONS = [
  // Foundations: languages & runtimes
  { name: "Python",      slug: "python",      category: "Foundation", source: "simpleicons", siSlug: "python" },
  { name: "Bash",        slug: "bash",        category: "Foundation", source: "simpleicons", siSlug: "gnubash" },
  { name: "PowerShell",  slug: "powershell",  category: "Foundation", source: "lucide",      luName: "terminal" },
  { name: "JavaScript",  slug: "javascript",  category: "Foundation", source: "simpleicons", siSlug: "javascript" },
  { name: "TypeScript",  slug: "typescript",  category: "Foundation", source: "simpleicons", siSlug: "typescript" },
  { name: "SQL",         slug: "sql",         category: "Foundation", source: "lucide",      luName: "database" },
  { name: "DAX",         slug: "dax",         category: "Foundation", source: "lucide",      luName: "function-square" },

  // Fields: abstract topics — Lucide line icons (recolored to navy)
  { name: "Network Security",   slug: "network-security",   category: "Field", source: "lucide", luName: "network" },
  { name: "Offensive Security", slug: "offensive-security", category: "Field", source: "lucide", luName: "swords" },
  { name: "Defensive Security", slug: "defensive-security", category: "Field", source: "lucide", luName: "shield-check" },
  { name: "OSINT",              slug: "osint",              category: "Field", source: "lucide", luName: "search" },
  { name: "Machine Learning",   slug: "machine-learning",   category: "Field", source: "lucide", luName: "brain" },
  { name: "Deep Learning",      slug: "deep-learning",      category: "Field", source: "lucide", luName: "cpu" },
  { name: "LLMs",               slug: "llms",               category: "Field", source: "lucide", luName: "message-square-code" },
  { name: "RAG",                slug: "rag",                category: "Field", source: "lucide", luName: "layers" },
  { name: "Agentic AI",         slug: "agentic-ai",         category: "Field", source: "lucide", luName: "bot" },
  { name: "Data Modeling",      slug: "data-modeling",      category: "Field", source: "lucide", luName: "database-zap" },
  { name: "Forecasting",        slug: "forecasting",        category: "Field", source: "lucide", luName: "trending-up" },
  { name: "Scrum",              slug: "scrum",              category: "Field", source: "simpleicons", siSlug: "scrumalliance" },

  // Tools: real product logos where possible, Lucide stand-ins elsewhere
  { name: "Nmap",         slug: "nmap",         category: "Tool", source: "lucide",      luName: "radar" },
  { name: "Wireshark",    slug: "wireshark",    category: "Tool", source: "simpleicons", siSlug: "wireshark" },
  { name: "Burp Suite",   slug: "burp-suite",   category: "Tool", source: "simpleicons", siSlug: "burpsuite" },
  { name: "Metasploit",   slug: "metasploit",   category: "Tool", source: "simpleicons", siSlug: "metasploit" },
  { name: "Splunk",       slug: "splunk",       category: "Tool", source: "simpleicons", siSlug: "splunk" },
  { name: "MISP",         slug: "misp",         category: "Tool", source: "lucide",      luName: "shield-alert" },
  { name: "n8n",          slug: "n8n",          category: "Tool", source: "simpleicons", siSlug: "n8n" },
  { name: "Power BI",     slug: "power-bi",     category: "Tool", source: "lucide",      luName: "bar-chart-3" },
  { name: "Power Automate", slug: "power-automate", category: "Tool", source: "lucide",  luName: "workflow" },
  { name: "Tableau",      slug: "tableau",      category: "Tool", source: "lucide",      luName: "pie-chart" },
  { name: "Pandas",       slug: "pandas",       category: "Tool", source: "simpleicons", siSlug: "pandas" },
  { name: "NumPy",        slug: "numpy",        category: "Tool", source: "simpleicons", siSlug: "numpy" },
  { name: "scikit-learn", slug: "scikit-learn", category: "Tool", source: "simpleicons", siSlug: "scikitlearn" },
  { name: "PyTorch",      slug: "pytorch",      category: "Tool", source: "simpleicons", siSlug: "pytorch" },
  { name: "Hugging Face", slug: "huggingface",  category: "Tool", source: "simpleicons", siSlug: "huggingface" },
  { name: "OpenAI",       slug: "openai",       category: "Tool", source: "lucide",      luName: "sparkles" },
  { name: "Anthropic",    slug: "anthropic",    category: "Tool", source: "simpleicons", siSlug: "anthropic" },
  { name: "NVIDIA",       slug: "nvidia",       category: "Tool", source: "simpleicons", siSlug: "nvidia" },
  { name: "Supabase",     slug: "supabase",     category: "Tool", source: "simpleicons", siSlug: "supabase" },
  { name: "Lovable",      slug: "lovable",      category: "Tool", source: "lucide",      luName: "heart-handshake" },
  { name: "Replit",       slug: "replit",       category: "Tool", source: "simpleicons", siSlug: "replit" },
  { name: "Postman",      slug: "postman",      category: "Tool", source: "simpleicons", siSlug: "postman" },
  { name: "SharePoint",   slug: "sharepoint",   category: "Tool", source: "lucide",      luName: "folder-cog" },
  { name: "Microsoft Teams", slug: "ms-teams",  category: "Tool", source: "lucide",      luName: "users" },

  // Illustrations (hero artwork) — Lucide line icons, white-tinted by CSS in catalog.css
  { name: "Shield (3D)",      slug: "illustration-shield",      category: "Illustration", source: "lucide", luName: "shield-check" },
  { name: "Brain (3D)",       slug: "illustration-brain",       category: "Illustration", source: "lucide", luName: "brain-circuit" },
  { name: "Chart (3D)",       slug: "illustration-chart",       category: "Illustration", source: "lucide", luName: "chart-no-axes-combined" },
  { name: "Gear (3D)",        slug: "illustration-gear",        category: "Illustration", source: "lucide", luName: "settings-2" },
  { name: "Megaphone (3D)",   slug: "illustration-megaphone",   category: "Illustration", source: "lucide", luName: "megaphone" },
];

function log(...args) { console.log("[icons]", ...args); }

async function getIconsTableId() {
  const schema = await meta.getBaseSchema(BASE_ID);
  const t = schema.tables.find((x) => x.name === ICONS_TABLE_NAME);
  if (!t) throw new Error(`${ICONS_TABLE_NAME} table not found in base ${BASE_ID}. Run airtable:setup first.`);
  return t.id;
}

async function downloadSvg(url, target, { recolorTo } = {}) {
  const r = await fetch(url);
  if (!r.ok) return false;
  let buf = Buffer.from(await r.arrayBuffer());
  if (recolorTo) {
    // Lucide SVGs use stroke="currentColor" + stroke-width=2 on black-by-default
    // strokes. Rewrite stroke to the brand navy so the SVG looks right when
    // dropped as an <img> (no inherited color context). We DON'T recolor for
    // hero illustrations — catalog.css filters those to white via CSS so they
    // appear correctly on the blue card.
    let text = buf.toString("utf8");
    text = text.replace(/stroke=["']currentColor["']/g, `stroke="${recolorTo}"`);
    // Also bump stroke-width slightly so the icons read at small sizes.
    text = text.replace(/stroke-width=["']2["']/g, 'stroke-width="2.2"');
    buf = Buffer.from(text, "utf8");
  }
  fs.writeFileSync(target, buf);
  return buf.length;
}

async function main() {
  const tableId = await getIconsTableId();
  const existing = await data.listAll(BASE_ID, tableId);
  const bySlug = new Map(existing.filter((r) => r.fields?.Slug).map((r) => [r.fields.Slug, r]));
  log(`Found ${existing.length} existing icon records (${bySlug.size} with a Slug).`);

  let downloaded = 0;
  let failed = 0;
  const toCreate = [];
  const toUpdate = [];

  for (const icon of ICONS) {
    const fields = {
      Name: icon.name,
      Slug: icon.slug,
      Category: icon.category,
      Notes: icon.notes || undefined,
    };

    if (icon.source === "simpleicons" && icon.siSlug) {
      const url = si(icon.siSlug);
      const target = path.join(ICONS_DIR, `${icon.slug}.svg`);
      const size = await downloadSvg(url, target);
      if (size) {
        log(`↓ ${icon.slug}.svg (${size} bytes, simpleicons)`);
        downloaded++;
        fields["Source URL"] = `https://simpleicons.org/?q=${encodeURIComponent(icon.siSlug)}`;
      } else {
        log(`! ${icon.slug}: SimpleIcons URL 404'd (${url}). Row created without local file.`);
        failed++;
      }
    } else if (icon.source === "lucide" && icon.luName) {
      const url = lu(icon.luName);
      const target = path.join(ICONS_DIR, `${icon.slug}.svg`);
      // Hero illustrations stay black-stroked; catalog.css inverts them to white on blue.
      // Everything else recolors to brand navy so it reads on the white chip background.
      const recolorTo = icon.category === "Illustration" ? null : "#11213D";
      const size = await downloadSvg(url, target, { recolorTo });
      if (size) {
        log(`↓ ${icon.slug}.svg (${size} bytes, lucide:${icon.luName})`);
        downloaded++;
        fields["Source URL"] = `https://lucide.dev/icons/${icon.luName}`;
      } else {
        log(`! ${icon.slug}: Lucide URL 404'd (${url}). Row created without local file.`);
        failed++;
      }
    }

    for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];

    if (bySlug.has(icon.slug)) toUpdate.push({ id: bySlug.get(icon.slug).id, fields });
    else                       toCreate.push({ fields });
  }

  // typecast:false because in this script we never send attachment URLs to
  // Airtable (it silently drops SVG-by-URL anyway). The select fields we send
  // use exact-match option names which work fine without typecast.
  if (toCreate.length) { log(`Creating ${toCreate.length} icon row(s)…`); await data.createRecords(BASE_ID, tableId, toCreate, { typecast: false }); }
  if (toUpdate.length) { log(`Updating ${toUpdate.length} icon row(s)…`); await data.updateRecords(BASE_ID, tableId, toUpdate, { typecast: false }); }

  log("");
  log(`Bootstrap complete. ${downloaded} SVGs downloaded to assets/icons/, ${failed} failed, ${ICONS.length - downloaded - failed} await manual upload.`);
  log("Next: open the Icons table in Airtable and upload artwork for any row whose Slug doesn't have a local SVG.");
  log("Then in each Course row, link Foundations / Fields / Tools / Illustration to icons.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
