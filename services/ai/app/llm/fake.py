"""Modèle factice, déterministe et gratuit : développement local sans clé, et tests.
Il construit une réponse plausible à partir des documents fournis, sans rien inventer."""

import json
import re
from collections.abc import AsyncIterator
from typing import Any

from app.llm.port import LlmResult
from app.schemas import (
    DraftAnswer,
    DraftChoice,
    DraftExtraction,
    DraftLab,
    DraftLogFinding,
    DraftQuestion,
    DraftQuiz,
    DraftStep,
    DraftSymptom,
)


class FakeLlm:
    model = "fake"

    async def answer(self, system: str, user: str) -> LlmResult:
        refs = [int(n) for n in re.findall(r"^\[(\d+)\] ", user, re.MULTILINE)]
        names = re.findall(r"^Commande : (\S+)", user, re.MULTILINE)
        steps = [
            DraftStep(
                title=f"Observer avec {name}",
                why="Comprendre l'état réel avant d'agir.",
                how=f"Lisez la fiche « {name} ».",
                command=None,
                shell=None,
                when="En premier.",
                risk="none",
                risk_note="Aucun : lecture seule.",
            )
            for name in names[:2]
        ]
        draft = DraftAnswer(
            summary="Réponse de démonstration (modèle factice) construite à partir de la base de connaissances.",
            explanation="Configurez AI_LLM=claude et une clé d'API pour obtenir une vraie réponse.",
            steps=steps,
            source_refs=refs[:2],
            check_questions=["Quelle étape est sans risque, et pourquoi ?"],
        )
        return LlmResult(draft=draft, outcome="answered", model=self.model)

    async def answer_stream(self, system: str, user: str) -> AsyncIterator[dict[str, Any] | LlmResult]:
        """Rejoue la réponse factice mot à mot, comme un vrai flux (résumé puis explication)."""
        result = await self.answer(system, user)
        partial: dict[str, Any] = {}
        for field in ("summary", "explanation"):
            words = getattr(result.draft, field).split(" ")
            for i in range(1, len(words) + 1):
                partial[field] = " ".join(words[:i])
                yield dict(partial)
        yield result

    async def extract(self, system: str, user: str) -> LlmResult[DraftExtraction]:
        """Repère les libellés du catalogue présents tels quels dans le texte (sans accents ni casse)."""
        from app.diagnostic.extract import unaccent

        catalogue = re.findall(r"^- (\S+) : (.+)$", system, re.MULTILINE)
        text = user
        flat = unaccent(text).lower()
        symptoms = []
        for code, label in catalogue:
            i = flat.find(unaccent(label).lower())
            if i >= 0:
                symptoms.append(DraftSymptom(code=code, quote=text[i : i + len(label)]))
        journal = re.search(r"<journal>\n(.*)\n</journal>", user, re.DOTALL)
        findings = [
            DraftLogFinding(summary="Ligne d'erreur relevée (modèle factice).", quote=line.strip())
            for line in (journal.group(1).splitlines() if journal else [])
            if re.search(r"error|erreur|critical|critique|fail", line, re.IGNORECASE)
        ][:5]
        return LlmResult(draft=DraftExtraction(symptoms=symptoms, log_findings=findings), outcome="answered", model=self.model)

    async def generate_quiz(self, system: str, user: str) -> LlmResult[DraftQuiz]:
        """Une question par demande, construite sur le titre du contenu (aucune invention)."""
        title = re.search(r'<contenu titre="([^"]*)">', user)
        count = int(m.group(1)) if (m := re.search(r"Rédige (\d+) question", user)) else 1
        name = title.group(1) if title else "ce contenu"
        questions = [
            DraftQuestion(
                type="single",
                prompt=f"Question {i + 1} (modèle factice) : avant d'utiliser {name}, que faut-il faire ?",
                choices=[
                    DraftChoice(id="a", text="Comprendre ce que fait la commande et ses risques"),
                    DraftChoice(id="b", text="L'exécuter tout de suite pour voir"),
                    DraftChoice(id="c", text="Copier la première commande trouvée en ligne"),
                ],
                answer=["a"],
                explanation="Comprendre avant d'exécuter : les autres choix agissent sans savoir ce qui va se passer.",
                difficulty="beginner",
            )
            for i in range(count)
        ]
        return LlmResult(draft=DraftQuiz(questions=questions), outcome="answered", model=self.model)

    async def generate_lab(self, system: str, user: str) -> LlmResult[DraftLab]:
        """Un petit lab jouable : un service ne démarre plus, faute de son fichier de configuration."""
        names = {"Linux": "linux", "Docker": "docker", "Réseau": "network", "Cybersécurité": "cyber"}
        label = m.group(1) if (m := re.search(r"Catégorie : ([^.]+)\.", user)) else "Linux"
        prefix = names.get(label, "linux")
        conf = "/etc/rapports/rapports.conf"
        machine = {
            "hostname": "srv-rapports",
            "cwd": "/root",
            "clock": "2026-11-24T08:00:00.000Z",
            "nextPid": 2000,
            "dirs": ["/etc", "/etc/rapports", "/root", "/tmp", "/var", "/var/log"],
            "files": {
                "/etc/rapports/rapports.conf.exemple": {"size": 40, "content": "# Exemple\nport=8080\n"},
                "/var/log/syslog": {"size": 1048576, "content": ""},
            },
            "mounts": [{"target": "/", "device": "/dev/sda1", "sizeBytes": 21474836480, "baseUsedBytes": 5368709120}],
            "services": {
                "rapports": {
                    "description": "Générateur de rapports",
                    "active": "failed",
                    "enabled": True,
                    "process": "rapports",
                    "ports": [8080],
                    "needsFiles": [conf],
                    "journal": [f'nov. 24 07:59:58 srv-rapports rapports[1999]: open() "{conf}" failed (2: No such file or directory)'],
                }
            },
        }
        validators = [{"description": "Le service rapports tourne", "check": {"kind": "service_active", "service": "rapports"}}]
        draft = DraftLab(
            slug=f"{prefix}-brouillon-factice",
            title="Le service de rapports ne démarre plus (brouillon factice)",
            brief_md="Le service **rapports** est en échec depuis ce matin. Remettez-le en marche.\n\n"
            "> Machine simulée : tapez `help` pour voir les commandes disponibles.",
            objectives=["Lire le journal d'un service en échec", "Rétablir un fichier de configuration manquant"],
            hints=[
                "Que dit le journal du service ?",
                f"Il manque {conf} : un exemple est à côté.",
                f"echo 'port=8080' > {conf} puis systemctl start rapports",
            ],
            solution_md="**Cause** : le fichier de configuration a disparu lors d'un nettoyage. **Démarche** : journalctl -u rapports, "
            "recréer le fichier à partir de l'exemple, redémarrer. **Prévention** : versionner la configuration (modèle factice).",
            machine_json=json.dumps(machine, ensure_ascii=False),
            validators_json=json.dumps(validators, ensure_ascii=False),
            walkthrough=[
                "systemctl status rapports",
                "journalctl -u rapports -n 5",
                f"echo 'port=8080' > {conf}",
                "systemctl start rapports",
            ],
        )
        return LlmResult(draft=draft, outcome="answered", model=self.model)
