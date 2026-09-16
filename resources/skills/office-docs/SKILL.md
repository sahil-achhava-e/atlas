---
name: office-docs
description: |
  Read and write Microsoft Office files — Excel (.xlsx, .xlsm), Word (.docx),
  PowerPoint (.pptx) — and read PDFs. Use whenever the task names a spreadsheet,
  a workbook, a document, a deck, a report or a PDF, or whenever a file you need
  to open ends in .xlsx/.xlsm/.docx/.pptx/.pdf. These are ZIP archives, not text:
  reading one with a normal file read returns binary and tells you nothing. Every
  recipe here avoids compiled Python extensions, because application allowlisting
  (ThreatLocker, MDM) blocks those on a managed laptop even once they install.
allowed-tools:
  - Bash
  - Read
  - Write
---

## Office files, without wrecking the user's originals

An `.xlsx`, `.docx` or `.pptx` is a ZIP of XML. Reading one as text gives you
`PK\003\004…` and nothing else.

### 1. Protect the original first

The person you are working for very likely has no undo. This app does not
snapshot their folder, and a folder of documents is usually not a git
repository, so **an overwrite is permanent**.

- Default to writing a NEW file next to the original: `report.xlsx` →
  `report-updated.xlsx`. Say which file you created.
- Only edit in place when the user asked for that in those words. When you do,
  copy first:
  `cp "book.xlsx" "book.backup-$(date +%Y%m%d-%H%M%S).xlsx"` — then say where
  the backup is.
- Never delete an original. Never write to a path you have not read first.

### 2. What you may use

| Format | Read | Write | With |
|---|---|---|---|
| Excel `.xlsx` `.xlsm` | yes | yes | `openpyxl` (pure Python) |
| Word `.docx` | yes | edit, and create plain | stdlib `zipfile`+`xml`, `textutil` |
| PowerPoint `.pptx` | yes | edit text only | stdlib `zipfile`+`xml` |
| PDF | text only | no | `pypdf` (pure Python) |

**Do not reach for `python-docx`, `python-pptx` or `pandas`.** They depend on
compiled extensions (`lxml`, `numpy`) which application allowlisting refuses to
load. The failure is not a missing package and reinstalling cannot fix it — it
looks like this:

```
ImportError: dlopen(.../lxml/etree.cpython-39-darwin.so ...
  (mmap(size=0x914878) failed with errno=1)
```

If you see that, say plainly that the library is blocked by the machine's
security policy, and use the recipes below, which need nothing but Python's own
standard library. `zipfile` and `xml.etree` are part of Python and always load.

### 3. Look before you edit

Print the shape of the file and show the user what you found:

```python
import openpyxl
wb = openpyxl.load_workbook("book.xlsx")
for ws in wb.worksheets:
    print(ws.title, ws.dimensions, [c.value for c in ws[1]])
```

### 4. Excel — openpyxl

- **Edit the workbook you loaded.** `load_workbook()`, change cells, `save()`.
  Building a fresh `Workbook()` and copying values across throws away every
  column width, merge, number format, chart and conditional format — the user
  sees their formatting destroyed and the numbers intact, which is worse than a
  crash because it looks like it worked.
- **The formula trap.** `load_workbook(path, data_only=True)` returns the value
  Excel *cached* when it last recalculated. For a formula this code just wrote
  there is no cached value and you get `None` — verified, not theory. Excel
  recalculates when the human opens the file, so it reads right to them and
  empty to you. When a number has to be readable by anything other than Excel,
  compute it in Python and write the literal value. Write a formula only when
  the point is that the human can see and change it, and never read one back
  expecting a number.
- **Bulk data**: `ws.iter_rows(values_only=True)` for reading, and the stdlib
  `csv` module for anything tabular. pandas is not available here.
- `.csv` is not Excel — read it with `csv`, never with openpyxl.

### 5. Word — stdlib

**Read** every paragraph:

```python
import zipfile, xml.etree.ElementTree as ET
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
with zipfile.ZipFile("memo.docx") as z:
    root = ET.fromstring(z.read("word/document.xml"))
for p in root.iter(W + "p"):
    text = "".join(t.text or "" for t in p.iter(W + "t"))
    if text.strip():
        print(text)
```

**Edit** by rewriting every part and changing only the bytes you mean to:

```python
import zipfile
with zipfile.ZipFile("memo.docx") as zin, \
     zipfile.ZipFile("memo-updated.docx", "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "word/document.xml":
            data = data.replace(b"old wording", b"new wording")
        zout.writestr(item, data)
```

Every part has to be written back, not just the one you touched, or the file
opens damaged. Word splits a sentence across several `<w:t>` runs, so a phrase
you can see may not exist as one byte string — check with the read recipe first,
and match on the shortest run you can see rather than on a whole sentence.

**Create** a new document (macOS): write HTML, then convert.

```bash
textutil -convert docx report.html -output report.docx
```

Headings, paragraphs and bold survive. **Tables do not** — a `<table>` arrives
as loose paragraphs, verified both directly and via an RTF hop. If the user
needs a real table, either fill a template `.docx` that already contains one
using the edit recipe above, or put the table in a `.xlsx` and say why.
`textutil` is macOS only; on Windows, use the template route.

### 6. PowerPoint — stdlib, read and text edits

```python
import zipfile, xml.etree.ElementTree as ET
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
with zipfile.ZipFile("deck.pptx") as z:
    slides = sorted(n for n in z.namelist()
                    if n.startswith("ppt/slides/slide") and n.endswith(".xml"))
    for name in slides:
        root = ET.fromstring(z.read(name))
        print(name, [t.text for t in root.iter(A + "t") if t.text])
```

Changing wording uses the same rewrite-every-part loop as Word, on
`ppt/slides/slideN.xml`. Building a deck from scratch is not available without
`python-pptx`: say so and offer to fill an existing deck instead.

### 7. PDF

`pypdf` reads text: `PdfReader(path).pages[i].extract_text()`. It is a layout
format, so a table arrives as loose lines — say that rather than presenting a
guess at the table as fact. A scanned PDF has no text layer; if extraction
returns nothing, report that instead of inventing content.

Making a PDF needs a converter this machine does not have. Write the `.docx` or
`.xlsx` and tell the user it is one File → Export away.

### 8. Say what you did, in their words

Name the file you wrote, the sheet or section you touched, and the numbers that
changed. The person reading this often does not code, so "updated the workbook"
is not a result. "Added a Q2 column to the Summary sheet in
`sales-updated.xlsx`; your original is untouched" is.
