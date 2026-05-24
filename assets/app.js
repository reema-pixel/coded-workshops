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
  // Drops redundant ":00" minutes, and uses non-breaking spaces inside the
  // value so it never wraps mid-time (we used to see PM drop to the next
  // line in narrow columns).
  //   "Morning shift, 8am–3pm, ..."        -> "8 AM – 3 PM"
  //   "Sundays · 5:00–8:45 PM · ..."        -> "5 – 8:45 PM"
  //   "5:30am–8:00pm"                       -> "5:30 AM – 8 PM"
  function fmtTimingShort(pattern) {
    if (!pattern) return "";
    const NBSP = " ";
    const trimZero = (h, m) => (!m || m === "00") ? h : `${h}:${m}`;
    // AM/PM on both sides: "8am–2pm" / "8:30am–4pm"
    const m1 = pattern.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[–\-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (m1) {
      const left  = `${trimZero(m1[1], m1[2])}${NBSP}${m1[3].toUpperCase()}`;
      const right = `${trimZero(m1[4], m1[5])}${NBSP}${m1[6].toUpperCase()}`;
      return `${left}${NBSP}–${NBSP}${right}`;
    }
    // Single AM/PM suffix: "5:00–8:45 PM"
    const m2 = pattern.match(/(\d{1,2})(?::(\d{2}))?\s*[–\-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (m2) {
      const left  = trimZero(m2[1], m2[2]);
      const right = trimZero(m2[3], m2[4]);
      return `${left}${NBSP}–${NBSP}${right}${NBSP}${m2[5].toUpperCase()}`;
    }
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
    /* View-toggle icons (16×16) */
    viewGrid: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>',
    viewList: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>',
    viewCal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2"/></svg>',
  };

  /* ── Per-program glyphs ─────────────────────────────────────────────────
   * Each program gets a topic-themed glyph (line icon) OR a real brand
   * mark in the brand's actual colors (Power BI yellow, Power Automate blue,
   * NVIDIA green, n8n red). The container tile picks up the topic color
   * via CSS for the non-branded ones (data-brand="false").
   */
  const ICONS_PROGRAM = {
    "cybersecurity-bootcamp": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.5 8.5-8 9.5-4.5-1-8-5-8-9.5V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
    },
    "ai-app-developer-bootcamp": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r="0.6" fill="currentColor"/><circle cx="9" cy="6.5" r="0.6" fill="currentColor"/><path d="M12 13l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/></svg>',
    },
    "ai-and-data-science-bootcamp": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V8M4 20h16"/><path d="M8 20v-5M12 20v-8M16 20v-4"/><path d="M19 3l.7 1.8 1.8.7-1.8.7L19 8l-.7-1.8L16.5 5.5l1.8-.7z"/></svg>',
    },
    "agentic-ai-workshop": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="7" r="2.4"/><circle cx="19" cy="7" r="2.4"/><circle cx="12" cy="17.5" r="2.4"/><path d="M7 8.4l4 7M17 8.4l-4 7"/></svg>',
    },
    "ai-in-content-creation-and-marketing": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14V10c0-.6.4-1 1-1h2.5l8.5-4.5v15L6.5 15H4c-.6 0-1-.4-1-1z"/><path d="M19 8.5l.6 1.4 1.4.6-1.4.6L19 12.5l-.6-1.4L17 10.5l1.4-.6z"/></svg>',
    },
    "scrum-master-exam-prep": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 11-3.5-7.1"/><path d="M21 4v5h-5"/><path d="M9 12l2.2 2.2L15 10.5"/></svg>',
    },
    "power-bi-workshop": {
      brand: true,
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="4.5" height="8" rx="0.6" fill="#F2C811"/><rect x="9.75" y="8" width="4.5" height="13" rx="0.6" fill="#F2C811"/><rect x="16.5" y="3" width="4.5" height="18" rx="0.6" fill="#F2C811"/></svg>',
    },
    "intro-ai-for-finance": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5C14 8.2 12.7 7.8 11.5 7.8c-1.4 0-2.7.6-2.7 1.9s1.1 1.7 2.7 1.9c1.6.2 2.8.7 2.8 2s-1.3 2-2.8 2c-1.3 0-2.6-.5-3.1-1.9"/><path d="M11.5 6v1.8M11.5 16.2V18"/></svg>',
    },
    "data-analytics-and-sql": {
      brand: false,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.2"/><path d="M4.5 5.5v6c0 1.2 3.4 2.2 7.5 2.2s7.5-1 7.5-2.2v-6"/><path d="M4.5 11.5v6c0 1.2 3.4 2.2 7.5 2.2s7.5-1 7.5-2.2v-6"/></svg>',
    },
    "power-automate": {
      brand: true,
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L5 12.5h5.5l-1 9.5L18 11h-5.5z" fill="#0066FF"/></svg>',
    },
    "nvidia-genai-and-llm-certification": {
      brand: true,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#76B900" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12c0-3.3 2.5-6 6-6 2.5 0 4 1 5 2.5"/><path d="M19 12c0 3.3-2.5 6-6 6-2.5 0-4-1-5-2.5"/><circle cx="12" cy="12" r="2.2" fill="#76B900" stroke="none"/></svg>',
    },
  };

  function programIconHtml(p) {
    const def = ICONS_PROGRAM[p.slug];
    if (!def) {
      // Fallback: generic sparkle in topic color
      return '<span class="prog-icon" data-brand="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l1.5 4 4 1.5-4 1.5L12 15l-1.5-4-4-1.5 4-1.5z"/></svg></span>';
    }
    return `<span class="prog-icon" data-brand="${def.brand ? "true" : "false"}">${def.svg}</span>`;
  }

  // Days-until-start, for FOMO badge. Returns {days, label, urgency}
  function daysUntil(iso) {
    if (!iso) return null;
    const start = new Date(iso + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ms = start.getTime() - today.getTime();
    const days = Math.round(ms / 86400000);
    if (days < 0)  return { days, label: "In progress",       urgency: "past" };
    if (days === 0) return { days, label: "Starts today",     urgency: "now" };
    if (days === 1) return { days, label: "Starts tomorrow",  urgency: "now" };
    if (days <= 7)  return { days, label: `${days} days left`, urgency: "soon" };
    if (days <= 21) return { days, label: `${days} days left`, urgency: "warm" };
    return                  { days, label: `${days} days left`, urgency: "calm" };
  }

  const MONTH_LONG = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"];
  function monthLabel(ym) {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    return `${MONTH_LONG[parseInt(m, 10) - 1]} ${y}`;
  }
  /* The hero-strip needs its icons sized larger than the meta-row icons ,
   * the inline width/height attributes already handle that (22×22). */

  // ---------------- Filter definitions ----------------
  const FILTER_DEFS = [
    {
      key: "topic", label: "Topic", multi: true,
      options: [
        "Agentic AI",
        "Data Science & Analysis",
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
    const todayISO = new Date().toISOString().slice(0, 10);
    return programs.filter(p => {
      if (p.start_date && p.start_date < todayISO) return false;
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
    const clearBtn = document.getElementById("filterSearchClear");
    if (clearBtn) clearBtn.hidden = true;
    document.querySelectorAll("#filtersBar input").forEach(i => { i.checked = false; });
    refreshResults();
  }

  // ---------------- Landing renderers ----------------

  function renderLanding() {
    const app = $("#app");
    app.innerHTML = `
      <section class="hero hero--dark">
        <div class="hero-bg" aria-hidden="true">
          <div class="hero-bg__noise"></div>
          <div class="hero-bg__lights"></div>
          <div class="hero-bg__grid"></div>
          <div class="hero-bg__orb hero-bg__orb--a"></div>
          <div class="hero-bg__orb hero-bg__orb--b"></div>
          <div class="hero-bg__orb hero-bg__orb--c"></div>
        </div>
        <img class="hero-circles" src="assets/brand/circles-white-to-faded.svg" alt="" aria-hidden="true" />
        <span class="hero-bracket-wrap hero-bracket-wrap--left">
          <img class="hero-bracket hero-bracket--left" src="assets/brand/bracket-onyx.png" alt="" aria-hidden="true" />
        </span>
        <span class="hero-bracket-wrap hero-bracket-wrap--right">
          <img class="hero-bracket hero-bracket--right" src="assets/brand/bracket-onyx.png" alt="" aria-hidden="true" />
        </span>
        <div class="container hero__inner">
          <div class="eyebrow eyebrow--light"><span>CODED For Companies · 2026</span></div>
          <h1>CODED Training<br/>For <span class="accent-soft hero-cycle" id="heroCycleWord">Companies</span><span class="hero-cycle-caret" aria-hidden="true"></span></h1>
          <p class="lede lede--light">Hands-on bootcamps and workshops for enterprise teams.</p>
          <form class="hero-prompt" id="heroPrompt" autocomplete="off" novalidate aria-label="Quick concierge">
            <span class="hero-prompt__label" id="heroPromptLabel" aria-live="polite">What does your company do?</span>
            <input class="hero-prompt__input" id="heroPromptInput" type="text" required />
            <button type="submit" class="hero-prompt__send" aria-label="Continue">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
            <span class="hero-prompt__steps" id="heroPromptSteps" aria-hidden="true">
              <span class="dot is-active"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </span>
          </form>
          <a class="hero-scroll" href="#filtersSection" aria-label="Scroll to programs">
            <span class="hero-scroll__label">Or browse the catalog</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          </a>
        </div>
      </section>

      <!-- Trusted-by strip hidden until real client logos are dropped into
           assets/brand/clients/ (see README there). To re-enable, restore the
           <section class="trusted-strip"> block. -->

      <section class="intro-band">
        <div class="container intro-band__inner">
          <div class="intro-band__head">
            <span class="eyebrow"><span>Why partner with CODED</span></span>
            <h2>Training your team will <em>actually use</em>.</h2>
            <p>We've been teaching the people who run Kuwait's banks, telcos, ministries, and operators since 2019 — and we still teach every cohort like it's our first.</p>
          </div>
          <div class="intro-band__grid">
            <div class="intro-card reveal-up">
              <span class="intro-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h12M3 12h18M3 17h12"/><circle cx="20" cy="7" r="1.6" fill="currentColor"/><circle cx="20" cy="17" r="1.6" fill="currentColor"/></svg>
              </span>
              <h3>70% hands-on</h3>
              <p>Every session ends with something built — code, a dashboard, a defended environment. Not slides they'll never reopen.</p>
            </div>
            <div class="intro-card reveal-up delay-1">
              <span class="intro-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/></svg>
              </span>
              <h3>Send one or thirty</h3>
              <p>Same program, group pricing kicks in from 6 seats. Mix and match across the catalog if you'd rather split tracks.</p>
            </div>
            <div class="intro-card reveal-up delay-2">
              <span class="intro-card__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.8 6.7 19.2l1.2-5.9-4.5-4.1 6-.7z"/></svg>
              </span>
              <h3>One contact, one report</h3>
              <p>We handle invites, attendance, feedback, and the wrap-up report. Your L&amp;D team gets one weekly update — not a Slack of vendor questions.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="impact-band" aria-label="Impact in numbers">
        <img class="impact-band__dots" src="assets/brand/dot-pattern-white.svg" alt="" aria-hidden="true" />
        <img class="impact-band__lines" src="assets/brand/lines-3-A.svg" alt="" aria-hidden="true" />
        <div class="container impact-band__inner">
          <div class="impact-band__head">
            <span class="eyebrow eyebrow--light"><span>Since 2019</span></span>
            <h2>The numbers our partners <em>come back for</em>.</h2>
            <p>Cumulative across all partner engagements — banks, telcos, ministries, family offices, and a handful of unicorns. Public clients listed on request.</p>
          </div>
          <div class="impact-band__stats">
            <div class="impact-stat reveal-up">
              <span class="impact-stat__num" data-count="8500" data-suffix="+">8,500<i class="impact-stat__plus">+</i></span>
              <span class="impact-stat__label">Professionals trained</span>
              <span class="impact-stat__hint">Across 50+ partner organizations</span>
            </div>
            <div class="impact-stat reveal-up delay-1">
              <span class="impact-stat__num" data-count="220" data-suffix="+">220<i class="impact-stat__plus">+</i></span>
              <span class="impact-stat__label">Programs delivered</span>
              <span class="impact-stat__hint">From half-day workshops to multi-month academies</span>
            </div>
            <div class="impact-stat reveal-up delay-2">
              <span class="impact-stat__num" data-count="95" data-suffix="%">95<i class="impact-stat__plus">%</i></span>
              <span class="impact-stat__label">Satisfaction rate</span>
              <span class="impact-stat__hint">Average post-program NPS, 2021–2025</span>
            </div>
          </div>
        </div>
      </section>

      <section class="catalog-header" aria-label="2026 calendar">
        <div class="container catalog-header__inner">
          <h2>2026 Calendar</h2>
          <p>Pick a program, request seats — we'll come back within one business day with availability and group pricing. All on-campus, Free Trade Zone, Kuwait.</p>
        </div>
      </section>

      <section class="filters filters--simple filters--centered" id="filtersSection">
        <div class="container">
          <div class="filter-search-row">
            <label class="filter-search" for="filterSearch">
              <svg class="filter-search__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input id="filterSearch" type="search" autocomplete="off" placeholder="Search programs (e.g. AI, Power BI, cybersecurity)…" aria-label="Search programs" />
              <button type="button" class="filter-search__clear" id="filterSearchClear" aria-label="Clear search" hidden>×</button>
            </label>
          </div>
          <div class="quick-filters" id="quickFilters" role="toolbar" aria-label="Quick filters"></div>
          <div id="activeChips" class="active-chips" style="display:none;"></div>
        </div>
      </section>

      <!-- Featured rotator: cycles through the top picks, one at a time. -->
      <section class="featured-rotator" id="featuredRotator" aria-label="Featured program">
        <div class="container">
          <div class="featured-rotator__head">
            <span class="featured-rotator__eyebrow">
              <span class="featured-rotator__pulse" aria-hidden="true"></span>Featured · top picks
            </span>
            <div class="featured-rotator__dots" id="featuredRotatorDots" role="tablist" aria-label="Featured program selector"></div>
          </div>
          <div class="featured-rotator__viewport" id="featuredRotatorViewport" aria-live="polite"></div>
        </div>
      </section>

      <section class="grid-section" id="gridSection">
        <div class="container">
          <div id="resultsHeader" class="results-header results-header--simple">
            <span class="filter-results" id="resultsCount"></span>
            <span class="filter-results" id="sortLabel">Grouped by month · soonest first</span>
          </div>
          <div id="cardGrid"></div>
        </div>
      </section>

      <!-- Floating duplicate of the view toggle. Appears while #gridSection is in view. -->
      <div class="view-toggle-floating" id="viewToggleFloating" aria-hidden="true">
        <div class="view-toggle view-toggle--lg" role="tablist" aria-label="View mode (floating)" data-view-toggle="floating">
          <button type="button" class="view-toggle__btn is-active" data-view="grid" role="tab" aria-selected="true">
            ${ICON.viewGrid} <span>Grid</span>
          </button>
          <button type="button" class="view-toggle__btn" data-view="schedule" role="tab" aria-selected="false">
            ${ICON.viewList} <span>Schedule</span>
          </button>
          <button type="button" class="view-toggle__btn" data-view="calendar" role="tab" aria-selected="false">
            ${ICON.viewCal} <span>Calendar</span>
          </button>
        </div>
      </div>

      <section class="faq-section" aria-label="Frequently asked questions">
        <div class="container faq-section__inner">
          <aside class="faq-section__aside">
            <span class="eyebrow"><span>Answers for HR &amp; L&amp;D teams</span></span>
            <h2>Questions we hear from L&amp;D and procurement.</h2>
            <p>Five questions we get on almost every call. Don't see yours?</p>
            <a class="btn btn-secondary" href="#/enterprise">Ask us directly
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </aside>
          <div class="faq faq--landing">
            <details open>
              <summary>Who are these programs for?</summary>
              <p>Two main groups: enterprises upskilling existing teams, and orgs onboarding new graduate or junior cohorts. We run both technical and non-technical tracks — finance, marketing, and operations included.</p>
            </details>
            <details>
              <summary>Can you tailor the program to our team?</summary>
              <p>Yes — every engagement starts with a scoping call. We adjust the level, the stack, the case studies, and the schedule. No recycled decks.</p>
            </details>
            <details>
              <summary>What topics do you cover?</summary>
              <p>Software, data &amp; AI, cybersecurity, cloud, project management, and AI for non-technical teams. The catalog above is the public 2026 set — we also build custom programs.</p>
            </details>
            <details>
              <summary>Where is it taught, and by whom?</summary>
              <p>On-site at CODED Campus (Free Trade Zone), at your offices, or hybrid. Every session is led by a working practitioner — not a contractor reading from a deck.</p>
            </details>
            <details>
              <summary>How do you report outcomes back to L&amp;D?</summary>
              <p>Every program ends with a deliverable (a deployed app, a defended environment, a working dashboard) plus an outcomes report — attendance, assessment scores, and the learner artefacts. Hand it straight to L&amp;D.</p>
            </details>
          </div>
        </div>
      </section>

      <section class="cta-banner cta-banner--final">
        <div class="container">
          <div class="cta-banner__inner reveal-up">
            <img class="cta-dot" src="assets/brand/dot-pattern-white.svg" alt="" aria-hidden="true" />
            <img class="cta-lines" src="assets/brand/lines-2-A.svg" alt="" aria-hidden="true" />
            <div class="cta-banner__content">
              <span class="eyebrow eyebrow--light"><span>One business day to a proposal</span></span>
              <h2>Let's design a program your team will actually remember.</h2>
              <p>Tell us about the team, the timing, and the outcome you want. We'll come back within one business day with a written proposal — pricing, dates, and the curriculum we'd run.</p>
            </div>
            <a class="btn btn-primary btn-lg" href="#/enterprise">Request a proposal ${ICON.arrow}</a>
          </div>
        </div>
      </section>
    `;

    buildQuickFilters();
    wireSearch();
    setupHeroPrompt();
    setupHeroCycle();
    renderTrustedLogos();
    renderFeaturedRotator();
    setupViewToggle();
    setupHelperChat();
    refreshResults();
    document.title = "Programs · CODED";
    window.scrollTo({ top: 0 });
  }

  // Logo wall of partner companies. Each tile resolves to assets/brand/clients/<slug>.svg
  // (drop the SVG/PNG files in that folder). If the image is missing, a styled
  // wordmark fallback renders so the strip never looks broken.
  const TRUSTED_LOGOS = [
    { slug: "kfh",            name: "Kuwait Finance House" },
    { slug: "nbk",            name: "National Bank of Kuwait" },
    { slug: "zain",           name: "Zain" },
    { slug: "boursa-kuwait",  name: "Boursa Kuwait" },
    { slug: "kipco",          name: "KIPCO" },
    { slug: "kfas",           name: "KFAS" },
    { slug: "agility",        name: "Agility" },
    { slug: "stc",            name: "stc" },
    { slug: "burgan-bank",    name: "Burgan Bank" },
    { slug: "gulf-bank",      name: "Gulf Bank" },
    { slug: "boubyan-bank",   name: "Boubyan Bank" },
    { slug: "pwc",            name: "PwC" },
  ];
  function renderTrustedLogos() {
    const track = document.getElementById("trustedTrack");
    if (!track) return;
    const tile = (logo, dup = false) => `
      <span class="trusted-logo"${dup ? ' aria-hidden="true"' : ""}>
        <img src="assets/brand/clients/${escapeHtml(logo.slug)}.svg"
             alt="${escapeHtml(logo.name)}"
             loading="lazy"
             onerror="this.parentNode.classList.add('trusted-logo--fallback');this.remove();"/>
        <span class="trusted-logo__fallback">${escapeHtml(logo.name)}</span>
      </span>
    `;
    track.innerHTML =
      TRUSTED_LOGOS.map(l => tile(l)).join("") +
      TRUSTED_LOGOS.map(l => tile(l, true)).join("");
  }

  // ---------------- Quick-filter chips ----------------
  // Single-tap filter shortcuts that map to the existing filter state.
  // Toggleable: clicking a chip already-active clears it.
  const QUICK_FILTERS = [
    {
      id: "ai",
      label: "AI training",
      icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l1.4 3.6L17 9l-3.6 1.4L12 14l-1.4-3.6L7 9l3.6-1.4z"/><circle cx="18.5" cy="17.5" r="1.6"/><circle cx="5.5" cy="17.5" r="1.6"/></svg>',
      apply: { topic: ["Agentic AI", "AI Automation", "AI Productivity"] },
    },
    {
      id: "bootcamps",
      label: "Bootcamps",
      icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l9 4-9 4-9-4 9-4z"/><path d="M21 6v6c0 1.7-4 3-9 3s-9-1.3-9-3V6"/></svg>',
      apply: { format: ["Bootcamp"] },
    },
    {
      id: "quick",
      label: "Quick (≤1 week)",
      icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 10-13h-7l1-7z"/></svg>',
      apply: { format: ["Workshop"] },
    },
    {
      id: "soon",
      label: "Starting soon",
      icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
      // Computed at apply-time — next 2 calendar months including current
      apply: () => {
        const now = new Date();
        const ms = [];
        for (let i = 0; i < 2; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          ms.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        return { month: ms };
      },
    },
  ];

  function quickFilterIsActive(qf, filters) {
    const apply = typeof qf.apply === "function" ? qf.apply() : qf.apply;
    return Object.entries(apply).every(([k, v]) => {
      const cur = filters[k];
      if (!Array.isArray(v)) return cur === v;
      if (!Array.isArray(cur) || !cur.length) return false;
      return v.every(x => cur.includes(x));
    });
  }

  function buildQuickFilters() {
    const host = $("#quickFilters");
    if (!host) return;
    const filters = readFilters();
    host.innerHTML = QUICK_FILTERS.map(qf => {
      const active = quickFilterIsActive(qf, filters);
      return `
        <button type="button" class="quick-chip${active ? " is-active" : ""}" data-quick-id="${qf.id}" aria-pressed="${active}">
          ${qf.icon}<span>${escapeHtml(qf.label)}</span>
        </button>
      `;
    }).join("") + `
      <button type="button" class="quick-chip quick-chip--reset" id="quickFilterReset" hidden>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0114-7L20 8M20 3v5h-5"/></svg>
        <span>Show all</span>
      </button>
    `;
    host.querySelectorAll(".quick-chip[data-quick-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const qf = QUICK_FILTERS.find(x => x.id === btn.dataset.quickId);
        if (!qf) return;
        const f = readFilters();
        const apply = typeof qf.apply === "function" ? qf.apply() : qf.apply;
        const active = quickFilterIsActive(qf, f);
        if (active) {
          // Toggle off — clear only the keys this chip set
          Object.keys(apply).forEach(k => { f[k] = []; });
        } else {
          // Apply — but in a chip-exclusive way, replace conflicting keys
          Object.entries(apply).forEach(([k, v]) => { f[k] = Array.isArray(v) ? v.slice() : v; });
        }
        writeFilters(f);
        refreshResults();
      });
    });
    const resetBtn = $("#quickFilterReset");
    if (resetBtn) resetBtn.addEventListener("click", clearAllFilters);
  }

  function refreshQuickFiltersState() {
    const filters = readFilters();
    const anyActive =
      (filters.q && filters.q.trim()) ||
      FILTER_DEFS.some(d => {
        const v = filters[d.key];
        return Array.isArray(v) ? v.length > 0 : !!v;
      });
    $$(".quick-chip[data-quick-id]").forEach(btn => {
      const qf = QUICK_FILTERS.find(x => x.id === btn.dataset.quickId);
      if (!qf) return;
      const active = quickFilterIsActive(qf, filters);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const reset = $("#quickFilterReset");
    if (reset) reset.hidden = !anyActive;
  }

  // ---------------- Helper chat (program finder) ----------------
  // A small chat-style assistant in the bottom-right corner. Three short
  // conversational steps map to the existing filter state, then we apply
  // and close. The conversation is also the entry point for "I don't know
  // what to choose, help me."
  const CHAT_STEPS = [
    {
      key: "team",
      prompt: "Who's the training for?",
      options: [
        { label: "Developers / Tech team",  patch: { audience: ["Technical / IT"] } },
        { label: "Data & Analytics",        patch: { audience: ["Data & Analytics"] } },
        { label: "Marketing / Content",     patch: { audience: ["Marketing & Content"] } },
        { label: "Finance team",            patch: { audience: ["Finance & Accounting"] } },
        { label: "Security team",           patch: { topic: ["Cybersecurity"] } },
        { label: "Project / Agile leads",   patch: { topic: ["Project Management & Agile"] } },
        { label: "Open to anything",        patch: {} },
      ],
    },
    {
      key: "time",
      prompt: "How much time can they commit?",
      options: [
        { label: "A few days",            patch: { format: ["Workshop"] } },
        { label: "Several weeks",         patch: { format: ["Bootcamp"] } },
        { label: "Either works",          patch: {} },
      ],
    },
    {
      key: "when",
      prompt: "When does it need to happen?",
      options: [
        // __whenMonths is inclusive of the current month, so 2 ≈ "next ~60 days"
        // and 3 ≈ "next ~90 days". The semantics matter because the catalog
        // is sparse some months — a too-narrow "ASAP" returns zero matches.
        { label: "Within ~60 days",        patch: { __whenMonths: 2 } },
        { label: "Within 3 months",        patch: { __whenMonths: 3 } },
        { label: "Later this year",        patch: { __whenMonths: 12 } },
        { label: "Flexible",               patch: {} },
      ],
    },
  ];

  function nextMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }

  function setupHelperChat() {
    const chat = $("#helperChat");
    if (!chat) return;
    const launcher = $("#helperChatLauncher");
    const closer = $("#helperChatClose");
    const body = $("#helperChatBody");
    const foot = $("#helperChatFoot");

    // State machine
    let stepIndex = 0;
    const answers = {};      // chosen options keyed by step.key
    const pendingPatch = {}; // accumulated filter patch

    function openChat() {
      chat.dataset.open = "true";
      chat.setAttribute("aria-hidden", "false");
      stepIndex = 0;
      Object.keys(answers).forEach(k => delete answers[k]);
      Object.keys(pendingPatch).forEach(k => delete pendingPatch[k]);
      renderConversation();
      // Focus the first option for keyboard nav
      setTimeout(() => {
        const first = body.querySelector(".helper-chat__option");
        if (first) first.focus();
      }, 60);
    }
    function closeChat() {
      chat.dataset.open = "false";
      chat.setAttribute("aria-hidden", "true");
    }

    function renderConversation() {
      // Intro bubble + each step rendered as bot question + user answer (if chosen)
      const parts = [
        `<div class="chat-msg chat-msg--bot">
           <p>Hi! Let me help you find the right program for your team. Just a few quick questions.</p>
         </div>`,
      ];
      CHAT_STEPS.forEach((step, i) => {
        if (i > stepIndex) return;
        parts.push(`<div class="chat-msg chat-msg--bot"><p>${escapeHtml(step.prompt)}</p></div>`);
        const chosen = answers[step.key];
        if (chosen) {
          parts.push(`<div class="chat-msg chat-msg--user"><p>${escapeHtml(chosen)}</p></div>`);
        } else if (i === stepIndex) {
          parts.push(`<div class="chat-options" role="group" aria-label="${escapeHtml(step.prompt)}">
            ${step.options.map((opt, j) =>
              `<button type="button" class="helper-chat__option" data-step="${i}" data-opt="${j}">${escapeHtml(opt.label)}</button>`
            ).join("")}
          </div>`);
        }
      });
      // Done state — at the end, show summary + apply
      if (stepIndex >= CHAT_STEPS.length) {
        // Compute matching count using current state + pendingPatch (preview).
        // If zero match all three filters, relax the timing filter and try
        // again — the user's audience + format choices are stronger signal
        // than the calendar window, and "Found 0 programs" is a dead end.
        const preview = previewFilters();
        let count = applyFilters(PROGRAMS, preview).length;
        let relaxed = false;
        if (count === 0 && pendingPatch.__whenMonths) {
          relaxed = true;
          delete pendingPatch.__whenMonths;
          const widened = previewFilters();
          count = applyFilters(PROGRAMS, widened).length;
        }
        const msg = relaxed
          ? `<p>No exact match for your timing — here ${count === 1 ? "is" : "are"} <strong>${count}</strong> close ${count === 1 ? "fit" : "fits"} across the rest of 2026. Want to see ${count === 1 ? "it" : "them"}?</p>`
          : `<p>Found <strong>${count}</strong> program${count === 1 ? "" : "s"} that match. Want to see ${count === 1 ? "it" : "them"}?</p>`;
        parts.push(`<div class="chat-msg chat-msg--bot">${msg}</div>`);
      }
      body.innerHTML = parts.join("");
      body.scrollTop = body.scrollHeight;

      // Wire options
      body.querySelectorAll(".helper-chat__option").forEach(btn => {
        btn.addEventListener("click", () => {
          const step = CHAT_STEPS[+btn.dataset.step];
          const opt = step.options[+btn.dataset.opt];
          answers[step.key] = opt.label;
          // Merge patch into pendingPatch
          Object.entries(opt.patch || {}).forEach(([k, v]) => {
            pendingPatch[k] = v;
          });
          stepIndex += 1;
          renderConversation();
          renderFoot();
          // Focus next chip group
          setTimeout(() => {
            const nextOpt = body.querySelector(".helper-chat__option");
            if (nextOpt) nextOpt.focus();
          }, 60);
        });
      });
    }

    function previewFilters() {
      // Start from CLEAN filter state — chat is an alternative to manual filtering
      const cleared = { q: "" };
      FILTER_DEFS.forEach(d => cleared[d.key] = d.multi ? [] : null);
      Object.entries(pendingPatch).forEach(([k, v]) => {
        if (k === "__whenMonths") {
          cleared.month = nextMonths(v);
        } else {
          cleared[k] = v;
        }
      });
      return cleared;
    }

    function renderFoot() {
      if (stepIndex >= CHAT_STEPS.length) {
        foot.hidden = false;
        foot.innerHTML = `
          <button type="button" class="helper-chat__btn helper-chat__btn--ghost" id="helperChatRestart">Start over</button>
          <button type="button" class="helper-chat__btn helper-chat__btn--primary" id="helperChatApply">Show programs ${ICON.arrow}</button>
        `;
        $("#helperChatRestart").addEventListener("click", () => {
          stepIndex = 0;
          Object.keys(answers).forEach(k => delete answers[k]);
          Object.keys(pendingPatch).forEach(k => delete pendingPatch[k]);
          foot.hidden = true;
          foot.innerHTML = "";
          renderConversation();
        });
        $("#helperChatApply").addEventListener("click", () => {
          const f = previewFilters();
          writeFilters(f);
          const search = $("#filterSearch");
          if (search) search.value = "";
          refreshResults();
          closeChat();
          // Scroll grid into view smoothly
          const grid = $("#cardGrid");
          if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        foot.hidden = true;
        foot.innerHTML = "";
      }
    }

    launcher.addEventListener("click", () => {
      const isOpen = chat.dataset.open === "true";
      isOpen ? closeChat() : openChat();
    });
    closer.addEventListener("click", closeChat);

    // Activate (make the launcher visible) only after a brief delay so it
    // doesn't compete with the hero on first paint.
    setTimeout(() => { chat.dataset.active = "true"; }, 800);

    // Close on Escape when focus is in the chat panel
    chat.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeChat();
    });
  }

  // View mode: 'grid' / 'schedule' / 'calendar'. Persists per-tab.
  // The grid and calendar toggles are hidden in CSS for now — we
  // hard-code "schedule" so returning users with an old stored
  // "grid" preference still see the active view. Plumbing stays
  // intact so we can re-enable the toggle by reverting the CSS hide
  // + restoring this getter.
  const VIEW_MODE_KEY = "coded.b2b.viewMode";
  function getViewMode() {
    return "schedule";
  }
  function setViewMode(mode) {
    try { sessionStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  }
  function setupViewToggle() {
    // $$ matches both the inline (.view-toggle) and the floating
    // (.view-toggle-floating .view-toggle) copies, so a click on either
    // updates both groups via the same forEach below.
    const btns = $$(".view-toggle__btn");
    const current = getViewMode();
    btns.forEach(b => {
      const active = b.dataset.view === current;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
      b.addEventListener("click", () => {
        const mode = b.dataset.view;
        if (mode === getViewMode()) return;
        setViewMode(mode);
        btns.forEach(x => {
          const a = x.dataset.view === mode;
          x.classList.toggle("is-active", a);
          x.setAttribute("aria-selected", a ? "true" : "false");
        });
        refreshResults();
      });
    });
    setupFloatingViewToggle();
  }

  // The floating view-toggle fades in while the programs grid is in view.
  // Two-sentinel IntersectionObserver: a "top" sentinel just below the hero
  // (when it leaves the viewport, the user has entered the grid) and a
  // "bottom" sentinel just after the grid (when it leaves, they're past).
  // Pure IO — no scroll listener — so it's reliable across browsers and
  // unaffected by CSS `scroll-behavior: smooth`.
  function setupFloatingViewToggle() {
    const floater = document.getElementById("viewToggleFloating");
    const grid    = document.getElementById("gridSection");
    if (!floater || !grid) return;

    if (setupFloatingViewToggle._observer) setupFloatingViewToggle._observer.disconnect();

    const reveal = () => {
      floater.classList.add("is-visible");
      floater.setAttribute("aria-hidden", "false");
    };
    const hide = () => {
      floater.classList.remove("is-visible");
      floater.setAttribute("aria-hidden", "true");
    };

    if (!("IntersectionObserver" in window)) { reveal(); return; }

    // The grid section is "in viewing" when any part of it intersects the
    // middle 70% of the viewport. rootMargin trims 15% top + 15% bottom so
    // the floater appears as the section enters the meaningful read zone and
    // disappears once the user is reading past it.
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(); else hide();
      }
    }, {
      threshold: 0,
      rootMargin: "-15% 0px -15% 0px",
    });
    io.observe(grid);
    setupFloatingViewToggle._observer = io;
  }

  // ---------------- Hero prompt (minimal single-pill concierge) ----------------
  // A single input pill that walks the user through 4 quick questions.
  // The label above the input cross-fades between questions on each submit.
  // Per-keystroke save to sessionStorage so a tab close keeps the draft.
  const HERO_PROMPT_KEY = "coded.b2b.heroPrompt.v2";
  const HERO_PROMPT_STEPS = [
    { key: "company",       label: "What does your company do?",         placeholder: "Kuwait Finance House — retail banking" },
    { key: "needs",         label: "What skills should the team build?", placeholder: "AI app development, Power BI, cybersecurity…" },
    { key: "teamAndTiming", label: "Roughly how many people, and when?", placeholder: "~12 people, March–April 2026" },
    { key: "contact",       label: "Your name and work email?",          placeholder: "Sara Al-Ali · sara@company.com" },
  ];
  const HERO_PROMPT_DONE = { label: "Thanks — we'll be in touch within 1 business day.", placeholder: "" };

  function loadPromptDraft() {
    try { return JSON.parse(sessionStorage.getItem(HERO_PROMPT_KEY) || "{}"); }
    catch { return {}; }
  }
  function savePromptDraft(d) {
    try { sessionStorage.setItem(HERO_PROMPT_KEY, JSON.stringify(d)); } catch {}
  }

  // ── Hero cycle word ────────────────────────────────────────────────
  // Types & erases a sequence of words inside the H1's platinum span.
  // Pure setTimeout chain — survives route changes by aborting via the
  // stale-element check inside tick().
  const HERO_CYCLE_WORDS = ["Companies", "Enterprises", "Banks", "Telecoms"];
  function setupHeroCycle() {
    const el = document.getElementById("heroCycleWord");
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = HERO_CYCLE_WORDS[0];
      return;
    }
    // Start fully showing the first word, then loop: pause → erase → type next.
    let idx = 0;
    let chars = HERO_CYCLE_WORDS[0].length;
    let phase = "pause-show";
    el.textContent = HERO_CYCLE_WORDS[0];

    function tick() {
      // Abort if the element has been detached by a route change.
      if (!el.isConnected || document.getElementById("heroCycleWord") !== el) return;
      const word = HERO_CYCLE_WORDS[idx];
      if (phase === "pause-show") {
        setTimeout(() => { phase = "erasing"; tick(); }, 1900);
      } else if (phase === "erasing") {
        chars--;
        el.textContent = word.slice(0, chars);
        if (chars <= 0) {
          idx = (idx + 1) % HERO_CYCLE_WORDS.length;
          phase = "pause-erased";
          setTimeout(tick, 220);
        } else {
          setTimeout(tick, 38);
        }
      } else if (phase === "pause-erased") {
        phase = "typing";
        tick();
      } else if (phase === "typing") {
        chars++;
        el.textContent = HERO_CYCLE_WORDS[idx].slice(0, chars);
        if (chars >= HERO_CYCLE_WORDS[idx].length) {
          phase = "pause-show";
          tick();
        } else {
          setTimeout(tick, 72);
        }
      }
    }
    // Kick off after a short initial delay so the headline settles first.
    setTimeout(tick, 1200);
  }

  // ── Top courses marquee ────────────────────────────────────────────
  // Curated list of the most-enrolled programs. Each card adopts the
  // program's topic accent via inline CSS variables (gradient backgrounds
  // are driven from --topic in the stylesheet). The track is duplicated
  // so the CSS marquee animation loops seamlessly.
  const TOP_COURSE_SLUGS = [
    "cybersecurity-bootcamp",
    "ai-and-data-science-bootcamp",
    "ai-app-developer-bootcamp",
    "agentic-ai-workshop",
    "power-bi-workshop",
    "nvidia-genai-and-llm-certification",
    "data-analytics-and-sql",
  ];
  const TOPIC_GRADIENTS = {
    "Cybersecurity":              { from: "#7F1D1D", to: "#0B0B0F" },
    "Agentic AI":                 { from: "#1A1F4A", to: "#0B0B0F" },
    "Data & Analytics":           { from: "#064E3B", to: "#0B0B0F" },
    "AI Automation":              { from: "#4C1D95", to: "#0B0B0F" },
    "Project Management & Agile": { from: "#7C2D12", to: "#0B0B0F" },
    "Business Intelligence":      { from: "#1E3A8A", to: "#0B0B0F" },
  };

  // Featured rotator: one card visible, auto-cycles through the top picks.
  // Sits under the search bar to draw attention to high-demand programs
  // without pushing the catalog grid down with a tall marquee.
  // - 3s per slide
  // - Pauses on hover / focus / when the section is offscreen
  // - Honours prefers-reduced-motion (no auto-cycle)
  // - Dots are clickable; clicking jumps to that slide and resets the timer
  const FEATURED_ROTATE_MS = 3000;

  function renderFeaturedRotator() {
    const viewport = document.getElementById("featuredRotatorViewport");
    const dotsBox  = document.getElementById("featuredRotatorDots");
    if (!viewport || !dotsBox) return;

    const programs = window.CODED_PROGRAMS || [];
    const picked = TOP_COURSE_SLUGS
      .map(slug => programs.find(p => p.slug === slug && p.status === "Published"))
      .filter(Boolean)
      .slice(0, 5);
    if (!picked.length) {
      const root = document.getElementById("featuredRotator");
      if (root) root.style.display = "none";
      return;
    }

    viewport.innerHTML = picked.map((p, i) => {
      const grad = TOPIC_GRADIENTS[p.topic] || { from: "#1F2937", to: "#0B0B0F" };
      const rank = String(i + 1).padStart(2, "0");
      const priceStr = p.price_per_seat_kwd
        ? `From KWD ${Number(p.price_per_seat_kwd).toLocaleString("en-GB")} / seat`
        : "On request";
      const active = i === 0;
      return `
        <a class="featured-rotator__card" href="#/programs/${escapeHtml(p.slug)}"
           data-idx="${i}"
           style="--c-from:${grad.from};--c-to:${grad.to};"
           ${active ? 'data-active="true"' : 'aria-hidden="true" tabindex="-1"'}>
          <span class="featured-rotator__rank">${rank}</span>
          <span class="featured-rotator__copy">
            <span class="featured-rotator__topic">${escapeHtml(p.topic)}</span>
            <span class="featured-rotator__name">${escapeHtml(p.name)}</span>
            <span class="featured-rotator__meta">${escapeHtml(p.duration_label || "")} · ${escapeHtml(priceStr)}</span>
          </span>
          <span class="featured-rotator__arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </a>`;
    }).join("");

    dotsBox.innerHTML = picked.map((_, i) => `
      <button type="button" class="featured-rotator__dot"
              data-idx="${i}" role="tab"
              aria-selected="${i === 0 ? "true" : "false"}"
              aria-label="Featured ${i + 1} of ${picked.length}"></button>
    `).join("");

    const cards = Array.from(viewport.querySelectorAll(".featured-rotator__card"));
    const dots  = Array.from(dotsBox.querySelectorAll(".featured-rotator__dot"));
    let idx = 0;
    let timer = null;
    let paused = false;

    function goTo(next) {
      if (next === idx || next < 0 || next >= cards.length) return;
      cards[idx].removeAttribute("data-active");
      cards[idx].setAttribute("aria-hidden", "true");
      cards[idx].setAttribute("tabindex", "-1");
      dots[idx].setAttribute("aria-selected", "false");
      idx = next;
      cards[idx].setAttribute("data-active", "true");
      cards[idx].removeAttribute("aria-hidden");
      cards[idx].removeAttribute("tabindex");
      dots[idx].setAttribute("aria-selected", "true");
    }
    function tick() { if (!paused) goTo((idx + 1) % cards.length); }
    function start() { stop(); timer = setInterval(tick, FEATURED_ROTATE_MS); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }

    // Pause when the user is hovering / focused so they have time to click.
    viewport.addEventListener("mouseenter", () => { paused = true; });
    viewport.addEventListener("mouseleave", () => { paused = false; });
    viewport.addEventListener("focusin",  () => { paused = true; });
    viewport.addEventListener("focusout", () => { paused = false; });

    // Click a dot to jump to that slide; reset the timer so the user gets
    // the full 3s on their picked card.
    dots.forEach(d => d.addEventListener("click", () => {
      goTo(+d.dataset.idx);
      if (timer) start();
    }));

    // Stop cycling when the rotator scrolls offscreen, restart when back.
    // Saves a tick on mobile and avoids triggering accessibility focus
    // changes for users who've scrolled past it.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => e.isIntersecting ? start() : stop());
      }, { threshold: 0.15 });
      obs.observe(viewport);
    } else {
      start();
    }
  }

  function setupHeroPrompt() {
    const form    = document.getElementById("heroPrompt");
    const labelEl = document.getElementById("heroPromptLabel");
    const input   = document.getElementById("heroPromptInput");
    const stepsEl = document.getElementById("heroPromptSteps");
    if (!form || !labelEl || !input) return;

    let draft = loadPromptDraft();
    if (typeof draft !== "object" || !draft) draft = {};
    if (typeof draft.step !== "number") draft.step = 0;
    if (typeof draft.answers !== "object" || !draft.answers) draft.answers = {};
    if (draft.submitted) draft = { step: 0, answers: {} };

    function setLabel(text, placeholder) {
      labelEl.classList.add("is-fading");
      setTimeout(() => {
        labelEl.textContent = text;
        if (placeholder !== undefined) input.placeholder = placeholder;
        labelEl.classList.remove("is-fading");
      }, 160);
    }
    function setSteps() {
      if (!stepsEl) return;
      const dots = stepsEl.querySelectorAll(".dot");
      dots.forEach((d, i) => d.classList.toggle("is-active", i < draft.step + 1 && draft.step < HERO_PROMPT_STEPS.length));
      stepsEl.classList.toggle("is-hidden", draft.step >= HERO_PROMPT_STEPS.length);
    }
    function render() {
      if (draft.step >= HERO_PROMPT_STEPS.length) {
        setLabel(HERO_PROMPT_DONE.label, "");
        form.classList.add("hero-prompt--done");
        input.disabled = true;
      } else {
        const cur = HERO_PROMPT_STEPS[draft.step];
        setLabel(cur.label, cur.placeholder);
        form.classList.remove("hero-prompt--done");
        input.disabled = false;
        input.value = draft.pending && draft.pending.step === draft.step ? draft.pending.text : "";
      }
      setSteps();
    }

    input.addEventListener("input", () => {
      draft.pending = { step: draft.step, text: input.value };
      savePromptDraft(draft);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (draft.step >= HERO_PROMPT_STEPS.length) return;
      const text = (input.value || "").trim();
      if (!text) return;
      const cur = HERO_PROMPT_STEPS[draft.step];
      draft.answers[cur.key] = text;
      delete draft.pending;
      input.value = "";

      if (cur.key === "contact") {
        const parsed = parseContactLine(text);
        if (!parsed.email) { flashError(labelEl, "Need an email so we can follow up."); return; }
        if (!parsed.name)  { flashError(labelEl, "Got the email — what should we call you?"); return; }
        draft.contact = parsed;
        draft.step += 1;
        savePromptDraft(draft);
        render();
        submitHeroPrompt(draft);
        return;
      }
      draft.step += 1;
      savePromptDraft(draft);
      render();
    });

    render();
  }

  function flashError(el, msg) {
    const prev = el.textContent;
    el.classList.add("is-error");
    el.textContent = msg;
    setTimeout(() => {
      el.classList.remove("is-error");
      el.textContent = prev;
    }, 2600);
  }

  function parseContactLine(text) {
    const out = { name: "", email: "", phone: "" };
    const emailMatch = text.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/);
    if (emailMatch) out.email = emailMatch[0];
    const phoneMatch = text.match(/(\+?\d[\d\s\-()]{6,})/);
    if (phoneMatch) out.phone = phoneMatch[0].trim();
    let rest = text;
    if (out.email) rest = rest.replace(out.email, "");
    if (out.phone) rest = rest.replace(out.phone, "");
    rest = rest.replace(/[·•|,;]/g, " ").replace(/\s+/g, " ").trim();
    out.name = rest;
    return out;
  }

  async function submitHeroPrompt(draft) {
    const payload = {
      source:  "Hero Chatbot",
      contact: draft.contact || {},
      company: { name: extractCompanyName(draft.answers.company), description: draft.answers.company },
      answers: { needs: draft.answers.needs, teamAndTiming: draft.answers.teamAndTiming },
      programs: [],
      pageUrl: location.href,
    };
    try {
      const r = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      draft.submitted = true;
      savePromptDraft(draft);
    } catch (err) {
      const labelEl = document.getElementById("heroPromptLabel");
      if (labelEl) flashError(labelEl, "Couldn't reach the server — please email enterprise@joincoded.com");
    }
  }

  // Best-effort: pull the first capitalised noun phrase out of the company answer
  function extractCompanyName(s) {
    if (!s) return "";
    // If user wrote "Company — description", split on em dash / hyphen / colon
    const m = s.split(/[—–\-:|]/)[0];
    return (m || s).trim().slice(0, 120);
  }

  // ---------------- Inquiry modal ----------------
  // Opened from per-card "Inquire about seats" or the detail-page CTA.
  function openInquiryModal({ programSlug } = {}) {
    const modal = document.getElementById("inquiryModal");
    if (!modal) return;
    const select = document.getElementById("inquiryProgramSelect");
    const form   = document.getElementById("inquiryForm");
    const status = document.getElementById("inquiryFormStatus");
    const eyebrow = document.getElementById("inquiryModalEyebrow");
    if (!form || !select) return;

    // Populate program select
    select.innerHTML = `<option value="">Open to any program / not sure yet</option>` +
      PROGRAMS.map(p => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.name)}</option>`).join("") +
      `<option value="custom">Other / Custom program</option>`;
    if (programSlug) {
      select.value = programSlug;
      const p = slugToProgram(programSlug);
      if (p) eyebrow.textContent = `Inquiry · ${p.name}`;
    } else {
      eyebrow.textContent = "B2B inquiry";
    }

    // Reset state
    form.reset();
    if (programSlug) select.value = programSlug;
    status.textContent = "";
    status.removeAttribute("data-tone");
    form.querySelector("button[type='submit']").disabled = false;

    // Show
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => modal.classList.add("inquiry-modal--in"), 10);
    const firstInput = form.querySelector("input[name='name']");
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function closeInquiryModal() {
    const modal = document.getElementById("inquiryModal");
    if (!modal) return;
    modal.classList.remove("inquiry-modal--in");
    setTimeout(() => {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }, 220);
  }

  function setupInquiryModal() {
    const modal = document.getElementById("inquiryModal");
    const form  = document.getElementById("inquiryForm");
    if (!modal || !form || setupInquiryModal._wired) return;
    setupInquiryModal._wired = true;

    modal.addEventListener("click", (e) => {
      if (e.target.matches("[data-modal-close]")) closeInquiryModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeInquiryModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("inquiryFormStatus");
      const submitBtn = document.getElementById("inquiryFormSubmit");
      const data = new FormData(form);
      const programSlug = data.get("program");
      let programs = [];
      if (programSlug && programSlug !== "custom") {
        const p = slugToProgram(programSlug);
        if (p) programs = [p.name];
      } else if (programSlug === "custom") {
        programs = ["Other / Custom"];
      }
      const payload = {
        source: "Program Inquiry Form",
        contact: {
          name: (data.get("name") || "").toString().trim(),
          email: (data.get("email") || "").toString().trim(),
          phone: (data.get("phone") || "").toString().trim(),
        },
        company: {
          name: (data.get("company") || "").toString().trim(),
        },
        answers: {
          teamAndTiming: (data.get("teamAndTiming") || "").toString().trim(),
        },
        programs,
        notes: (data.get("notes") || "").toString().trim(),
        pageUrl: location.href,
      };

      if (!payload.contact.name || !payload.contact.email || !payload.company.name) {
        status.textContent = "Name, email, and company are required.";
        status.setAttribute("data-tone", "error");
        return;
      }

      submitBtn.disabled = true;
      status.removeAttribute("data-tone");
      status.textContent = "Sending…";
      try {
        const r = await fetch("/api/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        status.textContent = "Thanks — we got it. You'll hear from us within one business day.";
        status.setAttribute("data-tone", "ok");
        setTimeout(closeInquiryModal, 1800);
      } catch (err) {
        status.textContent = "Couldn't reach the server. Email enterprise@joincoded.com and we'll pick it up.";
        status.setAttribute("data-tone", "error");
        submitBtn.disabled = false;
      }
    });
  }
  // Expose for the detail-page sticky CTA
  window.openInquiryModal  = openInquiryModal;
  window.closeInquiryModal = closeInquiryModal;

  // ---------------- Gated PDF brochure modal ----------------
  // Visitors hit "Download brochure (PDF)" → we collect their work details
  // and trigger an Airtable automation that emails them the PDF. No public
  // (Gmail/Hotmail/Yahoo) addresses; no direct download from the platform.
  //
  // GCC codes are listed first so the most common picks are at the top of
  // the dropdown. Default selection is Kuwait (+965).
  const PDF_COUNTRY_CODES = [
    { code: "+965", name: "Kuwait", group: "GCC" },
    { code: "+966", name: "Saudi Arabia", group: "GCC" },
    { code: "+971", name: "United Arab Emirates", group: "GCC" },
    { code: "+974", name: "Qatar", group: "GCC" },
    { code: "+973", name: "Bahrain", group: "GCC" },
    { code: "+968", name: "Oman", group: "GCC" },
    { code: "+93",  name: "Afghanistan" },
    { code: "+213", name: "Algeria" },
    { code: "+54",  name: "Argentina" },
    { code: "+61",  name: "Australia" },
    { code: "+43",  name: "Austria" },
    { code: "+880", name: "Bangladesh" },
    { code: "+32",  name: "Belgium" },
    { code: "+55",  name: "Brazil" },
    { code: "+1",   name: "Canada / United States" },
    { code: "+86",  name: "China" },
    { code: "+45",  name: "Denmark" },
    { code: "+20",  name: "Egypt" },
    { code: "+251", name: "Ethiopia" },
    { code: "+358", name: "Finland" },
    { code: "+33",  name: "France" },
    { code: "+49",  name: "Germany" },
    { code: "+30",  name: "Greece" },
    { code: "+852", name: "Hong Kong" },
    { code: "+91",  name: "India" },
    { code: "+62",  name: "Indonesia" },
    { code: "+98",  name: "Iran" },
    { code: "+964", name: "Iraq" },
    { code: "+353", name: "Ireland" },
    { code: "+972", name: "Israel" },
    { code: "+39",  name: "Italy" },
    { code: "+81",  name: "Japan" },
    { code: "+962", name: "Jordan" },
    { code: "+254", name: "Kenya" },
    { code: "+961", name: "Lebanon" },
    { code: "+218", name: "Libya" },
    { code: "+60",  name: "Malaysia" },
    { code: "+52",  name: "Mexico" },
    { code: "+212", name: "Morocco" },
    { code: "+977", name: "Nepal" },
    { code: "+31",  name: "Netherlands" },
    { code: "+64",  name: "New Zealand" },
    { code: "+234", name: "Nigeria" },
    { code: "+47",  name: "Norway" },
    { code: "+92",  name: "Pakistan" },
    { code: "+970", name: "Palestine" },
    { code: "+63",  name: "Philippines" },
    { code: "+48",  name: "Poland" },
    { code: "+351", name: "Portugal" },
    { code: "+40",  name: "Romania" },
    { code: "+7",   name: "Russia / Kazakhstan" },
    { code: "+65",  name: "Singapore" },
    { code: "+27",  name: "South Africa" },
    { code: "+82",  name: "South Korea" },
    { code: "+34",  name: "Spain" },
    { code: "+94",  name: "Sri Lanka" },
    { code: "+249", name: "Sudan" },
    { code: "+46",  name: "Sweden" },
    { code: "+41",  name: "Switzerland" },
    { code: "+963", name: "Syria" },
    { code: "+886", name: "Taiwan" },
    { code: "+66",  name: "Thailand" },
    { code: "+216", name: "Tunisia" },
    { code: "+90",  name: "Turkey" },
    { code: "+380", name: "Ukraine" },
    { code: "+44",  name: "United Kingdom" },
    { code: "+84",  name: "Vietnam" },
    { code: "+967", name: "Yemen" },
  ];

  function populatePdfPhoneCountry() {
    const sel = document.getElementById("pdfRequestPhoneCountry");
    if (!sel || sel.options.length > 0) return;
    let gcc = "", rest = "";
    PDF_COUNTRY_CODES.forEach(c => {
      const label = `${c.name} (${c.code})`;
      const opt = `<option value="${c.code}" data-country="${c.name}">${label}</option>`;
      if (c.group === "GCC") gcc += opt; else rest += opt;
    });
    sel.innerHTML =
      `<optgroup label="GCC">${gcc}</optgroup>` +
      `<optgroup label="Other">${rest}</optgroup>`;
    sel.value = "+965";
  }

  const PDF_PUBLIC_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com",
    "hotmail.com", "hotmail.co.uk", "hotmail.fr", "live.com", "outlook.com", "outlook.sa", "msn.com",
    "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com",
    "icloud.com", "me.com", "mac.com",
    "aol.com",
    "proton.me", "protonmail.com", "pm.me",
    "gmx.com", "gmx.net", "gmx.de",
    "mail.com", "mail.ru",
    "zoho.com",
    "yandex.com", "yandex.ru",
    "qq.com", "163.com", "126.com", "sina.com",
    "fastmail.com", "tutanota.com", "tuta.io",
    "hey.com",
    "duck.com", "duckduckgo.com",
    "inbox.com",
  ]);

  function openPdfRequestModal({ programSlug, programName } = {}) {
    const modal = document.getElementById("pdfRequestModal");
    if (!modal) return;
    const form    = document.getElementById("pdfRequestForm");
    const status  = document.getElementById("pdfRequestStatus");
    const submit  = document.getElementById("pdfRequestSubmit");
    const eyebrow = document.getElementById("pdfRequestModalEyebrow");
    if (!form) return;

    populatePdfPhoneCountry();
    form.reset();
    // form.reset() snaps the select back to its first option — re-apply
    // the Kuwait default after the reset.
    const countrySel = form.querySelector("select[name='phoneCountry']");
    if (countrySel) countrySel.value = "+965";
    form.dataset.programSlug = programSlug || "";
    form.dataset.programName = programName || "";
    eyebrow.textContent = programName ? `Brochure · ${programName}` : "Brochure request";
    status.textContent = "Use your company email — we'll send the PDF there.";
    status.removeAttribute("data-tone");
    submit.disabled = false;
    submit.textContent = "Email me the PDF";

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => modal.classList.add("inquiry-modal--in"), 10);
    setTimeout(() => {
      const first = form.querySelector("input[name='name']");
      if (first) first.focus();
    }, 100);
  }

  function closePdfRequestModal() {
    const modal = document.getElementById("pdfRequestModal");
    if (!modal) return;
    modal.classList.remove("inquiry-modal--in");
    setTimeout(() => {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".inquiry-modal:not([hidden])")) {
        document.body.classList.remove("modal-open");
      }
    }, 220);
  }

  function setupPdfRequestModal() {
    const modal = document.getElementById("pdfRequestModal");
    const form  = document.getElementById("pdfRequestForm");
    if (!modal || !form || setupPdfRequestModal._wired) return;
    setupPdfRequestModal._wired = true;

    modal.addEventListener("click", (e) => {
      if (e.target.matches("[data-modal-close]")) closePdfRequestModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closePdfRequestModal();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("pdfRequestStatus");
      const submit = document.getElementById("pdfRequestSubmit");
      const data   = new FormData(form);
      const name         = (data.get("name")         || "").toString().trim();
      const department   = (data.get("department")   || "").toString().trim();
      const company      = (data.get("company")      || "").toString().trim();
      const email        = (data.get("email")        || "").toString().trim().toLowerCase();
      const phoneCountry = (data.get("phoneCountry") || "+965").toString().trim();
      const phone        = (data.get("phone")        || "").toString().trim();
      const notes        = (data.get("notes")        || "").toString().trim();

      if (!name) {
        status.textContent = "Full name is required.";
        status.setAttribute("data-tone", "error");
        return;
      }
      if (!department) {
        status.textContent = "Department is required.";
        status.setAttribute("data-tone", "error");
        return;
      }
      if (!company) {
        status.textContent = "Company name is required.";
        status.setAttribute("data-tone", "error");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = "Enter a valid email address.";
        status.setAttribute("data-tone", "error");
        return;
      }
      const at = email.lastIndexOf("@");
      const domain = at === -1 ? "" : email.slice(at + 1);
      if (PDF_PUBLIC_EMAIL_DOMAINS.has(domain)) {
        status.textContent = "Please use your company email — Gmail / Hotmail / Yahoo and other public addresses are not accepted.";
        status.setAttribute("data-tone", "error");
        return;
      }

      const programSlug = form.dataset.programSlug || "";
      const programName = form.dataset.programName || "";
      const pdfUrl = programSlug
        ? new URL(`assets/pdfs/${programSlug}.pdf`, location.href).toString()
        : "";

      submit.disabled = true;
      status.removeAttribute("data-tone");
      status.textContent = "Sending…";
      try {
        const r = await fetch("/api/pdf-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact: {
              name,
              email,
              department,
              phone,
              phoneCountry,
            },
            company: { name: company },
            programSlug,
            programName,
            pdfUrl,
            pageUrl: location.href,
            notes,
          }),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (json.code === "email_public") {
            status.textContent = json.error || "Please use your company email.";
          } else if (json.code === "email_invalid") {
            status.textContent = "Enter a valid email address.";
          } else if (json.code === "company_required") {
            status.textContent = "Company name is required.";
          } else if (json.code === "department_required") {
            status.textContent = "Department is required.";
          } else if (json.code === "name_required") {
            status.textContent = "Full name is required.";
          } else {
            status.textContent = json.error || `Couldn't send the request (HTTP ${r.status}).`;
          }
          status.setAttribute("data-tone", "error");
          submit.disabled = false;
          return;
        }
        status.textContent = "Thanks — check your inbox in a minute for the PDF.";
        status.setAttribute("data-tone", "ok");
        submit.textContent = "Sent";
        setTimeout(closePdfRequestModal, 2200);
      } catch (err) {
        status.textContent = "Couldn't reach the server. Email enterprise@joincoded.com and we'll send it over.";
        status.setAttribute("data-tone", "error");
        submit.disabled = false;
      }
    });
  }

  // Global delegate — any [data-pdf-request] button opens the gated modal.
  // Works whether the button is rendered by the detail view, catalog view,
  // or any future surface that adds the attribute.
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-pdf-request]");
    if (!trigger) return;
    e.preventDefault();
    openPdfRequestModal({
      programSlug: trigger.dataset.programSlug || "",
      programName: trigger.dataset.programName || "",
    });
  });

  window.openPdfRequestModal  = openPdfRequestModal;
  window.closePdfRequestModal = closePdfRequestModal;

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
    refreshQuickFiltersState();

    const rc = $("#resultsCount");
    if (rc) {
      rc.textContent = `${filtered.length} program${filtered.length === 1 ? "" : "s"} ${totalActive === 0 ? "available" : "match your filters"}`;
    }

    const grid = $("#cardGrid");
    if (!grid) return;
    if (!filtered.length) {
      grid.classList.remove("grid", "calendar-view");
      const queryLine = filters.q
        ? `<p>Nothing matches "<strong>${escapeHtml(filters.q)}</strong>" with the current filters.</p>`
        : `<p>Try widening your selection, or get in touch and we'll let you know when something fits.</p>`;
      grid.innerHTML = `
        <div class="empty">
          <h3>No programs match those filters yet.</h3>
          ${queryLine}
          <div class="empty__actions">
            <button type="button" class="btn btn-secondary" id="emptyClearBtn">Clear filters</button>
            <a class="btn btn-primary" href="#/enterprise">Brief us on your team ${ICON.arrow}</a>
          </div>
        </div>
      `;
      const ec = $("#emptyClearBtn");
      if (ec) ec.addEventListener("click", clearAllFilters);
      return;
    }

    const mode = getViewMode();
    const sortLabel = $("#sortLabel");
    if (sortLabel) {
      sortLabel.textContent =
        mode === "calendar" ? "Month view · navigate to see scheduled programs" :
        mode === "schedule" ? "Grouped by month · soonest first" :
                              "Sorted by start date · soonest first";
    }

    grid.classList.remove("grid", "schedule-view", "month-cal-view");

    if (mode === "calendar") {
      grid.classList.add("month-cal-view");
      grid.innerHTML = renderMonthCalendar(filtered);
      wireMonthCalendar(filtered);
    } else if (mode === "schedule") {
      grid.classList.add("schedule-view");
      grid.innerHTML = renderCalendar(filtered);
      grid.querySelectorAll(".cal-row__inquire").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openInquiryModal({ programSlug: btn.dataset.programSlug });
        });
      });
    } else {
      grid.classList.add("grid");
      grid.innerHTML = filtered.map((p, i) => renderCard(p, i)).join("");
      // Wire the per-card "Inquire" buttons after the markup is mounted
      grid.querySelectorAll(".card__inquire").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openInquiryModal({ programSlug: btn.dataset.programSlug });
        });
      });
    }
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
    const aria = `${p.name}, ${p.topic}, ${p.format || ""}, starts ${fmtDate(p.start_date)}`;
    const formatBadge = p.format
      ? `<span class="card__format">${escapeHtml(p.format)}</span>`
      : "";
    const oneLiner = p.one_liner
      ? `<p class="card__lede">${escapeHtml(p.one_liner)}</p>`
      : "";
    return `
      <article class="card card--program" data-topic="${escapeHtml(p.topic)}" style="--i:${index}">
        <a class="card__hit" href="#/programs/${escapeHtml(p.slug)}" aria-label="${escapeHtml(aria)}"></a>
        <div class="card__head">
          ${programIconHtml(p)}
          ${formatBadge}
        </div>
        <span class="card__topic" data-topic="${escapeHtml(p.topic)}">
          <span class="card__topic-dot" aria-hidden="true"></span>
          ${escapeHtml(p.topic)}
        </span>
        <h3 class="card__title">${escapeHtml(p.name)}</h3>
        ${oneLiner}
        <dl class="card__stats">
          <div class="card__stat">
            <dt>Starts</dt>
            <dd>${ICON.cal}<span>${escapeHtml(fmtDate(p.start_date))}</span></dd>
          </div>
          <div class="card__stat">
            <dt>Duration</dt>
            <dd>${ICON.clock}<span>${escapeHtml(p.duration_label || "")}</span></dd>
          </div>
        </dl>
        <div class="card__actions">
          <button type="button" class="card__inquire" data-program-slug="${escapeHtml(p.slug)}">Inquire about seats</button>
          <span class="card__cta">Details <span class="card__cta-arrow">${ICON.arrow}</span></span>
        </div>
      </article>
    `;
  }

  // ---------------- Calendar (month-grouped agenda) view ----------------
  // Each row: icon · name · meta · days-left badge · inquire. Grouped by
  // start month. Sorted by start date within each month.
  function renderCalendarRow(p) {
    const aria = `${p.name}, ${p.topic}, ${p.format || ""}, starts ${fmtDate(p.start_date)}`;
    const d = new Date(p.start_date + "T00:00:00");
    const dayNum = d.getDate();
    const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
    const until = daysUntil(p.start_date);
    const fomoChip = until
      ? `<span class="cal-row__fomo" data-urgency="${until.urgency}">
           <span class="cal-row__fomo-pulse" aria-hidden="true"></span>
           ${escapeHtml(until.label)}
         </span>`
      : "";
    return `
      <li class="cal-row" data-topic="${escapeHtml(p.topic)}">
        <a class="cal-row__hit" href="#/programs/${escapeHtml(p.slug)}" aria-label="${escapeHtml(aria)}"></a>
        <div class="cal-row__date">
          <span class="cal-row__day">${dayNum}</span>
          <span class="cal-row__dow">${dayName}</span>
        </div>
        ${programIconHtml(p)}
        <div class="cal-row__body">
          <div class="cal-row__title-row">
            <h3 class="cal-row__title">${escapeHtml(p.name)}</h3>
            ${fomoChip}
          </div>
          <div class="cal-row__meta">
            <span class="cal-row__topic" data-topic="${escapeHtml(p.topic)}">
              <span class="cal-row__topic-dot" aria-hidden="true"></span>
              ${escapeHtml(p.topic)}
            </span>
            <span class="cal-row__sep" aria-hidden="true">·</span>
            <span>${escapeHtml(p.format || "")}</span>
            <span class="cal-row__sep" aria-hidden="true">·</span>
            <span>${escapeHtml(p.duration_label || "")}</span>
          </div>
        </div>
        <div class="cal-row__actions">
          <button type="button" class="cal-row__inquire" data-program-slug="${escapeHtml(p.slug)}">Inquire <span class="cal-row__arrow">${ICON.arrow}</span></button>
        </div>
      </li>
    `;
  }

  function renderCalendar(filtered) {
    if (!filtered.length) return ""; // empty state is handled separately
    // Group by year-month of start_date
    const groups = new Map();
    filtered.forEach(p => {
      const key = (p.start_date || "").slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const sortedKeys = Array.from(groups.keys()).sort();
    return sortedKeys.map(key => {
      const programs = groups.get(key).slice().sort((a, b) =>
        (a.start_date || "").localeCompare(b.start_date || "")
      );
      const count = programs.length;
      return `
        <section class="cal-month">
          <header class="cal-month__head">
            <h2 class="cal-month__title">${escapeHtml(monthLabel(key))}</h2>
            <span class="cal-month__count">${count} program${count === 1 ? "" : "s"}</span>
          </header>
          <ul class="cal-list">
            ${programs.map(renderCalendarRow).join("")}
          </ul>
        </section>
      `;
    }).join("");
  }

  // ---------------- Month Calendar (actual calendar grid) ----------------
  // 6×7 month grid with programs drawn as Google-Calendar-style spanning
  // bars from start_date to end_date. Each program is assigned a vertical
  // "lane" so overlapping programs stack without colliding. Bars segment
  // across week boundaries (continuesLeft / continuesRight indicators).

  const MCAL_KEY = "coded.b2b.calMonth";
  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function getCalMonth(filtered) {
    try {
      const saved = sessionStorage.getItem(MCAL_KEY);
      if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
    } catch {}
    // Default: the earliest start month present in the filtered set, or
    // today's month if nothing matches.
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const months = filtered.map(p => (p.start_date || "").slice(0, 7)).filter(Boolean).sort();
    return months[0] || todayKey;
  }
  function setCalMonth(ym) {
    try { sessionStorage.setItem(MCAL_KEY, ym); } catch {}
  }
  function ymAdd(ym, delta) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function dateAdd(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function buildMonthGrid(ym) {
    // 42-day grid (6 weeks × 7 days), starting on Sunday of the week
    // that contains the 1st of the month.
    const [y, m] = ym.split("-").map(Number);
    const firstOfMonth = new Date(y, m - 1, 1);
    const offset = firstOfMonth.getDay(); // 0 = Sunday
    const start = new Date(y, m - 1, 1 - offset);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        iso: d.toISOString().slice(0, 10),
        day: d.getDate(),
        inMonth: d.getMonth() + 1 === m,
        weekday: d.getDay(),
      });
    }
    return days;
  }

  function assignLanes(programs) {
    // Greedy interval scheduling: sort by start, then longer first as
    // tiebreak. Assign each program to the lowest lane index whose
    // last-end-date is strictly before this program's start_date.
    const sorted = programs.slice().sort((a, b) => {
      const c = (a.start_date || "").localeCompare(b.start_date || "");
      if (c !== 0) return c;
      const ae = a.end_date || a.start_date || "";
      const be = b.end_date || b.start_date || "";
      return be.localeCompare(ae); // longer first
    });
    const lanes = []; // lanes[i] = last end_date in this lane
    const laneOf = new Map();
    sorted.forEach(p => {
      const s = p.start_date;
      const e = p.end_date || p.start_date;
      if (!s) return;
      let lane = lanes.findIndex(l => l < s);
      if (lane < 0) { lane = lanes.length; lanes.push(e); }
      else { lanes[lane] = e; }
      laneOf.set(p.slug, lane);
    });
    return laneOf;
  }

  function renderMonthCalendar(filtered) {
    const ym = getCalMonth(filtered);
    const days = buildMonthGrid(ym);
    const windowStart = days[0].iso;
    const windowEnd = days[41].iso;
    const today = new Date().toISOString().slice(0, 10);

    // Programs that intersect the visible 6-week window
    const inWindow = filtered.filter(p => {
      const s = p.start_date;
      const e = p.end_date || p.start_date;
      return s && e && e >= windowStart && s <= windowEnd;
    });
    const laneOf = assignLanes(filtered); // assign across ALL filtered (stable across nav)
    const maxLane = inWindow.reduce((m, p) => Math.max(m, laneOf.get(p.slug) ?? 0), 0);

    // Build weeks
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const wd = days.slice(w * 7, (w + 1) * 7);
      const weekStart = wd[0].iso;
      const weekEnd = wd[6].iso;
      const bars = [];
      inWindow.forEach(p => {
        const s = p.start_date;
        const e = p.end_date || p.start_date;
        if (e < weekStart || s > weekEnd) return;
        const barStartIso = s < weekStart ? weekStart : s;
        const barEndIso = e > weekEnd ? weekEnd : e;
        const startCol = wd.findIndex(d => d.iso === barStartIso) + 1;
        const endCol = wd.findIndex(d => d.iso === barEndIso) + 1;
        bars.push({
          program: p,
          startCol,
          span: endCol - startCol + 1,
          lane: laneOf.get(p.slug) ?? 0,
          continuesLeft: s < weekStart,
          continuesRight: e > weekEnd,
          isStart: s >= weekStart && s <= weekEnd,
        });
      });
      // Sort bars by lane then startCol so DOM order is stable
      bars.sort((a, b) => (a.lane - b.lane) || (a.startCol - b.startCol));
      weeks.push({ days: wd, bars });
    }

    // Header: prev / month label / next / today
    const monthName = monthLabel(ym);
    const todayMonth = today.slice(0, 7);
    const isToday = ym === todayMonth;

    const weeksHtml = weeks.map(week => {
      const dayCells = week.days.map(d => {
        const cls = [
          "mcal-day",
          d.inMonth ? "mcal-day--in" : "mcal-day--out",
          d.iso === today ? "mcal-day--today" : "",
          d.iso < today ? "mcal-day--past" : "",
        ].filter(Boolean).join(" ");
        return `<div class="${cls}"><span class="mcal-day__num">${d.day}</span></div>`;
      }).join("");
      const barEls = week.bars.map(b => {
        const cls = [
          "mcal-bar",
          b.continuesLeft  ? "mcal-bar--cont-left"  : "",
          b.continuesRight ? "mcal-bar--cont-right" : "",
          b.isStart        ? "mcal-bar--start"      : "",
        ].filter(Boolean).join(" ");
        const label = b.isStart ? b.program.name : `${b.program.name} (continued)`;
        return `
          <a class="${cls}" data-topic="${escapeHtml(b.program.topic)}"
             style="--col-start:${b.startCol}; --col-span:${b.span}; --lane:${b.lane};"
             href="#/programs/${escapeHtml(b.program.slug)}"
             title="${escapeHtml(b.program.name)} · ${escapeHtml(fmtDate(b.program.start_date))} → ${escapeHtml(fmtDate(b.program.end_date || b.program.start_date))}">
            ${escapeHtml(label)}
          </a>
        `;
      }).join("");
      const weekLanes = Math.max(0, ...week.bars.map(b => b.lane + 1));
      return `
        <div class="mcal-week" style="--lanes:${weekLanes}">
          ${dayCells}
          ${barEls}
        </div>
      `;
    }).join("");

    return `
      <section class="month-cal" data-month="${escapeHtml(ym)}">
        <header class="month-cal__head">
          <div class="month-cal__nav">
            <button type="button" class="month-cal__navbtn" id="mcalPrev" aria-label="Previous month">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button type="button" class="month-cal__navbtn" id="mcalNext" aria-label="Next month">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>
            <h2 class="month-cal__title">${escapeHtml(monthName)}</h2>
          </div>
          <div class="month-cal__actions">
            ${isToday ? "" : `<button type="button" class="month-cal__today" id="mcalToday">Jump to today</button>`}
            <span class="month-cal__count">${inWindow.length} program${inWindow.length === 1 ? "" : "s"} in view</span>
          </div>
        </header>
        <div class="month-cal__weekdays">
          ${WEEKDAY_LABELS.map(d => `<span>${d}</span>`).join("")}
        </div>
        <div class="month-cal__weeks">
          ${weeksHtml}
        </div>
        ${inWindow.length === 0 ? `
          <div class="month-cal__empty">
            <p>No programs scheduled in ${escapeHtml(monthName)}${
              filtered.length ? " (with your current filters)" : ""
            }.</p>
          </div>
        ` : ""}
      </section>
    `;
  }

  function wireMonthCalendar(filtered) {
    const prev = $("#mcalPrev");
    const next = $("#mcalNext");
    const today = $("#mcalToday");
    if (prev) prev.addEventListener("click", () => {
      setCalMonth(ymAdd(getCalMonth(filtered), -1));
      refreshResults();
    });
    if (next) next.addEventListener("click", () => {
      setCalMonth(ymAdd(getCalMonth(filtered), +1));
      refreshResults();
    });
    if (today) today.addEventListener("click", () => {
      const t = new Date();
      setCalMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
      refreshResults();
    });
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

    // Countdown to the next upcoming cohort. Falls back to start_date if no future cohort is parsed.
    const daysUntil = (() => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const candidates = [];
      if (p.start_date) candidates.push(new Date(p.start_date + "T00:00:00"));
      (p.cohorts || []).forEach(c => { if (c.start_date) candidates.push(new Date(c.start_date + "T00:00:00")); });
      const future = candidates.filter(d => d >= today).sort((a, b) => a - b)[0];
      if (!future) return null;
      return Math.round((future - today) / (1000 * 60 * 60 * 24));
    })();
    const countdownChip = daysUntil != null
      ? `<span class="countdown-chip" title="Days until the next cohort starts">
           <span class="countdown-chip__pulse" aria-hidden="true"></span>
           <span class="countdown-chip__num">${daysUntil === 0 ? "Starts today" : daysUntil === 1 ? "Starts tomorrow" : `Starts in ${daysUntil} days`}</span>
         </span>`
      : "";

    // Live D : H : M : S countdown to the next upcoming cohort. Picks the same
    // future-cohort date as the chip above, then layers the start-of-day time
    // parsed from session_pattern (e.g. "8am–2pm" → 08:00) for a precise tick.
    const countdownTarget = (() => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const candidates = [];
      if (p.start_date) candidates.push(p.start_date);
      (p.cohorts || []).forEach(c => { if (c.start_date) candidates.push(c.start_date); });
      const futureISO = candidates
        .map(iso => ({ iso, date: new Date(iso + "T00:00:00") }))
        .filter(x => x.date >= today)
        .sort((a, b) => a.date - b.date)[0];
      if (!futureISO) return null;
      const target = new Date(futureISO.iso + "T00:00:00");
      const tm = (p.session_pattern || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if (tm) {
        let h = parseInt(tm[1], 10);
        const min = tm[2] ? parseInt(tm[2], 10) : 0;
        const mer = tm[3].toLowerCase();
        if (mer === "pm" && h < 12) h += 12;
        if (mer === "am" && h === 12) h = 0;
        target.setHours(h, min, 0, 0);
      }
      return target;
    })();
    const countdownBlock = countdownTarget
      ? `<div class="hero-countdown" id="heroCountdown" data-target="${countdownTarget.toISOString()}" aria-live="off">
           <div class="hero-countdown__label">Starts in</div>
           <div class="hero-countdown__grid">
             <div class="hero-countdown__cell"><span class="hero-countdown__num" data-cd="d">--</span><span class="hero-countdown__unit">Days</span></div>
             <span class="hero-countdown__sep" aria-hidden="true">:</span>
             <div class="hero-countdown__cell"><span class="hero-countdown__num" data-cd="h">--</span><span class="hero-countdown__unit">Hours</span></div>
             <span class="hero-countdown__sep" aria-hidden="true">:</span>
             <div class="hero-countdown__cell"><span class="hero-countdown__num" data-cd="m">--</span><span class="hero-countdown__unit">Minutes</span></div>
             <span class="hero-countdown__sep" aria-hidden="true">:</span>
             <div class="hero-countdown__cell"><span class="hero-countdown__num" data-cd="s">--</span><span class="hero-countdown__unit">Seconds</span></div>
           </div>
         </div>`
      : "";

    $("#app").innerHTML = `
      <section class="detail-hero detail-hero--onyx" data-parallax-root>
        <div class="detail-hero__bg" aria-hidden="true">
          <div class="detail-hero__grid"></div>
          <div class="detail-hero__orb detail-hero__orb--a"></div>
          <div class="detail-hero__orb detail-hero__orb--b"></div>
          <img class="detail-dot-pattern" src="assets/brand/dot-pattern-white.svg" alt="" data-parallax="0.25" />
        </div>
        <div class="container detail-hero__inner">
          <div class="breadcrumb breadcrumb--light">
            <a href="#/">Home</a><span>/</span>
            <a href="#/">Programs</a><span>/</span>
            <span>${escapeHtml(p.name)}</span>
          </div>
          <div class="detail-hero__pills">
            <span class="pill pill--platinum" data-topic="${escapeHtml(p.topic)}">${escapeHtml(p.topic)}</span>
            ${audiencePills}
            ${countdownChip}
          </div>
          <h1 data-parallax="-0.12">${escapeHtml(p.name)}</h1>
          <p class="lede lede--platinum">${escapeHtml(p.one_liner)}</p>

          <div class="detail-meta-row detail-meta-row--onyx">
            <div>
              <div class="detail-meta__label">Starts</div>
              <div class="detail-meta__value">${escapeHtml(fmtDate(p.start_date))}</div>
            </div>
            <div>
              <div class="detail-meta__label">Ends</div>
              <div class="detail-meta__value">${escapeHtml(fmtDate(p.end_date) || "—")}</div>
            </div>
            <div>
              <div class="detail-meta__label">Duration</div>
              <div class="detail-meta__value">${escapeHtml(p.duration_label)}</div>
              ${p.total_hours ? `<div class="detail-meta__sub">${escapeHtml(String(p.total_hours))} hrs total</div>` : ""}
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

          ${countdownBlock}

          <div class="detail-hero__cta">
            <a class="btn btn-primary btn-lg btn--platinum" href="${escapeHtml(mailto)}">Request Seats &amp; Pricing ${ICON.arrow}</a>
            <a class="btn btn-secondary btn-lg btn--ghost-light" href="${escapeHtml(p.location_url || "#")}" target="_blank" rel="noopener">Location (CODED Campus) ${ICON.extlink}</a>
          </div>
        </div>
      </section>

      <!-- Detail shell: left = full content stack (overview, curriculum, audience, ...),
           right = sticky AT A GLANCE aside that stays visible from hero through FAQ -->
      <div class="container">
        <div class="detail-grid detail-grid--full">
          <div class="detail-grid__main">
            <!-- Overview marquee, now inline in the left column -->
            <section class="detail-section detail-section--marquee detail-section--marquee-inline reveal-up">
              <span class="eyebrow-tag">[ Overview ]</span>
              <h2>What You'll Walk Out With</h2>
              <ul class="overview-tiles overview-tiles--three">
                <li class="stagger-child"><h6>You'll build</h6><p>${escapeHtml(p.outcomes[0] || "")}</p></li>
                <li class="stagger-child"><h6>How we teach</h6><p>70 / 30 hands-on. Every session ships a working artefact.</p></li>
                <li class="stagger-child"><h6>Walk out with</h6><p>${escapeHtml(p.outcomes[p.outcomes.length - 1] || "")}</p></li>
              </ul>
            </section>

            <!-- Curriculum band, now an inline dark panel inside the left column -->
            <section class="curriculum-band curriculum-band--inline reveal-up">
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
            </section>

            <section class="detail-section reveal-up">
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
              <button type="button" class="btn btn-ghost btn-block" style="margin-top:8px;" data-pdf-request data-program-slug="${escapeHtml(p.slug)}" data-program-name="${escapeHtml(p.name)}">Download brochure (PDF) ${ICON.download}</button>
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

    // Live D / H / M / S countdown. Re-renders every second; the previous
    // timer (if any) is cleared first because route changes wipe #app.
    if (window._codedCountdownTimer) {
      clearInterval(window._codedCountdownTimer);
      window._codedCountdownTimer = null;
    }
    const cdRoot = document.getElementById("heroCountdown");
    if (cdRoot && cdRoot.dataset.target) {
      const target = new Date(cdRoot.dataset.target);
      const dEl = cdRoot.querySelector('[data-cd="d"]');
      const hEl = cdRoot.querySelector('[data-cd="h"]');
      const mEl = cdRoot.querySelector('[data-cd="m"]');
      const sEl = cdRoot.querySelector('[data-cd="s"]');
      const pad = (n) => String(Math.max(0, n)).padStart(2, "0");
      const tick = () => {
        const diff = target.getTime() - Date.now();
        if (diff <= 0) {
          if (dEl) dEl.textContent = "00";
          if (hEl) hEl.textContent = "00";
          if (mEl) mEl.textContent = "00";
          if (sEl) sEl.textContent = "00";
          cdRoot.classList.add("hero-countdown--done");
          clearInterval(window._codedCountdownTimer);
          window._codedCountdownTimer = null;
          return;
        }
        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins  = Math.floor((diff % 3600000) / 60000);
        const secs  = Math.floor((diff % 60000) / 1000);
        if (dEl) dEl.textContent = String(days);
        if (hEl) hEl.textContent = pad(hours);
        if (mEl) mEl.textContent = pad(mins);
        if (sEl) sEl.textContent = pad(secs);
      };
      tick();
      window._codedCountdownTimer = setInterval(tick, 1000);
    }

    // Sticky mobile CTA — opens the inquiry modal pre-filled with this program
    const stickyMobile = $("#stickyCtaMobile");
    if (stickyMobile) {
      stickyMobile.style.display = "";
      const btn = $("#stickyCtaLink");
      if (btn) {
        btn.onclick = (e) => { e.preventDefault(); openInquiryModal({ programSlug: p.slug }); };
      }
    }
    // Replace the two big "Request Seats & Pricing" mailto anchors on the detail page
    document.querySelectorAll(`a.btn-primary[href="${mailto}"]`).forEach(a => {
      a.removeAttribute("href");
      a.setAttribute("role", "button");
      a.style.cursor = "pointer";
      a.addEventListener("click", (e) => { e.preventDefault(); openInquiryModal({ programSlug: p.slug }); });
    });

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

  // ---------------- Enterprise inquiry page ----------------
  // A dedicated page (not a modal, not a mailto) where companies brief us on the
  // training they want. Mirrors the public-friendly slice of CODED's internal BD
  // intake: who you are, what your team needs, how many seats, when, in what shape.

  const ENT_INDUSTRIES = [
    "Banking & Finance", "Government & Public Sector", "Telecom",
    "Energy & Industrials", "Healthcare", "Retail & E-commerce",
    "Education", "Technology / Software", "Consulting & Professional Services",
    "Other",
  ];
  const ENT_REGIONS = ["Kuwait", "Qatar", "UAE", "Saudi Arabia", "Bahrain", "Oman", "Other"];
  const ENT_SIZES = [
    { value: "1–5",   label: "1–5 people" },
    { value: "6–15",  label: "6–15 people" },
    { value: "16–30", label: "16–30 people" },
    { value: "31–60", label: "31–60 people" },
    { value: "60+",   label: "60+ people" },
  ];
  const ENT_DELIVERY = [
    { value: "CODED Campus",   label: "At CODED Campus",     hint: "Kuwait Free Trade Zone" },
    { value: "On-site",        label: "At our offices",      hint: "We bring the program to you" },
    { value: "Virtual",        label: "Virtual",             hint: "Live online sessions" },
    { value: "Hybrid",         label: "Hybrid",              hint: "Mix of on-site and virtual" },
    { value: "Open / Flexible",label: "Open to suggestions", hint: "Recommend what fits best" },
  ];
  const ENT_SCHEDULE = [
    { value: "Morning",  label: "Morning" },
    { value: "Evening",  label: "Evening" },
    { value: "Weekend",  label: "Weekend" },
    { value: "Flexible", label: "Flexible" },
  ];
  const ENT_LANGUAGE = [
    { value: "English",   label: "English" },
    { value: "Arabic",    label: "Arabic" },
    { value: "Bilingual", label: "Bilingual" },
  ];

  function enterpriseUrlFor(p) {
    return p && p.slug ? `#/enterprise?program=${encodeURIComponent(p.slug)}` : `#/enterprise`;
  }

  function renderEnterpriseForm({ programSlug } = {}) {
    const app = $("#app");
    const preselected = (() => {
      if (!programSlug) return new Set();
      const p = slugToProgram(programSlug);
      return p ? new Set([p.slug]) : new Set();
    })();
    const eyebrowProgram = programSlug ? slugToProgram(programSlug) : null;

    document.title = "Enterprise Inquiry · CODED";

    const programCard = (p) => {
      const checked = preselected.has(p.slug) ? "checked" : "";
      const dur = p.duration_label || "";
      return `
        <label class="ent-prog" data-slug="${escapeHtml(p.slug)}">
          <input type="checkbox" name="programs" value="${escapeHtml(p.slug)}" ${checked} />
          <span class="ent-prog__check" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
          </span>
          <span class="ent-prog__body">
            <span class="ent-prog__topic" data-topic="${escapeHtml(p.topic)}">${escapeHtml(p.topic)}</span>
            <span class="ent-prog__name">${escapeHtml(p.name)}</span>
            <span class="ent-prog__meta">${escapeHtml(p.format)} · ${escapeHtml(dur)}</span>
          </span>
        </label>`;
    };

    app.innerHTML = `
      <section class="ent-hero">
        <div class="ent-hero__bg" aria-hidden="true">
          <div class="ent-hero__grid"></div>
          <div class="ent-hero__orb ent-hero__orb--a"></div>
          <div class="ent-hero__orb ent-hero__orb--b"></div>
        </div>
        <div class="container ent-hero__inner">
          <div class="breadcrumb breadcrumb--light">
            <a href="#/">Home</a><span>/</span>
            <span>Enterprise Inquiry</span>
          </div>
          <div class="eyebrow eyebrow--light"><span>${eyebrowProgram ? `Enterprise inquiry · ${escapeHtml(eyebrowProgram.name)}` : "Enterprise inquiry · Custom programs"}</span></div>
          <h1>Tell us what your team<br/><span class="accent-soft">needs to build.</span></h1>
          <p class="lede lede--light">Six short steps. We'll come back within one business day with a written proposal — programs, dates, and group pricing.</p>
        </div>
      </section>

      <section class="ent-form-wrap">
        <div class="container ent-form-wrap__inner">

          <form class="ent-form" id="entForm" autocomplete="on" novalidate>

            <!-- Section 1 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 01 · About you ]</span>
                <h2>Who should we follow up with?</h2>
              </div>
              <div class="ent-grid ent-grid--2">
                <label class="ent-field">
                  <span>Your name <em>*</em></span>
                  <input type="text" name="name" required autocomplete="name" placeholder="Full name" />
                </label>
                <label class="ent-field">
                  <span>Your role</span>
                  <input type="text" name="role" autocomplete="organization-title" placeholder="e.g. Head of L&amp;D, CTO, HR Director" />
                </label>
                <label class="ent-field">
                  <span>Work email <em>*</em></span>
                  <input type="email" name="email" required autocomplete="email" placeholder="you@company.com" />
                </label>
                <label class="ent-field">
                  <span>Phone (optional)</span>
                  <input type="tel" name="phone" autocomplete="tel" placeholder="+965 …" />
                </label>
              </div>
            </fieldset>

            <!-- Section 2 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 02 · Your company ]</span>
                <h2>Where is the team based?</h2>
              </div>
              <div class="ent-grid ent-grid--2">
                <label class="ent-field">
                  <span>Company name <em>*</em></span>
                  <input type="text" name="company" required autocomplete="organization" placeholder="Legal or commercial name" />
                </label>
                <label class="ent-field">
                  <span>Industry</span>
                  <select name="industry">
                    <option value="">Select industry…</option>
                    ${ENT_INDUSTRIES.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join("")}
                  </select>
                </label>
                <label class="ent-field">
                  <span>Country / Region <em>*</em></span>
                  <select name="region" required>
                    <option value="">Select region…</option>
                    ${ENT_REGIONS.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
                  </select>
                </label>
                <label class="ent-field">
                  <span>Company website (optional)</span>
                  <input type="url" name="website" autocomplete="url" placeholder="https://…" />
                </label>
              </div>
            </fieldset>

            <!-- Section 3 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 03 · Programs of interest ]</span>
                <h2>Pick the programs you'd like for your team.</h2>
                <p class="ent-section__sub">Tick as many as you want — or tick "Recommend" if you'd rather we suggest the fit.</p>
              </div>
              <div class="ent-prog-grid" role="group" aria-label="Programs of interest">
                ${PROGRAMS.map(programCard).join("")}
                <label class="ent-prog ent-prog--special" data-slug="__recommend">
                  <input type="checkbox" name="programs" value="__recommend" />
                  <span class="ent-prog__check" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
                  </span>
                  <span class="ent-prog__body">
                    <span class="ent-prog__topic ent-prog__topic--ghost">Recommend</span>
                    <span class="ent-prog__name">Not sure yet — recommend based on goals</span>
                    <span class="ent-prog__meta">We'll suggest the closest fit after a short call</span>
                  </span>
                </label>
                <label class="ent-prog ent-prog--special" data-slug="__custom">
                  <input type="checkbox" name="programs" value="__custom" />
                  <span class="ent-prog__check" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
                  </span>
                  <span class="ent-prog__body">
                    <span class="ent-prog__topic ent-prog__topic--ghost">Custom</span>
                    <span class="ent-prog__name">Custom / hybrid program</span>
                    <span class="ent-prog__meta">Design something tailored end-to-end</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <!-- Section 4 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 04 · Team size &amp; timing ]</span>
                <h2>How many people, and when?</h2>
              </div>
              <div class="ent-field ent-field--full">
                <span>Number of participants <em>*</em></span>
                <div class="ent-chips" role="radiogroup" aria-label="Number of participants">
                  ${ENT_SIZES.map((s, i) => `
                    <label class="ent-chip">
                      <input type="radio" name="size" value="${escapeHtml(s.value)}" ${i === 1 ? "" : ""} required />
                      <span>${escapeHtml(s.label)}</span>
                    </label>`).join("")}
                </div>
              </div>
              <div class="ent-grid ent-grid--2" style="margin-top: 18px;">
                <label class="ent-field">
                  <span>Preferred timing window</span>
                  <input type="text" name="timing" placeholder="e.g. March–April 2026, before Ramadan, Q3" />
                </label>
                <label class="ent-field">
                  <span>How urgent is this?</span>
                  <select name="urgency">
                    <option value="">Select…</option>
                    <option value="Within 2 weeks">Within 2 weeks</option>
                    <option value="Within a month">Within a month</option>
                    <option value="Next quarter">Next quarter</option>
                    <option value="Just exploring">Just exploring options</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <!-- Section 5 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 05 · How should we shape it? ]</span>
                <h2>Tell us your preferences.</h2>
                <p class="ent-section__sub">All optional — pick what matters, leave the rest open.</p>
              </div>

              <div class="ent-field ent-field--full">
                <span>Delivery format</span>
                <div class="ent-chips ent-chips--stacked" role="radiogroup" aria-label="Delivery format">
                  ${ENT_DELIVERY.map(d => `
                    <label class="ent-chip ent-chip--lg">
                      <input type="radio" name="delivery" value="${escapeHtml(d.value)}" />
                      <span class="ent-chip__main">${escapeHtml(d.label)}</span>
                      <span class="ent-chip__hint">${escapeHtml(d.hint)}</span>
                    </label>`).join("")}
                </div>
              </div>

              <div class="ent-grid ent-grid--2" style="margin-top: 22px;">
                <div class="ent-field">
                  <span>Schedule preference</span>
                  <div class="ent-chips" role="radiogroup" aria-label="Schedule preference">
                    ${ENT_SCHEDULE.map(s => `
                      <label class="ent-chip">
                        <input type="radio" name="schedule" value="${escapeHtml(s.value)}" />
                        <span>${escapeHtml(s.label)}</span>
                      </label>`).join("")}
                  </div>
                </div>
                <div class="ent-field">
                  <span>Language of instruction</span>
                  <div class="ent-chips" role="radiogroup" aria-label="Language of instruction">
                    ${ENT_LANGUAGE.map(l => `
                      <label class="ent-chip">
                        <input type="radio" name="language" value="${escapeHtml(l.value)}" />
                        <span>${escapeHtml(l.label)}</span>
                      </label>`).join("")}
                  </div>
                </div>
              </div>

              <label class="ent-field ent-field--full" style="margin-top: 22px;">
                <span>Goals &amp; success metrics (optional)</span>
                <textarea name="goals" rows="3" placeholder="e.g. Build 10 internal AI champions · Pass a cybersecurity audit · Ship a working dashboard per team"></textarea>
              </label>
            </fieldset>

            <!-- Section 6 -->
            <fieldset class="ent-section reveal-up">
              <div class="ent-section__head">
                <span class="eyebrow-tag">[ 06 · Anything else? ]</span>
                <h2>Other context we should know.</h2>
              </div>
              <label class="ent-field ent-field--full">
                <span>Notes (optional)</span>
                <textarea name="notes" rows="4" placeholder="Existing skill level, scheduling constraints, prior training, procurement requirements…"></textarea>
              </label>
            </fieldset>

            <div class="ent-submit reveal-up">
              <p class="ent-submit__note">Goes straight to the enterprise team. We reply within one business day, and never share your details.</p>
              <div class="ent-submit__row">
                <span class="ent-form__status" id="entFormStatus" aria-live="polite"></span>
                <button type="submit" class="btn btn-primary btn-lg" id="entFormSubmit">Send inquiry ${ICON.arrow}</button>
              </div>
            </div>
          </form>

          <!-- Success state, shown after a successful submit -->
          <div class="ent-success" id="entSuccess" hidden>
            <div class="ent-success__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.8 2.8L16 9.5"/></svg>
            </div>
            <h2>Thanks <span id="entSuccessName"></span> — we've got it.</h2>
            <p class="ent-success__sub" id="entSuccessSummary"></p>
            <ol class="ent-success__steps">
              <li><strong>Within 1 business day</strong> — a CODED enterprise lead reviews your brief and replies by email.</li>
              <li><strong>Short discovery call</strong> — 20 minutes to confirm scope, audience level, and timing.</li>
              <li><strong>Tailored proposal</strong> — outline, group pricing, and the next available cohort.</li>
            </ol>
            <div class="ent-success__actions">
              <a class="btn btn-secondary" href="#/">Browse the catalog</a>
              <a class="btn btn-primary" href="#/enterprise" id="entSuccessRestart">Send another inquiry ${ICON.arrow}</a>
            </div>
          </div>

        </div>
      </section>
    `;

    setupEnterpriseForm();
    window.scrollTo({ top: 0 });
  }

  function setupEnterpriseForm() {
    const form    = document.getElementById("entForm");
    const success = document.getElementById("entSuccess");
    const status  = document.getElementById("entFormStatus");
    const submit  = document.getElementById("entFormSubmit");
    if (!form || !success || !status || !submit) return;

    // Mutual exclusion: ticking "Recommend" or "Custom" doesn't preclude real
    // programs, but ticking a real program clears the recommend/custom marker
    // if it would otherwise look contradictory. Kept loose — the BD team can
    // sort intent on the call.
    form.querySelectorAll('input[name="programs"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const card = cb.closest(".ent-prog");
        if (card) card.classList.toggle("is-on", cb.checked);
      });
      // Initial state for pre-selected program
      const card = cb.closest(".ent-prog");
      if (card && cb.checked) card.classList.add("is-on");
    });

    // Chip radios: paint the chip when its hidden radio is selected.
    form.querySelectorAll('.ent-chip input[type="radio"]').forEach(r => {
      r.addEventListener("change", () => {
        const group = form.querySelectorAll(`.ent-chip input[name="${r.name}"]`);
        group.forEach(other => {
          const chip = other.closest(".ent-chip");
          if (chip) chip.classList.toggle("is-on", other.checked);
        });
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.textContent = "";
      status.removeAttribute("data-tone");

      const data = new FormData(form);
      const name    = (data.get("name") || "").toString().trim();
      const email   = (data.get("email") || "").toString().trim();
      const company = (data.get("company") || "").toString().trim();
      const region  = (data.get("region") || "").toString().trim();
      const size    = (data.get("size") || "").toString().trim();
      const programSlugs = data.getAll("programs").map(v => v.toString());

      // Client-side validation (matches the API)
      const missing = [];
      if (!name) missing.push("name");
      if (!email) missing.push("email");
      if (!company) missing.push("company");
      if (!region) missing.push("region");
      if (!size) missing.push("number of participants");
      if (missing.length) {
        status.textContent = `Please fill in: ${missing.join(", ")}.`;
        status.setAttribute("data-tone", "error");
        const first = form.querySelector(`[name="${missing[0] === "number of participants" ? "size" : missing[0]}"]`);
        if (first && first.focus) first.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = "That email address doesn't look quite right.";
        status.setAttribute("data-tone", "error");
        form.querySelector('[name="email"]').focus();
        return;
      }

      // Resolve program slugs to display names
      const programs = [];
      let wantsRecommend = false, wantsCustom = false;
      programSlugs.forEach(slug => {
        if (slug === "__recommend") { wantsRecommend = true; return; }
        if (slug === "__custom")    { wantsCustom = true; return; }
        const p = slugToProgram(slug);
        if (p) programs.push(p.name);
      });
      if (wantsRecommend) programs.push("Recommend based on goals");
      if (wantsCustom)    programs.push("Custom / hybrid program");

      const role     = (data.get("role") || "").toString().trim();
      const industry = (data.get("industry") || "").toString().trim();
      const website  = (data.get("website") || "").toString().trim();
      const timing   = (data.get("timing") || "").toString().trim();
      const urgency  = (data.get("urgency") || "").toString().trim();
      const delivery = (data.get("delivery") || "").toString().trim();
      const schedule = (data.get("schedule") || "").toString().trim();
      const language = (data.get("language") || "").toString().trim();
      const goals    = (data.get("goals") || "").toString().trim();
      const notes    = (data.get("notes") || "").toString().trim();

      // The /api/inquiry shape is fixed — we pack the rich enterprise fields
      // into the existing free-text fields so BD reads everything in one place.
      const descParts = [];
      if (industry) descParts.push(`Industry: ${industry}`);
      if (region)   descParts.push(`Region: ${region}`);
      if (role)     descParts.push(`POC role: ${role}`);
      if (website)  descParts.push(`Website: ${website}`);

      const needsParts = [];
      if (programs.length) needsParts.push(`Programs of interest: ${programs.join(", ")}`);
      if (delivery) needsParts.push(`Delivery: ${delivery}`);
      if (schedule) needsParts.push(`Schedule: ${schedule}`);
      if (language) needsParts.push(`Language: ${language}`);
      if (goals)    needsParts.push(`Goals: ${goals}`);

      const timingParts = [];
      if (size)    timingParts.push(`Participants: ${size}`);
      if (timing)  timingParts.push(`Preferred window: ${timing}`);
      if (urgency) timingParts.push(`Urgency: ${urgency}`);

      const payload = {
        source:  "Enterprise Form",
        contact: { name, email, phone: (data.get("phone") || "").toString().trim() },
        company: { name: company, description: descParts.join(" · ") },
        answers: {
          needs:         needsParts.join(" · "),
          teamAndTiming: timingParts.join(" · "),
        },
        programs,
        notes,
        pageUrl: location.href,
      };

      submit.disabled = true;
      status.textContent = "Sending…";

      try {
        const r = await fetch("/api/inquiry", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        // Success — swap the form for the confirmation card.
        document.getElementById("entSuccessName").textContent = name.split(/\s+/)[0] || "";
        const summaryBits = [];
        if (programs.length) summaryBits.push(`${programs.length} program${programs.length === 1 ? "" : "s"}`);
        if (size)            summaryBits.push(`${size} people`);
        if (region)          summaryBits.push(region);
        document.getElementById("entSuccessSummary").textContent =
          summaryBits.length ? `Summary: ${summaryBits.join(" · ")}` : "We'll be in touch shortly.";
        form.hidden = true;
        success.hidden = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        status.textContent = "Couldn't reach the server. Email enterprise@joincoded.com and we'll pick it up.";
        status.setAttribute("data-tone", "error");
        submit.disabled = false;
      }
    });
  }
  // Expose for any external link that wants to deep-link to the form
  window.renderEnterpriseForm = renderEnterpriseForm;

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

  // Subtle parallax for the detail hero: any [data-parallax="<factor>"]
  // element inside [data-parallax-root] translates Y by scroll × factor.
  // factor < 0 moves with scroll (text rises slower), > 0 moves opposite.
  // Single rAF-throttled listener; cleaned up between renders implicitly
  // because the elements vanish when the route changes.
  function setupHeroParallax() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector("[data-parallax-root]");
    if (!root) return;
    const targets = Array.from(root.querySelectorAll("[data-parallax]")).map(el => ({
      el,
      factor: parseFloat(el.getAttribute("data-parallax")) || 0,
    }));
    if (!targets.length) return;

    let ticking = false;
    function update() {
      const y = window.scrollY;
      const rect = root.getBoundingClientRect();
      // Only animate while the hero is roughly in view; outside that, skip work.
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) { ticking = false; return; }
      for (const t of targets) {
        t.el.style.transform = `translate3d(0, ${y * t.factor}px, 0)`;
      }
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    if (!setupHeroParallax._wired) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      setupHeroParallax._wired = true;
    }
    setupHeroParallax._onScroll = onScroll;
    update();
  }

  // Header gains a subtle shadow once user has scrolled past the hero (or 8px on light pages).
  function evalHeaderScroll() {
    const header = document.querySelector(".site-header");
    if (!header) return;
    const darkHero = document.querySelector(".hero--dark");
    const threshold = darkHero ? (darkHero.offsetHeight - header.offsetHeight - 8) : 8;
    header.classList.toggle("is-scrolled", window.scrollY > threshold);
  }
  function setupHeaderScroll() {
    if (setupHeaderScroll._wired) { evalHeaderScroll(); return; }
    setupHeaderScroll._wired = true;
    window.addEventListener("scroll", evalHeaderScroll, { passive: true });
    window.addEventListener("resize", evalHeaderScroll, { passive: true });
    evalHeaderScroll();
  }

  // ---------------- Router ----------------
  function route() {
    // Reset transient UI on every route change
    const stickyMobile = $("#stickyCtaMobile");
    if (stickyMobile) stickyMobile.style.display = "none";
    document.getElementById("courseLD")?.remove();

    const hash = location.hash || "#/";
    const path = hash.split("?")[0];
    // Catalog route owns its own body class; strip it before every re-route.
    if (typeof window.teardownCatalog === "function") window.teardownCatalog();
    if (path.startsWith("#/catalog/")) {
      const slug = path.replace("#/catalog/", "").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
      if (typeof window.renderCatalog === "function") window.renderCatalog(slug);
    } else if (path === "#/enterprise" || path.startsWith("#/enterprise/")) {
      const params = new URLSearchParams(hash.split("?")[1] || "");
      renderEnterpriseForm({ programSlug: params.get("program") });
    } else if (path.startsWith("#/programs/")) {
      const slug = path.replace("#/programs/", "").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
      renderDetail(slug);
    } else {
      renderLanding();
    }
    setupReveals();
    setupHeaderScroll();
    setupHeroParallax();
  }

  // ---------------- Init ----------------
  // Reload shouldn't restore scroll — we want the user to see the hero each time
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  document.addEventListener("DOMContentLoaded", () => {
    setupHeaderScroll();
    setupInquiryModal();
    setupPdfRequestModal();
    route();
    window.addEventListener("hashchange", route);
  });
})();
