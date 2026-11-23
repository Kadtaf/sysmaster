"""Page HTML → sections → passages.

On découpe par titres (h1 à h3) pour qu'un passage parle d'un seul sujet et que la citation pointe
vers la bonne ancre. Une section trop longue est coupée en passages qui se recouvrent un peu, pour
ne pas séparer une option de son explication.
"""

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

# Environ 150 à 450 mots : assez de contexte pour répondre, assez court pour rester précis.
MAX_WORDS = 450
MIN_WORDS = 25
OVERLAP_WORDS = 60
NOISE = ["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "svg", "button"]


@dataclass(frozen=True)
class Chunk:
    title: str  # titre de la page
    section: str  # chemin des titres, ex. « chkdsk › Paramètres »
    anchor: str | None
    text: str


def _clean(text: str) -> str:
    return re.sub(r"[ \t ]+", " ", re.sub(r"\n\s*\n+", "\n", text)).strip()


def _split(text: str) -> list[str]:
    words = text.split()
    if len(words) <= MAX_WORDS:
        return [text]
    parts, start = [], 0
    while start < len(words):
        parts.append(" ".join(words[start : start + MAX_WORDS]))
        start += MAX_WORDS - OVERLAP_WORDS
    return parts


def chunk_html(html: str) -> list[Chunk]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(NOISE):
        tag.decompose()
    root = soup.find("main") or soup.find("article") or soup.body or soup
    h1 = root.find("h1") or soup.find("title")
    page_title = _clean(h1.get_text(" ")) if h1 else "Sans titre"

    chunks: list[Chunk] = []
    path: dict[int, str] = {1: page_title}
    anchor: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        text = _clean("\n".join(buffer))
        buffer.clear()
        # Une section très courte n'apporte rien… sauf si c'est une syntaxe ou un exemple de code.
        if len(text.split()) < MIN_WORDS and "```" not in text:
            return
        section = " › ".join(path[k] for k in sorted(path))
        chunks.extend(Chunk(page_title, section, anchor, part) for part in _split(text))

    for el in root.find_all(["h1", "h2", "h3", "p", "li", "pre", "td", "dt", "dd"]):
        if not isinstance(el, Tag):
            continue
        if el.name in ("h1", "h2", "h3"):
            flush()
            level = int(el.name[1])
            path = {k: v for k, v in path.items() if k < level}
            path[level] = _clean(el.get_text(" "))
            inner = el.find(attrs={"id": True})
            anchor = el.get("id") or (inner.get("id") if inner else None)
            continue
        # Un <li> ou <td> qui contient déjà des <p> serait compté deux fois.
        if el.find(["p", "li", "pre"]) is not None:
            continue
        text = el.get_text("\n" if el.name == "pre" else " ")
        buffer.append(f"```\n{text.strip()}\n```" if el.name == "pre" else text)
    flush()
    return chunks
