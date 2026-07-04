#!/usr/bin/env python3
"""
Generate a professionally formatted DOCX from the URS markdown.
Uses python-docx to create headings, paragraphs, tables with proper styling.
"""

import re
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

MD_PATH = r"d:\INDRA SUDARSONO\MYPROJECT\operasi\server\docs\USER_REQUIREMENT_SPECIFICATION.md"
OUT_PATH = r"d:\INDRA SUDARSONO\MYPROJECT\operasi\server\docs\USER_REQUIREMENT_SPECIFICATION_v1.docx"

# ---------- Helper functions ----------

def set_cell_shading(cell, color_hex):
    """Set background shading for a table cell."""
    shading = OxmlElement('w:shd')
    shading.set(qn('w:val'), 'clear')
    shading.set(qn('w:color'), 'auto')
    shading.set(qn('w:fill'), color_hex)
    cell._tc.get_or_add_tcPr().append(shading)

def set_cell_borders(cell):
    """Add borders to a table cell."""
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        border = OxmlElement(f'w:{edge}')
        border.set(qn('w:val'), 'single')
        border.set(qn('w:sz'), '4')
        border.set(qn('w:color'), '999999')
        borders.append(border)
    tc_pr.append(borders)

def add_styled_table(doc, headers, rows, col_widths=None):
    """Add a formatted table with header row shading."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ''
        p = cell.paragraphs[0]
        run = p.add_run(header.strip())
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_shading(cell, '2B579A')
        set_cell_borders(cell)

    # Data rows
    for r_idx, row in enumerate(rows):
        for c_idx, cell_text in enumerate(row):
            cell = table.rows[r_idx + 1].cells[c_idx]
            cell.text = ''
            p = cell.paragraphs[0]
            # Parse inline bold **text** and code `text`
            text = cell_text.strip()
            add_runs_with_formatting(p, text, base_size=Pt(9))
            # Alternate row shading
            if r_idx % 2 == 0:
                set_cell_shading(cell, 'F2F2F2')
            set_cell_borders(cell)

    # Column widths
    if col_widths:
        for row in table.rows:
            for i, width in enumerate(col_widths):
                if i < len(row.cells):
                    row.cells[i].width = width

    return table

def add_runs_with_formatting(paragraph, text, base_size=None, base_bold=False):
    """Parse markdown-style inline formatting (**bold**, `code`) and add runs."""
    # Pattern to match **bold** or `code`
    pattern = re.compile(r'(\*\*(.+?)\*\*|`(.+?)`)')
    
    last_end = 0
    for match in pattern.finditer(text):
        # Add preceding normal text
        if match.start() > last_end:
            normal_text = text[last_end:match.start()]
            run = paragraph.add_run(normal_text)
            if base_size:
                run.font.size = base_size
            run.bold = base_bold
        
        if match.group(2):  # Bold text
            run = paragraph.add_run(match.group(2))
            run.bold = True
            if base_size:
                run.font.size = base_size
        elif match.group(3):  # Code text
            run = paragraph.add_run(match.group(3))
            run.font.name = 'Consolas'
            run.font.color.rgb = RGBColor(0xB0, 0x00, 0x00)
            if base_size:
                run.font.size = base_size
        
        last_end = match.end()
    
    # Add remaining text
    if last_end < len(text):
        run = paragraph.add_run(text[last_end:])
        if base_size:
            run.font.size = base_size
        run.bold = base_bold

def parse_markdown_table(lines):
    """Parse markdown table lines into headers and rows."""
    # Remove separator line (|---|---|)
    table_lines = [l for l in lines if not re.match(r'^\s*\|[\s\-:|]+\|\s*$', l)]
    if len(table_lines) < 2:
        return None, None
    
    def parse_row(line):
        # Split by | and strip
        parts = line.strip().strip('|').split('|')
        return [p.strip() for p in parts]
    
    headers = parse_row(table_lines[0])
    rows = [parse_row(l) for l in table_lines[1:]]
    return headers, rows

# ---------- Main generation ----------

def generate():
    doc = Document()

    # Page setup - A4 with proper margins
    for section in doc.sections:
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    # Base style
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10)
    style.paragraph_format.space_after = Pt(4)
    style.paragraph_format.line_spacing = 1.15

    # Heading styles
    for level, size, color in [(1, 18, '1F3864'), (2, 14, '2B579A'), (3, 12, '2B579A'), (4, 11, '2B579A')]:
        h_style = doc.styles[f'Heading {level}']
        h_style.font.name = 'Calibri'
        h_style.font.size = Pt(size)
        h_style.font.bold = True
        h_style.font.color.rgb = RGBColor.from_string(color)
        h_style.paragraph_format.space_before = Pt(12 if level <= 2 else 8)
        h_style.paragraph_format.space_after = Pt(4)

    # Title style
    title_style = doc.styles['Title']
    title_style.font.name = 'Calibri'
    title_style.font.size = Pt(26)
    title_style.font.bold = True
    title_style.font.color.rgb = RGBColor.from_string('1F3864')

    # Read markdown
    with open(MD_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    i = 0

    # Cover page
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_para.paragraph_format.space_before = Pt(120)
    run = title_para.add_run('USER REQUIREMENT SPECIFICATION (URS)')
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string('1F3864')

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run('SIMPONI — Sistem Informasi Manajemen Operasi\nOperational Management System')
    run.font.size = Pt(16)
    run.font.color.rgb = RGBColor.from_string('2B579A')

    # Info box
    info = doc.add_paragraph()
    info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info.paragraph_format.space_before = Pt(60)
    run = info.add_run('Document Version: 1.0\nDate: 2026-07-03\nPrepared from: Source code analysis of server (backend) and simponi (frontend) repositories')
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor.from_string('666666')

    doc.add_page_break()

    # Process lines
    in_code_block = False
    code_lines = []

    while i < len(lines):
        line = lines[i]

        # Code blocks
        if line.strip().startswith('```'):
            if in_code_block:
                # End code block
                code_text = '\n'.join(code_lines)
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(1)
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                run = p.add_run(code_text)
                run.font.name = 'Consolas'
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
                # Light gray shading
                shading = OxmlElement('w:shd')
                shading.set(qn('w:val'), 'clear')
                shading.set(qn('w:color'), 'auto')
                shading.set(qn('w:fill'), 'F5F5F5')
                p._p.get_or_add_pPr().append(shading)
                # Add border
                pPr = p._p.get_or_add_pPr()
                pBdr = OxmlElement('w:pBdr')
                for edge in ('top', 'left', 'bottom', 'right'):
                    b = OxmlElement(f'w:{edge}')
                    b.set(qn('w:val'), 'single')
                    b.set(qn('w:sz'), '4')
                    b.set(qn('w:color'), 'CCCCCC')
                    pBdr.append(b)
                pPr.append(pBdr)
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # Headings
        if line.startswith('# ') and not line.startswith('## '):
            doc.add_heading(line[2:].strip(), level=1)
            i += 1
            continue
        if line.startswith('## '):
            doc.add_heading(line[3:].strip(), level=2)
            i += 1
            continue
        if line.startswith('### '):
            doc.add_heading(line[4:].strip(), level=3)
            i += 1
            continue
        if line.startswith('#### '):
            doc.add_heading(line[5:].strip(), level=4)
            i += 1
            continue

        # Horizontal rule
        if line.strip() == '---':
            # Add a thin horizontal line paragraph
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            pPr = p._p.get_or_add_pPr()
            pBdr = OxmlElement('w:pBdr')
            bottom = OxmlElement('w:bottom')
            bottom.set(qn('w:val'), 'single')
            bottom.set(qn('w:sz'), '6')
            bottom.set(qn('w:space'), '1')
            bottom.set(qn('w:color'), 'BFBFBF')
            pBdr.append(bottom)
            pPr.append(pBdr)
            i += 1
            continue

        # Tables
        if line.strip().startswith('|') and '|' in line.strip()[1:]:
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i])
                i += 1
            headers, rows = parse_markdown_table(table_lines)
            if headers and rows:
                # Determine column widths based on number of columns
                num_cols = len(headers)
                if num_cols == 2:
                    col_widths = [Cm(4), Cm(12)]
                elif num_cols == 3:
                    col_widths = [Cm(4), Cm(4), Cm(8)]
                elif num_cols >= 4:
                    total = Cm(16)
                    each = Cm(16 / num_cols)
                    col_widths = [each] * num_cols
                else:
                    col_widths = None
                add_styled_table(doc, headers, rows, col_widths)
                doc.add_paragraph()  # spacing after table
            continue

        # Bold-only lines (like **Document Version:** ...)
        stripped = line.strip()
        if stripped.startswith('**') and stripped.endswith('**') and stripped.count('**') == 2:
            p = doc.add_paragraph()
            run = p.add_run(stripped[2:-2])
            run.bold = True
            i += 1
            continue

        # Bullet lists
        if stripped.startswith('- '):
            text = stripped[2:]
            p = doc.add_paragraph(style='List Bullet')
            add_runs_with_formatting(p, text)
            i += 1
            continue

        # Numbered lists
        if re.match(r'^\d+\.\s', stripped):
            text = re.sub(r'^\d+\.\s', '', stripped)
            p = doc.add_paragraph(style='List Number')
            add_runs_with_formatting(p, text)
            i += 1
            continue

        # Regular paragraph
        if stripped:
            p = doc.add_paragraph()
            add_runs_with_formatting(p, stripped)
        else:
            doc.add_paragraph()

        i += 1

    # Footer with page numbers
    for section in doc.sections:
        footer = section.footer
        p = footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run('SIMPONI URS — Page ')
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)

        # Add PAGE field
        fldChar1 = OxmlElement('w:fldChar')
        fldChar1.set(qn('w:fldCharType'), 'begin')
        instrText = OxmlElement('w:instrText')
        instrText.set(qn('xml:space'), 'preserve')
        instrText.text = 'PAGE'
        fldChar2 = OxmlElement('w:fldChar')
        fldChar2.set(qn('w:fldCharType'), 'end')
        run._r.append(fldChar1)
        run._r.append(instrText)
        run._r.append(fldChar2)
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)

    # Header with document title
    for section in doc.sections:
        header = section.header
        p = header.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        run = p.add_run('SIMPONI — User Requirement Specification')
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
        run.italic = True

    # Table of Contents page
    # Insert a TOC at the beginning (after cover page)
    # We need to insert before the first heading - python-docx doesn't support
    # easy insertion, so we add it as a note

    doc.save(OUT_PATH)
    print(f"DOCX saved to: {OUT_PATH}")

if __name__ == '__main__':
    generate()