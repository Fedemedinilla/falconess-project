"""Download Barlow and Barlow Condensed (SIL OFL 1.1) from Google Fonts into fonts/.

Google serves each style split by script; the guide needs Spanish plus ō and ū (Kōryū), so the
latin and latin-ext subsets are merged into one TrueType file per style. Needs fontTools and brotli.
"""
import io
import os
import re
import sys
import urllib.request

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fonts")
CSS = ("https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;1,400"
       "&family=Barlow+Condensed:wght@500;600;700&display=swap")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
NAMES = {
    ("Barlow", "normal", "400"): "Barlow-Regular",
    ("Barlow", "normal", "500"): "Barlow-Medium",
    ("Barlow", "normal", "600"): "Barlow-SemiBold",
    ("Barlow", "italic", "400"): "Barlow-Italic",
    ("Barlow Condensed", "normal", "500"): "BarlowCond-Medium",
    ("Barlow Condensed", "normal", "600"): "BarlowCond-SemiBold",
    ("Barlow Condensed", "normal", "700"): "BarlowCond-Bold",
}
FACE = re.compile(r"/\* (?P<subset>[\w-]+) \*/\s*@font-face \{(?P<body>[^}]*)\}")


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, "tmp")
    os.makedirs(tmp, exist_ok=True)
    parts = {}
    for m in FACE.finditer(fetch(CSS).decode()):
        if m["subset"] not in ("latin", "latin-ext"):
            continue
        body = m["body"]
        key = (re.search(r"font-family: '([^']+)'", body)[1], re.search(r"font-style: (\w+)", body)[1],
               re.search(r"font-weight: (\d+)", body)[1])
        if key not in NAMES:
            continue
        font = TTFont(io.BytesIO(fetch(re.search(r"url\(([^)]+)\)", body)[1])))
        font.flavor = None
        path = os.path.join(tmp, f"{NAMES[key]}-{m['subset']}.ttf")
        font.save(path)
        parts.setdefault(NAMES[key], []).append(path)
    for name, paths in sorted(parts.items()):
        if len(paths) != 2:
            sys.exit(f"{name}: expected the latin and latin-ext subsets, got {len(paths)}")
        Merger().merge(sorted(paths)).save(os.path.join(OUT, name + ".ttf"))
        print("fonts/" + name + ".ttf")
    missing = set(NAMES.values()) - set(parts)
    if missing:
        sys.exit("missing styles: " + ", ".join(sorted(missing)))


if __name__ == "__main__":
    main()
