"""Builds the formatted leads workbook (Leads + Summary tabs) from src/data/lead-columns.json.

    python3 scripts/google-sheet/build_sheet.py out.xlsx            # empty, ready for live data
    python3 scripts/google-sheet/build_sheet.py out.xlsx --sample   # with 4 made-up rows, for previews

Upload the .xlsx to Google Drive and open it with Google Sheets; formatting, dropdowns and
conditional colours carry over. Keep the column order in step with Code.gs (a test checks).
"""
import json, sys, datetime
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation

COLS = json.loads((Path(__file__).parents[2] / 'src/data/lead-columns.json').read_text())
LAST_ROW = 5000
FONT = 'Roboto'

# Design tokens (KYFR dark purple / magenta, light surface so it reads as a working sheet)
INK, MUTED, LINE = '241B33', '7A7388', 'E7E3EF'
HEAD_BG, HEAD_INK = '241B33', 'FFFFFF'
GROUP_FILL = {  # one calm hue per group of columns
    'Contact': '6B2FB5', 'Profile': '7A55C9', 'Income': '9F5FE5', 'Savings': '3B82C4', 'Credit & loans': 'C2417F',
    'Insurance': 'D9822B', 'Report': '2E9E6B', 'Source': '6F6A7C', 'Team': '241B33',
}
STATUS = {  # status colours (fill, ink)
    'Critical': ('FCE4E4', 'B3261E'), 'Caution': ('FDEFD3', '9A5B00'), 'Improve': ('E8E2FA', '5B35B0'), 'On track': ('DDF5E8', '17784A'),
    'Needs Work': ('FCE4E4', 'B3261E'), 'Fair': ('FDEFD3', '9A5B00'), 'Good': ('E8E2FA', '5B35B0'), 'Excellent': ('DDF5E8', '17784A'),
}
FOLLOW = {'New': ('E8E2FA', '5B35B0'), 'Contacted': ('FDEFD3', '9A5B00'), 'Interested': ('DDF5E8', '17784A'),
          'Not interested': ('EEEBF3', '6F6A7C'), 'Converted': ('C9F0DB', '0F6B3F')}


thin = Side(style='thin', color=LINE)

def fill(hex_): return PatternFill('solid', start_color=hex_, end_color=hex_)

wb = Workbook()
ws = wb.active
ws.title = 'Leads'
ws.sheet_view.showGridLines = False
ws.sheet_properties.tabColor = '9F5FE5'

# ── Row 1: group band, Row 2: headers ────────────────────────
ws.row_dimensions[1].height = 24
ws.row_dimensions[2].height = 34
i = 0
while i < len(COLS):
    g = COLS[i]['group']; j = i
    while j + 1 < len(COLS) and COLS[j + 1]['group'] == g: j += 1
    ws.merge_cells(start_row=1, start_column=i + 1, end_row=1, end_column=j + 1)
    c = ws.cell(1, i + 1, g.upper())
    c.font = Font(name=FONT, size=9, bold=True, color='FFFFFF'); c.fill = fill(GROUP_FILL[g])
    c.alignment = Alignment(horizontal='left', vertical='center', indent=1)
    for k in range(i + 1, j + 2): ws.cell(1, k).fill = fill(GROUP_FILL[g])
    i = j + 1
for n, col in enumerate(COLS, 1):
    h = ws.cell(2, n, col['label'])
    h.font = Font(name=FONT, size=10, bold=True, color=HEAD_INK); h.fill = fill(HEAD_BG)
    h.alignment = Alignment(horizontal=col['align'], vertical='center', wrap_text=True, indent=1 if col['align'] == 'left' else 0)
    h.border = Border(bottom=Side(style='medium', color=GROUP_FILL[col['group']]))
    ws.column_dimensions[L(n)].width = col['width']

# ── Body: column-wide formats so rows the script appends look right ──
for n, col in enumerate(COLS, 1):
    cd = ws.column_dimensions[L(n)]
    cd.number_format = col['format']
    cd.font = Font(name=FONT, size=10, color=MUTED if col['kind'] == 'muted' else INK)
    cd.alignment = Alignment(horizontal=col['align'], vertical='center', indent=1 if col['align'] == 'left' else 0)
ws.freeze_panes = 'D3'  # keep Submitted, Phone, Email in view
ws.auto_filter.ref = f'A2:{L(len(COLS))}{LAST_ROW}'
rng = lambda key: f'{L(next(i for i, c in enumerate(COLS, 1) if c["key"] == key))}3:{L(next(i for i, c in enumerate(COLS, 1) if c["key"] == key))}{LAST_ROW}'
colno = lambda key: next(i for i, c in enumerate(COLS, 1) if c['key'] == key)
FULL = f'A3:{L(len(COLS))}{LAST_ROW}'

# Status pills
for key in ('creditBand', 'sevSavings', 'sevCredit', 'sevInsurance', 'sevInvesting'):
    for text, (bg, ink) in STATUS.items():
        first = rng(key).split(':')[0]
        ws.conditional_formatting.add(rng(key), FormulaRule(formula=[f'{first}="{text}"'], fill=fill(bg), font=Font(color=ink, bold=True)))
for text, (bg, ink) in FOLLOW.items():
    first = rng('followUp').split(':')[0]
    ws.conditional_formatting.add(rng('followUp'), FormulaRule(formula=[f'{first}="{text}"'], fill=fill(bg), font=Font(color=ink, bold=True)))
# Readiness score: red → amber → green
ws.conditional_formatting.add(rng('readiness'), ColorScaleRule(start_type='num', start_value=0, start_color='F6B8B4', mid_type='num', mid_value=50, mid_color='FBE3A8', end_type='num', end_value=100, end_color='A9E5C4'))
# Row banding goes last: Google applies the first matching rule, so the colour-coded cells above must outrank it.
ws.conditional_formatting.add(FULL, FormulaRule(formula=['AND($B3<>"",ISEVEN(ROW()))'], fill=fill('F7F5FB')))
# Follow-up dropdown
dv = DataValidation(type='list', formula1='"' + ','.join(FOLLOW) + '"', allow_blank=True, showDropDown=False)
dv.error = 'Pick a status from the list'; dv.errorTitle = 'Follow-up'
dv.add(rng('followUp')); ws.add_data_validation(dv)
# Print: one page wide, landscape
from openpyxl.worksheet.properties import PageSetupProperties
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = 'landscape'; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
# Row height for the working area
ws.sheet_format.defaultRowHeight = 24
ws.sheet_format.customHeight = True

if '--sample' in sys.argv:
    SAMPLE = [
        dict(phone='+919812300001', email='asha.rao@example.com', age=26, dependents=0, income=62000, spending=41000, incomeRank=12.0, savings=90000, sip=3000, retirementCorpus='', runwayMonths=2.2, emi=0, creditScore=720, emiPct=0, cardBalance=12000, cardLimit=80000, cardUtilPct=15, creditBand='Excellent', lifeCover=0, healthCover=500000, readiness=64, sevSavings='Caution', sevCredit='On track', sevInsurance='On track', sevInvesting='Improve', priority1='Build your safety cushion', priority2='Invest a little more', priority3='', device='Mobile', utmSource='instagram', utmMedium='story', utmCampaign='launch', referrer='', sessionId='3f9a1c72', followUp='New'),
        dict(phone='+919812300002', email='vikram.s@example.com', age=35, dependents=2, income=240000, spending=120000, incomeRank=0.7, savings=2400000, sip=60000, retirementCorpus='', runwayMonths=20, emi=45000, creditScore=790, emiPct=19, cardBalance=30000, cardLimit=600000, cardUtilPct=5, creditBand='Excellent', lifeCover=20000000, healthCover=1500000, readiness=88, sevSavings='On track', sevCredit='On track', sevInsurance='Improve', sevInvesting='On track', priority1="Guard against a big medical bill", priority2='', priority3='', device='Desktop', utmSource='linkedin', utmMedium='post', utmCampaign='launch', referrer='https://www.linkedin.com/feed/', sessionId='81be40d5', followUp='Contacted'),
        dict(phone='+919812300003', email='meera.k@example.com', age=31, dependents=3, income=50000, spending=40000, incomeRank=16.0, savings=30000, sip=0, retirementCorpus='', runwayMonths=0.8, emi=15000, creditScore=650, emiPct=30, cardBalance=40000, cardLimit=50000, cardUtilPct=80, creditBand='Fair', lifeCover=0, healthCover=0, readiness=29, sevSavings='Critical', sevCredit='Caution', sevInsurance='Critical', sevInvesting='Critical', priority1='Build your safety cushion', priority2='Invest a little more', priority3='Guard against a big medical bill', device='Mobile', utmSource='', utmMedium='', utmCampaign='', referrer='', sessionId='c07d9e11', followUp='Interested'),
        dict(phone='+919812300004', email='rohan.d@example.com', age=52, dependents=1, income=450000, spending=160000, incomeRank=0.3, savings=9500000, sip=120000, retirementCorpus=30000000, runwayMonths=59, emi=0, creditScore=810, emiPct=0, cardBalance='', cardLimit='', cardUtilPct='', creditBand='Excellent', lifeCover=40000000, healthCover=3000000, readiness=96, sevSavings='On track', sevCredit='On track', sevInsurance='On track', sevInvesting='On track', priority1='', priority2='', priority3='', device='Desktop', utmSource='', utmMedium='', utmCampaign='', referrer='', sessionId='5a2c77f0', followUp='Converted'),
    ]
    t0 = datetime.datetime(2026, 10, 7, 11, 42)
    for r, row in enumerate(SAMPLE, 3):
        ts = ws.cell(r, 1, t0 + datetime.timedelta(hours=r * 7, minutes=r * 13)); ts.number_format = COLS[0]['format']
        ts.font = Font(name=FONT, size=10, color=INK); ts.alignment = Alignment(horizontal=COLS[0]['align'], vertical='center', indent=1)
        for key, v in row.items():
            if v != '':
                c = ws.cell(r, colno(key), v); col = COLS[colno(key) - 1]
                # Google drops column-wide styles on import, so the demo rows carry their own
                c.number_format = col['format']; c.font = Font(name=FONT, size=10, color=MUTED if col['kind'] == 'muted' else INK)
                c.alignment = Alignment(horizontal=col['align'], vertical='center', indent=1 if col['align'] == 'left' else 0)

# ── Summary tab: every figure is a formula over Leads ─────────
sm = wb.create_sheet('Summary')
sm.sheet_view.showGridLines = False
sm.sheet_properties.tabColor = '2E9E6B'
sm.column_dimensions['A'].width = 3
for c, w in zip('BCDE', (34, 18, 4, 40)): sm.column_dimensions[c].width = w
def S(col): return f"Leads!${L(colno(col))}$3:${L(colno(col))}${LAST_ROW}"
def put(cell, v, **kw):
    c = sm[cell]; c.value = v
    c.font = Font(name=FONT, size=kw.get('size', 11), bold=kw.get('bold', False), color=kw.get('color', INK))
    c.alignment = Alignment(horizontal=kw.get('h', 'left'), vertical='center', indent=kw.get('indent', 0))
    if 'fmt' in kw: c.number_format = kw['fmt']
    if 'bg' in kw: c.fill = fill(kw['bg'])
    return c
sm.row_dimensions[2].height = 34
put('B2', 'KYFR onboarding leads', size=18, bold=True)
put('B3', 'Live from the Leads tab. Nothing on this page is typed in.', size=10, color=MUTED)
r = 5
def section(title):
    global r
    for c in 'BC': sm[f'{c}{r}'].fill = fill(HEAD_BG)
    put(f'B{r}', title.upper(), size=9, bold=True, color='FFFFFF', bg=HEAD_BG, indent=1)
    sm.row_dimensions[r].height = 22; r += 1
def line(label, formula, fmt='#,##0'):
    global r
    put(f'B{r}', label, indent=1); put(f'C{r}', formula, bold=True, h='right', fmt=fmt)
    for c in 'BC': sm[f'{c}{r}'].border = Border(bottom=thin)
    sm.row_dimensions[r].height = 24; r += 1
section('Volume')
line('Submissions', f'=COUNTA({S("phone")})')
line('Unique people (by phone)', f'=SUMPRODUCT(({S("phone")}<>"")/COUNTIF({S("phone")},{S("phone")}&""))')
line('Last 7 days', f'=COUNTIFS({S("submittedAt")},">="&(NOW()-7))')
line('Last 24 hours', f'=COUNTIFS({S("submittedAt")},">="&(NOW()-1))')
r += 1; section('Who they are')
line('Median monthly income', f'=IFERROR(MEDIAN({S("income")}),"–")', next(c['format'] for c in COLS if c['key'] == 'income'))
line('Median age', f'=IFERROR(MEDIAN({S("age")}),"–")', '0')
line('Average readiness score', f'=IFERROR(AVERAGE({S("readiness")}),"–")', '0')
line('Have dependents', f'=COUNTIFS({S("dependents")},">0")')
line('Opened on a phone', f'=COUNTIFS({S("device")},"Mobile")')
r += 1; section('Where the gaps are (Critical or Caution)')
for lbl, k in (('Safety cushion', 'sevSavings'), ('Credit & loans', 'sevCredit'), ('Insurance', 'sevInsurance'), ('Investing', 'sevInvesting')):
    line(lbl, f'=COUNTIFS({S(k)},"Critical")+COUNTIFS({S(k)},"Caution")')
r += 1; section('Follow-up')
for lbl in FOLLOW: line(lbl, f'=COUNTIFS({S("followUp")},"{lbl}")')
sm.freeze_panes = 'A5'

wb.save(sys.argv[1])
print('wrote', sys.argv[1])
