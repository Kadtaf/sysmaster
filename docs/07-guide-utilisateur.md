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

La vitesse ne rapporte rien. L'XP récompense ce que vous avez compris, pas la rapidité.

### Classement

Vous y apparaissez sous un nom abrégé (« Alice M. »), jamais avec votre e-mail. Le bouton **Me retirer du classement** vous en retire sans toucher à votre XP ni à vos badges.

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

Personne ne relit sa propre révision, administrateurs compris. Un second regard est la raison d'être de la relecture.

## 4. L'assistant

Connecté, ouvrez **Assistant** et posez votre question (choisir la plateforme et votre niveau aide l'assistant à adapter la réponse).

- Chaque étape dit **pourquoi**, **comment** et **quand** agir, avec son niveau de risque.
- Une commande à risque élevé ou critique est **masquée** : dépliez « Risques à connaître » pour l'afficher. Une commande critique ne se copie pas : tapez-la vous-même en vérifiant chaque argument.
- Les **sources** renvoient aux fiches de la base de connaissances. Une réponse marquée **« Non vérifiée »** ne s'appuie sur aucune fiche : vérifiez dans la documentation officielle avant d'agir.
- L'assistant n'exécute jamais rien. Ne lui donnez ni mot de passe, ni clé, ni donnée personnelle.
- Le nombre de questions par 24 heures est limité ; il reste affiché sous la zone de saisie. Vos conversations sont conservées dans la colonne de gauche.
- Les pouces 👍 / 👎 sous une réponse nous aident à améliorer l'assistant.

## 5. Ce qui arrive ensuite

Les fonctions suivantes sont prévues dans la [feuille de route](05-feuille-de-route.md) :

- l'enrichissement de l'assistant (documentation officielle, réponses en continu, diagnostic à partir de journaux) ;
- les labs pratiques (Phase 4) ;
- les certifications, la communauté et les offres payantes (Phase 5) ;
- les applications mobiles (Phase 6).
