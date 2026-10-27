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
  Une demande qui ne revient jamais (l'iPhone suspend les requêtes dès que l'appli passe en arrière-plan)
  laissait le champ de réponse bloqué sur « Arrêter » : `parler()` garde donc une montre (`ATTENTE_MAX`,
  repoussée à chaque morceau reçu) et rend la main par `surErreur`. Côté `app.js`, le témoin rendu par
  `parler()` n'est posé que si la demande est encore en vol (`enVol`) : un `surErreur` synchrone — pas de
  clé — écrasait sinon le `null` qu'il venait de poser, et plus rien ne s'envoyait jusqu'à la fermeture
  du plateau.
- L'interlocuteur doit être **contentable**, c'est la demande la plus insistante de Fabien : répondre ne sert
  à rien si ça ne mène jamais nulle part. Trois leviers dans `consigne()` : un bloc de règles (« une question
  à laquelle il a répondu est une question réglée »), le champ `comble` de chaque rôle (ce qui suffit à ce
  personnage-là, et ce qu'il fait alors), et `etape()` qui lui dit combien de fois Fabien a déjà répondu —
  à 4 il resserre, à 7 il conclut, et « Qu'il conclue » (`mode.clore`) lui interdit toute question. La phrase
  de clôture part comme une réponse de Fabien, visible dans le fil, marquée `c:1` pour rester hors des notes.
- Coût : Anthropic ne publie aucun endpoint de solde (l'Admin API, seule à parler d'argent, est fermée
  aux comptes individuels et ne donne que le dépensé). L'appli compte donc elle-même, à partir du
  `usage` de chaque réponse, sous `atelier-du-rien.depense`. Les tarifs sont dans `MODELES[].tarif`
  (dollars par million de jetons, relevés sur platform.claude.com le 27/10/2026) : à revérifier avant
  de les croire, et à mettre à jour si Anthropic bouge ses prix. L'affichage montre le **reste** en
  grand (`.solde`), pas le dépensé : Fabien veut un compte qui descend, lisible sans se rappeler de
  combien il est parti. Le chiffre qu'on saisit est celui de la console, donc **ce qui reste** et non
  ce qui a été chargé : `depense.recaler()` le prend comme nouveau départ et remet le compteur à
  zéro, sinon on soustrairait deux fois le déjà-dépensé. Sans chiffre saisi, pas de reste possible :
  on retombe sur le dépensé seul.
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
  une phrase courte en s'allumant, c'est volontaire. Mais le réglage est gardé d'une fois sur l'autre, donc
  au lancement suivant il est déjà allumé sans qu'on y touche, et la réponse arrive du réseau, loin de tout
  geste : le téléphone restait muet et la lecture avait l'air d'avoir disparu. D'où `voix.reveiller()`, appelé
  au premier clic de la séance (une utterance muette), et le `cancel()` qui ne précède plus `speak()` dans le
  même tour — WebKit reste muet quand on les enchaîne. « Qu'il parle » est remonté dans la ligne de réponse,
  à côté de « Parler » : en bas du plateau, sous le champ, personne ne descendait jusque-là. « L'écouter »,
  sur sa dernière bulle, redit la réponse à la demande — et c'est un geste, donc ça marche toujours.
- Pas de zoom : `maximum-scale=1, user-scalable=no` et `touch-action:manipulation`, parce qu'un pincement par
  mégarde laisse la page de travers et les boutons hors de l'écran. L'autre moitié du garde-fou est dans le
  CSS : **aucun champ sous 16px**, sinon iOS zoome tout seul dès qu'on touche le champ. Ne pas redescendre
  la taille des `input`/`textarea`/`select` pour faire joli : c'était la cause de la plupart des « je ne peux
  plus envoyer » et « le bouton a disparu ».
- `js/sujets.js` est la banque livrée (70 fiches, 12 thèmes). L'appli y puise au premier lancement et quand on
  touche « Compléter avec les sujets livrés ». Chaque fiche a exactement trois `temps`.
- À chaque changement de fichier, incrémenter `VERSION` dans `sw.js` et garder la liste `FILES` à jour.
- Icônes générées par `node outils/icones.js` (pas de module à installer).
- Flou d'iOS 26 en haut de l'écran : l'appli installée reçoit l'effet « liquid glass » du système
  (dégradé flou sur les premiers points sous le haut de l'écran), et Apple ne documente aucun moyen
  de le couper. Parade retenue, celle des projets qui s'y sont cassé les dents : un bandeau fixe
  opaque pleine largeur (`body::before`, hauteur minimale `--bord-mini`, au-dessus du plateau), et
  le contenu décalé de `--bord-flou` pour que le dégradé tombe sur du vide. Les deux variables
  valent zéro hors `display-mode:standalone` : un onglet n'a pas le problème. Ne pas remettre de
  fond translucide ni de `backdrop-filter` en haut de l'écran, c'est ce qui rallume l'effet.
- Polices locales (Fraunces, Bricolage Grotesque, Space Mono) dans `fonts/` : pas d'appel réseau, hors ligne compris.
- Tester sur mobile en portrait (iPhone d'abord) : zones sûres (`env(safe-area-inset-*)`) et appli lancée depuis
  l'écran d'accueil. Vérifier aussi le thème sombre (tout passe par les variables de `:root`).
