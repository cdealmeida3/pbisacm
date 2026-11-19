# PREVIEW ONLY: give the scaled samples (tools/powerbi/scaled.ts) many invented people, as the real reports have
# (about 200 to 400 people), so the pages look as they will. Copy n of the samples gets the people of group n % 40;
# copy 0 keeps the sample people. Everything stays invented.
#   python tools/preview/people.py <folder>
import csv, io, os, re, sys
SURNAMES = ['', 'Berg', 'Holm', 'Lund', 'Moss', 'Nord', 'Park', 'Quinn', 'Reed', 'Stone', 'Vale', 'West', 'York', 'Ash', 'Birch', 'Cole', 'Dale',
            'Elm', 'Frost', 'Gray', 'Hale', 'Iver', 'Jay', 'Kent', 'Lane', 'Mars', 'Nash', 'Oak', 'Pine', 'Rowe', 'Sage', 'Tate', 'Ure', 'Voss',
            'Wade', 'Yale', 'Zane', 'Brook', 'Clay', 'Dunn']
PEOPLE = [('Ada Example', 'ada01', 'ada'), ('Bo Leaver', 'bo01', 'bo'), ('Cy Keeper', 'cy01', 'cy'), ('Dee Owner', 'dee01', 'dee'),
          ('Dana Daily', 'dda', 'dana.daily'), ('Olga Owner', 'oow', 'olga.owner'), ('Pat Partner', 'ppa', 'pat.partner'), ('Ian Inactive', 'iin', 'ian.inactive')]
def variant(text, g):
    if g == 0 or text == '': return text
    s = SURNAMES[g]
    for name, user, mail in PEOPLE:
        first = name.split(' ')[0]
        if text == name: return f'{first} {s}'
        if text == f'{mail}@example.com': return f'{first.lower()}.{s.lower()}@example.com'
        if text.lower() == user: return (user[:-2] if user.endswith('01') else user) + f'{g:02d}' if text == user else ((user[:-2] if user.endswith('01') else user) + f'{g:02d}').upper()
    return text
def copy_of(row):
    for cell in row:
        m = re.match(r'^C(\d+) ', cell) or re.search(r'-C(\d+)$', cell)
        if m: return int(m.group(1))
    return 0
folder = sys.argv[1]
for name in sorted(os.listdir(folder)):
    if not name.endswith('.csv') or '_rel_' in name: continue
    path = os.path.join(folder, name); raw = open(path, 'rb').read(); bom = raw.startswith(b'\xef\xbb\xbf')
    text = raw.decode('utf-8-sig'); first = text.split('\n')[0]
    d = ';' if first.count(';') > first.count(',') else ','
    rows = list(csv.reader(io.StringIO(text, newline=''), delimiter=d))
    out = [rows[0]] + [[variant(c, copy_of(r) % 40) for c in r] for r in rows[1:]]
    buf = io.StringIO(); csv.writer(buf, delimiter=d, lineterminator='\r\n').writerows(out)
    open(path, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + buf.getvalue().encode('utf-8'))
    print(name, len(rows) - 1, 'rows')
