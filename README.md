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

The CTA on every detail page opens the inquiry modal (PRD §9). It captures everything in the spec including hidden fields (program slug, source URL, UTM). On submit it currently does:

```js
console.info("[CODED] Inquiry payload →", payload);
```

…then shows the success screen. **To wire up production**, replace that block in `assets/app.js` (search `Inquiry payload`) with:

```js
fetch("/api/inquiry", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

…and provision the serverless function: post to Notion's Business Leads database via the official API and email `enterprise@joincoded.com`. Free-email-domain detection (`flag_free_email`) is already in the payload, Notion can route on it.

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
