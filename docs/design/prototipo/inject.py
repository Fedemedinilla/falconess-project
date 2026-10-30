import base64, json, sys
tpl, out, imgdir = sys.argv[1:4]
d = {}
for r in ["peregrina","cernicala","caracara"]:
    d[r] = {k: "data:image/webp;base64," + base64.b64encode(open(f"{imgdir}/{r}-{k}.webp","rb").read()).decode() for k in ["splash","chibi"]}
s = open(tpl, encoding="utf-8").read()
assert s.count("__IMG_JSON__") == 1
s = s.replace("__IMG_JSON__", json.dumps(d))
open(out, "w", encoding="utf-8").write(s)
print(len(s.encode()))
