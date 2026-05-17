"""
generate_pdfs.py — CODED Enterprise Programs brochure generator
Run: python3 generate_pdfs.py
Outputs: assets/pdfs/<slug>.pdf for every Published program
"""

import json5, os, re
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas

# ── Brand colours ──────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#11213D")
NAVY_LIGHT = colors.HexColor("#1A2F52")
BLUE       = colors.HexColor("#0258BE")
BLUE_PALE  = colors.HexColor("#C8D9F0")
OFF_WHITE  = colors.HexColor("#F5F6F8")
MID_GREY   = colors.HexColor("#8A99AE")
BORDER     = colors.HexColor("#DDE3EC")
TEXT_DARK  = colors.HexColor("#11213D")
TEXT_MID   = colors.HexColor("#2D3F55")
TEXT_LIGHT = colors.HexColor("#3A4F6A")
WHITE      = colors.white

# ── Page geometry ───────────────────────────────────────────────────────────────
W, H   = A4          # 595.27 × 841.89 pt
ML     = 44          # left margin
MR     = 44          # right margin
CW     = W - ML - MR

# ── Paths ───────────────────────────────────────────────────────────────────────
BASE    = os.path.dirname(os.path.abspath(__file__))
LOGO_W  = os.path.join(BASE, "assets/brand/logo-white.png")
OUT_DIR = os.path.join(BASE, "assets/pdfs")
JS_FILE = os.path.join(BASE, "assets/programs.js")

os.makedirs(OUT_DIR, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────────────
# 1. Parse programs.js
# ──────────────────────────────────────────────────────────────────────────────
def parse_programs():
    raw = open(JS_FILE, encoding="utf-8").read()
    raw = raw.replace("CODED_LOCATION.short",  '"CODED Campus, Free Trade Zone"')
    raw = raw.replace("CODED_LOCATION.label",  '"CODED Campus, Free Trade Zone, Kuwait"')
    raw = raw.replace("CODED_LOCATION.maps_url", '"https://maps.google.com"')
    for key in ("ammar", "ali_taqi", "alhamzah", "aya", "omar"):
        raw = raw.replace(f"INSTRUCTORS.{key}", f'{{key: "{key}"}}')
    m = re.search(r"window\.CODED_PROGRAMS\s*=\s*(\[.*?\]);", raw, re.DOTALL)
    if not m:
        raise RuntimeError("Could not find window.CODED_PROGRAMS")
    return json5.loads(m.group(1))

# ──────────────────────────────────────────────────────────────────────────────
# 2. Low-level drawing helpers
# ──────────────────────────────────────────────────────────────────────────────
def rect(c, x, y, w, h, fill=None, stroke_color=None, lw=0.5, radius=0):
    if fill:      c.setFillColor(fill)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.setLineWidth(lw)
    if radius:
        c.roundRect(x, y, w, h, radius, fill=bool(fill), stroke=bool(stroke_color))
    else:
        c.rect(x, y, w, h, fill=bool(fill), stroke=bool(stroke_color))

def text(c, s, x, y, fn="Helvetica", size=10, color=TEXT_DARK,
         align="left", max_w=None):
    c.setFont(fn, size)
    c.setFillColor(color)
    if max_w:
        while s and c.stringWidth(s, fn, size) > max_w:
            s = s[:-1]
        if not s.endswith("…"):
            s = s + "…"
    if   align == "right":  c.drawRightString(x, y, s)
    elif align == "center": c.drawCentredString(x, y, s)
    else:                   c.drawString(x, y, s)

def wrap(c, s, x, y, w, fn="Helvetica", size=10, color=TEXT_DARK, lh=14):
    """Word-wrap text; return y after last line."""
    c.setFont(fn, size)
    c.setFillColor(color)
    words = s.split()
    lines, cur = [], []
    for word in words:
        test = " ".join(cur + [word])
        if c.stringWidth(test, fn, size) <= w:
            cur.append(word)
        else:
            if cur: lines.append(" ".join(cur))
            cur = [word]
    if cur: lines.append(" ".join(cur))
    for ln in lines:
        c.drawString(x, y, ln)
        y -= lh
    return y

def pill_badge(c, label, x, y, bg=BLUE, fg=WHITE, size=7.5,
               px=9, py=3.5):
    """Draw pill; return its width."""
    fn  = "Helvetica-Bold"
    tw  = c.stringWidth(label, fn, size)
    pw  = tw + px * 2
    ph  = size + py * 2
    rect(c, x, y - ph + py, pw, ph, fill=bg, radius=3)
    c.setFont(fn, size); c.setFillColor(fg)
    c.drawString(x + px, y - size + py + 1, label)
    return pw

def divider(c, x, y, w=None):
    c.setStrokeColor(BORDER); c.setLineWidth(0.5)
    c.line(x, y, x + (w or CW), y)

def section_tag(c, label, x, y):
    text(c, f"[ {label} ]", x, y, "Helvetica-Bold", 7, BLUE)

def fmt_date(iso):
    if not iso: return ""
    MONTHS = ["Jan","Feb","Mar","Apr","May","Jun",
               "Jul","Aug","Sep","Oct","Nov","Dec"]
    y, m, d = iso.split("-")
    return f"{int(d)} {MONTHS[int(m)-1]} {y}"

def fmt_price(kwd):
    return f"KWD {int(kwd):,} / seat" if kwd else "On request"

def fmt_timing(pat):
    m = re.search(r"\b(\d{1,2})(am|pm)[–\-](\d{1,2})(am|pm)\b", pat, re.I)
    if m:
        def ampm(v, s): return f"{v}:00 {s.upper()}"
        return f"{ampm(m.group(1),m.group(2))} – {ampm(m.group(3),m.group(4))}"
    return pat

# ──────────────────────────────────────────────────────────────────────────────
# 3. Header  (navy block, top of every first page)
# ──────────────────────────────────────────────────────────────────────────────
HEADER_H = 260   # taller so content never crowds the facts strip
FACTS_H  = 56
FOOTER_H = 38

def draw_header(c, p):
    # ── Navy background ───────────────────────────────────────────────
    rect(c, 0, H - HEADER_H, W, HEADER_H, fill=NAVY)

    # Dot-grid watermark (right half)
    c.setFillColor(NAVY_LIGHT)
    for col in range(22):
        for row in range(10):
            dx = W * 0.52 + col * 20
            dy = H - HEADER_H + 8 + row * 24
            if dx < W - 8:
                c.circle(dx, dy, 1.2, fill=1, stroke=0)

    # Blue accent stripe at very top
    rect(c, 0, H - 5, W, 5, fill=BLUE)

    # ── Logo ──────────────────────────────────────────────────────────
    try:
        lh = 30
        c.drawImage(LOGO_W, ML, H - 52, width=lh * 2.5, height=lh,
                    mask="auto", preserveAspectRatio=True)
    except Exception:
        text(c, "CODED", ML, H - 48, "Helvetica-Bold", 20, WHITE)

    # ── Eyebrow ───────────────────────────────────────────────────────
    text(c, "Enterprise Programs  ·  2026", ML, H - 78,
         "Helvetica", 8, BLUE_PALE)

    # ── Topic pill (on its own line, well below eyebrow) ──────────────
    topic = p.get("topic", "")
    pill_badge(c, topic.upper(), ML, H - 102, bg=BLUE, fg=WHITE, size=7.5)

    # ── Program name (starts below pill, never overlaps it) ───────────
    name      = p.get("name", "")
    name_size = 28 if len(name) < 30 else 23 if len(name) < 45 else 18
    line_h    = name_size + 7
    # Title baseline starts 28 pt below the pill baseline
    y_name = H - 134
    wrap(c, name, ML, y_name, CW * 0.70,
         "Helvetica-Bold", name_size, WHITE, lh=line_h)

    # ── One-liner (below name, generous gap above facts strip) ────────
    one_liner = p.get("one_liner", "")
    # Leave at least 48 pt gap above the facts strip
    y_liner = H - HEADER_H + FACTS_H + 52  # anchored from bottom of navy block
    wrap(c, one_liner, ML, y_liner, CW * 0.72,
         "Helvetica", 9.5, BLUE_PALE, lh=14)

    # ── Facts strip (white band at bottom of header) ──────────────────
    fy = H - HEADER_H
    rect(c, 0, fy, W, FACTS_H, fill=OFF_WHITE)
    divider(c, 0, fy + FACTS_H, w=W)
    divider(c, 0, fy, w=W)

    facts = [
        ("Start date",  fmt_date(p.get("start_date", ""))),
        ("Duration",    p.get("duration_label", "")),
        ("Total hours", f"{p.get('total_hours','')} hrs"),
        ("Per seat",    fmt_price(p.get("price_per_seat_kwd"))),
        ("Timing",      fmt_timing(p.get("session_pattern", ""))),
    ]
    cw = W / len(facts)
    for i, (lbl, val) in enumerate(facts):
        cx = i * cw + cw / 2
        text(c, lbl.upper(), cx, fy + 36, "Helvetica", 6.5, MID_GREY, align="center")
        text(c, val,         cx, fy + 18, "Helvetica-Bold", 9, NAVY,     align="center")
        if i > 0:
            c.setStrokeColor(BORDER); c.setLineWidth(0.5)
            c.line(i * cw, fy + 8, i * cw, fy + FACTS_H - 8)


def draw_footer(c, page_num, total):
    rect(c, 0, 0, W, FOOTER_H, fill=NAVY)
    text(c, "enterprise@joincoded.com", ML, 13, "Helvetica", 8, BLUE_PALE)
    text(c, "coded.kw", W / 2, 13, "Helvetica", 8, BLUE_PALE, align="center")
    text(c, f"Page {page_num} / {total}", W - MR, 13,
         "Helvetica", 8, MID_GREY, align="right")


# ──────────────────────────────────────────────────────────────────────────────
# 4. Page 1 body
# ──────────────────────────────────────────────────────────────────────────────
def draw_page1_body(c, p):
    # usable zone
    top    = H - HEADER_H - 28
    bottom = FOOTER_H + 16
    x, y   = ML, top

    # ── Overview ──────────────────────────────────────────────────────
    section_tag(c, "OVERVIEW", x, y);  y -= 15
    overview = p.get("overview", "")
    y = wrap(c, overview, x, y, CW, "Helvetica", 9.5, TEXT_MID, lh=15)
    y -= 22
    divider(c, x, y);  y -= 18

    # ── Outcomes ──────────────────────────────────────────────────────
    section_tag(c, "WHAT YOU'LL WALK OUT WITH", x, y);  y -= 15
    for out in p.get("outcomes", []):
        if y < bottom + 24: break
        c.setFillColor(BLUE)
        c.circle(x + 4, y + 2.5, 2.5, fill=1, stroke=0)
        y = wrap(c, out, x + 14, y, CW - 14, "Helvetica", 9.5, TEXT_DARK, lh=14)
        y -= 7
    y -= 12
    divider(c, x, y);  y -= 18

    # ── Cohort dates ──────────────────────────────────────────────────
    iterations = p.get("iterations", [])
    if iterations and y > bottom + 50:
        section_tag(c, "COHORT DATES", x, y);  y -= 15
        for i, it in enumerate(iterations):
            if y < bottom + 18: break
            tag_col = BLUE if i == 0 else MID_GREY
            tag_lbl = "Next cohort" if i == 0 else "Open"
            text(c, it.get("dates", ""), x, y, "Helvetica-Bold", 9.5, TEXT_DARK)
            text(c, tag_lbl, x + 220, y, "Helvetica", 9, tag_col)
            y -= 16
        y -= 10
        divider(c, x, y);  y -= 18

    # ── CTA box (anchored near bottom, not just floating) ─────────────
    box_h  = 52
    box_y  = FOOTER_H + 16
    rect(c, x, box_y, CW, box_h, fill=OFF_WHITE, radius=5)
    # left accent bar
    rect(c, x, box_y, 3, box_h, fill=BLUE, radius=1)
    text(c, "Ready to enrol your team?",
         x + 14, box_y + box_h - 17, "Helvetica-Bold", 10.5, TEXT_DARK)
    text(c, "enterprise@joincoded.com  ·  coded.kw",
         x + 14, box_y + box_h - 32, "Helvetica", 9, BLUE)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Page 2: curriculum + audience
# ──────────────────────────────────────────────────────────────────────────────
def draw_page2(c, p):
    c.showPage()

    # ── Navy top band ─────────────────────────────────────────────────
    band_h = 72
    rect(c, 0, H - band_h, W, band_h, fill=NAVY)
    rect(c, 0, H - 5, W, 5, fill=BLUE)
    # accent line under band
    rect(c, 0, H - band_h, W, 2, fill=BLUE)

    text(c, "[ CURRICULUM ]", ML, H - 28, "Helvetica-Bold", 7.5, BLUE_PALE)
    text(c, p.get("name",""), ML, H - 50, "Helvetica-Bold", 15, WHITE,
         max_w=CW)

    x       = ML
    y       = H - band_h - 28
    bottom  = FOOTER_H + 16
    structure = p.get("structure", [])

    # Pre-calculate total height needed so items fill the page evenly
    # Each item: pill row(16) + title(14) + focus lines + gap
    # We just render normally; items are spaced to fill nicely
    ITEM_GAP = 18   # gap between items

    for i, ph in enumerate(structure):
        if y < bottom + 60: break

        raw   = ph.get("phase_name", "")
        parts = raw.split(",", 1)
        step  = parts[0].strip()
        title = parts[1].strip() if len(parts) > 1 else raw
        hrs   = ph.get("hours", "")
        focus = ph.get("focus", "")

        # Step pill + hours on same row
        pill_badge(c, step.upper(), x, y + 4,
                   bg=NAVY_LIGHT, fg=BLUE_PALE, size=7.5, px=8, py=3)
        text(c, f"{hrs} hrs", x + CW, y + 2,
             "Helvetica", 8.5, MID_GREY, align="right")

        y -= 17
        text(c, title, x, y, "Helvetica-Bold", 10.5, TEXT_DARK)
        y -= 14
        y = wrap(c, focus, x, y, CW, "Helvetica", 8.5, TEXT_LIGHT, lh=13)
        y -= ITEM_GAP

        if i < len(structure) - 1:
            divider(c, x, y + ITEM_GAP - 8)

    # ── Audience / Who this is for ────────────────────────────────────
    audience = p.get("audience_detail", "")
    if audience and y > bottom + 40:
        y -= 6
        divider(c, x, y);  y -= 16
        section_tag(c, "WHO THIS IS FOR", x, y);  y -= 14
        wrap(c, audience, x, y, CW, "Helvetica", 9, TEXT_MID, lh=14)


# ──────────────────────────────────────────────────────────────────────────────
# 6. Main
# ──────────────────────────────────────────────────────────────────────────────
def generate_pdf(p):
    slug = p.get("slug", p.get("id", "program"))
    out  = os.path.join(OUT_DIR, f"{slug}.pdf")
    c    = canvas.Canvas(out, pagesize=A4)
    c.setTitle(p.get("name", "CODED Program"))
    c.setAuthor("CODED")
    c.setSubject("Enterprise Training Brochure · 2026")

    draw_header(c, p)
    draw_page1_body(c, p)
    draw_footer(c, 1, 2)

    draw_page2(c, p)
    draw_footer(c, 2, 2)

    c.save()
    print(f"  ✓  {slug}.pdf")


def main():
    programs  = parse_programs()
    published = [p for p in programs if p.get("status") == "Published"]
    print(f"Generating {len(published)} PDFs → assets/pdfs/\n")
    for p in published:
        generate_pdf(p)
    print(f"\nDone. {len(published)} brochures saved to assets/pdfs/")


if __name__ == "__main__":
    main()
