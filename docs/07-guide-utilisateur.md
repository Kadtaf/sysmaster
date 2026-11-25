# 07 — Guide utilisateur

Ce guide présente ce que vous pouvez faire aujourd'hui sur SysMaster, et la logique derrière chaque écran. Une seule idée court partout : **comprendre avant d'exécuter**. Une commande ne vous est jamais donnée seule. Elle arrive avec le pourquoi, le quand, le contexte, les risques et les alternatives.

## 1. Sans compte

Tout le contenu se lit sans compte. Il en faut un seulement pour garder une trace de votre progression.

| Écran | Adresse | À quoi il sert |
|---|---|---|
| Accueil | `/` | Vue d'ensemble et accès rapides |
| Parcours | `/parcours` | Les parcours métier (technicien, administrateur Linux, DevOps…) et leurs cours |
| Leçons | `/cours/<cours>/<leçon>` | Le contenu pédagogique : objectifs, explications, exemples |
| Base de connaissances | `/commandes` | Les fiches commandes, avec recherche et filtre par plateforme |
| Diagnostic | `/diagnostic` | Décrire une panne et obtenir des causes probables expliquées |
| Classement | `/classement` | Les apprenants les plus actifs (noms abrégés) |

### Lire une fiche commande

Les sections d'une fiche suivent un ordre voulu : **Pourquoi → Quand → Risques → Commande → Alternatives**.

- La couleur du risque (aucun, faible, moyen, élevé, critique) est toujours accompagnée d'un libellé écrit.
- Une commande à risque **élevé** ou **critique** reste masquée tant que vous n'avez pas déplié ses risques.
- Une commande **critique** n'a pas de bouton copier. Vous la tapez vous-même, en sachant ce qu'elle fait.

Essayez avec `/commandes/linux-rm-rf`, puis regardez l'alternative proposée, `trash-put`.

### Tester ma compréhension

Quand une fiche a un quiz relu et publié, la section **Tester ma compréhension** y mène. Répondez à toutes les questions, puis validez : vous voyez votre score, les questions justes et fausses, la bonne réponse et le **pourquoi** de chacune. Une question à cases à cocher n'est juste que si vous cochez exactement les bonnes réponses. Vous pouvez recommencer autant de fois que vous le voulez. Sans compte, rien n'est enregistré ; connecté, chaque tentative est gardée.

### Faire un diagnostic

1. Décrivez la panne avec vos mots, par exemple « mon PC redémarre seul, surtout en jeu, et il chauffe ». Vous pouvez aussi cocher des symptômes.
2. Si vous avez un extrait de journal, collez-le. Un indice comme `Event ID 41 Kernel-Power` change le classement des causes.
3. Lisez les causes probables. Chacune donne sa **probabilité**, **pourquoi** vos symptômes y mènent, et un **plan d'action** ordonné avec le risque de chaque étape.
4. Les **questions de clarification** sont celles qui départageraient le mieux les deux premières hypothèses.

Le moteur ne propose jamais une action destructive en première étape. Il n'utilise pas d'IA générative : chaque probabilité vient de règles relues, que l'explication détaille.

## 2. Avec un compte

### Se connecter

Cliquez sur **Se connecter**. Vous pouvez utiliser :

- un e-mail (vérifié) et un mot de passe ;
- Google, Microsoft ou GitHub, si l'administrateur les a activés ;
- une **passkey** : c'est la méthode recommandée, car elle ne peut pas être hameçonnée.

La double authentification (application TOTP) et les passkeys se gèrent dans **Mon compte → Gérer la sécurité du compte**.

### Suivre un parcours

1. Ouvrez un parcours et cliquez sur **S'inscrire au parcours**.
2. Lisez une leçon, puis cliquez sur **J'ai compris, valider la leçon**. Avant de valider, demandez-vous si vous sauriez expliquer *pourquoi* on procède ainsi, et quel est le principal risque.
3. Les leçons se valident **dans l'ordre**. Si une leçon s'appuie sur une autre que vous n'avez pas encore validée, la plateforme vous indique laquelle faire d'abord. Vous pouvez quand même la lire.

La progression d'un parcours tient compte des leçons partagées : une leçon validée dans un cours compte pour tous les parcours qui le contiennent.

### Tableau de bord (`/tableau-de-bord`)

- **Niveau et XP**, avec la distance jusqu'au niveau suivant (de « Curieux » à « Maître système »).
- **Série** : le nombre de jours consécutifs où vous avez appris quelque chose, et votre record. La date se calcule dans votre fuseau horaire.
- **Que faire ensuite ?** : la prochaine leçon de chaque parcours en cours.
- **Points forts / À renforcer** : vos compétences selon les leçons validées.
- **Badges** obtenus, et ceux qui restent à obtenir.

### Comment gagner de l'XP

| Action | XP |
|---|---|
| Valider une leçon | 10 + 1 par minute estimée (50 au plus) |
| Mener un diagnostic à terme (connecté) | 15 |
| Terminer un parcours | 200 |
| Voir sa réponse acceptée dans la communauté (une fois par sujet) | 25 |

La vitesse ne rapporte rien. L'XP récompense ce que vous avez compris, pas la rapidité.

### Classement

Vous y apparaissez sous un nom abrégé (« Alice M. »), jamais avec votre e-mail. Le bouton **Me retirer du classement** vous en retire sans toucher à votre XP ni à vos badges.

### Les labs (`/labs`)

Un lab vous confie une machine en panne et une situation (« le site ne répond plus »). Vous tapez des commandes dans le terminal de la page comme sur un vrai serveur, mais **rien ne s'exécute réellement** : la machine est simulée. Tapez `help` pour la liste des commandes disponibles.

1. Lisez la situation et ce qui sera vérifié.
2. Observez avant d'agir : `systemctl status`, `journalctl -u`, `df -h`, `ss -tlnp`, pour le réseau `ip a`, `ip route`, `ping`, `dig`, `curl`, pour Docker `docker ps -a`, `docker logs`, `docker compose up -d`, et pour la sécurité `ls -l`, `stat`, `ufw status numbered`, `grep … | cut | sort | uniq -c`…
3. Réparez, puis cliquez sur **Vérifier ma réparation**. La validation regarde l'état de la machine, pas la suite exacte de vos commandes.
4. Une fois réussi, vous voyez votre score et l'explication complète : la cause, la démarche, et comment éviter que ça revienne.

Les **indices** sont révélés un par un ; chacun retire des points. Un lab résolu sans indice rapporte 60 XP et le badge « Sans filet ». Une commande trop dangereuse (effacer `/var/log` entier, par exemple) est refusée avec une explication. **Recommencer** vous rend une machine neuve. Une session dure le temps indiqué sur le lab ; il faut être connecté.

### Les certifications (`/certifications`)

Chaque certification affiche ce qu'il faut pour l'obtenir : des **labs pratiques** à réussir, parfois une autre certification d'abord, puis un **examen**. Les conditions remplies sont cochées.

1. Réussissez les labs exigés (liens sur la page).
2. Lancez l'examen quand vous êtes prêt : les questions sont tirées au sort, le minuteur démarre tout de suite et ne s'arrête pas si vous fermez la page (vous pouvez la rouvrir et reprendre). À l'échéance, l'examen est remis automatiquement.
3. Les changements d'onglet et les collages sont notés, sans vous éliminer : un examen litigieux peut être relu.
4. Résultat immédiat. Les bonnes réponses ne sont pas affichées, pour que l'examen reste juste pour les suivants : révisez avec les quiz d'entraînement et les labs. Après un échec, une nouvelle tentative est possible au bout du délai indiqué (24 h en général).

En cas de réussite, votre **certificat** est émis à votre nom, avec un numéro (ex. `SM-2026-LINADM-7F3K9Q`). Sa page s'imprime ou s'enregistre en PDF, porte un QR code, et peut être ajoutée à LinkedIn. N'importe qui peut le vérifier sur `/verify/<numéro>` : la page confirme qu'il a bien été délivré par SysMaster, qu'il n'a pas été modifié, et s'il est toujours valide.

## 3. Contribuer aux fiches (auteurs et relecteurs)

Le lien **Rédaction** apparaît si vous avez le rôle *author*, *reviewer* ou *admin*.

1. **Nouvelle fiche** ou **Proposer une modification** : saisissez l'identifiant d'une fiche existante (la fin de son adresse, par exemple `linux-systemctl`). La version en ligne **ne change pas** tant que la révision n'est pas approuvée.
2. Rédigez. Vous pouvez enregistrer un brouillon incomplet. L'encadré **Avant de soumettre** liste ce qui manque encore pour respecter la règle « comprendre avant d'exécuter » :
   - pourquoi, quand, contexte ;
   - au moins un risque décrit ;
   - un exemple expliqué ;
   - une alternative (une fiche publiée) ;
   - une source.
3. **Soumettre à la relecture** : la fiche est figée pendant la relecture.
4. Un relecteur **approuve**, ce qui publie la fiche, ou **demande des changements** avec une explication. Vous retrouvez son commentaire en haut de la révision.

Les quiz et les labs suivent le même circuit. Pour un lab, vous décrivez la machine en panne, ce qui sera vérifié, et votre **démarche de référence** (une commande par ligne) : elle est rejouée à chaque enregistrement, et l'encadré vous dit si elle répare bien la machine.

Personne ne relit sa propre révision, administrateurs compris. Un second regard est la raison d'être de la relecture.

## 4. L'assistant

Connecté, ouvrez **Assistant** et posez votre question (choisir la plateforme et votre niveau aide l'assistant à adapter la réponse).

- La réponse s'écrit sous vos yeux : d'abord les documents consultés, puis le résumé et l'explication. Les **étapes et commandes** n'apparaissent qu'à la fin, une fois contrôlées par les garde-fous.
- Chaque étape dit **pourquoi**, **comment** et **quand** agir, avec son niveau de risque.
- Une commande à risque élevé ou critique est **masquée** : dépliez « Risques à connaître » pour l'afficher. Une commande critique ne se copie pas : tapez-la vous-même en vérifiant chaque argument.
- Les **sources** renvoient aux fiches de la base de connaissances (« Fiche SysMaster ») et, quand elle est installée, à la documentation officielle (« Doc officielle », souvent en anglais, avec sa mention de licence). Une réponse marquée **« Non vérifiée »** ne s'appuie sur aucune fiche : vérifiez dans la documentation officielle avant d'agir.
- L'assistant n'exécute jamais rien. Ne lui donnez ni mot de passe, ni clé, ni donnée personnelle.
- Le nombre de questions par 24 heures est limité ; il reste affiché sous la zone de saisie. Vos conversations sont conservées dans la colonne de gauche.
- Les pouces 👍 / 👎 sous une réponse nous aident à améliorer l'assistant.

### Diagnostic avec l'IA

Connecté, cochez « Repérer les symptômes avec l'IA » sur la page Diagnostic. L'IA lit votre description et le journal collé, et montre pour chaque symptôme retenu le passage exact qui le justifie : vous voyez ce qu'elle a compris, et vous pouvez corriger en cochant d'autres symptômes. Les causes, elles, sont toujours classées par le moteur de diagnostic, avec son raisonnement. Chaque analyse par l'IA compte dans le même quota quotidien que l'assistant.

### La communauté (`/communaute`)

Posez une question dans la bonne catégorie : le système, ce que vous avez essayé, le message d'erreur exact. Avant de publier, la page propose les sujets proches. La réponse existe peut-être déjà. **Masquez les mots de passe, adresses IP publiques et noms internes** avant de coller un journal.

- **Votes** : flèche haute si un message vous a aidé, flèche basse s'il est faux ou dangereux. On ne vote pas pour soi.
- **Réponse acceptée** : si une réponse vous a débloqué, acceptez-la. Elle remonte en tête, le sujet est marqué « Résolue », et son auteur gagne 25 XP d'entraide.
- **Signaler** : spam, propos blessants, commande dangereuse sans avertissement. Après trois signalements de personnes différentes, le message est masqué jusqu'à la décision d'un modérateur. Si l'un de vos messages est masqué, vous le voyez encore, avec le motif.

Une bonne réponse explique quoi vérifier et pourquoi. Une commande risquée s'accompagne d'un avertissement sur ce qu'elle fait.

### Groupes d'étude et mentorat

- **Groupes** (`/communaute/groupes`) : rejoignez un groupe public, ou un groupe privé avec le code que son responsable vous donne. Les échanges du groupe ne sont visibles que de ses membres. Vous pouvez créer votre propre groupe, avec un objectif (« obtenir Linux Administrator avant mars ») et un nombre de places.
- **Mentorat** (`/communaute/mentorat`) : choisissez un mentor selon ses sujets et envoyez une demande qui dit où vous en êtes et ce que vous attendez. S'il accepte, une page d'échanges privée s'ouvre pour vous deux. L'un ou l'autre peut y mettre fin ; les échanges restent alors lisibles.

## 5. Ce qui arrive ensuite

Les fonctions suivantes sont prévues dans la [feuille de route](05-feuille-de-route.md) :

- l'enrichissement de l'assistant (documentation officielle, réponses en continu, diagnostic à partir de journaux) ;
- les labs sur de vraies machines isolées (Phase 4) ;
- les examens des autres certifications, le partage de labs et de scripts et les offres payantes (Phase 5) ;
- les applications mobiles (Phase 6).
