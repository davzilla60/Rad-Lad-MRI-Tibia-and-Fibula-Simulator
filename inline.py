"""Inline every asset into a single self-contained page.

    python inline.py   ->  tibfib.embed.html + index.html (identical; index.html for one-drop hosting)
"""
import base64, json, os

SRC = "tibfib.html"
OUT = "tibfib.embed.html"
ASSETS = "assets"

calib = json.load(open(os.path.join(ASSETS, "calib.json")))
jpg = [f"{sid}_{k:0{s['pad']}d}" for sid, s in calib["ser"].items() for k in range(s["n"])]

png = ["logo_full", "logo_mark", "loc_sag", "loc_cor", "loc_ax"]

d = {}
for n in jpg:
    with open(os.path.join(ASSETS, n + ".jpg"), "rb") as f:
        d[n] = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
for n in png:
    with open(os.path.join(ASSETS, n + ".png"), "rb") as f:
        d[n] = "data:image/png;base64," + base64.b64encode(f.read()).decode()

html = open(SRC, encoding="utf-8").read()
tag = '<script src="assets/calib.js"></script>'
assert tag in html, "calib.js tag not found"
html = html.replace(tag, "<script>" + open(os.path.join(ASSETS, "calib.js"), encoding="utf-8").read().strip() +
                    "\nwindow.SCG_ASSETS=" + json.dumps(d) + ";</script>")
for js in ("room3d.js?v=1", "app.js?v=1"):
    tag = '<script src="' + js + '"></script>'
    assert tag in html, js + " tag not found - bump the version here too"
    html = html.replace(tag, "<script>\n" + open(js.split("?")[0], encoding="utf-8").read() + "\n</script>")

open(OUT, "w", encoding="utf-8").write(html)
open("index.html", "w", encoding="utf-8").write(html)
print("wrote", OUT, "and index.html", f"{os.path.getsize(OUT)/1024:.0f} KB  ({len(d)} assets)")
