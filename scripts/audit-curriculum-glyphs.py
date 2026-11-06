"""Independent PDFium glyph/color count for dynamically discovered appendix pages."""
from pathlib import Path
import json, ctypes, math, collections
import pypdfium2 as pdfium
ROOT=Path(__file__).resolve().parents[1]; D=ROOT/'data/research'
audit=json.loads((D/'audit-independent-results.json').read_text())
report=[]
for b in audit['books']:
 pdf=pdfium.PdfDocument(D/f"{b['id']}.pdf"); tables={}
 for name,table in b['tables'].items():
  if table is None: tables[name]=None; continue
  chars=[]; blue=[]; by_page=[]; discarded=[]
  for n in range(table['pdfPages'][0],table['pdfPages'][1]+1):
   page=pdf[n-1]; tp=page.get_textpage(); w,h=page.get_size(); page_chars=[]; page_blue=[]
   for i in range(tp.count_chars()):
    c=tp.get_text_range(i,1)
    if len(c)!=1 or not '\u3400'<=c<='\u9fff': continue
    font=ctypes.create_string_buffer(256); flags=ctypes.c_int()
    pdfium.raw.FPDFText_GetFontInfo(tp,i,font,256,ctypes.byref(flags))
    if b'FZKT' not in font.value: continue
    matrix=pdfium.raw.FS_MATRIX(); pdfium.raw.FPDFText_GetMatrix(tp,i,ctypes.byref(matrix))
    size=pdfium.raw.FPDFText_GetFontSize(tp,i)*math.hypot(matrix.a,matrix.b)
    if abs(size-18)>0.5: continue
    x0,y0,x1,y1=tp.get_charbox(i)
    if not (0<=(x0+x1)/2<=w and 0<=(y0+y1)/2<=h):
     discarded.append({'character':c,'pdfPage':n,'bbox':[x0,y0,x1,y1]});continue
    rgba=[ctypes.c_uint() for _ in range(4)]
    pdfium.raw.FPDFText_GetFillColor(tp,i,*[ctypes.byref(x) for x in rgba])
    r,g,bl,a=[x.value for x in rgba]
    page_chars.append(c)
    if bl>r+50 and g>r+40: page_blue.append(c)
   chars+=page_chars;blue+=page_blue
   by_page.append({'pdfPage':n,'raw':len(page_chars),'blue':len(page_blue),'blueCharacters':''.join(page_blue)})
   tp.close();page.close()
  poppler=collections.Counter(table['characters']); glyphs=collections.Counter(chars)
  tables[name]={'rawCount':len(chars),'uniqueCount':len(set(chars)),'blueCount':len(blue),'blackCount':len(chars)-len(blue),'printedCount':table['printedTotal'],'printedCountMatches':len(chars)-len(blue)==table['printedTotal'],'popplerMultisetMatches':glyphs==poppler,'missingInPoppler':dict(glyphs-poppler),'extraInPoppler':dict(poppler-glyphs),'pages':by_page,'excludedOutsidePage':discarded}
 print(b['id'],{k:None if v is None else (v['rawCount'],v['blueCount'],v['printedCountMatches'],v['popplerMultisetMatches']) for k,v in tables.items()},flush=True)
 report.append({'id':b['id'],'tables':tables})
 pdf.close()
(D/'audit-pdfium-results.json').write_text(json.dumps({'method':'PDFium character glyphs, text transform, bounding box and fill color; ranges discovered independently by whole-PDF Poppler','books':report},ensure_ascii=False,indent=2)+'\n')
