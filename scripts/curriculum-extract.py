"""Extract only printed appendix character tables from archived PEP PDFs.

PDF text outside the visible page is deliberately excluded (some PDFs contain
off-page text from an adjacent page). Body text is never used to invent entries.
"""
from pathlib import Path
import collections
import hashlib
import json
import re
import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'data' / 'research'
RANGES = {
    'g1s1': [(110, 112), (113, 113)],
    'g1s2': [(119, 121), (122, 124)],
    'g2s1': [(113, 117), (118, 120)],
    'g2s2': [(118, 121), (122, 124)],
    'g3s1': [(114, 116), (117, 118)],
    'g3s2': [(116, 118), (119, 120)],
    'g4s1': [(128, 130), (131, 132)],
    'g4s2': [(142, 144), (145, 146)],
    'g5s1': [(122, 124), (125, 126)],
    'g5s2': [(124, 125), (126, 127)],
    'g6s1': [None, (135, 136)],
    'g6s2': [None, (126, 126)],
}
EXPECTED_WRITING = [100, 200, 250, 250, 250, 250, 250, 250, 220, 180, 180, 120]
EXPECTED_NEW_RECOGNITION = [280, 410, 460, 450, 250, 250, 250, 250, 200, 200, 0, 0]
COVER_PRODUCTION_DATES = ['2024-08-08', '2025-12-05', '2025-07-10', '2025-12-09', '2025-07-09', '2025-12-09', '2022-07-08', '2022-12-22', '2024-06-25', '2022-12-22', '2022-07-18', '2023-10-17']
TONE_MAP = str.maketrans(dict(zip('QWASE R D F U I J K T Y G H O P L M V X B C'.replace(' ', ''), 'āáǎàēéěèīíǐìōóǒòūúǔùǚǜǘǜ')))
HANZI = re.compile(r'[\u3400-\u9fff]')

def visible(page):
    x0, y0, x1, y1 = page.bbox
    return [c for c in page.chars if x0 <= c['x0'] < x1 and y0 <= c['top'] < y1]

def cluster_rows(chars):
    rows = []
    for c in sorted(chars, key=lambda c: (c['top'], c['x0'])):
        row = next((r for r in reversed(rows) if abs(r[0]['top'] - c['top']) < 4), None)
        if row is None:
            rows.append([c])
        else:
            row.append(c)
    return [sorted(row, key=lambda c: c['x0']) for row in rows]

def extract_table(pdf, page_range, kind, split_columns=False, literal_pinyin_pages=None):
    items, lessons = [], []
    category, current_key, garden_count = 'lesson', None, 0
    if page_range is None:
        return items, lessons
    for page_no in range(page_range[0], page_range[1] + 1):
        full_page = pdf.pages[page_no - 1]
        x0, y0, x1, y1 = full_page.bbox
        mid = (x0 + x1) / 2
        pages = [full_page.crop((x0, y0, mid, y1)), full_page.crop((mid, y0, x1, y1))] if split_columns else [full_page]
        for page in pages:
            chars = visible(page)
            targets = [c for c in chars if HANZI.fullmatch(c['text']) and 'FZKT' in c['fontname'] and abs(c['size'] - 18) < 1]
            pinyin_chars = [c for c in chars if 'Hanyu' in c['fontname']]
            headings = cluster_rows([c for c in chars if HANZI.fullmatch(c['text']) and 'FZS3' in c['fontname'] and abs(c['size'] - 14) < 1])
            heading_cursor = 0
            for row in cluster_rows(targets):
                top = row[0]['top']
                while heading_cursor < len(headings) and headings[heading_cursor][0]['top'] < top:
                    title = ''.join(c['text'] for c in headings[heading_cursor])
                    category = {'识字': 'literacy', '阅读': 'reading', '汉语拼音': 'pinyin'}.get(title, category)
                    heading_cursor += 1
                middle = top + 9
                left = sorted([c for c in chars if c['x1'] < row[0]['x0'] - 1 and abs((c['top'] + c['bottom']) / 2 - middle) < 7 and 'Hanyu' not in c['fontname']], key=lambda c: c['x0'])
                label = ''.join(c['text'] for c in left).strip(' .\t\n')
                num = re.sub(r'\s', '', label)
                if '语文园地' in label:
                    garden_count += 1
                    suffix = re.search(r'语文园地([一二三四五六七八])', label)
                    n = '一二三四五六七八'.index(suffix[1]) + 1 if suffix else garden_count
                    key = f'garden-{n}'
                elif num.isdigit():
                    key = f'{category}-{int(num)}'
                else:
                    key = current_key or f'{category}-unlabeled'
                if key != current_key:
                    lessons.append({'id': key, 'label': label or key, 'table': kind, 'characters': []})
                    current_key = key
                # Match each pinyin letter to the nearest Hanzi centre on its row.
                near = [c for c in pinyin_chars if 4 < top - c['top'] < 21]
                assigned = [[] for _ in row]
                centres = [(c['x0'] + c['x1']) / 2 for c in row]
                for letter in near:
                    centre = (letter['x0'] + letter['x1']) / 2
                    ix = min(range(len(row)), key=lambda i: abs(centres[i] - centre))
                    if abs(centres[ix] - centre) < 24:
                        assigned[ix].append(letter)
                for ix, c in enumerate(row):
                    raw = ''.join(x['text'] for x in sorted(assigned[ix], key=lambda x: x['x0']))
                    py = raw.translate(TONE_MAP)
                    reference = (literal_pinyin_pages or {}).get((page_no, c['text']), [])
                    if len(reference) == 1 and py and py != reference[0]:
                        py = reference[0]  # Correct letter-boundary drift against the literal PDF text.
                    colour = c.get('non_stroking_color')
                    item = {'character': c['text'], 'pinyin': py, 'lessonId': key, 'pdfPage': page_no, 'previouslyLearnedReading': bool(colour and tuple(colour) not in [(0.0, 0.0, 0.0, 1.0), (0.0,), (0.0, 0.0, 0.0)])}
                    items.append(item)
                    lessons[-1]['characters'].append(c['text'])
    return items, lessons

def unique(chars):
    return list(dict.fromkeys(chars))

def correct_g1s1_recognition(items, lessons):
    """Restore lesson order in the mixed-width layout, visually checked on pp.105–106.

    Pinyin lessons are printed in two columns within otherwise full-width pages.
    Splits below partition existing extracted entries; they never add characters.
    """
    splits = {
        'literacy-4': [('literacy-4', 0, 8), ('garden-1', 8, 13)],
        'pinyin-3': [('pinyin-3', 0, 2), ('pinyin-4', 2, 6)],
        'pinyin-5': [('pinyin-5', 0, 4), ('pinyin-8', 4, 8)],
        'pinyin-6': [('pinyin-6', 0, 4), ('pinyin-9', 4, 8)],
        'pinyin-10': [('pinyin-10', 0, 5), ('pinyin-13', 5, 9)],
        'pinyin-11': [('pinyin-11', 0, 4), ('pinyin-14', 4, 8)],
    }
    rows, row_items = {}, {}
    for row in lessons:
        old_items = [x for x in items if x['lessonId'] == row['id']]
        assert [x['character'] for x in old_items] == row['characters']
        pieces = splits.get(row['id'], [(row['id'], 0, len(old_items))])
        assert sum(end - start for _, start, end in pieces) == len(old_items)
        for key, start, end in pieces:
            part = [{**x, 'lessonId': key} for x in old_items[start:end]]
            label = ('语文园地' + '一二三四五六七八'[int(key.split('-')[1]) - 1]) if key.startswith('garden-') else key.split('-')[1]
            rows[key] = {'id': key, 'label': label, 'table': 'recognition', 'characters': [x['character'] for x in part]}
            row_items[key] = part
    first = ([f'literacy-{n}' for n in range(1, 5)] + ['garden-1', 'pinyin-3', 'pinyin-4', 'garden-2']
             + [f'pinyin-{n}' for n in range(5, 10)] + ['garden-3']
             + [f'pinyin-{n}' for n in range(10, 15)] + ['garden-4'])
    order = first + [row['id'] for row in lessons if row['id'] not in first]
    assert len(order) == len(rows) == len(set(order))
    return [x for key in order for x in row_items[key]], [rows[key] for key in order]

def merge_lessons(recognition, writing):
    merged = []
    for row in recognition:
        merged.append({'id': row['id'], 'label': row['label'], 'recognition': row['characters'][:], 'writing': []})
    last_pos = -1
    for row in writing:
        found = next((i for i, x in enumerate(merged) if x['id'] == row['id']), None)
        if found is None:
            last_pos += 1
            merged.insert(last_pos, {'id': row['id'], 'label': row['label'], 'recognition': [], 'writing': row['characters'][:]})
        else:
            merged[found]['writing'] += row['characters']
            last_pos = found
    return merged

def main():
    books = []
    for ix, (book_id, ranges) in enumerate(RANGES.items()):
        grade, term = int(book_id[1]), int(book_id[3])
        path = RESEARCH / f'{book_id}.pdf'
        literal_pdf = PdfReader(path)
        literal_pinyin_pages = {}
        for rg in ranges:
            if rg is None: continue
            for pg in range(rg[0], rg[1] + 1):
                for hanzi, encoded in re.findall(r'([\u3400-\u9fff])\s*\n\s*([A-Za-züÜv]+)', literal_pdf.pages[pg - 1].extract_text()):
                    key = (pg, hanzi)
                    literal_pinyin_pages.setdefault(key, [])
                    value = encoded.translate(TONE_MAP)
                    if value not in literal_pinyin_pages[key]: literal_pinyin_pages[key].append(value)
        with pdfplumber.open(path) as pdf:
            rec, rec_lessons = extract_table(pdf, ranges[0], 'recognition', literal_pinyin_pages=literal_pinyin_pages)
            wr, wr_lessons = extract_table(pdf, ranges[1], 'writing', split_columns=book_id == 'g1s1', literal_pinyin_pages=literal_pinyin_pages)
        if book_id == 'g1s1':
            rec, rec_lessons = correct_g1s1_recognition(rec, rec_lessons)
        assert len(wr) == EXPECTED_WRITING[ix], (book_id, len(wr), EXPECTED_WRITING[ix])
        assert sum(not x['previouslyLearnedReading'] for x in rec) == EXPECTED_NEW_RECOGNITION[ix], book_id
        lessons = merge_lessons(rec_lessons, wr_lessons)
        ordered = unique(c for lesson in lessons for c in lesson['recognition'] + lesson['writing'])
        assert set(ordered) == {x['character'] for x in rec + wr}
        readings = {}
        variants = collections.defaultdict(list)
        for item in rec + wr:
            py = item['pinyin']
            if py:
                readings.setdefault(item['character'], py)
                if py not in variants[item['character']]: variants[item['character']].append(py)
        slug = f'zh-lang-grade{grade}{"a" if term == 1 else "b"}-textbook.pdf'
        url = f'https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/{slug}'
        edition = ('2024修订版（2022课标）' if book_id == 'g1s1' else '2022课标修订版（2025年电子存档）') if grade <= 3 else '旧版统编教材（非2026修订版）'
        notes = ['字表从电子教材附录提取；排除页外隐藏文本与课文正文。', '同册合并识字表和写字表去重；蓝色多音字按汉字去重保留，故总数可大于印刷生字数。', '按附录课次合并；各课先识字表次序，再追加该课仅在写字表中的字。']
        notes.append('公开PDF版权页未填写版次与印次；封面制作日期仅为存档证据，不代表出版日期。')
        if grade >= 4: notes.append('本册为旧版存档，尚未核对2026修订版；不要显示为全套最新教材。')
        if grade == 6: notes.append('原册没有识字表，使用写字表全部汉字。')
        books.append({'id':book_id, 'grade':grade, 'term':term, 'title':'一二三四五六'[grade-1]+'年级'+('上册' if term==1 else '下册'), 'edition':edition, 'editionEvidence':{'coverProductionDate':COVER_PRODUCTION_DATES[ix], 'copyrightEdition':None, 'revisionStatement':'2022课标编写修订' if grade <= 3 else None, 'revision2026Verified':False}, 'sources':[{'title':'人民教育出版社义务教育教科书·语文（PDF公开存档）', 'url':url, 'recognitionPdfPages':ranges[0], 'writingPdfPages':ranges[1], 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}], 'printedCounts':{'newRecognition':EXPECTED_NEW_RECOGNITION[ix], 'writing':EXPECTED_WRITING[ix]}, 'recognition':unique(x['character'] for x in rec), 'writing':unique(x['character'] for x in wr), 'orderedCharacters':ordered, 'readings':readings, 'readingVariants':dict(variants), 'lessons':lessons, 'recognitionItems':rec, 'writingItems':wr, 'notes':notes})
        print(book_id, len(rec), len(wr), len(ordered), len(readings), len(lessons))
    result = {'schemaVersion':1,'generatedAt':'2026-11-06','status':'mixed-verified-editions','books':books}
    (ROOT/'data'/'curriculum-source.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

if __name__ == '__main__':
    main()
