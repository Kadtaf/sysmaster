import pytest

from app.guardrails.pii import redact
from app.llm.port import LlmResult
from app.llm.redacting import RedactingLlm


@pytest.mark.parametrize(
    ("text", "hidden", "kind"),
    [
        ("Contactez jean.dupont@exemple.fr pour l'accès", "jean.dupont@exemple.fr", "email"),
        ("DATABASE_URL=postgres://app:S3cr3t!x@db:5432/app", "S3cr3t!x", "url_password"),
        ("password=hunter2 et le reste", "hunter2", "assignment"),
        ('"client_secret": "a1b2c3d4"', "a1b2c3d4", "assignment"),
        ("mot de passe : Azerty123", "Azerty123", "assignment"),
        ("Authorization: Bearer abc.def-ghi_123", "abc.def-ghi_123", "auth_header"),
        ("export ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop", "sk-ant-api03-abcdefghijklmnop", "api_key"),
        ("aws_access_key_id = AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLE", "api_key"),
        ("jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", "eyJhbGci", "jwt"),
        ("carte 4111 1111 1111 1111 refusée", "4111 1111 1111 1111", "card"),
        ("IBAN FR76 3000 6000 0112 3456 7890 189", "FR76 3000", "iban"),
        ("appelez le 06 12 34 56 78", "06 12 34 56 78", "phone"),
        (
            "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----",
            "b3BlbnNzaC1rZXk",
            "private_key",
        ),
    ],
)
def test_masque_donnees_personnelles_et_secrets(text: str, hidden: str, kind: str):
    r = redact(text)
    assert hidden not in r.text
    assert r.counts.get(kind) == 1, r.counts


@pytest.mark.parametrize(
    "text",
    [
        "ssh root@srv01 puis ping 192.168.1.10",
        "journalctl -u nginx --since '2026-11-26 10:00:00'",
        "Error 0x80070005 dans C:\\Windows\\System32\\config",
        "ls -la /etc/passwd && cat /etc/shadow",
        "PID 4111111111111112 introuvable",  # échoue au test de Luhn : ce n'est pas une carte
        "inode 1234567890123",
        "le champ password est vide",
    ],
)
def test_laisse_intact_ce_qui_sert_au_diagnostic(text: str):
    r = redact(text)
    assert r.text == text and r.counts == {}


class Recorder:
    def __init__(self):
        self.seen: list[str] = []

    async def answer(self, system, user):
        self.seen.append(user)
        return LlmResult(draft=None, outcome="refused", model="x")

    async def answer_stream(self, system, user):
        self.seen.append(user)
        yield {"summary": "…"}

    extract = generate_quiz = generate_lab = answer


async def test_aucun_appel_ne_part_sans_masquage():
    inner = Recorder()
    llm = RedactingLlm(inner)
    question = "Mon serveur refuse admin@corp.example.com avec password=Tr0ub4dor"
    await llm.answer("s", question)
    await llm.extract("s", question)
    await llm.generate_quiz("s", question)
    await llm.generate_lab("s", question)
    async for _ in llm.answer_stream("s", question):
        pass
    assert len(inner.seen) == 5
    for sent in inner.seen:
        assert "admin@corp.example.com" not in sent and "Tr0ub4dor" not in sent
        assert "Mon serveur refuse" in sent


def test_jeton_de_developpement_refuse_avec_un_vrai_modele():
    from app.config import Settings

    with pytest.raises(ValueError, match="AI_SERVICE_TOKEN"):
        Settings(ai_llm="claude")
    assert Settings(ai_llm="claude", ai_service_token="x" * 32).ai_llm == "claude"
    assert Settings().ai_llm == "fake"
