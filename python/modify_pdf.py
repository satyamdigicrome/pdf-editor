import sys
import json
import fitz


def parse_color(color_val):
    """
    PyMuPDF span color can be:
      - int   -> packed sRGB  e.g. 0x000000 = black
      - float -> grayscale    e.g. 0.0 = black, 1.0 = white
      - None  -> default black
    Returns (r, g, b) tuple in 0.0-1.0 range.
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


def find_fitting_fontsize(text, rect, fontname, start_size, min_size=4.0):
    """
    Pre-calculate the largest font size that fits text inside rect.
    Avoids the need to insert-then-redo which corrupts pages.
    """
    if rect.width <= 0 or rect.height <= 0:
        return start_size

    size = start_size
    while size >= min_size:

        lines = text.split('\n') if '\n' in text else [text]

        total_lines = 0
        for line in lines:
            if not line.strip():
                total_lines += 1
                continue
    
            line_width = fitz.get_text_length(line, fontname=fontname, fontsize=size)
            wrapped = max(1, -(-int(line_width) // int(rect.width)))
            total_lines += wrapped


        total_height = total_lines * size * 1.2

        if total_height <= rect.height:
            return size

        size -= 0.5

    return min_size


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

            redact_rect = fitz.Rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
            page.add_redact_annot(redact_rect, fill=(1, 1, 1))
            new_x0 = float(change.get("new_x0", 0))
            new_y0 = float(change.get("new_y0", 0))
            cw     = float(change.get("custom_width", 0))
            ch     = float(change.get("custom_height", 0))

            if cw > 0 and ch > 0:
                new_rect = fitz.Rect(new_x0 - 1, new_y0 - 1, new_x0 + cw + 1, new_y0 + ch + 1)
        
                if abs(new_x0 - x0) > 2 or abs(new_y0 - y0) > 2:
                    page.add_redact_annot(new_rect, fill=(1, 1, 1))


        page.apply_redactions()




        for change in page_changes:
            new_text = (change.get("new_text") or change.get("text") or "").strip()
            if not new_text:
                continue

    
            x0 = float(change["x0"])
            y0 = float(change["y0"])
            x1 = float(change["x1"])
            y1 = float(change["y1"])

            font_size = float(change.get("font_size", 12))
            color     = parse_color(change.get("color", 0))

    
            new_x0 = float(change.get("new_x0", 0))
            new_y0 = float(change.get("new_y0", 0))
            cw     = float(change.get("custom_width", 0))
            ch     = float(change.get("custom_height", 0))

    
            if cw > 0 and ch > 0:
                ins_x = new_x0
                ins_y = new_y0
                ins_w = cw
                ins_h = ch
            else:
                ins_x = x0
                ins_y = y0
                ins_w = (x1 - x0) + 100
                ins_h = (y1 - y0) + 2

    
            is_multiline = '\n' in new_text

            if is_multiline:
        
        
                line_count = new_text.count('\n') + 1
                min_h = font_size * 1.4 * line_count
                rect_h = max(ins_h, min_h)
                rect_w = max(ins_w, font_size * 2)

                insert_rect = fitz.Rect(ins_x, ins_y, ins_x + rect_w, ins_y + rect_h)

                fit_size = find_fitting_fontsize(
                    new_text, insert_rect, "helv", font_size, min_size=4.0
                )

                page.insert_textbox(
                    insert_rect,
                    new_text,
                    fontsize=fit_size,
                    fontname="helv",
                    color=color,
                    align=0,
                )
            else:
        
        
                baseline_y = ins_y + font_size * 0.85

                page.insert_text(
                    fitz.Point(ins_x, baseline_y),
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
        print(json.dumps({
            "success": False,
            "error":   "Usage: modify_pdf.py <input> <output> <changes_json_file>"
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
        print(json.dumps({"success": False, "error": str(e)}))
