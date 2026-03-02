import sys
import fitz
import json

input_pdf = sys.argv[1]
output_pdf = sys.argv[2]
edits = json.loads(sys.argv[3])

doc = fitz.open(input_pdf)

for page in doc:
    for edit in edits:
        page.insert_text(
            (edit['x'], edit['y']),
            edit['text'],
            fontsize=edit['fontSize']
        )

doc.save(output_pdf)
doc.close()