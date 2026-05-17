"""
generate_pdfs.py — CODED Enterprise Programs brochure generator
Run: python3 generate_pdfs.py
Outputs: assets/pdfs/<slug>.pdf for every Published program
"""

import json, json5, os, re, textwrap
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

# ── Brand colours ─────────────────────────────────────────────────────────────
NAVY      = colors.HexColor("#11213D")
BLUE      = colors.HexColor("#0258BE")
BLUE_PALE = colors.HexColor("#D6E5FA")
OFF_WHITE = colors.HexColor("#F5F6F8")
MID_GREY  = colors.HexColor("#8A99AE")
BORDER    = colors.HexColor("#DDE3EC")
WHITE     = colors.white
BLACK     = colors.black

# ── Page geometry ──────────────────────────────────────────────────────────────
W, H  = A4                         # 595.27 × 841.89 pt
ML    = 40                         # left margin
MR    = 40                         # right margin
CW    = W - ML - MR               # content width

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE     = os.path.dirname(os.path.abspath(__file__))
LOGO_W   = os.path.join(BASE, "assets/brand/logo-white.png")   # white logo → navy bg
LOGO_N   = os.path.join(BASE, "assets/brand/logo-navy.png")    # navy logo → white bg
OUT_DIR  = os.path.join(BASE, "assets/pdfs")
JS_FILE  = os.path.join(BASE, "assets/programs.js")

os.makedirs(OUT_DIR, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────────────
# 1. Parse programs.js
# ──────────────────────────────────────────────────────────────────────────────
def parse_programs():
    raw = open(JS_FILE, encoding="utf-8").read()

    # Substitute CODED_LOCATION references
    raw = raw.replace("CODED_LOCATION.short",
                      '"CODED Campus, Free Trade Zone"')
    raw = raw.replace("CODED_LOCATION.label",
                      '"CODED Campus, Free Trade Zone, Kuwait"')
    raw = raw.replace("CODED_LOCATION.maps_url",
                      '"https://www.google.com/maps/search/?api=1&query=CODED+Kuwait+Free+Trade+Zone"')

    # Substitute INSTRUCTORS references with placeholder objects
    for key in ("ammar", "ali_taqi", "alhamzah", "aya", "omar"):
        raw = raw.replace(f"INSTRUCTORS.{key}", f'{{key: "{key}"}}')

    # Extract the array literal
    m = re.search(r"window\.CODED_PROGRAMS\s*=\s*(\[.*?\]);", raw, re.DOTALL)
    if not m:
        raise RuntimeError("Could not find window.CODED_PROGRAMS in programs.js")
    arr = m.group(1)

    # Use json5 which handles JS object syntax (unquoted keys, trailing commas, comments)
    return json5.loads(arr)

# ──────────────────────────────────────────────────────────────────────────────
# 2. Drawing helpers
# ──────────────────────────────────────────────────────────────────────────────
def font(bold=False, size=10):
    return ("Helvetica-Bold" if bold else "Helvetica", size)

def draw_rect(c, x, y, w, h, fill=None, stroke=None, radius=0):
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(0.5)
    if radius:
        c.roundRect(x, y, w, h, radius, fill=bool(fill), stroke=bool(stroke))
    else:
        c.rect(x, y, w, h, fill=bool(fill), stroke=bool(stroke))

def draw_text(c, text, x, y, font_name="Helvetica", size=10,
              color=BLACK, align="left", max_width=None):
    c.setFont(font_name, size)
    c.setFillColor(color)
    if max_width and c.stringWidth(text, font_name, size) > max_width:
        # simple truncation
        while text and c.stringWidth(text + "…", font_name, size) > max_width:
            text = text[:-1]
        text = text + "…"
    if align == "right":
        c.drawRightString(x, y, text)
    elif align == "center":
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)

def wrapped_text(c, text, x, y, width, font_name="Helvetica", size=10,
                 color=BLACK, line_height=14, max_lines=None):
    """Draw word-wrapped text, return y position after last line."""
    c.setFont(font_name, size)
    c.setFillColor(color)
    words = text.split()
    lines, line = [], []
    for word in words:
        test = " ".join(line + [word])
        if c.stringWidth(test, font_name, size) <= width:
            line.append(word)
        else:
            if line:
                lines.append(" ".join(line))
            line = [word]
    if line:
        lines.append(" ".join(line))
    if max_lines:
        lines = lines[:max_lines]
    for ln in lines:
        c.drawString(x, y, ln)
        y -= line_height
    return y

def pill(c, label, x, y, bg=BLUE, text_color=WHITE, size=8, padding_x=8, padding_y=4):
    """Draw a rounded pill badge."""
    fn = "Helvetica-Bold"
    tw = c.stringWidth(label, fn, size)
    pw = tw + padding_x * 2
    ph = size + padding_y * 2
    draw_rect(c, x, y - ph + padding_y, pw, ph, fill=bg, radius=3)
    c.setFont(fn, size)
    c.setFillColor(text_color)
    c.drawString(x + padding_x, y - size + padding_y + 1, label)
    return pw  # return width for chaining

def section_label(c, text, x, y):
    """[ SECTION ] eyebrow in blue."""
    draw_text(c, f"[ {text} ]", x, y, "Helvetica-Bold", 7, BLUE)

def divider(c, x, y, width=None):
    w = width or CW
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(x, y, x + w, y)

def fmt_price(kwd):
    if not kwd:
        return "On request"
    return f"KWD {int(kwd):,} / seat"

def fmt_date(iso):
    if not iso:
        return ""
    months = ["Jan","Feb","Mar","Apr","May","Jun",
               "Jul","Aug","Sep","Oct","Nov","Dec"]
    y, m, d = iso.split("-")
    return f"{int(d)} {months[int(m)-1]} {y}"

def fmt_timing(pattern):
    m1 = re.search(r"\b(\d{1,2})(am|pm)[–\-](\d{1,2})(am|pm)\b", pattern, re.I)
    if m1:
        return f"{m1.group(1)}:00 {m1.group(2).upper()} – {m1.group(3)}:00 {m1.group(4).upper()}"
    m2 = re.search(r"(\d{1,2}:\d{2})[–\-](\d{1,2}:\d{2})\s*(AM|PM)", pattern, re.I)
    if m2:
        return f"{m2.group(1)} – {m2.group(2)} {m2.group(3).upper()}"
    return pattern

# ──────────────────────────────────────────────────────────────────────────────
# 3. Page furniture (header, footer)
# ──────────────────────────────────────────────────────────────────────────────
HEADER_H  = 230   # navy header height
FOOTER_H  = 36

def draw_header(c, program):
    """Full-width navy header with logo and program name."""
    # Navy background
    draw_rect(c, 0, H - HEADER_H, W, HEADER_H, fill=NAVY)

    # Subtle dot-grid watermark (hand-drawn as small circles)
    c.setFillColor(colors.HexColor("#1A2F52"))
    dot_r = 1.2
    for col in range(20):
        for row in range(8):
            dx = W * 0.55 + col * 18
            dy = H - HEADER_H + 10 + row * 26
            if dx < W - 10:
                c.circle(dx, dy, dot_r, fill=1, stroke=0)

    # Blue accent bar at very top
    draw_rect(c, 0, H - 5, W, 5, fill=BLUE)

    # CODED logo (white version)
    try:
        logo_h = 28
        logo_w = logo_h * 2.5  # approximate aspect
        c.drawImage(LOGO_W, ML, H - 48, width=logo_w, height=logo_h,
                    mask="auto", preserveAspectRatio=True)
    except Exception:
        draw_text(c, "CODED", ML, H - 44, "Helvetica-Bold", 18, WHITE)

    # "Enterprise Programs · 2026" eyebrow
    draw_text(c, "Enterprise Programs  ·  2026", ML, H - 72,
              "Helvetica", 8, BLUE_PALE)

    # Topic pill
    topic = program.get("topic", "")
    pill(c, topic.upper(), ML, H - 88, bg=BLUE, text_color=WHITE, size=7)

    # Program name — large, white
    name = program.get("name", "")
    name_size = 26 if len(name) < 35 else 21 if len(name) < 50 else 17
    wrapped_text(c, name, ML, H - 108,
                 CW * 0.72, "Helvetica-Bold", name_size, WHITE,
                 line_height=name_size + 6)

    # One-liner below name
    one_liner = program.get("one_liner", "")
    wrapped_text(c, one_liner, ML, H - 165,
                 CW * 0.72, "Helvetica", 9.5, colors.HexColor("#B8C8DC"),
                 line_height=14, max_lines=3)

    # Key facts strip at bottom of header (white bg)
    strip_y  = H - HEADER_H
    strip_h  = 52
    draw_rect(c, 0, strip_y, W, strip_h, fill=OFF_WHITE)
    divider(c, 0, strip_y + strip_h, width=W)
    divider(c, 0, strip_y, width=W)

    facts = [
        ("Start date",  fmt_date(program.get("start_date", ""))),
        ("Duration",    program.get("duration_label", "")),
        ("Total hours", f"{program.get('total_hours', '')} hrs"),
        ("Per seat",    fmt_price(program.get("price_per_seat_kwd"))),
        ("Timing",      fmt_timing(program.get("session_pattern", ""))),
    ]
    col_w = W / len(facts)
    for i, (label, value) in enumerate(facts):
        cx = i * col_w + col_w / 2
        draw_text(c, label.upper(), cx, strip_y + 33, "Helvetica", 6.5,
                  MID_GREY, align="center")
        draw_text(c, value, cx, strip_y + 18, "Helvetica-Bold", 8.5,
                  NAVY, align="center")
        if i > 0:
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.5)
            c.line(i * col_w, strip_y + 8, i * col_w, strip_y + strip_h - 8)


def draw_footer(c, page_num, total_pages):
    """Footer on every page."""
    draw_rect(c, 0, 0, W, FOOTER_H, fill=NAVY)
    draw_text(c, "enterprise@joincoded.com", ML, 13,
              "Helvetica", 8, BLUE_PALE)
    draw_text(c, "coded.kw", W / 2, 13, "Helvetica", 8,
              BLUE_PALE, align="center")
    draw_text(c, f"Page {page_num} / {total_pages}",
              W - MR, 13, "Helvetica", 8, MID_GREY, align="right")


# ──────────────────────────────────────────────────────────────────────────────
# 4. Page 1 content: overview + outcomes
# ──────────────────────────────────────────────────────────────────────────────
def draw_page1_body(c, program):
    top    = H - HEADER_H - 24   # start just below header strip
    bottom = FOOTER_H + 12
    x      = ML
    y      = top

    # ── Overview ────────────────────────────────────────────────────
    section_label(c, "OVERVIEW", x, y);  y -= 14
    overview = program.get("overview", "")
    y = wrapped_text(c, overview, x, y, CW,
                     "Helvetica", 9.5, colors.HexColor("#2D3F55"), 14)
    y -= 18
    divider(c, x, y);  y -= 16

    # ── Outcomes ────────────────────────────────────────────────────
    section_label(c, "WHAT YOU'LL WALK OUT WITH", x, y);  y -= 14
    outcomes = program.get("outcomes", [])
    for out in outcomes:
        if y < bottom + 20:
            break
        # bullet circle
        c.setFillColor(BLUE)
        c.circle(x + 4, y + 3, 2.5, fill=1, stroke=0)
        y = wrapped_text(c, out, x + 14, y, CW - 14,
                         "Helvetica", 9.5, NAVY, 13)
        y -= 5
    y -= 10
    divider(c, x, y);  y -= 16

    # ── Cohort dates ────────────────────────────────────────────────
    iterations = program.get("iterations", [])
    if iterations and y > bottom + 40:
        section_label(c, "COHORT DATES", x, y);  y -= 14
        col_w3 = CW / 3
        for i, it in enumerate(iterations):
            if y < bottom + 16:
                break
            tag = "Next cohort" if i == 0 else "Open"
            tag_color = BLUE if i == 0 else MID_GREY
            draw_text(c, it.get("dates", ""), x, y, "Helvetica-Bold", 9, NAVY)
            draw_text(c, tag, x + 200, y, "Helvetica", 9, tag_color)
            y -= 14
        y -= 8
        divider(c, x, y);  y -= 16

    # ── CTA box ─────────────────────────────────────────────────────
    if y > bottom + 48:
        box_h = 44
        box_y = max(bottom + 4, y - box_h - 4)
        draw_rect(c, x, box_y, CW, box_h, fill=OFF_WHITE, radius=4)
        draw_text(c, "Ready to enrol your team?", x + 14, box_y + box_h - 16,
                  "Helvetica-Bold", 10, NAVY)
        draw_text(c, "enterprise@joincoded.com  ·  coded.kw",
                  x + 14, box_y + box_h - 30, "Helvetica", 8.5, BLUE)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Page 2: curriculum
# ──────────────────────────────────────────────────────────────────────────────
def draw_page2(c, program):
    c.showPage()

    # Navy header band
    band_h = 64
    draw_rect(c, 0, H - band_h, W, band_h, fill=NAVY)
    draw_rect(c, 0, H - 5, W, 5, fill=BLUE)
    draw_text(c, "[ CURRICULUM ]", ML, H - 28, "Helvetica-Bold", 7, BLUE_PALE)
    prog_name = program.get("name", "")
    draw_text(c, prog_name, ML, H - 46, "Helvetica-Bold", 13, WHITE,
              max_width=CW)

    y = H - band_h - 24
    x = ML
    bottom = FOOTER_H + 12

    structure = program.get("structure", [])
    fmt = program.get("format", "Workshop")

    for i, ph in enumerate(structure):
        if y < bottom + 50:
            break

        raw_name = ph.get("phase_name", "")
        # Split "Day 1, Title" → step="Day 1", title="Title"
        parts = raw_name.split(",", 1)
        step  = parts[0].strip()
        title = parts[1].strip() if len(parts) > 1 else raw_name
        hrs   = ph.get("hours", "")
        focus = ph.get("focus", "")

        # Step tag (pill)
        pill_w = pill(c, step.upper(), x, y + 4, bg=NAVY,
                      text_color=BLUE_PALE, size=7, padding_x=7, padding_y=3)

        # Hours badge right-aligned
        hrs_str = f"{hrs} hrs"
        draw_text(c, hrs_str, x + CW, y + 1, "Helvetica", 8,
                  MID_GREY, align="right")

        y -= 16
        draw_text(c, title, x, y, "Helvetica-Bold", 10, NAVY)
        y -= 13
        y = wrapped_text(c, focus, x, y, CW, "Helvetica", 8.5,
                         colors.HexColor("#3A4F6A"), 12)
        y -= 10
        if i < len(structure) - 1:
            divider(c, x, y)
            y -= 12

    # Audience note
    audience_detail = program.get("audience_detail", "")
    if audience_detail and y > bottom + 40:
        y -= 10
        divider(c, x, y);  y -= 14
        section_label(c, "WHO THIS IS FOR", x, y);  y -= 13
        wrapped_text(c, audience_detail, x, y, CW, "Helvetica", 8.5,
                     colors.HexColor("#2D3F55"), 13)


# ──────────────────────────────────────────────────────────────────────────────
# 6. Main generator
# ──────────────────────────────────────────────────────────────────────────────
def generate_pdf(program):
    slug   = program.get("slug", program.get("id", "program"))
    out    = os.path.join(OUT_DIR, f"{slug}.pdf")
    total  = 2  # always 2 pages

    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle(program.get("name", "CODED Program"))
    c.setAuthor("CODED")
    c.setSubject("Enterprise Training Brochure")

    # ── Page 1 ──────────────────────────────────────────────────────
    draw_header(c, program)
    draw_page1_body(c, program)
    draw_footer(c, 1, total)

    # ── Page 2 ──────────────────────────────────────────────────────
    draw_page2(c, program)
    draw_footer(c, 2, total)

    c.save()
    print(f"  ✓  {slug}.pdf")


def main():
    programs = parse_programs()
    published = [p for p in programs
                 if p.get("status") == "Published"]
    print(f"Generating {len(published)} PDFs → assets/pdfs/\n")
    for p in published:
        generate_pdf(p)
    print(f"\nDone. {len(published)} brochures saved to assets/pdfs/")


if __name__ == "__main__":
    main()
