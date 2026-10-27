# Notes pour Claude Code

- Appli web perso, en français, pour Fabien. Interface et commentaires en français, tutoiement dans les textes.
- Table de travail pour la chaîne YouTube « Les enseignements de rien » : trouver des sujets à démystifier,
  les tourner, et tenir un rythme de publication. Née comme artifact claude.ai (« L'atelier du rien », 27/10/2026),
  devenue appli iPhone.
- Le bottleneck à servir, c'est le démarrage à froid : une fiche doit permettre de lancer la caméra sans réfléchir
  (accroche à dire telle quelle, trois temps). Ne pas transformer l'appli en gestionnaire de tâches.
- Pas de framework ni d'étape de build : HTML + CSS + JS classiques, servis tels quels par GitHub Pages,
  installés sur l'iPhone via Safari > Sur l'écran d'accueil.
- Données dans le `localStorage` (clé `atelier-du-rien.v1`) : `{version, sujets, journal, discussions, reglages}`.
  Toute évolution du format doit rester lisible par les exports existants.
- L'interlocuteur (`js/discussion.js`) est la seule chose qui sort de l'appareil : un appel direct à
  `api.anthropic.com` depuis le navigateur (en-tête `anthropic-dangerous-direct-browser-access`).
  La clé est dans `localStorage` sous `atelier-du-rien.cle`, à part des fiches : elle n'entre jamais
  dans l'export, et ne doit jamais être écrite dans un fichier du dépôt. Le modèle est sous
  `atelier-du-rien.modele`. Quatre rôles, un fil par sujet, l'IA ne donne jamais la réponse à sa place.
- Coût : Anthropic ne publie aucun endpoint de solde (l'Admin API, seule à parler d'argent, est fermée
  aux comptes individuels et ne donne que le dépensé). L'appli compte donc elle-même, à partir du
  `usage` de chaque réponse, sous `atelier-du-rien.depense`. Les tarifs sont dans `MODELES[].tarif`
  (dollars par million de jetons, relevés sur platform.claude.com le 27/10/2026) : à revérifier avant
  de les croire, et à mettre à jour si Anthropic bouge ses prix. L'affichage montre le **reste** en
  grand (`.solde`), pas le dépensé : Fabien veut un compte qui descend, lisible sans se rappeler de
  combien il est parti. Sans crédit déclaré, pas de reste possible : on retombe sur le dépensé seul.
  Le même chiffre est repris en réduction (`.solde-mini`) dans la barre du mode tournage, qui ne
  défile pas : c'est là qu'on dépense, donc c'est là qu'il faut le voir bouger. C'est un bouton :
  il ouvre la saisie du crédit sur place (`.solde-saisie`), parce que c'est en discutant qu'on
  s'aperçoit qu'on ne l'a jamais renseigné.
- Réflexion : le modèle vif part avec `thinking:{type:"between_tools"}` + `effort:"low"` — pour trois
  phrases, réfléchir avant de parler coûte du temps et des jetons, et avec une limite serrée ça rendait
  des réponses vides. Le profond garde sa réflexion (`effort:"medium"`, on ne peut pas la couper sur
  Opus 5.5). Si l'API refuse un de ces réglages, la requête repart une fois sans lui.
- Voix : `speechSynthesis` pour la lecture (préférence sous `atelier-du-rien.voix`, voix française locale de
  préférence) et `webkitSpeechRecognition` pour la dictée. Tout passe par le moteur de l'appareil, rien par
  l'appli. Sur iPhone le moteur de parole ne se débloque qu'après un geste : le bouton « Qu'il parle » dit
  une phrase courte en s'allumant, c'est volontaire.
- `js/sujets.js` est la banque livrée (70 fiches, 12 thèmes). L'appli y puise au premier lancement et quand on
  touche « Compléter avec les sujets livrés ». Chaque fiche a exactement trois `temps`.
- À chaque changement de fichier, incrémenter `VERSION` dans `sw.js` et garder la liste `FILES` à jour.
- Icônes générées par `node outils/icones.js` (pas de module à installer).
- Polices locales (Fraunces, Bricolage Grotesque, Space Mono) dans `fonts/` : pas d'appel réseau, hors ligne compris.
- Tester sur mobile en portrait (iPhone d'abord) : zones sûres (`env(safe-area-inset-*)`) et appli lancée depuis
  l'écran d'accueil. Vérifier aussi le thème sombre (tout passe par les variables de `:root`).
