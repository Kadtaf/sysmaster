"""Contrat du service IA. Les noms suivent packages/contracts (camelCase côté JSON)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

RiskLevel = Literal["none", "low", "medium", "high", "critical"]
RISK_ORDER: list[RiskLevel] = ["none", "low", "medium", "high", "critical"]
Platform = Literal[
    "windows",
    "linux",
    "macos",
    "ios",
    "ipados",
    "android",
    "network",
    "cloud",
    "security",
    "devops",
    "docker",
    "kubernetes",
    "postgresql",
    "mysql",
    "software",
    "cross_platform",
]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------------------------------------------------------- Ce que produit le modèle
class DraftStep(BaseModel):
    """Une étape : toujours le pourquoi avant le comment (règle « comprendre avant d'exécuter »)."""

    title: str
    why: str = Field(description="Pourquoi cette étape : ce qu'elle vérifie ou corrige. Jamais vide.")
    how: str = Field(description="Comment la réaliser, en Markdown court.")
    command: str | None = Field(default=None, description="Commande exacte, ou null si l'étape n'en a pas.")
    shell: str | None = Field(default=None, description="bash, powershell, cmd… ou null.")
    when: str = Field(description="Dans quel cas faire cette étape, et quand ne pas la faire.")
    risk: RiskLevel
    risk_note: str = Field(description="Ce qui peut mal tourner, ou « aucun : lecture seule ».")
    alternatives: list[str] = Field(default_factory=list)


class DraftAnswer(BaseModel):
    """Format imposé au modèle (structured outputs)."""

    summary: str = Field(description="La réponse en une ou deux phrases.")
    explanation: str = Field(description="Le pourquoi : le mécanisme en jeu, en Markdown, adapté au niveau.")
    steps: list[DraftStep] = Field(default_factory=list)
    source_refs: list[int] = Field(default_factory=list, description="Numéros des documents [n] du contexte réellement utilisés.")
    check_questions: list[str] = Field(default_factory=list, description="Une ou deux questions pour vérifier la compréhension.")
    out_of_scope: bool = Field(default=False, description="Vrai si la question sort de l'informatique système et réseau.")


class DraftSymptom(BaseModel):
    code: str = Field(description="Code exact d'un symptôme du catalogue fourni. Jamais un code inventé.")
    quote: str = Field(description="Passage recopié mot pour mot du texte de l'utilisateur qui montre ce symptôme.")


class DraftLogFinding(BaseModel):
    summary: str = Field(description="Ce que la ligne de journal indique, en une phrase en français.")
    quote: str = Field(description="La ligne (ou le fragment) recopiée mot pour mot depuis le journal.")


class DraftExtraction(BaseModel):
    """Format imposé au modèle pour l'extraction : il repère, il ne conclut pas (le moteur de déduction décide)."""

    symptoms: list[DraftSymptom] = Field(default_factory=list)
    log_findings: list[DraftLogFinding] = Field(default_factory=list, description="Au plus 5 lignes de journal significatives.")


# --------------------------------------------------------------------------- Ce que renvoie le service
class Source(Camel):
    ref: int
    title: str
    url: str
    kind: Literal["kb_command", "official_doc"]
    slug: str | None = None
    # Mention de licence de la documentation officielle (CC BY… exige l'attribution).
    attribution: str | None = None


class Step(Camel):
    title: str
    why: str
    how: str
    command: str | None
    shell: str | None
    when: str
    risk: RiskLevel
    risk_note: str
    alternatives: list[str]
    # Garde-fous appliqués après le modèle (docs/01 §8.3) :
    masked_until_risks_read: bool
    copy_allowed: bool
    flagged_by: list[str] = Field(default_factory=list, description="Motifs destructifs détectés par le service.")


class Answer(Camel):
    summary: str
    explanation: str
    steps: list[Step]
    sources: list[Source]
    check_questions: list[str]
    verified: bool
    out_of_scope: bool
    notes: list[str] = Field(default_factory=list, description="Corrections apportées par les garde-fous.")


class Turn(Camel):
    question: str
    summary: str


class AskRequest(Camel):
    question: str = Field(min_length=3, max_length=4000)
    platform: Platform | None = None
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    history: list[Turn] = Field(default_factory=list, max_length=6)


class Usage(Camel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


class AskResponse(Camel):
    answer: Answer
    agent: str
    domain: str | None
    model: str
    usage: Usage
    latency_ms: int
    outcome: Literal["answered", "refused", "error"]


# --------------------------------------------------------------------------- Extraction de symptômes
class CatalogueSymptom(Camel):
    code: str = Field(max_length=64)
    label: str = Field(max_length=300)


class ExtractRequest(Camel):
    platform: Platform
    description: str = Field(default="", max_length=5000)
    evidence: str = Field(default="", max_length=100_000)
    catalogue: list[CatalogueSymptom] = Field(min_length=1, max_length=500)


class ExtractedSymptom(Camel):
    code: str
    quote: str
    source: Literal["description", "evidence"]


class LogFinding(Camel):
    summary: str
    quote: str


class ExtractResponse(Camel):
    symptoms: list[ExtractedSymptom]
    log_findings: list[LogFinding]
    notes: list[str] = Field(default_factory=list, description="Éléments écartés par les garde-fous.")
    model: str
    usage: Usage
    latency_ms: int
    outcome: Literal["answered", "refused"]


# --------------------------------------------------------------------------- Génération de quiz
Difficulty = Literal["beginner", "intermediate", "advanced", "expert"]


class DraftChoice(BaseModel):
    id: str = Field(description="Lettre du choix : a, b, c…")
    text: str


class DraftQuestion(BaseModel):
    """Question proposée par le modèle, vérifiée par le service puis relue par une personne avant publication."""

    type: Literal["single", "multiple"] = Field(description="single : une seule bonne réponse ; multiple : plusieurs.")
    prompt: str = Field(description="L'énoncé, en Markdown court. Il porte sur le pourquoi, le quand ou les risques.")
    choices: list[DraftChoice] = Field(description="De 3 à 5 choix plausibles.")
    answer: list[str] = Field(description="Identifiants des choix corrects.")
    explanation: str = Field(description="Pourquoi la bonne réponse est juste, et pourquoi chaque autre choix est faux.")
    difficulty: Difficulty


class DraftQuiz(BaseModel):
    questions: list[DraftQuestion] = Field(default_factory=list)


class QuizRequest(Camel):
    title: str = Field(min_length=1, max_length=200)
    platform: Platform | None = None
    level: Difficulty = "beginner"
    text: str = Field(min_length=50, max_length=30_000, description="Contenu source (fiche ou leçon), seule base des questions.")
    count: int = Field(default=5, ge=1, le=10)


class QuizChoice(Camel):
    id: str
    text: str


class QuizQuestion(Camel):
    type: Literal["single", "multiple"]
    prompt_md: str
    choices: list[QuizChoice]
    answer: list[str]
    explanation: str
    difficulty: Difficulty


class QuizResponse(Camel):
    questions: list[QuizQuestion]
    notes: list[str] = Field(default_factory=list, description="Questions écartées par les vérifications.")
    model: str
    usage: Usage
    latency_ms: int
    outcome: Literal["answered", "refused"]
