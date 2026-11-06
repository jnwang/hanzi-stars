"""Read-only audit of source PDFs and both JSON files, independent Poppler extraction.
Outputs only audit-* research artifacts. Does not import the production extractor.
"""
from pathlib import Path
import json, re, subprocess, collections, hashlib, sys, shutil
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'data/research'
POPPLER=shutil.which('pdftotext')
if not POPPLER: raise RuntimeError('Install Poppler and add pdftotext to PATH.')
source=json.loads((ROOT/'data/curriculum-source.json').read_text())
public=json.loads((ROOT/'public/data/curriculum.json').read_text())
public_by_id={b['id']:b for b in public['books']}
han=re.compile(r'[\u3400-\u9fff]')
report=[]
for book in source['books']:
 bid=book['id']; pdf=D/f'{bid}.pdf'; out=D/f'audit-{bid}-poppler.txt'
 proc=subprocess.run([str(POPPLER),'-layout','-enc','UTF-8',str(pdf),str(out)],capture_output=True,text=True)
 if proc.returncode: raise RuntimeError(proc.stderr)
 pages=out.read_text().split('\f')
 if not pages[-1].strip(): pages.pop()
 starts={}; mentions=[]
 for n,page in enumerate(pages,1):
  for line in page.splitlines():
   flat=re.sub(r'\s','',line)
   for name in ['识字表','写字表','词语表']:
    if name in flat: mentions.append({'kind':name,'pdfPage':n,'text':line.strip()})
    if re.fullmatch(name+r'[①②③]?',flat):
     if name in starts: raise ValueError((bid,'duplicate heading',name))
     starts[name]=n
 tables={}
 for kind,title in [('recognition','识字表'),('writing','写字表')]:
  if title not in starts:
   tables[kind]=None; continue
  start=starts[title]; entries=[]; uncertain=[]; total=None; printed_page=None
  for n in range(start,len(pages)+1):
   page=pages[n-1]
   total_lines=[line for line in page.splitlines() if re.search(r'共\s*\d+\s*个?\s*生?字',line)]
   for line in page.splitlines():
    flat=re.sub(r'\s','',line)
    if not flat: continue
    if re.fullmatch(r'(识字表|写字表|阅读|识字|汉语拼音)[①②③]?',flat): continue
    if '共' in flat and re.search(r'共\d+个?生?字',flat): continue
    if flat.startswith('①') or '识字表中' in flat or '计入生字总数' in flat: continue
    line=re.sub(r'语\s*文\s*园\s*地(?:\s*[一二三四五六七八])?', '', line)
    line=re.sub(r'(?<!\S)(?:识字|阅读|汉语拼音)(?!\S)', '', line)
    chars=han.findall(line)
    if chars:
     # Ordinary target cells are single Hanzi separated by whitespace.
     if re.search(r'[\u3400-\u9fff]{2,}',line): uncertain.append({'pdfPage':n,'line':line})
     entries.extend(chars)
   if total_lines:
    total=int(re.search(r'共\s*(\d+)',total_lines[-1])[1]); end=n
    printed_numbers=[x.strip() for x in page.splitlines() if re.fullmatch(r'\s*\d{1,3}\s*',x)]
    printed_page=int(printed_numbers[-1]) if printed_numbers else None
    break
   if n+1 in [p for name,p in starts.items() if name!=title]: raise ValueError((bid,title,'no printed total before next table'))
  else: raise ValueError((bid,title,'no end found'))
  expected=book[kind]
  expected_raw=[x['character'] for x in book[kind+'Items']]
  counts=collections.Counter(entries); exp_counts=collections.Counter(expected_raw)
  tables[kind]={'pdfPages':[start,end],'totalPrintPage':printed_page,'printedTotal':total,'rawEntries':len(entries),'uniqueEntries':len(set(entries)),'characters':''.join(entries),'duplicates':{k:v for k,v in counts.items() if v>1},'missingInSource':sorted(set(entries)-set(expected)),'extraInSource':sorted(set(expected)-set(entries)),'missingOccurrencesInSource':dict(counts-exp_counts),'extraOccurrencesInSource':dict(exp_counts-counts),'compactCellLines':uncertain,'totalLine':total_lines[-1].strip()}
 union=set()
 for table in tables.values():
  if table: union.update(table['characters'])
 expected=book['orderedCharacters']; app_chars=[x['hanzi'] for x in public_by_id[bid]['characters']]
 rec=set(tables['recognition']['characters']) if tables['recognition'] else set()
 wr=set(tables['writing']['characters'])
 report.append({'id':bid,'pdfPageCount':len(pages),'sha256MatchesSource':hashlib.sha256(pdf.read_bytes()).hexdigest()==book['sources'][0]['sha256'],'discoveredTableStarts':starts,'allTableMentions':mentions,'tables':tables,'unionCount':len(union),'intersectionCount':len(rec&wr),'recognitionOnlyCount':len(rec-wr),'writingOnlyCount':len(wr-rec),'missingInOrderedCharacters':sorted(union-set(expected)),'extraInOrderedCharacters':sorted(set(expected)-union),'sourceDuplicateCount':len(expected)-len(set(expected)),'missingInPublic':sorted(union-set(app_chars)),'extraInPublic':sorted(set(app_chars)-union),'publicDuplicateCount':len(app_chars)-len(set(app_chars)),'publicOrderMatchesSource':app_chars==expected,'stars':(len(app_chars)+9)//10,'lastStarSize':len(app_chars)%10 or 10,'lastStarCharacters':''.join(app_chars[-(len(app_chars)%10 or 10):]),'edition':book['edition'],'notes':book['notes'],'popplerWarnings':proc.stderr.strip().splitlines()})
 print(bid,'tables',starts,'union',len(union),'public',len(app_chars),'last',report[-1]['lastStarCharacters'],'compact lines',sum(len(t['compactCellLines']) for t in tables.values() if t),flush=True)
(D/'audit-independent-results.json').write_text(json.dumps({'method':'whole-PDF Poppler layout text, dynamically located appendix titles and printed total boundaries','books':report},ensure_ascii=False,indent=2)+'\n')
