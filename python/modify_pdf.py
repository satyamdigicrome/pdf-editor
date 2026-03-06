import sys
import json
import fitz


def parse_color(color_val):
    """
    PyMuPDF span color can be:
      - int   → packed sRGB  e.g. 0x000000 = black
      - float → grayscale    e.g. 0.0 = black, 1.0 = white
      - None  → default black
    Returns (r, g, b) tuple in 0.0–1.0 range.
    """
    if color_val is None:
        return (0.0, 0.0, 0.0)
    if isinstance(color_val, float):
        v = max(0.0, min(1.0, color_val))
        return (v, v, v)
    if isinstance(color_val, int):
        r = ((color_val >> 16) & 0xFF) / 255.0
        g = ((color_val >> 8)  & 0xFF) / 255.0
        b = ( color_val        & 0xFF) / 255.0
        return (r, g, b)
    return (0.0, 0.0, 0.0)


def _norm_draw_color(c):
    """
    Normalise a color value from page.get_drawings() to a 3-tuple (r, g, b)
    that shape.finish() can safely accept, or None.

    page.get_drawings() may return:
      None                  → no color (transparent)
      float                 → grayscale 0-1
      1-tuple  (gray,)
      3-tuple  (r, g, b)    → RGB   – already correct
      4-tuple  (c, m, y, k) → CMYK  ← ROOT CAUSE of the crash

    Older PyMuPDF handles only 3-tuple in shape.finish(); it internally does
        '%g %g %g' % color
    Passing a 4-tuple (CMYK) produces exactly the
    "not all arguments converted during string formatting" TypeError.
    """
    if c is None:
        return None
    if isinstance(c, (int, float)):
        v = float(c)
        return (v, v, v)
    if isinstance(c, (list, tuple)):
        n = len(c)
        if n == 0:
            return None
        if n == 1:
            v = float(c[0])
            return (v, v, v)
        if n == 3:
            return tuple(float(x) for x in c)
        if n == 4:                     
            k = float(c[3])
            r = (1.0 - float(c[0])) * (1.0 - k)
            g = (1.0 - float(c[1])) * (1.0 - k)
            b = (1.0 - float(c[2])) * (1.0 - k)
            return (r, g, b)
    return None


def redraw_covered_paths(page, drawings_before, redact_rects):
    """
    KEY FIX FOR BORDER ERASURE:
    After apply_redactions() paints white over the redacted areas, any table
    border lines that were inside those areas are visually hidden (even though
    graphics=0 keeps them in the PDF data structure, the white fill still
    renders ON TOP of them).

    This function re-draws every border path that intersects with a redacted
    area, appending the draw commands AFTER the white fill in the content
    stream so they render on top and remain visible.
    """
    for d in drawings_before:
        d_rect = fitz.Rect(d["rect"])

      
        if not any(d_rect.intersects(r) for r in redact_rects):
            continue

        try:
            shape = page.new_shape()
            has_items = False

            for item in d.get("items", []):
                kind = item[0]
                if kind == 'l':        
                    shape.draw_line(item[1], item[2])
                    has_items = True
                elif kind == 're':     
                    shape.draw_rect(item[1])
                    has_items = True
                elif kind == 'c':      
                    shape.draw_bezier(item[1], item[2], item[3], item[4])
                    has_items = True
                elif kind == 'qu':     
                    shape.draw_quad(item[1])
                    has_items = True

            if not has_items:
                continue

          
            lc = d.get("lineCap", (0, 0, 0))
            if isinstance(lc, int):
                lc = (lc, lc, lc)

          
          
            shape.finish(
                color=_norm_draw_color(d.get("color")),
                fill=_norm_draw_color(d.get("fill")),
                dashes=d.get("dashes"),
                even_odd=d.get("even_odd", False),
                closePath=d.get("closePath", False),
                lineJoin=d.get("lineJoin", 0),
                lineCap=lc,
                width=d.get("width", 1),
            )
            shape.commit()

        except Exception:
          
            pass


def modify_pdf(input_path, output_path, changes):
    doc = fitz.open(input_path)

  
    pages_changes = {}
    for change in changes:
        pg = int(change["page"])
        pages_changes.setdefault(pg, []).append(change)

    for page_num, page_changes in pages_changes.items():
        page = doc[page_num]

      
      
        drawings_before = page.get_drawings()

      
        redact_rects = []
        for change in page_changes:
            x0 = float(change["x0"])
            y0 = float(change["y0"])
            x1 = float(change["x1"])
            y1 = float(change["y1"])                              
            r = fitz.Rect(x0 - 0.5, y0 + 0.3, x1 + 0.5, y1 - 0.3)
            redact_rects.append(r)
            page.add_redact_annot(r, fill=(1, 1, 1))
        page.apply_redactions(images=0, graphics=0)
        redraw_covered_paths(page, drawings_before, redact_rects)
        for change in page_changes:
            new_text = (change.get("new_text") or change.get("text") or "").strip()
            if not new_text:
                continue
            orig_x0    = float(change["x0"])
            orig_y0    = float(change["y0"])
            orig_y1    = float(change["y1"])
            font_size  = float(change.get("font_size", 12))
            color      = parse_color(change.get("color", 0))

          
            ins_x  = float(change["new_x0"]) if change.get("new_x0") is not None else orig_x0
            ins_y0 = float(change["new_y0"]) if change.get("new_y0") is not None else orig_y0

            text_h     = orig_y1 - orig_y0
            baseline_y = ins_y0 + text_h * 0.82 

          
            is_multiline = '\n' in new_text
            if is_multiline and change.get("custom_width") and change.get("custom_height"):
                rect_w   = float(change["custom_width"])
                rect_h   = float(change["custom_height"])
                ins_rect = fitz.Rect(ins_x, ins_y0, ins_x + rect_w, ins_y0 + rect_h)
                page.insert_textbox(
                    ins_rect, new_text,
                    fontsize=font_size, fontname="helv",
                    color=color, render_mode=0, align=0,
                )
            else:
              
                page.insert_text(
                    fitz.Point(ins_x, baseline_y),
                    new_text,
                    fontsize=font_size, fontname="helv",
                    color=color, render_mode=0,
                )

    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False,
            "error": "Usage: modify_pdf.py <input> <output> <changes_json_file>"
        }))
        sys.exit(1)

    input_path   = sys.argv[1]
    output_path  = sys.argv[2]
    changes_file = sys.argv[3]

    try:
        with open(changes_file, 'r', encoding='utf-8') as f:
            changes = json.load(f)

        if not isinstance(changes, list) or len(changes) == 0:
            raise ValueError("No changes provided")

        modify_pdf(input_path, output_path, changes)
        print(json.dumps({"success": True, "output": output_path}))

    except Exception as e:
        import traceback
        print(json.dumps({
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }))
