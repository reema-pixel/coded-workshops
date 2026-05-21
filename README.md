# CODED, Open Programs Landing Page

Discovery surface for HR, L&D, and individual learners to browse and inquire about CODED's open enrollment programs. Built to the [Open Programs PRD](../) v1 spec, in the brand visual language defined by the official CODED Brand Book.

## What's in here

```
Open Workshops Landing/
├── index.html                # Page shell (header, footer, inquiry modal)
├── server.py                 # Tiny static server, no deps
├── README.md                 # This file
└── assets/
    ├── styles.css            # All design tokens + components in one CSS file
    ├── app.js                # Hash router, filters, detail rendering, modal
    ├── programs.js           # Source of truth for the program catalog (PRD §11 schema)
    └── brand/
        ├── logo-white.png    # CODED wordmark (white), header use
        ├── logo-navy.png     # CODED wordmark (navy on white)
        └── logo-white-on-navy.png
```

The catalog data is hand-mirrored from the Notion page **Year Calendar, B2C / B2B [Open Enrollment Calendar]** and follows the data model in PRD §11 verbatim, so the only thing that changes when you wire up the live Notion API later is `programs.js`.

## Run it

No build step. Two ways:

### Quick, open it directly
```
open index.html
```
Works from `file://`. Inquiry-form `console.info` logs go to DevTools.

### Recommended, run the local static server
```
cd "Open Workshops Landing"
python3 server.py
```
Then open <http://127.0.0.1:7333/>.

Why prefer the server: clean URLs, correct MIME types, and the inquiry form's eventual fetch-to-`/api/inquiry` will work once you wire it up.

## How filtering works

Filters are URL-driven. Anything you select shows up as `?topic=...&audience=...&month=...` in the hash, so a filtered view is shareable: e.g. `#/?topic=AI%20%26%20Data%20Science&format=Workshop`. Five filters per the PRD:

- **Topic**, multi
- **Audience**, multi
- **Month**, multi (auto-built from program start dates, hides past months)
- **Format**, multi
- **Duration**, single

Combine logic: AND across categories, OR within. "Clear all" wipes the URL state.

## Adding or editing a program

Open `assets/programs.js`. Each program is one object matching the PRD §11 schema. Fields used:

`id, slug, name, one_liner, topic, format, audience[], start_date, end_date, duration_label, total_hours, session_pattern, delivery_mode, location, seats_available?, iterations[], overview, outcomes[], structure[], audience_detail, instructor?, faq[], status, tags[]`

Set `status: "Published"` to make a program visible. `Draft / Sold Out / Archived` are filtered out client-side. Saving + refreshing the page is enough.

> Once the Airtable catalog is live (below), `assets/programs.js` becomes a **generated** file. Edit programs in Airtable instead; the file is overwritten by `npm run airtable:sync`.

## Course Catalog — Airtable-driven (B2B Workshops / Cohorts / Curriculum / Icons)

The catalog feature gives every workshop a unified designed page at `#/catalog/<slug>` and a downloadable A4 PDF generated from the same HTML template. Content lives in Airtable so marketing/ops can edit copy, dates, and icons without touching code.

**The tables live in the existing `📦 CODED Programs DB` base (`app63RTo79M4FJzvd`)**, alongside Products, Programs (ops), Phases, Instructors, etc. We add four new tables — all prefixed `B2B …` so they're easy to find:

| Table | Purpose |
|---|---|
| `B2B Workshops` | Editorial catalog content (one row per bookable workshop). Linked to existing **Products**. |
| `B2B Cohorts` | Set-date instances of each workshop (replaces the old inline `iterations[]`). |
| `B2B Curriculum` | Curriculum modules / phases (replaces the old inline `structure[]`). |
| `Icons` | Reusable icon library (logos + illustrations). |

This stays cleanly separated from the operational Programs table (51 fields about classrooms, calendar invites, budgets, etc.) which marketing doesn't need to touch.

### One-time setup

1. Open the Airtable PAT used by this org (`omar@joincoded.com`, currently in `~/development/private_keys/airtable.env`). Go to https://airtable.com/create/tokens, edit it, and ensure it has:
   - **Scopes**: `schema.bases:read`, `schema.bases:write`, `data.records:read`, `data.records:write`
   - **Access**: `📦 CODED Programs DB`
2. Export env vars (also add them on Vercel **Project Settings → Environment Variables**):
   ```sh
   export CATALOG_AIRTABLE_PAT=$(grep ^AIRTABLE_PAT ~/development/private_keys/airtable.env | cut -d= -f2)
   # BASE_ID defaults to app63RTo79M4FJzvd; override only if you point at a different base.
   ```
3. Install deps + scaffold the tables + seed:
   ```sh
   npm install
   npm run airtable:setup        # creates the 4 new tables alongside existing ones
   npm run airtable:seed         # pushes current programs.js into B2B Workshops + children
   npm run icons:bootstrap       # seeds the Icons table with SimpleIcons logos
   ```
4. In Airtable, open each B2B Workshop row and link its **Foundations / Fields / Tools / Illustration** fields to rows in the Icons table. Upload custom artwork for any Icon row with an empty Image (the abstract Field icons + the 3D hero illustrations).

### Editing content (your marketing team's workflow)

1. Open the **CODED Programs Catalog** Airtable base.
2. Edit a Program row, add a Cohort, swap an Icon — whatever's needed.
3. From the project root, run:
   ```sh
   npm run build      # = airtable:sync + pdfs
   git add assets/ && git commit -m "Catalog refresh" && git push
   ```
   Vercel redeploys. Within ~1 min the live site + PDFs reflect the change.

### Available scripts

| Command | What it does |
|---|---|
| `npm run airtable:setup` | Idempotent: creates/extends the base, tables, and fields per `scripts/schema.js`. |
| `npm run airtable:seed`  | Pushes `assets/programs.js` into Airtable. Idempotent on `Slug`. |
| `npm run airtable:sync`  | Pulls Airtable → regenerates `assets/programs.js`, `assets/data/programs.json`, `assets/data/icons.json`, and downloads icons to `assets/icons/`. |
| `npm run icons:bootstrap`| Seeds the Icons table with SimpleIcons-sourced logos (idempotent). |
| `npm run pdfs`           | Renders every Published program's `#/catalog/<slug>` to `assets/pdfs/<slug>.pdf` via Puppeteer. Pass a slug to render one: `npm run pdfs -- cybersecurity-bootcamp`. |
| `npm run build`          | `airtable:sync && pdfs`. Run before each deploy. |

### Catalog routes & files

- **Web preview**: `http://127.0.0.1:7333/#/catalog/cybersecurity-bootcamp` (any published program slug).
- **PDF output**: `assets/pdfs/<slug>.pdf` — committed to the repo, served from `/assets/pdfs/<slug>.pdf`.
- **Template**: `assets/catalog.js` (renderer) + `assets/catalog.css` (styles, including `@media print` for PDF).
- **Data source**: `assets/programs.js` (generated). The catalog renderer reads `window.CODED_PROGRAMS` — same data source as the rest of the site.

### Why Airtable (not Supabase, for now)

For ~11 programs that marketing edits visually, Airtable's UI wins. Supabase becomes attractive when you need a public API, hundreds of records, or a custom admin — none of which apply yet. The sync script is the seam: when you outgrow Airtable, swap the source without touching the catalog template or PDF generator.

## Brand tokens

All colors and typographic scale live in the `:root` block of `assets/styles.css`. The palette is sampled directly from the official Brand Book:

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#0A1B33` | Page background |
| `--bg-surface` | `#12223C` | Cards, intro band |
| `--bg-elevated` | `#1A2D4F` | Filter chips, modal |
| `--brand-royal` | `#012891` | **Primary CTA**, brand signal blocks |
| `--brand-navy` | `#1F2940` | Logo bg, brand chrome |
| `--brand-cool-white` | `#F3F7FF` | Light surfaces in alternate sections |
| `--accent` | `#3D6BFF` | Highlights, links, hover rings |

Bracket motifs `[ ]` come straight from the Brand Book ("Brackets, Main Brand Element. To be used for contain ideas"). They're applied around the H1, around section eyebrows, and ambiently in the hero.

Topic pills are color-coded for scannability while staying tonally on-brand.

## Inquiry capture

Three surfaces collect inquiries:

1. **Hero chatbot** on the landing page (4-step concierge).
2. **Per-program inquiry modal** opened from each detail-page CTA.
3. **Enterprise form** at `/#/enterprise` (the long custom-program form).

All three POST the same payload to [`/api/inquiry`](api/inquiry.js). The
function writes a single row into **B2B Training Inquiries** in the
**Enterprise Deals** base (`appciDr5ptR27XXr9` / `tblHfbSdiyBrq4ga9`) with
`Status = "New"`. Required Vercel env var: `AIRTABLE_PAT`.

Two **Airtable Automations** in that base do the rest:

- **Confirmation email** → goes to the lead.
- **Internal notification** → goes to `enterprise@joincoded.com`.

Both use Airtable's built-in Send Email (or Send Gmail for branded HTML) —
no separate ESP, no extra code path. Marketing owns the templates.

Full step-by-step setup (PAT, env vars, both automations, email templates):
**[SETUP.md](SETUP.md)**. The branded HTML template is at
[`docs/inquiry-confirmation.html`](docs/inquiry-confirmation.html).

## Migrating to Next.js (PRD §12.1)

The static implementation is a clean blueprint for the production Next.js + Tailwind build:

| This project | Maps to |
|---|---|
| `assets/programs.js` (constant) | `lib/programs.ts` (or Notion fetcher in `app/programs/page.tsx`) |
| `assets/styles.css` `:root` tokens | `tailwind.config.ts` `theme.extend.colors` |
| `index.html` `<header>` / `<footer>` | `app/layout.tsx` |
| `renderLanding()` in `app.js` | `app/programs/page.tsx` |
| `renderDetail()` in `app.js` | `app/programs/[slug]/page.tsx` (generateStaticParams from data) |
| Hash router | App Router file-based routes |
| Filter URL state | `useSearchParams` + `useRouter().replace` |
| Inquiry form | Client component posting to `app/api/inquiry/route.ts` |

The hand-off is: keep token names, keep the data schema, drop the vanilla router. The component visuals were designed to match Tailwind's utility model, `border` ↔ `border-[--border]`, etc.

## What's intentionally out of scope (PRD §13)

- Direct online checkout / payment.
- User accounts and saved favorites.
- Live Notion API sync (queued for v2).
- Arabic localization (queued for v2, the data model is i18n-safe).
- Per-program testimonials (we use the existing site testimonials).
- `.ics` calendar export.

## Open decisions referenced in the PRD (§15)

A few items were called out as needing confirmation before final cut. Current behaviour:

| # | Decision | Current behaviour |
|---|---|---|
| Q1 | Pricing visibility | **Hidden**, every detail page CTA reads "Request Enrollment & Pricing" (PRD recommendation). |
| Q2 | "Programs" placement in nav | Top-level after Companies. Easy to move. |
| Q5 | Per-program photography | Topic-level fallback (no per-program photos yet). |
| Q6 | Sold-out programs | Will render with badge + waitlist CTA when present (none currently flagged). |
| Q8 | Youth programs | Not in this catalog, PRD recommends keeping them on `/kids-youth`. |

, Reem to validate and finalize during build review.
