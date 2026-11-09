"""
Translate the Captain app's words into every supported language.

    python manage.py translate_app            # only what's new since last time
    python manage.py translate_app --all      # redo everything
    python manage.py translate_app --dry-run  # list the strings, translate nothing

Collects the English text shown on screen (JSX text, and title/label/placeholder…
props) from captain-mob and mobile-core, asks the AI for simple, everyday
translations, and writes mobile-core/src/i18n/<lang>.json. The app looks words
up there, so screens switch language instantly and offline.
"""
import json
import re
import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.common import llm
from apps.common.languages import LANGUAGES

ROOT = Path(settings.BASE_DIR).parent
SOURCES = [ROOT / "captain-mob" / "app", ROOT / "captain-mob" / "lib", ROOT / "mobile-core" / "src"]
OUT = ROOT / "mobile-core" / "src" / "i18n"

PROPS = ("title|subtitle|label|placeholder|hint|body|action|confirm|emptyBody|emptyTitle|tagline|supporting|caption|"
         "message|cta|heading|description|note|text|sub")
PATTERNS = [
    re.compile(r">\s*([^<>{}`\n]*[A-Za-z][^<>{}`\n]*?)\s*<"),                                   # <T>Some text</T>
    re.compile(r"\b(?:" + PROPS + r")=\"([^\"\n]*[A-Za-z][^\"\n]*)\""),                        # title="…"
    re.compile(r"\b(?:" + PROPS + r")=\{\s*\"([^\"\n]*[A-Za-z][^\"\n]*)\"\s*\}"),              # title={"…"}
    re.compile(r"\b(?:" + PROPS + r"):\s*\"([^\"\n]*[A-Za-z][^\"\n]*)\""),                     # { title: "…" }
    re.compile(r"\?\s*\"([^\"\n]*[A-Za-z ][^\"\n]*)\"\s*:\s*\"([^\"\n]*[A-Za-z ][^\"\n]*)\""),  # a ? "Yes" : "No"
    re.compile(r"\bt\(\s*\"([^\"\n]+)\""),                                                        # t("…")
    re.compile(r"\btoast\(\s*\"([^\"\n]+)\""),                                                    # toast("…")
    re.compile(r"setError\(\s*\"([^\"\n]+)\""),
    re.compile(r"setInfo\(\s*\"([^\"\n]+)\""),
    re.compile(r"[\[,(]\s*\"([A-Z][^\"\n]*[a-z][^\"\n]*)\""),                                     # ["wallet", "Wallet", …]
]
CODE_BITS = re.compile(r"===|!==|\)\s*[:?]|\.includes\(|'\+|\+'|null|undefined|\w+\.\w+\(|\[\"")
NOT_TEXT = re.compile(r"^(?:[a-z0-9_\-./:@#%]+|[A-Z0-9_]+|https?://.*|#[0-9a-fA-F]{3,8}|rgba?\(.*)$")


def collect() -> list[str]:
    found = set()
    for base in SOURCES:
        for f in base.rglob("*.tsx"):
            src = f.read_text(encoding="utf8")
            for pat in PATTERNS:
                for m in pat.finditer(src):
                    for s in m.groups():
                        s = (s or "").strip()
                        if len(s) < 2 or NOT_TEXT.match(s) or "=>" in s or "&&" in s or s.startswith(("//", "{", "(")):
                            continue
                        if CODE_BITS.search(s) or s.endswith(("(", ":")) or ("_" in s and " " not in s):
                            continue
                        if not re.search(r"[A-Za-z]{2}", s):
                            continue
                        found.add(s)
    return sorted(found)


SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "properties": {"i": {"type": "integer"}, "text": {"type": "string"}},
        "required": ["i", "text"], "additionalProperties": False}}},
    "required": ["items"], "additionalProperties": False,
}

SYSTEM = """You translate the screens of GoLoc Captain, a phone app for local tour hosts in India, into {language}.
Many users have little schooling, so:
- Use the simple words people speak every day, in {language} script. Short and clear.
- Write everything in {language} script. Everyday English words people use (hotel, booking, trip, reels, wallet, app, online) are written the way they sound, in {language} script, never in English letters.
- Only these stay in English letters: GoLoc, AI, GLAC-ID, PDF, UPI, KYC, OTP, ID, PIN, SOS, GST, PAN, IFSC.
- Keep the brand words "GoLoc" and "Captain" recognisable; "GLAC-ID" and "AI" stay as they are.
- Keep anything in curly braces like {{n}} or {{name}} exactly, and keep numbers, ₹ amounts, emojis and symbols like · → … unchanged.
- These are button labels, titles and short messages: keep each about as short as the English.
Return one item per input with the same index i."""


class Command(BaseCommand):
    help = "Translate the Captain app's on-screen text into every supported language."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Retranslate everything, not just new strings.")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--lang", action="append", help="Only these languages (repeatable).")
        parser.add_argument("--groq-model", default=None,
                            help="Another Groq model for this bulk job (its own daily allowance), e.g. openai/gpt-oss-20b.")

    def handle(self, *args, **opts):
        strings = collect()
        self.stdout.write(f"{len(strings)} strings found.")
        if opts["dry_run"]:
            for s in strings:
                self.stdout.write(s)
            return
        if not llm.enabled():
            raise CommandError("Set GROQ_API_KEY or ANTHROPIC_API_KEY first.")
        OUT.mkdir(parents=True, exist_ok=True)
        langs = opts["lang"] or [c for c in LANGUAGES if c != "en"]
        for code in langs:
            path = OUT / f"{code}.json"
            have = {} if opts["all"] or not path.exists() else json.loads(path.read_text(encoding="utf8"))
            todo = [s for s in strings if s not in have]
            self.stdout.write(f"{LANGUAGES[code]}: {len(todo)} to translate")
            for start in range(0, len(todo), 50):
                batch = todo[start:start + 50]
                payload = json.dumps([{"i": i, "text": s} for i, s in enumerate(batch)], ensure_ascii=False)
                res = None
                for attempt in range(4):  # rate limits and the odd malformed reply: wait and retry
                    try:
                        res = llm.complete_json(SYSTEM.replace("{language}", LANGUAGES[code]), payload, SCHEMA,
                                                name="app_strings", effort="low", max_tokens=16000,
                                                groq_model=opts["groq_model"])
                        break
                    except llm.LLMError as exc:
                        self.stderr.write(f"  batch {start} try {attempt + 1}: {exc}")
                        time.sleep(8 * (attempt + 1))
                if res is None:
                    continue
                for row in res.data.get("items", []):
                    i = row.get("i")
                    if isinstance(i, int) and 0 <= i < len(batch) and row.get("text", "").strip():
                        have[batch[i]] = row["text"].strip()
                path.write_text(json.dumps(dict(sorted(have.items())), ensure_ascii=False, indent=0), encoding="utf8")
                self.stdout.write(f"  {min(start + 50, len(todo))}/{len(todo)}")
            # Drop words no longer in the app.
            keep = {k: v for k, v in have.items() if k in set(strings)}
            path.write_text(json.dumps(dict(sorted(keep.items())), ensure_ascii=False, indent=0), encoding="utf8")
        self.stdout.write(self.style.SUCCESS("Done."))
