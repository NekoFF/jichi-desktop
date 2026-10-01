"""Sammelt echte Daten für die Bildschirmfotos in fixture.json.

Aufruf: python3 screenshots/fixture.py <recording.jsonl> <projekt> <jichi-quellbaum>
- die Aufnahme: ein echter Lauf von jichi 0.12 mit jlu/qwen3-coder-next über ACP
- das Projekt: Dateien, git-Stand und Diff nach dem Lauf
- jichis Dokumentation (einige Seiten) und die echte Ausgabe von init --list / --dry-run
"""
import json, os, subprocess, sys, tempfile

rec, proj, jichi_src = sys.argv[1:4]
jichi = os.path.join(jichi_src, "jichi")
out = {}

out["recording"] = [json.loads(l) for l in open(rec)]

files, dirs = {}, {}
for root, ds, fs in os.walk(proj):
    ds[:] = [d for d in ds if not d.startswith(".") and d != "__pycache__"]
    rel_root = os.path.relpath(root, proj).replace(os.sep, "/")
    rel_root = "" if rel_root == "." else rel_root
    entries = []
    for d in sorted(ds):
        entries.append({"name": d, "path": f"{rel_root}/{d}".lstrip("/"), "dir": True, "size": 0, "heavy": False})
    for f in sorted(fs):
        p = os.path.join(root, f); rel = f"{rel_root}/{f}".lstrip("/")
        files[rel] = open(p).read()
        entries.append({"name": f, "path": rel, "dir": False, "size": os.path.getsize(p), "heavy": False})
    dirs[rel_root] = entries
out["files"], out["dirs"] = files, dirs

git = lambda *a: subprocess.run(["git", "-C", proj, *a], capture_output=True, text=True).stdout
out["git"] = {
    "branch": git("branch", "--show-current").strip() or "main",
    "changes": [{"path": "weather/convert.py", "status": "M", "additions": 1, "deletions": 1}],
    "before": git("show", "HEAD:weather/convert.py"),
    "after": files["weather/convert.py"],
}

docs = os.path.join(jichi_src, "docs")
out["docs"] = {p: open(os.path.join(docs, p)).read() for p in ["README.md", "SETUP_WIZARD.md", "SCAFFOLDING.md", "ACP.md", "VOCABULARY.md"]}
liste = []
for root, ds, fs in os.walk(docs):
    for f in fs:
        if f.endswith(".md"):
            liste.append(os.path.relpath(os.path.join(root, f), docs).replace(os.sep, "/"))
out["docsListe"] = sorted(liste)
out["docsCommit"] = subprocess.run(["git", "-C", jichi_src, "rev-parse", "--short=7", "HEAD"], capture_output=True, text=True).stdout.strip()

run = lambda args, cwd=None: subprocess.run([jichi, *args], capture_output=True, text=True, cwd=cwd, stdin=subprocess.DEVNULL)
out["initListe"] = run(["init", "--list"]).stdout
with tempfile.TemporaryDirectory() as t:
    out["initProbe"] = run(["init", "default", "python-cli", "--dry-run"], cwd=t).stdout
out["version"] = run(["--version"]).stdout.splitlines()[0]

here = os.path.dirname(os.path.abspath(__file__))
json.dump(out, open(os.path.join(here, "fixture.json"), "w"), ensure_ascii=False)
print(len(out["recording"]), "Zeilen,", len(files), "Dateien,", len(out["docsListe"]), "Doku-Seiten,", out["version"])
