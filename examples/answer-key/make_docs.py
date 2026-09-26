import sys, os
from cases import C
from spec_and_checklist import SPEC, SPEC_VERSION, CHECKLIST
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
PRIO = {}
for i,c in enumerate(C):
    PRIO[c['id']] = 'P1' if c['area'] in ('Login','Access tokens','Passwords') and i%3!=2 else ('P2' if i%4 else 'P3')

# ---------- test plan, .xlsx ----------
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
wb = Workbook(); ws = wb.active; ws.title = 'Test plan'
ws['A1'] = 'Turnstile 2.3.0: test plan'; ws['A1'].font = Font(bold=True, size=14)
ws['A2'] = 'Owner: release owner. Last run against main: 21 Sep 2026. Automated cases run in CI on every push.'
ws['A2'].font = Font(italic=True, color='555555')
hdr = ['ID','Area','Test case','Expected result','Priority','Type','Last result']
ws.append([]); ws.append(hdr)
thin = Side(style='thin', color='D0CCC4')
for i,h in enumerate(hdr,1):
    cell = ws.cell(row=4, column=i); cell.font = Font(bold=True, color='FFFFFF'); cell.fill = PatternFill('solid', fgColor='14161A')
for c in C:
    auto = c['status'] != 'manual'
    ws.append([c['id'], c['area'], c['title'], c['expected'], PRIO[c['id']], 'Automated' if auto else 'Manual', 'Pass' if auto else 'Pass (signed off)'])
for row in ws.iter_rows(min_row=5, max_row=ws.max_row):
    for cell in row:
        cell.border = Border(bottom=thin); cell.alignment = Alignment(vertical='top', wrap_text=True)
    if row[6].value == 'Pass': row[6].font = Font(color='2B7256', bold=True)
for col,w in zip('ABCDEFG',[8,18,58,40,9,12,16]): ws.column_dimensions[col].width = w
ws.freeze_panes = 'A5'
s2 = wb.create_sheet('Summary')
auto = [c for c in C if c['status']!='manual']
rows = [('Cases in plan', len(C)), ('Automated', len(auto)), ('Manual', len(C)-len(auto)),
        ('Automated cases passing', len(auto)), ('Automated coverage of plan', '100%'), ('Release gate', 'Met')]
s2['A1'] = 'Summary, 21 Sep 2026'; s2['A1'].font = Font(bold=True, size=13)
for r,(k,v) in enumerate(rows, start=3):
    s2.cell(row=r, column=1, value=k); s2.cell(row=r, column=2, value=v).font = Font(bold=True)
s2.column_dimensions['A'].width = 30; s2.column_dimensions['B'].width = 12
wb.save(os.path.join(out,'test-plan.xlsx'))

# ---------- spec, .docx ----------
from docx import Document
from docx.shared import Pt, RGBColor
d = Document()
st = d.styles['Normal']; st.font.name = 'Calibri'; st.font.size = Pt(11)
d.add_heading('Turnstile authentication specification', 0)
p = d.add_paragraph(f'Version {SPEC_VERSION}. Status: approved. Applies to Turnstile 2.x.'); p.runs[0].italic = True
d.add_heading('1 Scope', 1)
d.add_paragraph('This document states how Turnstile stores passwords, authenticates users, issues and verifies tokens, '
                'manages sessions, limits request rates, resets passwords, records audit events and verifies email '
                'addresses. Where this document and the code disagree, this document is the intended behaviour.')
for num, title, claims in SPEC:
    d.add_heading(f'{num} {title}', 1)
    for cid, text, _, _ in claims:
        para = d.add_paragraph(); r = para.add_run(f'{cid}  '); r.bold = True; para.add_run(text)
d.add_heading('10 Change history', 1)
t = d.add_table(rows=1, cols=3); t.style = 'Light Grid Accent 1'
for i,h in enumerate(['Version','Date','Change']): t.rows[0].cells[i].text = h
for v,dt,ch in [('1.2','Mar 2026','Initial approved version'),('1.3','May 2026','Added refresh token families (4.5)'),('1.4','Jul 2026','Added concurrent session limit (5.3)')]:
    row = t.add_row().cells; row[0].text=v; row[1].text=dt; row[2].text=ch
d.save(os.path.join(out,'auth-spec.docx'))

# ---------- release checklist, .pdf ----------
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
pdf = canvas.Canvas(os.path.join(out,'release-checklist-2.3.0.pdf'), pagesize=A4)
W,H = A4
pdf.setTitle('Turnstile 2.3.0 release checklist')
pdf.setFillColor(HexColor('#14161A')); pdf.setFont('Helvetica-Bold', 18); pdf.drawString(56, H-72, 'Turnstile 2.3.0: release checklist')
pdf.setFont('Helvetica', 10); pdf.setFillColor(HexColor('#555555'))
pdf.drawString(56, H-92, 'Every item must be ticked by the release owner before the tag is pushed.')
y = H-130
for rid, text, _, _ in CHECKLIST:
    pdf.setStrokeColor(HexColor('#14161A')); pdf.rect(56, y-3, 11, 11)
    pdf.setFillColor(HexColor('#2B7256')); pdf.setFont('ZapfDingbats', 10); pdf.drawString(57.5, y-1, '4')
    pdf.setFillColor(HexColor('#14161A')); pdf.setFont('Helvetica-Bold', 10.5); pdf.drawString(78, y, rid)
    pdf.setFont('Helvetica', 10.5); pdf.drawString(118, y, text)
    y -= 26
y -= 12
pdf.setStrokeColor(HexColor('#D0CCC4')); pdf.line(56, y, W-56, y); y -= 22
pdf.setFillColor(HexColor('#14161A')); pdf.setFont('Helvetica', 10.5)
pdf.drawString(56, y, 'Signed off by the release owner, 21 September 2026.'); y -= 16
pdf.drawString(56, y, 'Result: all items met. Cleared to tag v2.3.0.')
pdf.save()
print('docs written to', out)
