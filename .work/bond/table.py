import json,sys
rows=[json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
by={}
for r in rows: by.setdefault(r['cfg'],{})[(r['fal'],r['policy'])]=r
fals=['peregrina','cernicala','caracara']
print(f"{'config':16} | " + " | ".join(f"{f[:4]} atenta→sigue (stats, completa, sint%)" for f in fals))
order=['hoy']+sorted(k for k in by if k!='hoy')
for c in order:
  cells=[]
  for f in fals:
    a=by[c].get((f,'atenta')); s=by[c].get((f,'sigue'))
    if not a or not s: cells.append('-'); continue
    cells.append(f"{a['stats']}→{s['stats']} {a['completa']:.0f}→{s['completa']:.0f}% sint {s['syncPct']:.0f}% sem{s['syncWeek']} bond{s['bondMax']}")
  print(f"{c:16} | "+" | ".join(cells))
