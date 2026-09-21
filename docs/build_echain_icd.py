from pathlib import Path
import json, re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).parent / "integrations" / "e-chain"
OUT = Path(__file__).parent / "SIMPONI-e-chain-ICD-Draft.docx"
BLUE = "2E74B5"; DARK = "1F4D78"; LIGHT = "E8EEF5"; GRAY = "F2F4F7"; MUTED = "666666"

def font(run, name="Calibri", size=None, bold=None, color=None, italic=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    if size: run.font.size = Pt(size)
    if bold is not None: run.bold = bold
    if italic is not None: run.italic = italic
    if color: run.font.color.rgb = RGBColor.from_string(color)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement("w:shd"); shd.set(qn("w:fill"), fill); tcPr.append(shd)

def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr(); tcMar = tcPr.first_child_found_in("w:tcMar")
    if tcMar is None: tcMar = OxmlElement("w:tcMar"); tcPr.append(tcMar)
    for m, v in (("top",top),("start",start),("bottom",bottom),("end",end)):
        node = tcMar.find(qn("w:"+m))
        if node is None: node = OxmlElement("w:"+m); tcMar.append(node)
        node.set(qn("w:w"), str(v)); node.set(qn("w:type"), "dxa")

def fix_table(table, widths):
    table.autofit = False; table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tblPr = table._tbl.tblPr
    tblW = tblPr.first_child_found_in("w:tblW")
    if tblW is None: tblW = OxmlElement("w:tblW"); tblPr.append(tblW)
    tblW.set(qn("w:w"), str(sum(widths))); tblW.set(qn("w:type"), "dxa")
    ind = OxmlElement("w:tblInd"); ind.set(qn("w:w"), "120"); ind.set(qn("w:type"), "dxa"); tblPr.append(ind)
    grid = table._tbl.tblGrid
    for child in list(grid): grid.remove(child)
    for width in widths:
        gc=OxmlElement("w:gridCol"); gc.set(qn("w:w"),str(width)); grid.append(gc)
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            cell.width = Inches(widths[i]/1440); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tcW=cell._tc.get_or_add_tcPr().first_child_found_in("w:tcW"); tcW.set(qn("w:w"),str(widths[i])); tcW.set(qn("w:type"),"dxa")
            set_cell_margins(cell)

def add_table(doc, rows):
    if not rows: return
    cols=max(len(r) for r in rows); rows=[r+[""]*(cols-len(r)) for r in rows]
    table=doc.add_table(rows=0, cols=cols); table.style="Table Grid"
    widths=[9360//cols]*cols; widths[-1]+=9360-sum(widths)
    for ri,row in enumerate(rows):
        cells=table.add_row().cells
        for ci,val in enumerate(row):
            p=cells[ci].paragraphs[0]; p.paragraph_format.space_after=Pt(0)
            r=p.add_run(val.strip()); font(r,size=9,bold=(ri==0),color=("FFFFFF" if ri==0 else None))
            if ri==0: shade(cells[ci],BLUE)
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    fix_table(table,widths); doc.add_paragraph().paragraph_format.space_after=Pt(0)

def inline(p, text, mono=False):
    parts=re.split(r"(`[^`]+`|\*\*[^*]+\*|\*[^*]+\*)",text)
    for part in parts:
        if not part: continue
        if part.startswith("`") and part.endswith("`"): r=p.add_run(part[1:-1]); font(r,"Consolas",9,color=DARK)
        elif part.startswith("**") and part.endswith("**"): r=p.add_run(part[2:-2]); font(r,bold=True)
        elif part.startswith("*") and part.endswith("*"): r=p.add_run(part[1:-1]); font(r,italic=True)
        else: r=p.add_run(part); font(r)

def add_code(doc, text):
    p=doc.add_paragraph(); p.paragraph_format.left_indent=Inches(.18); p.paragraph_format.right_indent=Inches(.18)
    p.paragraph_format.space_before=Pt(3); p.paragraph_format.space_after=Pt(6)
    shd=OxmlElement("w:shd"); shd.set(qn("w:fill"),"F5F7FA"); p._p.get_or_add_pPr().append(shd)
    for i,line in enumerate(text.rstrip().splitlines()):
        if i: p.add_run().add_break()
        r=p.add_run(line); font(r,"Consolas",8,color="253858")

def add_markdown(doc, path, skip_title=True):
    lines=path.read_text(encoding="utf-8").splitlines(); i=0
    while i<len(lines):
        line=lines[i].rstrip()
        if line.startswith("```"):
            buf=[]; i+=1
            while i<len(lines) and not lines[i].startswith("```"): buf.append(lines[i]); i+=1
            add_code(doc,"\n".join(buf)); i+=1; continue
        if line.startswith("|") and i+1<len(lines) and re.match(r"^\|?[\s:|-]+\|",lines[i+1]):
            rows=[]; rows.append([c.strip() for c in line.strip("|").split("|")]); i+=2
            while i<len(lines) and lines[i].startswith("|"):
                rows.append([c.strip().replace("`","") for c in lines[i].strip("|").split("|")]); i+=1
            add_table(doc,rows); continue
        if line.startswith("#"):
            level=len(line)-len(line.lstrip("#")); title=line[level:].strip()
            if not(skip_title and level==1): doc.add_heading(title,level=min(level,3))
        elif re.match(r"^\d+\.\s+",line):
            p=doc.add_paragraph(style="List Number"); inline(p,re.sub(r"^\d+\.\s+","",line))
        elif re.match(r"^[-*]\s+",line):
            p=doc.add_paragraph(style="List Bullet"); inline(p,re.sub(r"^[-*]\s+","",line))
        elif line.strip():
            p=doc.add_paragraph(); inline(p,line)
        i+=1

def page_break(doc): doc.add_page_break()

doc=Document(); sec=doc.sections[0]
sec.page_width=Inches(8.5); sec.page_height=Inches(11); sec.top_margin=sec.bottom_margin=sec.left_margin=sec.right_margin=Inches(1)
sec.header_distance=sec.footer_distance=Inches(.492)
styles=doc.styles
normal=styles["Normal"]; normal.font.name="Calibri"; normal.font.size=Pt(11); normal.paragraph_format.space_after=Pt(6); normal.paragraph_format.line_spacing=1.10
for name,size,color,before,after in (("Title",28,DARK,0,8),("Subtitle",14,MUTED,0,16),("Heading 1",16,BLUE,16,8),("Heading 2",13,BLUE,12,6),("Heading 3",12,DARK,8,4)):
    s=styles[name]; s.font.name="Calibri"; s.font.size=Pt(size); s.font.color.rgb=RGBColor.from_string(color); s.font.bold=(name!="Subtitle")
    s.paragraph_format.space_before=Pt(before); s.paragraph_format.space_after=Pt(after); s.paragraph_format.keep_with_next=True
for name in ("List Bullet","List Number"):
    s=styles[name]; s.font.name="Calibri"; s.font.size=Pt(11); s.paragraph_format.left_indent=Inches(.5); s.paragraph_format.first_line_indent=Inches(-.25); s.paragraph_format.space_after=Pt(8); s.paragraph_format.line_spacing=1.167

header=sec.header.paragraphs[0]; header.text="SIMPONI - e-chain Interface Control Document"; font(header.runs[0],size=9,color=MUTED); header.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer=sec.footer.paragraphs[0]; footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=footer.add_run("DRAFT | Internal technical review | 31 August 2026"); font(r,size=9,color=MUTED)

p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(90); r=p.add_run("INTERFACE CONTROL DOCUMENT"); font(r,size=11,bold=True,color=BLUE)
p=doc.add_paragraph(style="Title"); p.add_run("SIMPONI Integration with e-chain")
p=doc.add_paragraph(style="Subtitle"); p.add_run("Consolidated API contracts, mappings, workflows, and examples")
p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(50)
add_table(doc,[["Document status","Draft"],["Document version","0.2"],["Prepared for","SIMPONI and e-chain technical teams"],["Source baseline",str(ROOT.relative_to(Path(__file__).parents[1]))],["Prepared date","8 September 2026"],["Classification","Internal technical review"]])
p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(24); r=p.add_run("Approval note"); font(r,bold=True,color=DARK)
p=doc.add_paragraph("This document consolidates the repository-based draft ICDs. Endpoint URLs, authentication, identity keys, file-download controls, and other items listed as open require joint confirmation before production use.")

page_break(doc); doc.add_heading("Document Control",1)
add_table(doc,[["Version","Date","Status","Description"],["0.1","31 Aug 2026","Draft","Initial consolidated ICD generated from the e-chain integration documentation set."],["0.2","8 Sep 2026","Draft","Added checker-approved manual IELP and MEDEX submission from SIMPONI to e-chain."]])
doc.add_heading("Purpose and Audience",2)
doc.add_paragraph("This ICD defines the technical boundary between SIMPONI and e-chain. It is intended for backend and frontend engineers, solution architects, security reviewers, testers, product owners, and operational stakeholders responsible for interface approval and implementation.")
doc.add_heading("Integration Portfolio",2)
add_table(doc,[["Interface","Direction","Purpose","Status"],["Profile","e-chain to SIMPONI","Synchronize user biodata and contact fields.","Draft"],["License","e-chain to SIMPONI","Synchronize license metadata and document reference.","Draft"],["IELP User","Bidirectional","Pull verified e-chain records and push checker-approved manual records.","Draft"],["MEDEX User","Bidirectional","Pull verified e-chain records and push checker-approved manual records.","Draft"],["Practical Exam","SIMPONI to e-chain","Send checked successful practical exam results and PDF evidence.","Draft"]])
doc.add_heading("Document Structure",2)
for text in ["Common integration rules apply to all interfaces unless overridden by an interface-specific section.","Each interface section contains its source ICD, field mapping, and payload examples.","Open questions remain normative blockers until the responsible parties record an agreed answer and update the version history."]:
    p=doc.add_paragraph(style="List Bullet"); p.add_run(text)

page_break(doc); doc.add_heading("1. Common Integration Rules",1); add_markdown(doc,ROOT/"common.md")

areas=[("2","Profile Synchronization","profile","profile-sync.icd.md"),("3","License Synchronization","license","license-sync.icd.md"),("4","IELP User Synchronization","ielpUser","ielp-user-sync.icd.md"),("5","MEDEX User Synchronization","medexUser","medex-user-sync.icd.md"),("6","Practical Exam Result Submission","practicalExam","practical-exam-send.icd.md")]
for num,title,folder,icd in areas:
    page_break(doc); doc.add_heading(f"{num}. {title}",1)
    add_markdown(doc,ROOT/folder/icd)
    doc.add_heading("Field Mapping",2); add_markdown(doc,ROOT/folder/"field-mapping.md")
    samples=sorted((ROOT/folder).glob("sample-*.json"))
    if samples:
        doc.add_heading("Payload Examples",2)
        for sample in samples:
            label=sample.stem.replace("sample-","").replace("-"," ").title()
            doc.add_heading(label,3)
            try: content=json.dumps(json.loads(sample.read_text(encoding="utf-8")),indent=2,ensure_ascii=True)
            except Exception: content=sample.read_text(encoding="utf-8")
            add_code(doc,content)

page_break(doc); doc.add_heading("7. Change History and Source Traceability",1)
add_markdown(doc,ROOT/"changelog.md")
doc.add_heading("Source Files",2)
for path in sorted(ROOT.rglob("*")):
    if path.is_file():
        p=doc.add_paragraph(style="List Bullet"); r=p.add_run(path.relative_to(ROOT).as_posix()); font(r,"Consolas",9,color=DARK)

doc.core_properties.title="SIMPONI Integration with e-chain - Interface Control Document"
doc.core_properties.subject="Consolidated e-chain integration ICD"
doc.core_properties.author="SIMPONI Project Team"
doc.core_properties.comments="Generated from repository documentation; draft for joint technical review."
doc.save(OUT)
print(OUT)
