#!/usr/bin/env python3
"""Builds docs/BIYAHE-Documentation.pdf from docs/BIYAHE-Documentation.md.

Needs Python `markdown` (pip install markdown) and Google Chrome or Chromium on PATH (CHROME=... to override).
Run: npm run docs:pdf
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'BIYAHE-Documentation.md'
OUT = ROOT / 'docs' / 'BIYAHE-Documentation.pdf'
FONTS = ROOT / 'node_modules' / '@fontsource' / 'poppins' / 'files'
TITLE = 'BIYAHE — Project Documentation'

CSS = """
%(fonts)s
@page { size: A4; margin: 18mm 18mm 20mm;
  @bottom-center { content: "%(title)s · " counter(page) " / " counter(pages); font: 400 8pt Poppins, sans-serif; color: #64748B; } }
html { font: 400 10.5pt/1.6 Poppins, sans-serif; color: #0F172A; font-variant-numeric: tabular-nums; }
h1, h2, h3 { color: #0B2D5B; line-height: 1.25; break-after: avoid; text-wrap: balance; }
h1 { font-weight: 800; font-size: 24pt; margin: 0 0 14pt; }
h2 { font-weight: 700; font-size: 15pt; margin: 20pt 0 8pt; }
h3 { font-weight: 700; font-size: 12pt; margin: 14pt 0 6pt; }
p, li { text-wrap: pretty; }
strong { font-weight: 600; }
a { color: #2563EB; text-decoration: none; }
hr { border: 0; border-top: 1px solid #E2E8F0; margin: 16pt 0; }
code { font: 8.5pt/1.4 ui-monospace, 'DejaVu Sans Mono', monospace; background: #F1F5F9; padding: 1pt 3pt; border-radius: 3pt; }
pre { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4pt; padding: 8pt 10pt; break-inside: avoid; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
table { width: 100%%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 8.5pt; line-height: 1.45; }
th { background: #F8FAFC; font-weight: 600; text-align: left; }
th, td { border-bottom: 1px solid #E2E8F0; padding: 5pt 6pt; vertical-align: top; }
tr { break-inside: avoid; }
td img, p > img { display: block; max-width: 100%%; max-height: 120mm; margin: 4pt auto; border: 1px solid #E2E8F0; border-radius: 6pt; }
td img { max-height: 110mm; }
"""


def font_faces() -> str:
    return '\n'.join(
        f"@font-face {{ font-family: Poppins; font-weight: {w}; src: url('{(FONTS / f'poppins-latin-{w}-normal.woff2').as_uri()}') format('woff2'); }}"
        for w in (400, 600, 700, 800)
    )


def chrome() -> str:
    for c in (os.environ.get('CHROME'), 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'):
        if c and shutil.which(c):
            return shutil.which(c)
    sys.exit('Chrome or Chromium not found; set CHROME=/path/to/chrome')


def main() -> None:
    body = markdown.markdown(SRC.read_text(encoding='utf-8'), extensions=['tables', 'fenced_code', 'sane_lists'])
    html = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{TITLE}</title>'
            f'<base href="{(SRC.parent).as_uri()}/"><style>{CSS % {"fonts": font_faces(), "title": TITLE}}</style>'
            f'</head><body>{body}</body></html>')
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / 'doc.html'
        page.write_text(html, encoding='utf-8')
        subprocess.run([chrome(), '--headless', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files',
                        f'--user-data-dir={tmp}/profile', f'--print-to-pdf={OUT}', page.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print(f'Wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
