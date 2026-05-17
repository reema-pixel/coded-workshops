/* CODED Course Catalog renderer.
 *
 * Mounts at #/catalog/<slug>. Reads from window.CODED_PROGRAMS (same data
 * source as the rest of the site). Designed to render identically on the
 * web and when Puppeteer captures it to PDF.
 *
 * Exposes window.renderCatalog(slug) so app.js can route to it.
 */

(function () {
  "use strict";

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  // Same time-format helper as app.js — duplicated here so this file is
  // standalone and Puppeteer can hit the page without app.js side-effects.
  function fmtTimingShort(pattern) {
    if (!pattern) return "";
    const m1 = pattern.match(/\b(\d{1,2})(am|pm)[–\-](\d{1,2})(am|pm)\b/i);
    if (m1) return `${m1[1]}:00 ${m1[2].toUpperCase()} – ${m1[3]}:00 ${m1[4].toUpperCase()}`;
    const m2 = pattern.match(/(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})\s*(AM|PM)/i);
    if (m2) return `${m2[1]} – ${m2[2]} ${m2[3].toUpperCase()}`;
    return pattern;
  }

  function titleSizeClass(name) {
    const len = (name || "").length;
    if (len < 22) return "";
    if (len < 32) return "catalog__title--medium";
    return "catalog__title--small";
  }

  // Render a single chip (foundation / field / tool).
  function chip(label) {
    return `<span class="chip">${escapeHtml(label)}</span>`;
  }

  // Round icon-tile. If we have a local path use the image; otherwise a ghost tile.
  function iconTile(icon) {
    if (icon && icon.path) {
      return `<span class="icon-tile" title="${escapeHtml(icon.name || "")}"><img src="${escapeHtml(icon.path)}" alt="${escapeHtml(icon.name || "")}"/></span>`;
    }
    return `<span class="icon-tile icon-tile--ghost" title="${escapeHtml(icon?.name || "")}"></span>`;
  }

  function renderSpecRow(label, items, opts = {}) {
    if (!items || !items.length) return "";
    const chips = items.map((it) => chip(typeof it === "string" ? it : it.name)).join("");
    return `
      <div class="spec-row">
        <span class="spec-row__label">${escapeHtml(label)}</span>
        <div class="chip-stack">${chips}</div>
      </div>`;
  }

  function pickYear(p) {
    const iso = p.start_date || "";
    return iso.slice(0, 4) || "2026";
  }

  function getLogoPath() {
    return "assets/brand/logo-navy.png";
  }

  // Programs from Airtable have richer `foundations`, `fields`, `tools`,
  // `illustration` linked-icon arrays. Programs from the legacy hand-written
  // programs.js don't. Fall back to topic/tags-derived defaults so the page
  // still renders something sensible during the transition.
  function inferIconList(p, kind) {
    const fromAirtable = p[kind];
    if (Array.isArray(fromAirtable) && fromAirtable.length) return fromAirtable;
    // Fallbacks driven by tags so brand-new catalogs are non-empty before
    // marketing has linked icons in Airtable.
    if (kind === "foundations") {
      const out = [];
      const t = (p.tags || []).join(" ");
      if (/\bpython\b/i.test(t)) out.push({ name: "Python" });
      if (/\bsql\b/i.test(t))    out.push({ name: "SQL" });
      return out;
    }
    if (kind === "fields") {
      const out = [];
      if (p.topic) out.push({ name: p.topic });
      return out;
    }
    if (kind === "tools") {
      return (p.tags || [])
        .filter((t) => !["ai", "agents", "data", "bootcamp"].includes(t))
        .slice(0, 4)
        .map((t) => ({ name: t.replace(/\b\w/g, (c) => c.toUpperCase()) }));
    }
    return [];
  }

  function pickIllustration(p) {
    if (p.illustration && p.illustration.path) return p.illustration;
    // Topic-driven fallback path. These will resolve only when icons-bootstrap
    // has been run and matching artwork uploaded.
    const slugByTopic = {
      "Cybersecurity":              "assets/icons/illustration-shield.svg",
      "Agentic AI":                 "assets/icons/illustration-brain.svg",
      "Data & Analytics":           "assets/icons/illustration-chart.svg",
      "AI Automation":              "assets/icons/illustration-gear.svg",
      "Project Management & Agile": "assets/icons/illustration-gear.svg",
    };
    const path = slugByTopic[p.topic];
    return path ? { name: p.topic, path } : null;
  }

  function renderHero(p) {
    const ill = pickIllustration(p);
    if (ill && ill.path) {
      return `
        <div class="catalog__hero-image">
          <img src="${escapeHtml(ill.path)}" alt="${escapeHtml(ill.name || "")}" onerror="this.parentElement.classList.add('catalog__hero-image--empty'); this.remove();"/>
        </div>`;
    }
    return `<div class="catalog__hero-image catalog__hero-image--empty">Illustration</div>`;
  }

  function renderCohorts(p) {
    const items = (p.iterations || []).map((it, i) => `
      <li class="${i === 0 ? "is-next" : ""}">
        <span class="cohort-list__label">${i === 0 ? "Next cohort" : `Cohort ${i + 1}`}</span>
        <span class="cohort-list__dates">${escapeHtml(it.dates || "")}</span>
      </li>
    `).join("");
    if (!items) return "";
    return `
      <section class="catalog__cohorts">
        <div class="catalog__cohorts-head">
          <h2>Dates for ${escapeHtml(pickYear(p))}</h2>
          <p class="catalog__cohorts-note">*Dates may change. Check coded.kw for the latest.</p>
        </div>
        <ol class="cohort-list">${items}</ol>
      </section>`;
  }

  function renderCatalog(slug) {
    const programs = window.CODED_PROGRAMS || [];
    const p = programs.find((x) => x.slug === (slug || "").toLowerCase());
    const app = document.getElementById("app");
    if (!app) return;

    document.body.classList.add("has-catalog");
    document.title = p ? `${p.name} · CODED Catalog` : "CODED Catalog";

    if (!p) {
      app.innerHTML = `
        <div class="catalog-shell">
          <article class="catalog" style="padding: 80px;">
            <h1 class="catalog__title catalog__title--small">Catalog not found</h1>
            <p class="catalog__lede">No program matches "${escapeHtml(slug)}". <a href="#/">Browse all programs →</a></p>
          </article>
        </div>`;
      document.body.removeAttribute("data-catalog-ready");
      return;
    }

    const foundations = inferIconList(p, "foundations");
    const fields      = inferIconList(p, "fields");
    const tools       = inferIconList(p, "tools");
    const iconStrip   = [...foundations, ...tools].filter((i) => i && (i.path || i.name));

    const titleSize = titleSizeClass(p.name);
    const fmtLine   = [p.format, p.delivery_mode].filter(Boolean).join(" · ");

    app.innerHTML = `
      <div class="catalog-shell">
        <article class="catalog catalog--${escapeHtml((p.topic || "").toLowerCase().replace(/\W+/g, "-"))}">
          <header class="catalog__head">
            <div class="catalog__brandbar">
              <img src="${getLogoPath()}" alt="CODED"/>
              <span class="catalog__brand-label">CODED Course Catalog</span>
            </div>
            <h1 class="catalog__title ${titleSize}">${escapeHtml(p.name)}</h1>
            <p class="catalog__lede">${escapeHtml(p.overview || p.one_liner || "")}</p>
            <span class="catalog__url-pill">coded.kw</span>
          </header>

          <section class="catalog__card">
            <div class="catalog__card-grid">
              <div class="catalog__specs">
                ${renderSpecRow("Duration", [p.duration_label].filter(Boolean))}
                ${renderSpecRow("Foundations", foundations.map((i) => i.name))}
                ${renderSpecRow("Fields", fields.map((i) => i.name))}
                ${renderSpecRow("Tools", tools.map((i) => i.name))}
                ${iconStrip.length ? `<div class="icon-tiles">${iconStrip.map(iconTile).join("")}</div>` : ""}
              </div>
              <aside class="catalog__hero">
                ${renderHero(p)}
                <dl class="catalog__meta">
                  ${fmtLine ? `<div><dt>Format:</dt><dd>${escapeHtml(fmtLine)}</dd></div>` : ""}
                  ${p.duration_label ? `<div><dt>Duration:</dt><dd>${escapeHtml(p.duration_label)}</dd></div>` : ""}
                  ${p.session_pattern ? `<div><dt>Timing:</dt><dd>${escapeHtml(fmtTimingShort(p.session_pattern))}</dd></div>` : ""}
                </dl>
              </aside>
            </div>
          </section>

          ${renderCohorts(p)}

          <footer class="catalog__foot">
            <a href="mailto:enterprise@joincoded.com">enterprise@joincoded.com</a>
            <span>© ${escapeHtml(pickYear(p))} CODED · Kuwait</span>
          </footer>
        </article>

        <div class="catalog-actions">
          <a class="btn btn-secondary" href="#/programs/${escapeHtml(p.slug)}">← Full program page</a>
          <a class="btn btn-primary" href="assets/pdfs/${escapeHtml(p.slug)}.pdf" download>Download PDF</a>
        </div>
      </div>
    `;

    // Sentinel for Puppeteer: wait for body[data-catalog-ready="true"] before
    // capturing the PDF. Set after layout settles (next frame).
    requestAnimationFrame(() => {
      document.body.setAttribute("data-catalog-ready", "true");
    });

    window.scrollTo({ top: 0 });
  }

  function teardown() {
    document.body.classList.remove("has-catalog");
    document.body.removeAttribute("data-catalog-ready");
    document.title = "Programs · CODED";
  }

  window.renderCatalog = renderCatalog;
  window.teardownCatalog = teardown;
})();
