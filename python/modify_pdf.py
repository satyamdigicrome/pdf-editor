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
def modify_pdf(input_path, output_path, changes):
    doc = fitz.open(input_path)
    pages_changes = {}
    for change in changes:
        pg = int(change["page"])
        pages_changes.setdefault(pg, []).append(change)
    for page_num, page_changes in pages_changes.items():
        page = doc[page_num]
        for change in page_changes:
            x0 = float(change["x0"])
            y0 = float(change["y0"])
            x1 = float(change["x1"])
            y1 = float(change["y1"])
            bbox = fitz.Rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
            page.add_redact_annot(bbox, fill=(1, 1, 1))
        page.apply_redactions()
        for change in page_changes:
            new_text  = change.get("new_text", "").strip()
            if not new_text:
                continue
            x0        = float(change["x0"])
            y0        = float(change["y0"])
            y1        = float(change["y1"])
            font_size = float(change.get("font_size", 12))
            color     = parse_color(change.get("color", 0))
            text_height = y1 - y0
            baseline_y  = y0 + (text_height * 0.82)
            page.insert_text(
                fitz.Point(x0, baseline_y),
                new_text,
                fontsize=font_size,
                fontname="helv",
                color=color,
                render_mode=0,
            )
    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Usage: modify_pdf.py <input> <output> <changes_json_file>"}))
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
        print(json.dumps({"success": False, "error": str(e)}))
