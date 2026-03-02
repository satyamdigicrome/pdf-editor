import sys
import json
import fitz

def extract_text_blocks(pdf_path):
    doc = fitz.open(pdf_path)
    pages_data = []

    for page_num, page in enumerate(doc):
        page_dict = page.get_text("dict")
        page_width  = page.rect.width
        page_height = page.rect.height
        blocks = []

        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    bbox = span["bbox"]
                    blocks.append({
                        "id":        f"p{page_num}_s{len(blocks)}",
                        "text":      text,
                        "x0":        round(bbox[0], 2),
                        "y0":        round(bbox[1], 2),
                        "x1":        round(bbox[2], 2),
                        "y1":        round(bbox[3], 2),
                        "font_size": round(span.get("size", 12), 2),
                        "font_name": span.get("font", "Helvetica"),
                        "color":     span.get("color", 0),
                        "page":      page_num
                    })

        pages_data.append({
            "page":   page_num,
            "width":  round(page_width, 2),
            "height": round(page_height, 2),
            "blocks": blocks
        })

    doc.close()
    return pages_data

if __name__ == "__main__":
    pdf_path = sys.argv[1]
    try:
        result = extract_text_blocks(pdf_path)
        print(json.dumps({"success": True, "pages": result}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
