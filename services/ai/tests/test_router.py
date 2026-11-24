import pytest

from app.agents.profiles import system_prompt
from app.agents.router import route


@pytest.mark.parametrize(
    ("question", "platform", "agent", "domain"),
    [
        ("Mon PC redémarre tout seul quand je joue", None, "diagnostician", None),
        ("Écran bleu après la mise à jour de Windows", None, "diagnostician", "windows"),
        ("Quelle différence entre systemctl start et enable ?", None, "tutor", "linux"),
        ("Comment fonctionne le DNS ?", None, "tutor", "network"),
        ("nginx ne démarre plus", "linux", "diagnostician", "linux"),
        ("Qu'est-ce qu'un volume ?", "docker", "tutor", "docker"),
        ("Par quels routeurs passent mes paquets ?", None, "tutor", "network"),
    ],
)
def test_route(question: str, platform: str | None, agent: str, domain: str | None) -> None:
    r = route(question, platform)
    assert (r.agent, r.domain) == (agent, domain)


def test_prompt_systeme_stable_pour_le_cache() -> None:
    # Même profil → même texte, octet pour octet (sinon le cache de prompt ne sert jamais).
    assert system_prompt("tutor", "linux") == system_prompt("tutor", "linux")
    assert "comprendre avant d'exécuter" in system_prompt("diagnostician", None)
