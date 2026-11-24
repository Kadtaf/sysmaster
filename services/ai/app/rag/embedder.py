"""Plongements (embeddings) pour la recherche sémantique.

Deux implémentations derrière le même port :
- `FastEmbedder` (production) : modèle multilingue local, exécuté dans le service (ONNX). Aucune
  donnée ne quitte l'infrastructure, aucun coût par requête, et une question en français retrouve
  une documentation en anglais. Le modèle est intégré à l'image Docker.
- `HashEmbedder` (tests, développement sans le modèle) : déterministe et instantané, mais purement
  lexical. Il fait tourner toute la chaîne ; il ne mesure pas la qualité de la recherche.
"""

import math
import zlib
from typing import Literal, Protocol

from app.rag.text import tokens

Kind = Literal["query", "passage"]


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: list[str], kind: Kind) -> list[list[float]]: ...


class HashEmbedder:
    def __init__(self, dim: int = 256):
        self.dim = dim
        self.name = f"hash-{dim}"

    def embed(self, texts: list[str], kind: Kind) -> list[list[float]]:
        out = []
        for text in texts:
            v = [0.0] * self.dim
            for w in tokens(text):
                h = zlib.crc32(w.encode())
                v[h % self.dim] += 1.0 if (h >> 16) & 1 else -1.0
            norm = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / norm for x in v])
        return out


class FastEmbedder:
    """Modèle chargé une fois par processus (≈ 220 Mo, Apache 2.0)."""

    def __init__(self, model: str, cache_dir: str | None = None, offline: bool = False):
        from fastembed import TextEmbedding  # dépendance optionnelle : extra « fastembed »

        # offline : le modèle est déjà dans l'image ; aucun téléchargement au démarrage (système de fichiers en lecture seule).
        self._model = TextEmbedding(model, cache_dir=cache_dir, local_files_only=offline)
        self.name = model
        self.dim = len(next(iter(self._model.embed(["dimension"]))))

    def embed(self, texts: list[str], kind: Kind) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts)]
