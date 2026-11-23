"""Normalisation du texte partagée par la recherche plein texte (vecteurs creux) et les mots-clés."""

import math
import re
import unicodedata
import zlib
from collections import Counter

STOPWORDS = set(
    (
        "avec dans pour sans sous vers chez entre comment pourquoi quand quoi quel quelle quels quelles est sont etre "
        "avoir fait faire mon mes ton tes son ses notre votre leur leurs cette ces celui celle plus moins tres tout "
        "tous toute toutes peux peut veux dois doit fois alors donc mais aussi encore depuis apres avant elle elles "
        "nous vous ils une des les aux par sur que qui the and what how why for with this that from are was you "
        "your can will not use using into when then than also have has its"
    ).split()
)

_TOKEN = re.compile(r"[\w\-./]+")


def unaccent(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def tokens(text: str) -> list[str]:
    """Mots significatifs, en minuscules et sans accents (« Redémarrer » et « redemarrer » se rejoignent)."""
    out = []
    for w in _TOKEN.findall(unaccent(text.lower())):
        w = w.strip(".-/")
        if len(w) >= 3 and w not in STOPWORDS:
            out.append(w)
    return out


def sparse_vector(text: str) -> tuple[list[int], list[float]]:
    """Vecteur creux « sac de mots » : Qdrant y applique l'IDF (modifier=IDF), ce qui donne un score de type BM25.

    L'indice d'un mot est son empreinte CRC32 : pas de vocabulaire à maintenir, et les collisions
    (rares sur 2^31) ne font que rapprocher deux mots, sans rien casser.
    """
    counts = Counter(tokens(text))
    indices = [zlib.crc32(w.encode()) & 0x7FFFFFFF for w in counts]
    values = [1.0 + math.log(n) for n in counts.values()]
    # Deux mots peuvent partager une empreinte : on fusionne pour garder des indices uniques.
    merged: dict[int, float] = {}
    for i, v in zip(indices, values, strict=True):
        merged[i] = merged.get(i, 0.0) + v
    return list(merged), list(merged.values())
