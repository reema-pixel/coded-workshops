/* CODED, Workshops landing
 * Standalone B2B catalog. Hash-based router: #/ for landing, #/programs/<slug> for detail.
 * No build step. Designed to map cleanly to Next.js App Router later.
 *
 * Inquiry path = mailto only. No modal, no form. CTA → email client.
 */

(function () {
  "use strict";

  const PROGRAMS = (window.CODED_PROGRAMS || []).filter(p => p.status === "Published");
  const ENTERPRISE_EMAIL = "enterprise@joincoded.com";

  // ---------------- Utilities ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const monthKey = (iso) => (iso ? iso.slice(0, 7) : "");

  // Parse every iteration's date string so the Month filter covers every month
  // a workshop runs in, not just its first cohort's start date.
  const MONTH_NAMES = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };
  function parseIterationMonth(dateStr, defaultYear) {
    if (!dateStr) return null;
    const m = dateStr.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/i);
    if (!m) return null;
    const monthNum = MONTH_NAMES[m[1].toLowerCase()];
    if (!monthNum) return null;
    const yr = dateStr.match(/\b(20\d{2})\b/);
    const year = yr ? yr[1] : (defaultYear || "2026");
    return `${year}-${String(monthNum).padStart(2, "0")}`;
  }
  function getProgramMonths(p) {
    const months = new Set();
    if (p.start_date) months.add(p.start_date.slice(0, 7));
    const defaultYear = p.start_date ? p.start_date.slice(0, 4) : "2026";
    (p.iterations || []).forEach(it => {
      const ym = parseIterationMonth(it.dates, defaultYear);
      if (ym) months.add(ym);
    });
    return Array.from(months);
  }

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

  const slugToProgram = (slug) => PROGRAMS.find(p => p.slug === (slug || "").toLowerCase());

  const fmtPrice = (kwd) => kwd ? `KWD ${kwd.toLocaleString("en-GB")} / seat` : "";

  // Extract just the clock time from a session_pattern string.
  // "Morning shift, 8am–3pm, five consecutive days" -> "8:00 AM – 3:00 PM"
  // "Sundays, Tuesdays · 5:00–8:45 PM · 3 sessions/week" -> "5:00 – 8:45 PM"
  function fmtTimingShort(pattern) {
    const m1 = pattern.match(/\b(\d{1,2})(am|pm)[–\-](\d{1,2})(am|pm)\b/i);
    if (m1) return `${m1[1]}:00 ${m1[2].toUpperCase()} – ${m1[3]}:00 ${m1[4].toUpperCase()}`;
    const m2 = pattern.match(/(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})\s*(AM|PM)/i);
    if (m2) return `${m2[1]} – ${m2[2]} ${m2[3].toUpperCase()}`;
    return pattern;
  }

  // Derive the day-of-week range from start/end dates, or parse from session_pattern for bootcamps.
  // Returns e.g. "Sun – Thu", "Sun – Tue", "Sun · Tue · Thu"
  const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function fmtDayRange(p) {
    if (p.format === "Bootcamp") {
      const sp = p.session_pattern || "";
      // "Sundays to Thursdays ..." → "Sun – Thu"
      const toMatch = sp.match(/(\w+day)s\s+to\s+(\w+day)s/i);
      if (toMatch) {
        const a = toMatch[1].slice(0, 3);
        const b = toMatch[2].slice(0, 3);
        return `${a} – ${b}`;
      }
      // "Sundays, Tuesdays, Thursdays ..." → "Sun · Tue · Thu"
      const listPart = sp.split("·")[0];
      const listed = listPart.match(/(\w+day)s/gi);
      if (listed) return listed.map(d => d.slice(0, 3)).join(" · ");
    }
    if (p.start_date && p.end_date) {
      const s = new Date(p.start_date + "T12:00:00");
      const e = new Date(p.end_date + "T12:00:00");
      if (s.toDateString() === e.toDateString()) return DAY_SHORT[s.getDay()];
      return `${DAY_SHORT[s.getDay()]} – ${DAY_SHORT[e.getDay()]}`;
    }
    return "";
  }

  // mailto link for a specific program (or generic if none).
  // Keeps the body short, with five quick-fill fields the buyer can complete
  // in their own client (Outlook, Apple Mail, Gmail) without leaving home.
  function mailtoFor(p) {
    const subject = p
      ? `Program inquiry: ${p.name}`
      : `B2B program inquiry`;
    const opening = p
      ? `We'd like to request seats in ${p.name} (${fmtDate(p.start_date)}${p.duration_label ? `, ${p.duration_label}` : ""}).`
      : `We'd like to learn more about CODED programs for our team.`;
    const lines = [
      "Hi CODED team,",
      "",
      opening,
      "",
      "• Name: ",
      "• Role: ",
      "• Company: ",
      "• Number of participants: ",
      "• Additional notes: ",
      "",
      "Thanks,",
    ].join("\n");
    const params = new URLSearchParams({ subject, body: lines });
    return `mailto:${ENTERPRISE_EMAIL}?${params.toString().replace(/\+/g, "%20")}`;
  }

  // ---------------- Inline SVG icons (replace emoji in cards/eyebrow) ----------------
  const ICON = {
    cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-7.2-7-12a7 7 0 1114 0c0 4.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    coin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9h4a2 2 0 010 4H9m0-4v8m0-4h6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    extlink: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M20 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h5"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
    /* Hero-strip icons (24×24 stroke set) */
    spark: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>',
    team: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="3.5"/><path d="M2.5 19c.6-3.4 3.3-5 6.5-5s5.9 1.6 6.5 5"/><circle cx="17" cy="8" r="2.6"/><path d="M21.5 16.5c-.4-2.5-2-3.8-4.5-3.8"/></svg>',
  };
  /* The hero-strip needs its icons sized larger than the meta-row icons ,
   * the inline width/height attributes already handle that (22×22). */

  // ---------------- Filter definitions ----------------
  const FILTER_DEFS = [
    {
      key: "topic", label: "Topic", multi: true,
      options: [
        "Agentic AI",
        "Data & Analytics",
        "AI Automation",
        "Cybersecurity",
        "Project Management & Agile",
      ],
    },
    {
      key: "format", label: "Duration", multi: true,
      options: [
        { value: "Workshop", label: "Workshop (1–5 days)" },
        { value: "Bootcamp", label: "Bootcamp (5–10 weeks)" },
      ],
    },
    {
      key: "shift", label: "Schedule", multi: true,
      options: [
        { value: "Morning", label: "Morning" },
        { value: "Evening", label: "Evening" },
      ],
    },
    {
      key: "audience", label: "Team", multi: true,
      options: [
        "Technical / IT",
        "Data & Analytics",
        "Finance & Accounting",
        "Marketing & Content",
        "Non-Technical",
      ],
    },
    {
      key: "month", label: "Month", multi: true,
      options: () => {
        // Union of every iteration's month across the entire catalog.
        const months = new Set();
        PROGRAMS.forEach(p => getProgramMonths(p).forEach(m => months.add(m)));
        const sorted = Array.from(months).sort();
        const today = new Date().toISOString().slice(0, 7);
        return sorted.filter(m => m >= today).map(m => {
          const [y, mo] = m.split("-");
          const d = new Date(`${y}-${mo}-01`);
          return { value: m, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
        });
      },
    },
  ];

  function durationBucket(p) {
    const lab = (p.duration_label || "").toLowerCase();
    if (lab.includes("10 week")) return "10-weeks";
    if (lab.includes("5 week")) return "5-weeks";
    if (lab.includes("week") || lab.includes("5 day")) return "5-day";
    if (lab.includes("3 day")) return "3-day";
    return "1-2-days";
  }

  // ---------------- Filter state in URL ----------------
  // `q` (free-text search) is a string filter that lives alongside the FILTER_DEFS.
  function readFilters() {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const out = {};
    FILTER_DEFS.forEach(d => {
      const v = params.get(d.key);
      if (!v) { out[d.key] = d.multi ? [] : null; return; }
      out[d.key] = d.multi ? v.split(",").filter(Boolean) : v;
    });
    out.q = params.get("q") || "";
    return out;
  }

  function writeFilters(filters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (k === "q") {
        if (typeof v === "string" && v.trim()) params.set("q", v.trim());
        return;
      }
      if (Array.isArray(v) && v.length) params.set(k, v.join(","));
      else if (typeof v === "string" && v) params.set(k, v);
    });
    const path = (location.hash.split("?")[0] || "#/") || "#/";
    const newHash = path + (params.toString() ? "?" + params.toString() : "");
    if (location.hash !== newHash) {
      history.replaceState(null, "", newHash);
    }
  }

  function countFilters(f) {
    let n = 0;
    FILTER_DEFS.forEach(d => {
      const v = f[d.key];
      if (Array.isArray(v)) n += v.length;
      else if (v) n += 1;
    });
    if (f.q && f.q.trim()) n += 1;
    return n;
  }

  // Free-text search: case-insensitive, every space-separated token must match somewhere
  // in the program's haystack (name, one-liner, topic, audience, instructor, tags).
  function matchesQuery(p, q) {
    if (!q) return true;
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const haystack = [
      p.name,
      p.one_liner,
      p.topic,
      (p.audience || []).join(" "),
      p.instructor && p.instructor.name,
      p.instructor && p.instructor.role,
      (p.tags || []).join(" "),
      p.duration_label,
    ].filter(Boolean).join(" ").toLowerCase();
    return tokens.every(t => haystack.includes(t));
  }

  function applyFilters(programs, filters) {
    return programs.filter(p => {
      if (filters.q && !matchesQuery(p, filters.q)) return false;
      if (filters.topic && filters.topic.length && !filters.topic.includes(p.topic)) return false;
      if (filters.format && filters.format.length && !filters.format.includes(p.format)) return false;
      if (filters.shift && filters.shift.length && !filters.shift.includes(p.shift)) return false;
      if (filters.audience && filters.audience.length && !filters.audience.some(a => (p.audience || []).includes(a))) return false;
      if (filters.month && filters.month.length) {
        const programMonths = getProgramMonths(p);
        if (!filters.month.some(m => programMonths.includes(m))) return false;
      }
      if (filters.duration && filters.duration.length && !filters.duration.includes(durationBucket(p))) return false;
      return true;
    }).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }

  function clearAllFilters() {
    const cleared = { q: "" };
    FILTER_DEFS.forEach(d => cleared[d.key] = d.multi ? [] : null);
    writeFilters(cleared);
    // sync DOM
    const search = document.getElementById("filterSearch");
    if (search) search.value = "";
    document.querySelectorAll("#filtersBar input").forEach(i => { i.checked = false; });
    refreshResults();
  }

  // ---------------- Landing renderers ----------------

  function renderLanding() {
    const app = $("#app");
    app.innerHTML = `
      <section class="hero">
        <img class="hero-circles" src="assets/brand/circles-navy-to-transparent.svg" alt="" aria-hidden="true" />
        <span class="hero-bracket-wrap hero-bracket-wrap--left">
          <img class="hero-bracket hero-bracket--left" src="assets/brand/d4XjMcpeBWOQtvHbaD2OCcQQU.avif" alt="" aria-hidden="true" />
        </span>
        <span class="hero-bracket-wrap hero-bracket-wrap--right">
          <img class="hero-bracket hero-bracket--right" src="assets/brand/AavaFcNfNC6v8x8NbnE08ibVHuA.avif" alt="" aria-hidden="true" />
        </span>
        <div class="container hero__inner">
          <div class="eyebrow"><span class="dot"></span><span>2026 Program Calendar</span></div>
          <h1>Enterprise Programs<br/>at CODED</h1>
          <p class="lede">In-person workshops and long-form bootcamps across AI, software, data, cybersecurity, product, and emerging technologies. Flexible seat-based enrollment for enterprises at CODED Campus.</p>
        </div>
      </section>

      <section class="intro-band">
        <div class="container intro-band__grid">
          <div class="intro-card reveal-up">
            <h3>Hands-On, Not Theory</h3>
            <p>Participants don't just learn concepts, they apply them through practical exercises and real-world projects.</p>
          </div>
          <div class="intro-card reveal-up delay-1">
            <h3>Flexible Enrollment</h3>
            <p>Enterprises can enroll one or multiple participants across a wide range of in-person programs.</p>
          </div>
          <div class="intro-card reveal-up delay-2">
            <h3>Built to Support L&amp;D Teams</h3>
            <p>We manage the full training experience, including attendee communication, onboarding, attendance, feedback collection, and post-program reporting.</p>
          </div>
        </div>
      </section>

      <section class="filters" id="filtersSection">
        <div class="container">
          <div class="filter-search-row">
            <label class="filter-search" for="filterSearch">
              <svg class="filter-search__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input id="filterSearch" type="search" autocomplete="off" placeholder="Search by topic or keyword (e.g. AI, Power BI, bootcamp)…" aria-label="Search programs" />
              <button type="button" class="filter-search__clear" id="filterSearchClear" aria-label="Clear search" hidden>×</button>
            </label>
            <button type="button" class="filters-toggle" id="filtersToggle" aria-expanded="false" aria-controls="filtersBar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4"/>
              </svg>
              <span>Filters</span>
              <span class="filters-toggle__count count" hidden>0</span>
            </button>
          </div>
          <div class="filters__inner" id="filtersBar"></div>
          <div class="filters__backdrop" id="filtersBackdrop" hidden></div>
          <div id="activeChips" class="active-chips" style="display:none;"></div>
        </div>
      </section>

      <section class="grid-section">
        <div class="container">
          <div id="resultsHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
            <span class="filter-results" id="resultsCount"></span>
            <span class="filter-results" id="sortLabel">Sorted by start date · soonest first</span>
          </div>
          <div id="cardGrid"></div>
        </div>
      </section>

      <section class="cta-banner">
        <div class="container">
          <div class="cta-banner__inner reveal-up">
            <img class="cta-dot" src="assets/brand/dot-pattern-white.svg" alt="" aria-hidden="true" />
            <img class="cta-lines" src="assets/brand/lines-2-A.svg" alt="" aria-hidden="true" />
            <div class="cta-banner__content">
              <h2>Need it tailored to your team instead?</h2>
              <p>For larger groups or company-specific use cases, CODED also runs custom programs end-to-end. Same hands-on methodology, scoped around your business.</p>
            </div>
            <a class="btn btn-primary btn-lg" href="mailto:${ENTERPRISE_EMAIL}?subject=Custom%20program%20inquiry">Email enterprise ${ICON.arrow}</a>
          </div>
        </div>
      </section>
    `;

    buildFilterBar();
    wireSearch();
    setupFiltersDrawer();
    refreshResults();
    document.title = "Programs · CODED";
    window.scrollTo({ top: 0 });
  }

  // ---------------- Mobile filters drawer ----------------
  function setupFiltersDrawer() {
    const toggle = $("#filtersToggle");
    const closeBtn = $("#filtersDrawerClose");
    const applyBtn = $("#filtersDrawerApply");
    const backdrop = $("#filtersBackdrop");
    if (!toggle) return;

    const open = () => {
      document.body.classList.add("filters-open");
      toggle.setAttribute("aria-expanded", "true");
      if (backdrop) backdrop.hidden = false;
    };
    const close = () => {
      document.body.classList.remove("filters-open");
      toggle.setAttribute("aria-expanded", "false");
      if (backdrop) backdrop.hidden = true;
    };

    toggle.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    applyBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    if (!setupFiltersDrawer._escHooked) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.body.classList.contains("filters-open")) {
          close();
        }
      });
      setupFiltersDrawer._escHooked = true;
    }
  }

  // ---------------- Search input ----------------
  function wireSearch() {
    const input = $("#filterSearch");
    const clearBtn = $("#filterSearchClear");
    if (!input) return;

    // Hydrate from URL
    const initial = readFilters();
    input.value = initial.q || "";
    if (clearBtn) clearBtn.hidden = !input.value;

    const onInput = () => {
      const f = readFilters();
      f.q = input.value;
      writeFilters(f);
      if (clearBtn) clearBtn.hidden = !input.value;
      refreshResults();
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) {
        input.value = "";
        onInput();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        input.value = "";
        input.focus();
        onInput();
      });
    }
  }

  // ---------------- Filter bar (built once per landing render) ----------------

  function buildFilterBar() {
    const bar = $("#filtersBar");
    if (!bar) return;
    /* Drawer header, only visible on mobile via CSS, but always in the DOM
       so close-from-inside works without re-rendering. */
    bar.innerHTML = `
      <header class="filters-drawer-head">
        <span class="filters-drawer-head__title">Filters</span>
        <button type="button" class="filters-drawer-head__close" id="filtersDrawerClose" aria-label="Close filters">×</button>
      </header>
    `;

    FILTER_DEFS.forEach(def => {
      const opts = typeof def.options === "function" ? def.options() : def.options;
      const wrapper = document.createElement("div");
      wrapper.className = "filter-group";
      wrapper.dataset.key = def.key;

      wrapper.innerHTML = `
        <button class="filter-button" type="button" aria-haspopup="true" aria-expanded="false">
          <span>${escapeHtml(def.label)}</span>
          <span class="count" hidden>0</span>
          <span class="chev" aria-hidden="true">▾</span>
        </button>
        <div class="filter-popover" role="group" aria-label="${escapeHtml(def.label)} options">
          ${opts.map(opt => {
            const value = typeof opt === "string" ? opt : opt.value;
            const label = typeof opt === "string" ? opt : opt.label;
            return `
              <label class="filter-option" data-value="${escapeHtml(value)}">
                <input type="${def.multi ? "checkbox" : "radio"}" name="${def.key}" value="${escapeHtml(value)}">
                <span>${escapeHtml(label)}</span>
              </label>`;
          }).join("")}
        </div>
      `;
      bar.appendChild(wrapper);
    });

    const clearBtn = document.createElement("button");
    clearBtn.className = "filter-clear";
    clearBtn.type = "button";
    clearBtn.textContent = "Clear all";
    clearBtn.id = "clearAllFilters";
    clearBtn.style.display = "none";
    clearBtn.addEventListener("click", clearAllFilters);
    bar.appendChild(clearBtn);

    /* Drawer footer, only visible on mobile via CSS. The Apply button just
       closes the drawer; results already update live as users tick options. */
    const drawerFoot = document.createElement("footer");
    drawerFoot.className = "filters-drawer-foot";
    drawerFoot.innerHTML = `
      <button type="button" class="btn btn-primary filters-drawer-apply" id="filtersDrawerApply">Show results</button>
    `;
    bar.appendChild(drawerFoot);

    $$(".filter-group", bar).forEach(group => {
      const btn = $(".filter-button", group);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = group.classList.contains("open");
        $$(".filter-group.open", bar).forEach(g => {
          g.classList.remove("open");
          $(".filter-button", g)?.setAttribute("aria-expanded", "false");
        });
        if (!wasOpen) {
          group.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && group.classList.contains("open")) {
          group.classList.remove("open");
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        }
      });
      $$("input", group).forEach(input => {
        input.addEventListener("change", () => {
          const def = FILTER_DEFS.find(d => d.key === group.dataset.key);
          const f = readFilters();
          if (def.multi) {
            const set = new Set(f[def.key]);
            if (input.checked) set.add(input.value); else set.delete(input.value);
            f[def.key] = Array.from(set);
          } else {
            const previous = f[def.key];
            f[def.key] = input.checked ? input.value : null;
            if (previous === input.value) {
              f[def.key] = null;
              input.checked = false;
            }
          }
          writeFilters(f);
          refreshResults();
        });
      });
    });

    // Hydrate from URL on first load
    const initial = readFilters();
    $$(".filter-group", bar).forEach(group => {
      const def = FILTER_DEFS.find(d => d.key === group.dataset.key);
      const v = initial[def.key];
      $$("input", group).forEach(input => {
        if (def.multi) input.checked = Array.isArray(v) && v.includes(input.value);
        else input.checked = v === input.value;
      });
    });

    if (!buildFilterBar._docHooked) {
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".filter-group")) {
          $$(".filter-group.open").forEach(g => {
            g.classList.remove("open");
            $(".filter-button", g)?.setAttribute("aria-expanded", "false");
          });
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          $$(".filter-group.open").forEach(g => {
            g.classList.remove("open");
            $(".filter-button", g)?.setAttribute("aria-expanded", "false");
          });
        }
      });
      buildFilterBar._docHooked = true;
    }
  }

  // ---------------- Refresh: results + chips + counts (no popover flicker) ----------------

  function refreshResults() {
    const filters = readFilters();
    const filtered = applyFilters(PROGRAMS, filters);

    FILTER_DEFS.forEach(def => {
      const group = $(`.filter-group[data-key="${def.key}"]`);
      if (!group) return;
      const v = filters[def.key];
      const n = Array.isArray(v) ? v.length : (v ? 1 : 0);
      const badge = $(".filter-button .count", group);
      const button = $(".filter-button", group);
      if (badge) {
        if (n > 0) {
          badge.textContent = n;
          badge.hidden = false;
          button?.classList.add("has-active");
        } else {
          badge.hidden = true;
          button?.classList.remove("has-active");
        }
      }
      $$(".filter-option", group).forEach(opt => {
        const input = $("input", opt);
        opt.classList.toggle("checked", !!input?.checked);
      });
    });

    const totalActive = countFilters(filters);
    const clearBtn = $("#clearAllFilters");
    if (clearBtn) clearBtn.style.display = totalActive > 0 ? "" : "none";

    /* Mobile drawer toggle: total-active badge + Apply button label */
    const toggleCount = $(".filters-toggle__count");
    if (toggleCount) {
      if (totalActive > 0) {
        toggleCount.textContent = totalActive;
        toggleCount.hidden = false;
      } else {
        toggleCount.hidden = true;
      }
    }
    const applyBtn = $("#filtersDrawerApply");
    if (applyBtn) {
      applyBtn.textContent = `Show ${filtered.length} program${filtered.length === 1 ? "" : "s"}`;
    }

    renderActiveChips(filters);

    const rc = $("#resultsCount");
    if (rc) {
      rc.textContent = `${filtered.length} program${filtered.length === 1 ? "" : "s"} ${totalActive === 0 ? "available" : "match your filters"}`;
    }

    const grid = $("#cardGrid");
    if (!grid) return;
    if (!filtered.length) {
      grid.classList.remove("grid");
      const queryLine = filters.q
        ? `<p>Nothing matches "<strong>${escapeHtml(filters.q)}</strong>" with the current filters.</p>`
        : `<p>Try widening your selection, or get in touch and we'll let you know when something fits.</p>`;
      grid.innerHTML = `
        <div class="empty">
          <h3>No programs match those filters yet.</h3>
          ${queryLine}
          <div class="empty__actions">
            <button type="button" class="btn btn-secondary" id="emptyClearBtn">Clear filters</button>
            <a class="btn btn-primary" href="mailto:${ENTERPRISE_EMAIL}?subject=Program%20notify-me">Email us ${ICON.arrow}</a>
          </div>
        </div>
      `;
      const ec = $("#emptyClearBtn");
      if (ec) ec.addEventListener("click", clearAllFilters);
      return;
    }
    grid.classList.add("grid");
    grid.innerHTML = filtered.map((p, i) => renderCard(p, i)).join("");
  }

  function renderActiveChips(filters) {
    const wrap = $("#activeChips");
    if (!wrap) return;
    const chips = [];

    // Search query chip first (if any)
    if (filters.q && filters.q.trim()) {
      chips.push({ key: "q", value: filters.q, label: `Search: "${filters.q}"` });
    }

    FILTER_DEFS.forEach(def => {
      const v = filters[def.key];
      const allOpts = typeof def.options === "function" ? def.options() : def.options;
      if (def.multi && Array.isArray(v) && v.length) {
        v.forEach(val => {
          const m = allOpts.find(o => (typeof o === "object" ? o.value : o) === val);
          const label = m ? (typeof m === "object" ? m.label : m) : val;
          chips.push({ key: def.key, value: val, label });
        });
      } else if (!def.multi && v) {
        const opt = allOpts.find(o => (typeof o === "object" ? o.value : o) === v);
        const label = opt ? (typeof opt === "object" ? opt.label : opt) : v;
        chips.push({ key: def.key, value: v, label });
      }
    });

    if (!chips.length) { wrap.style.display = "none"; wrap.innerHTML = ""; return; }
    wrap.style.display = "flex";
    wrap.innerHTML = chips.map(c =>
      `<span class="chip">${escapeHtml(c.label)} <button type="button" data-key="${escapeHtml(c.key)}" data-value="${escapeHtml(c.value)}" aria-label="Remove ${escapeHtml(c.label)} filter">×</button></span>`
    ).join("");

    $$("button", wrap).forEach(b => {
      b.addEventListener("click", () => {
        const f = readFilters();
        if (b.dataset.key === "q") {
          f.q = "";
          const search = $("#filterSearch");
          if (search) search.value = "";
          const sclear = $("#filterSearchClear");
          if (sclear) sclear.hidden = true;
        } else {
          const def = FILTER_DEFS.find(d => d.key === b.dataset.key);
          if (def.multi) f[def.key] = f[def.key].filter(x => x !== b.dataset.value);
          else f[def.key] = null;
          const group = $(`.filter-group[data-key="${def.key}"]`);
          if (group) {
            $$("input", group).forEach(input => {
              if (def.multi) input.checked = (f[def.key] || []).includes(input.value);
              else input.checked = f[def.key] === input.value;
            });
          }
        }
        writeFilters(f);
        refreshResults();
      });
    });
  }

  function renderCard(p, index) {
    const timingStr = [fmtTimingShort(p.session_pattern), fmtDayRange(p)].filter(Boolean).join(" · ");
    const timingPill = timingStr
      ? `<span class="pill audience">${escapeHtml(timingStr)}</span>`
      : "";
    const aria = `${p.name}, ${p.topic}, starts ${fmtDate(p.start_date)}, ${fmtPrice(p.price_per_seat_kwd)}`;
    const priceMain = p.price_per_seat_kwd
      ? `<span class="card__price">${escapeHtml(fmtPrice(p.price_per_seat_kwd))}</span>`
      : "";
    const priceTag = p.group_rates
      ? `<span class="card__price-tag">Group rates available</span>`
      : "";
    const priceLine = priceMain || priceTag
      ? `<div class="card__price-row">${priceMain}${priceTag}</div>`
      : "";
    return `
      <article class="card" style="--i:${index}">
        <a class="card__hit" href="#/programs/${escapeHtml(p.slug)}" aria-label="${escapeHtml(aria)}"></a>
        <div class="card__top">
          <span class="pill" data-topic="${escapeHtml(p.topic)}">${escapeHtml(p.topic)}</span>
        </div>
        <h3 class="card__title">${escapeHtml(p.name)}</h3>
        <p class="card__one-liner">${escapeHtml(p.one_liner)}</p>
        ${priceLine}
        <div class="card__meta">
          <span>${ICON.cal} ${escapeHtml("Starts " + fmtDate(p.start_date))}</span>
          <span>${ICON.clock} ${escapeHtml(p.duration_label)}</span>
          ${timingPill}
        </div>
        <span class="card__cta">View program ${ICON.arrow}</span>
      </article>
    `;
  }

  // ---------------- Detail page ----------------

  function renderDetail(slug) {
    const p = slugToProgram(slug);
    if (!p) {
      $("#app").innerHTML = `
        <section class="hero"><div class="container hero__inner">
          <div class="breadcrumb"><a href="#/">Home</a><span>/</span><a href="#/">Programs</a><span>/</span><span>Not found</span></div>
          <h1>Program not found</h1>
          <p class="lede">That program doesn't exist or is no longer published. <a href="#/" style="color: var(--accent); text-decoration: underline;">Browse all programs →</a></p>
        </div></section>
      `;
      return;
    }

    const audiencePills = (p.audience || []).map(a =>
      `<span class="pill audience">${escapeHtml(a)}</span>`
    ).join("");
    const priceDisplay = fmtPrice(p.price_per_seat_kwd);
    const groupRatesNote = p.group_rates
      ? `<div class="detail-meta__sub">Group rates available, email us</div>`
      : "";
    const groupRatesAside = p.group_rates
      ? `<small class="key-row__note">Group rates available, email us for the breakdown</small>`
      : "";
    const mailto = mailtoFor(p);
    const locationHtml = p.location_url
      ? `<a class="meta-link" href="${escapeHtml(p.location_url)}" target="_blank" rel="noopener">${escapeHtml(p.location || "CODED Campus")} ${ICON.extlink}</a>`
      : escapeHtml(p.location || "");

    document.title = `${p.name} · CODED Programs`;

    $("#app").innerHTML = `
      <section class="detail-hero">
        <img class="detail-dot-pattern" src="assets/brand/dot-pattern-navy.svg" alt="" aria-hidden="true" />
        <div class="container detail-hero__inner">
          <div class="breadcrumb">
            <a href="#/">Home</a><span>/</span>
            <a href="#/">Programs</a><span>/</span>
            <span>${escapeHtml(p.name)}</span>
          </div>
          <div class="detail-hero__pills">
            <span class="pill" data-topic="${escapeHtml(p.topic)}">${escapeHtml(p.topic)}</span>
            ${audiencePills}
          </div>
          <h1>${escapeHtml(p.name)}</h1>
          <p class="lede">${escapeHtml(p.one_liner)}</p>

          <div class="detail-meta-row">
            <div>
              <div class="detail-meta__label">Start date</div>
              <div class="detail-meta__value">${escapeHtml(fmtDate(p.start_date))}</div>
            </div>
            <div>
              <div class="detail-meta__label">Duration</div>
              <div class="detail-meta__value">${escapeHtml(p.duration_label)}</div>
            </div>
            <div>
              <div class="detail-meta__label">Per seat</div>
              <div class="detail-meta__value">${escapeHtml(priceDisplay || "On request")}</div>
              ${groupRatesNote}
            </div>
            <div>
              <div class="detail-meta__label">Format</div>
              <div class="detail-meta__value">${escapeHtml(p.delivery_mode)}</div>
            </div>
            <div>
              <div class="detail-meta__label">Timing</div>
              <div class="detail-meta__value">${escapeHtml(fmtTimingShort(p.session_pattern))}</div>
              <div class="detail-meta__sub">${escapeHtml(fmtDayRange(p))}</div>
            </div>
          </div>

          <div class="detail-hero__cta">
            <a class="btn btn-primary btn-lg" href="${escapeHtml(mailto)}">Request Seats &amp; Pricing ${ICON.arrow}</a>
            <a class="btn btn-secondary btn-lg" href="${escapeHtml(p.location_url || "#")}" target="_blank" rel="noopener">Location (CODED Campus) ${ICON.extlink}</a>
          </div>
        </div>
      </section>

      <!-- Centered Overview marquee, coded.kw style.
           Three scannable tiles, no long prose paragraph above them. -->
      <section class="detail-section detail-section--marquee is-soft reveal-up">
        <div class="container">
          <span class="eyebrow-tag">[ Overview ]</span>
          <h2>What You'll Walk Out With</h2>
          <ul class="overview-tiles overview-tiles--three">
            <li class="stagger-child"><h6>You'll build</h6><p>${escapeHtml(p.outcomes[0] || "")}</p></li>
            <li class="stagger-child"><h6>How we teach</h6><p>70 / 30 hands-on. Every session ships a working artefact.</p></li>
            <li class="stagger-child"><h6>Walk out with</h6><p>${escapeHtml(p.outcomes[p.outcomes.length - 1] || "")}</p></li>
          </ul>
        </div>
      </section>

      <!-- Curriculum band moved up: most important content, visible without deep scroll -->
      <section class="curriculum-band reveal-up">
        <div class="container">
          <div class="curriculum-band__head">
            <span class="eyebrow-tag is-light">[ Curriculum ]</span>
            <h2>${escapeHtml(p.name.replace(/\s+(Workshop|Bootcamp)$/i, "").trim())} Curriculum</h2>
            <p class="curriculum-band__lede">${escapeHtml(p.session_pattern)}. ${escapeHtml(p.duration_label)} total.</p>
          </div>
          <ol class="timeline timeline--dark">
            ${p.structure.map((ph, i) => {
              const parts = ph.phase_name.split(",");
              const head = (parts[0] || "").trim();
              const tail = parts.slice(1).join(",").trim();
              const step = tail ? head : `${p.format === "Bootcamp" ? "Module" : "Day"} ${i + 1}`;
              const title = tail || head;
              return `
                <li class="timeline__row">
                  <div class="timeline__rail" aria-hidden="true">
                    <span class="timeline__node"></span>
                    <span class="timeline__step">${escapeHtml(step)}</span>
                  </div>
                  <div class="timeline__body">
                    <h3 class="timeline__title">${escapeHtml(title)}</h3>
                    <div class="timeline__meta">${escapeHtml(String(ph.hours))} hrs · ${escapeHtml(String(ph.sessions))} session${ph.sessions === 1 ? "" : "s"}</div>
                    <p class="timeline__focus">${escapeHtml(ph.focus)}</p>
                  </div>
                </li>`;
            }).join("")}
          </ol>
        </div>
      </section>

      <!-- Detail grid, left rail (compact subsections), right rail (sticky aside) -->
      <div class="container">
        <div class="detail-grid" style="padding: var(--s-3) 0 0;">
          <div>
            <section class="detail-section reveal-up" style="padding-top:0;">
              <span class="eyebrow-tag">[ Audience ]</span>
              <h2>Who This Is For</h2>
              <div class="prose">
                <p>${escapeHtml(p.audience_detail)}</p>
              </div>
            </section>

            <section class="detail-section reveal-up">
              <span class="eyebrow-tag">[ Outcomes ]</span>
              <h2>What Attendees Walk Out With</h2>
              <ul class="outcomes">
                ${p.outcomes.map(o => `<li class="stagger-child">${escapeHtml(o)}</li>`).join("")}
              </ul>
            </section>

            <section class="detail-section reveal-up">
              <span class="eyebrow-tag">[ Schedule ]</span>
              <h2>Cohorts &amp; Dates</h2>
              <table class="iter-table">
                <thead><tr><th>Dates</th><th>Status</th></tr></thead>
                <tbody>
                  ${(p.iterations || []).map((it, i) => `
                    <tr class="stagger-child">
                      <td>${escapeHtml(it.dates)}</td>
                      <td>${i === 0 ? '<span style="color: var(--accent); font-weight: 600;">Next cohort</span>' : '<span style="color: var(--text-muted);">Open</span>'}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
              <p style="font-size: 13px; color: var(--text-muted); margin-top: 14px;">${escapeHtml(p.session_pattern)}</p>
            </section>

            <section class="detail-section reveal-up">
              <span class="eyebrow-tag">[ Method ]</span>
              <h2>How We Teach It</h2>
              <div class="method-block">
                <div>
                  <p><strong>70% hands-on, 30% theory.</strong> CODED's signature methodology runs through every program: short, focused inputs followed by long, deliberate practice on real artefacts.</p>
                  <p>Your people leave with something they built: a deployed dashboard, a working agent, a defended environment, a published playbook. Not slides they'll never reread.</p>
                </div>
                <figure class="ratio" aria-label="70 percent hands-on, 30 percent theory">
                  <div class="ratio__bar"><span style="--w: 70%"></span></div>
                  <figcaption class="ratio__caption">
                    <span><b>70</b>Hands-on</span>
                    <span><b>30</b>Theory</span>
                  </figcaption>
                </figure>
              </div>
            </section>

            <section class="detail-section ${p.faq && p.faq.length ? "" : "no-border"}">
              <span class="eyebrow-tag">[ FAQ ]</span>
              <h2>Frequently Asked</h2>
              <div class="faq">
                ${(p.faq && p.faq.length ? p.faq : defaultFaq()).map(q => `
                  <details class="stagger-child">
                    <summary>${escapeHtml(q.question)}</summary>
                    <p>${escapeHtml(q.answer)}</p>
                  </details>
                `).join("")}
              </div>
            </section>
          </div>

          <aside class="aside-stuck">
            <div class="aside-card">
              <h3>At a glance</h3>
              <div class="key-row"><span>Topic</span><span>${escapeHtml(p.topic)}</span></div>
              <div class="key-row is-price"><span>Per seat</span><span>${escapeHtml(priceDisplay || "On request")}${groupRatesAside}</span></div>
              <div class="key-row"><span>Duration</span><span>${escapeHtml(p.duration_label)}</span></div>
              <div class="key-row"><span>Total hours</span><span>${escapeHtml(String(p.total_hours))} hrs</span></div>
              <div class="key-row"><span>Timing</span><span>${escapeHtml(fmtTimingShort(p.session_pattern))}${fmtDayRange(p) ? ` · ${escapeHtml(fmtDayRange(p))}` : ""}</span></div>
              <div class="key-row"><span>Delivery</span><span>${escapeHtml(p.delivery_mode)}</span></div>
              <div class="key-row"><span>Location</span><span>${locationHtml}</span></div>
              <div class="key-row"><span>Next cohort</span><span>${escapeHtml(fmtDate(p.start_date))}</span></div>
              <a class="btn btn-primary btn-block" style="margin-top:18px;" href="${escapeHtml(mailto)}">Request Seats &amp; Pricing ${ICON.arrow}</a>
            </div>
          </aside>
        </div>
      </div>

      <section class="detail-close">
        <div class="container">
          <div class="detail-close__inner reveal-up">
            <h2>Ready to enroll your team?</h2>
            <p>Send us the headcount. We'll come back with seat confirmation, the next available cohort, and the invoice.</p>
            <a class="btn btn-primary btn-lg" href="${escapeHtml(mailto)}">Request Seats &amp; Pricing ${ICON.arrow}</a>
          </div>
        </div>
      </section>
    `;

    // Sticky mobile CTA
    const stickyMobile = $("#stickyCtaMobile");
    if (stickyMobile) {
      stickyMobile.style.display = "";
      const link = $("#stickyCtaLink");
      if (link) link.href = mailto;
    }

    // Course schema.org JSON-LD
    document.getElementById("courseLD")?.remove();
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "courseLD";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Course",
      name: p.name,
      description: p.one_liner,
      provider: { "@type": "Organization", name: "CODED", sameAs: "https://coded.kw" },
      offers: p.price_per_seat_kwd ? {
        "@type": "Offer",
        priceCurrency: "KWD",
        price: p.price_per_seat_kwd,
        category: "Per seat",
      } : undefined,
      hasCourseInstance: (p.iterations || []).map(it => ({
        "@type": "CourseInstance",
        courseMode: p.delivery_mode,
        location: p.location,
        startDate: p.start_date,
        endDate: p.end_date,
      })),
    });
    document.head.appendChild(ld);

    window.scrollTo({ top: 0 });
  }

  function defaultFaq() {
    return [
      { question: "Are seats limited?", answer: "Yes. Workshops cap at 20–33 seats; bootcamps cap based on classroom (typically 20–35) to preserve hands-on time." },
      { question: "Can we book just one seat?", answer: "Yes. Seats are sold individually. Same per-seat price whether you send one person or fifteen." },
      { question: "What's the language of instruction?", answer: "English by default, with Kuwaiti Arabic instructor support throughout." },
      { question: "What's the refund policy?", answer: "Full refund up to 14 days before the program start date. Within 14 days, we offer a credit toward the next iteration." },
    ];
  }

  // ---------------- Scroll-triggered reveals ----------------
  // Uses one shared IntersectionObserver, recreated per route render so we
  // pick up the freshly-rendered .reveal-up + .timeline__row elements
  // without leaking observers across renders.
  let revealObserver = null;
  function setupReveals() {
    if (revealObserver) revealObserver.disconnect();
    const targets = $$(".reveal-up, .timeline__row, .stagger-child");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach(el => el.classList.add("is-in"));
      return;
    }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    targets.forEach(el => revealObserver.observe(el));
  }

  // Header gains a subtle shadow once user has scrolled past 8px.
  function setupHeaderScroll() {
    const header = document.querySelector(".site-header");
    if (!header || setupHeaderScroll._wired) return;
    setupHeaderScroll._wired = true;
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------------- Router ----------------
  function route() {
    // Reset transient UI on every route change
    const stickyMobile = $("#stickyCtaMobile");
    if (stickyMobile) stickyMobile.style.display = "none";
    document.getElementById("courseLD")?.remove();

    const hash = location.hash || "#/";
    const path = hash.split("?")[0];
    if (path.startsWith("#/programs/")) {
      const slug = path.replace("#/programs/", "").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
      renderDetail(slug);
    } else {
      renderLanding();
    }
    setupReveals();
  }

  // ---------------- Init ----------------
  document.addEventListener("DOMContentLoaded", () => {
    setupHeaderScroll();
    route();
    window.addEventListener("hashchange", route);
  });
})();
