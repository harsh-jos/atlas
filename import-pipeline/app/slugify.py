import re

# Mirror of `slugify` in the Next.js app (lib/utils.ts) so slugs generated here match
# what the app would generate. JS `\w` is ASCII-only ([A-Za-z0-9_]); re.ASCII matches that.
_WHITESPACE = re.compile(r"\s+")
_NON_WORD = re.compile(r"[^\w\-]+", re.ASCII)
_DASHES = re.compile(r"-{2,}")
_LEADING = re.compile(r"^-+")
_TRAILING = re.compile(r"-+$")


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = _WHITESPACE.sub("-", s)
    s = _NON_WORD.sub("", s)
    s = _DASHES.sub("-", s)
    s = _LEADING.sub("", s)
    s = _TRAILING.sub("", s)
    return s
