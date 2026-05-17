/* CODED Course Catalog renderer.
 *
 * Mounts at #/catalog/<slug>. Reads from window.CODED_PROGRAMS.
 * Renders a multi-page editorial brochure that doubles as the source for
 * the Puppeteer-generated PDF (assets/pdfs/<slug>.pdf).
 *
 * Page 1 — Hero, Overview, At-a-glance stats, Stack chips, Outcomes
 * Page 2 — Curriculum modules, Cohort dates
 * Page 3 — Logistics keyvals, Audience, Instructor, FAQ, CTA
 *
 * Pages 2/3 are emitted only when there's enough content; short workshops
 * will produce a 2-page brochure rather than a sparse 3-pager.
 */

(function () {
  "use strict";

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  function topicSlug(topic) {
    return String(topic || "")
      .toLowerCase()
      .replace(/&/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function titleSizeClass(name) {
    const len = (name || "").length;
    if (len < 22) return "";
    if (len < 30) return "cat-hero__title--medium";
    return "cat-hero__title--small";
  }

  // "5:00 – 8:45 PM", "8:00 AM – 3:00 PM", etc.
  function fmtTimingShort(pattern) {
    if (!pattern) return "";
    const m1 = pattern.match(/\b(\d{1,2})(am|pm)[–\-](\d{1,2})(am|pm)\b/i);
    if (m1) return `${m1[1]}:00 ${m1[2].toUpperCase()} – ${m1[3]}:00 ${m1[4].toUpperCase()}`;
    const m2 = pattern.match(/(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})\s*(AM|PM)/i);
    if (m2) return `${m2[1]} – ${m2[2]} ${m2[3].toUpperCase()}`;
    return pattern;
  }

  function fmtDayRange(p) {
    const sp = p.session_pattern || "";
    const toMatch = sp.match(/(\w+day)s\s+to\s+(\w+day)s/i);
    if (toMatch) return `${toMatch[1].slice(0,3)}–${toMatch[2].slice(0,3)}`;
    const listed = (sp.split("·")[0]).match(/(\w+day)s/gi);
    if (listed && listed.length > 1) return listed.map(d => d.slice(0, 3)).join("·");
    return "";
  }

  function fmtPrice(p) {
    if (p.price_per_seat_kwd) {
      const base = `KWD ${Number(p.price_per_seat_kwd).toLocaleString("en-GB")}`;
      return { value: base, sub: p.group_rates ? "per seat · group rates" : "per seat" };
    }
    return { value: "On request", sub: "" };
  }

  function fmtDurationCompact(p) {
    return {
      value: p.duration_label || "",
      sub: p.total_hours ? `${p.total_hours} hrs total` : "",
    };
  }

  function fmtFormatCompact(p) {
    return {
      value: p.format || "Workshop",
      sub: p.delivery_mode || "",
    };
  }

  function fmtTimingCompact(p) {
    const time = fmtTimingShort(p.session_pattern);
    const days = fmtDayRange(p);
    return { value: time, sub: days };
  }

  function statCell(label, val) {
    return `
      <div class="cat-stats__cell">
        <span class="cat-stats__label">${escapeHtml(label)}</span>
        <span class="cat-stats__value">${escapeHtml(val.value || "—")}</span>
        ${val.sub ? `<span class="cat-stats__value-sub">${escapeHtml(val.sub)}</span>` : ""}
      </div>`;
  }

  function chipsRow(label, items) {
    if (!items || !items.length) return "";
    const chips = items.map((it) => {
      const name = typeof it === "string" ? it : it.name;
      const path = (typeof it === "object" && it.path) ? it.path : null;
      const inner = path
        ? `<img src="${escapeHtml(path)}" alt=""/><span>${escapeHtml(name)}</span>`
        : `<span>${escapeHtml(name)}</span>`;
      return `<span class="cat-chip">${inner}</span>`;
    }).join("");
    return `
      <div class="cat-stack__label">${escapeHtml(label)}</div>
      <div class="cat-stack__chips">${chips}</div>`;
  }

  function runHead(p, pageNum, totalPages) {
    return `
      <div class="cat-runhead">
        <img src="assets/brand/logo-navy.png" alt="CODED"/>
        <div class="cat-runhead__right">
          <span class="cat-runhead__program">${escapeHtml(p.name)}</span>
          <span class="cat-runhead__sep">·</span>
          <span>${escapeHtml(p.topic || "Catalog")}</span>
        </div>
      </div>`;
  }

  function runFoot(p, pageNum, totalPages) {
    return `
      <div class="cat-runfoot">
        <span class="cat-runfoot__email">enterprise@joincoded.com · coded.kw</span>
        <span class="cat-runfoot__pageno">${pageNum} / ${totalPages}</span>
      </div>`;
  }

  // Decide page count up-front so the page numbers in the footer are correct.
  function decidePageCount(p) {
    const hasCurriculum = (p.modules && p.modules.length) || (p.structure && p.structure.length);
    const hasCohorts = (p.cohorts && p.cohorts.length) || (p.iterations && p.iterations.length);
    const hasDetails = p.audience_detail || p.instructor || (p.faq && p.faq.length);
    if (hasCurriculum && hasDetails) return 3;
    if (hasCurriculum || hasCohorts || hasDetails) return 2;
    return 1;
  }

  // ── Page 1 ────────────────────────────────────────────────────────────────
  function renderPage1(p, totalPages) {
    const stack = [
      chipsRow("Foundations", (p.foundations || []).map((i) => i)),
      chipsRow("Fields",      (p.fields      || []).map((i) => i)),
      chipsRow("Tools",       (p.tools       || []).map((i) => i)),
    ].filter(Boolean).join("");

    const outcomes = (p.outcomes || []).slice(0, 5);
    const lede = p.overview || p.one_liner || "";

    return `
      <section class="catalog__page" aria-label="Overview">
        ${runHead(p, 1, totalPages)}

        <span class="cat-topic">${escapeHtml(p.topic || "Catalog")}</span>

        <div class="cat-hero" style="margin-top: 16px;">
          <h1 class="cat-hero__title ${titleSizeClass(p.name)}">${escapeHtml(p.name)}</h1>
          ${lede ? `<p class="cat-hero__lede">${escapeHtml(lede)}</p>` : ""}
        </div>

        <div class="cat-stats">
          ${statCell("Duration", fmtDurationCompact(p))}
          ${statCell("Format",   fmtFormatCompact(p))}
          ${statCell("Timing",   fmtTimingCompact(p))}
          ${statCell("Per seat", fmtPrice(p))}
        </div>

        ${stack ? `<div class="cat-stack">${stack}</div>` : ""}

        ${outcomes.length ? `
          <div class="cat-section" style="margin-top: 32px;">
            <h2 class="cat-section__title">What you'll walk out with</h2>
            <ul class="cat-outcomes">
              ${outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        ${runFoot(p, 1, totalPages)}
      </section>`;
  }

  // ── Page 2 ────────────────────────────────────────────────────────────────
  function renderPage2(p, totalPages) {
    const modules = (p.modules && p.modules.length)
      ? p.modules
      : (p.structure || []).map((s, i) => ({
          title: s.phase_name,
          focus: s.focus,
          hours: s.hours,
          sessions: s.sessions,
          order: i + 1,
        }));

    const cohorts = (p.cohorts && p.cohorts.length)
      ? p.cohorts
      : (p.iterations || []).map((it, i) => ({
          label: `Cohort ${i + 1}`,
          dates: it.dates,
          status: i === 0 ? "Open" : "Filling",
        }));

    const year = (p.start_date || "").slice(0, 4) || "2026";

    return `
      <section class="catalog__page" aria-label="Curriculum">
        ${runHead(p, 2, totalPages)}

        ${modules.length ? `
          <span class="cat-eyebrow">Curriculum</span>
          <h2 class="cat-section__title" style="margin-bottom: 18px;">
            ${modules.length} module${modules.length === 1 ? "" : "s"} across ${escapeHtml(p.duration_label || "the program")}
          </h2>
          <div class="cat-modules">
            ${modules.map((m, i) => `
              <article class="cat-module">
                <div class="cat-module__num">${String(i + 1).padStart(2, "0")}</div>
                <div class="cat-module__body">
                  <div class="cat-module__meta">
                    ${m.hours ? `<span><b>${m.hours}</b> HRS</span>` : ""}
                    ${m.sessions ? `<span><b>${m.sessions}</b> SESSIONS</span>` : ""}
                  </div>
                  <h3 class="cat-module__title">${escapeHtml(m.title || m.phase_name || `Module ${i + 1}`)}</h3>
                  ${m.focus ? `<p class="cat-module__focus">${escapeHtml(m.focus)}</p>` : ""}
                </div>
              </article>
            `).join("")}
          </div>
        ` : ""}

        ${cohorts.length ? `
          <span class="cat-eyebrow" style="margin-top: 12px;">Cohorts ${escapeHtml(year)}</span>
          <h2 class="cat-section__title" style="margin-bottom: 6px;">${cohorts.length} open${cohorts.length === 1 ? "" : ""} ${cohorts.length === 1 ? "cohort" : "cohorts"}</h2>
          <div class="cat-cohorts">
            ${cohorts.map((c, i) => `
              <div class="cat-cohort ${i === 0 ? "is-next" : ""}">
                <span class="cat-cohort__no">${i === 0 ? "Next" : `Cohort ${i + 1}`}</span>
                <span class="cat-cohort__dates">${escapeHtml(c.dates || "")}</span>
                <span class="cat-cohort__tag">${i === 0 ? "Open" : escapeHtml(c.status || "Filling")}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        ${runFoot(p, 2, totalPages)}
      </section>`;
  }

  // ── Page 3 ────────────────────────────────────────────────────────────────
  function renderPage3(p, totalPages) {
    const keyvals = [
      ["Duration",      p.duration_label + (p.total_hours ? ` (${p.total_hours} hours)` : "")],
      ["Format",        [p.format, p.delivery_mode].filter(Boolean).join(" · ")],
      ["Schedule",      p.session_pattern || ""],
      ["Location",      p.location_url
                          ? `<a href="${escapeHtml(p.location_url)}">${escapeHtml(p.location_full || p.location || "")}</a>`
                          : escapeHtml(p.location_full || p.location || "")],
      ["Per seat",      (p.price_per_seat_kwd ? `KWD ${Number(p.price_per_seat_kwd).toLocaleString("en-GB")}` : "On request") + (p.group_rates ? " · group rates available" : "")],
      p.prereq_label ? ["Prerequisites", p.prereq_label] : null,
      p.classroom ? ["Classroom", p.classroom] : null,
    ].filter(Boolean);

    return `
      <section class="catalog__page" aria-label="Details">
        ${runHead(p, 3, totalPages)}

        <span class="cat-eyebrow">At a glance</span>
        <h2 class="cat-section__title">Logistics & enrollment</h2>
        <dl class="cat-keyvals">
          ${keyvals.map(([k, v]) => `
            <dt>${escapeHtml(k)}</dt>
            <dd>${v}</dd>
          `).join("")}
        </dl>

        ${p.audience_detail ? `
          <div class="cat-section">
            <h2 class="cat-section__title">Who this is for</h2>
            <p class="cat-text">${escapeHtml(p.audience_detail)}</p>
          </div>
        ` : ""}

        ${p.instructor && p.instructor.name ? `
          <div class="cat-section">
            <span class="cat-eyebrow">Your instructor</span>
            <div class="cat-instructor">
              <p class="cat-instructor__role">${escapeHtml(p.instructor.role || "")}</p>
              <p class="cat-instructor__name">${escapeHtml(p.instructor.name)}</p>
              ${p.instructor.bio ? `<p class="cat-instructor__bio">${escapeHtml(p.instructor.bio)}</p>` : ""}
            </div>
          </div>
        ` : ""}

        ${(p.faq && p.faq.length) ? `
          <div class="cat-section">
            <h2 class="cat-section__title">Frequently asked</h2>
            <div class="cat-faq">
              ${p.faq.slice(0, 3).map((q) => `
                <div class="cat-faq__item">
                  <p class="cat-faq__q">${escapeHtml(q.question)}</p>
                  <p class="cat-faq__a">${escapeHtml(q.answer)}</p>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <div class="cat-cta">
          <div>
            <p class="cat-cta__title">Ready to enrol your team?</p>
            <p class="cat-cta__sub">We'll come back with seat confirmation, the next available cohort, and the invoice.</p>
          </div>
          <a class="cat-cta__email" href="mailto:enterprise@joincoded.com?subject=${encodeURIComponent(`Enrollment inquiry: ${p.name}`)}">enterprise@joincoded.com</a>
        </div>

        ${runFoot(p, 3, totalPages)}
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
          <article class="catalog__page">
            <h1 class="cat-hero__title cat-hero__title--small">Catalog not found</h1>
            <p class="cat-hero__lede">No program matches "${escapeHtml(slug)}". <a href="#/">Browse all programs →</a></p>
          </article>
        </div>`;
      document.body.removeAttribute("data-catalog-ready");
      return;
    }

    const totalPages = decidePageCount(p);
    const topicCls = topicSlug(p.topic);

    app.innerHTML = `
      <div class="catalog-shell">
        <div class="catalog catalog--${escapeHtml(topicCls)}">
          ${renderPage1(p, totalPages)}
          ${totalPages >= 2 ? renderPage2(p, totalPages) : ""}
          ${totalPages >= 3 ? renderPage3(p, totalPages) : ""}
        </div>

        <div class="catalog-actions">
          <a class="btn btn-secondary" href="#/programs/${escapeHtml(p.slug)}">← Program page</a>
          <a class="btn btn-primary" href="assets/pdfs/${escapeHtml(p.slug)}.pdf" download>Download PDF</a>
        </div>
      </div>
    `;

    // Sentinel for Puppeteer: wait for body[data-catalog-ready="true"]
    // before capturing the PDF. Set after the next animation frame so the
    // browser has fully laid out + decoded fonts.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.setAttribute("data-catalog-ready", "true");
      });
    });

    window.scrollTo({ top: 0 });
  }

  function teardown() {
    document.body.classList.remove("has-catalog");
    document.body.removeAttribute("data-catalog-ready");
    document.title = "Programs · CODED";
  }

  // Topic class — apply to .catalog so the CSS rules can pick it up.
  // Surfaced on .catalog wrapper inside each render.

  window.renderCatalog = renderCatalog;
  window.teardownCatalog = teardown;
})();
