# L'atelier du rien

Table de travail pour les vidéos de la chaîne : un sujet tiré chaque jour, **déjà cadré**, et le rythme
de publication sous les yeux. Appli web sans installation : du HTML, du CSS et du JavaScript, rien à compiler.

Le problème qu'elle règle n'est pas le manque d'idées, c'est le démarrage à froid. Chaque sujet arrive donc
avec de quoi lancer la caméra tout de suite : la croyance à retourner, ce qu'on ne dit pas, l'accroche à dire
telle quelle, trois temps à tenir, la sortie.

## Mettre l'appli en ligne avec GitHub Pages

1. Crée un nouveau dépôt sur GitHub (par exemple `atelier-du-rien`).
2. Envoie tous les fichiers de ce dossier à la racine du dépôt (`index.html` doit être à la racine).
3. Dans le dépôt : **Settings → Pages**, source **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Au bout d'une minute ou deux, l'appli est dispo sur `https://<ton-pseudo>.github.io/atelier-du-rien/`.

## L'installer sur l'iPhone

Ouvre l'adresse dans **Safari**, touche **Partager**, puis **Sur l'écran d'accueil**.
L'appli s'ouvre alors en plein écran avec son icône, et marche hors ligne après la première ouverture.

## Ce qu'il y a dedans

- **Le sujet du jour** : un tirage, pas une liste — choisir est une façon de remettre à demain. Le tirage évite
  les thèmes des trois dernières publications, pour que la chaîne ne tourne pas en rond.
- **La fiche de tournage** : ce qu'on croit, ce qu'on ne dit pas, l'accroche (les dix premières secondes,
  à dire telles quelles), trois temps, la sortie. Plus un champ de notes et un lien vers la vidéo publiée.
- **Le mode tournage** : plein écran, gros texte, chrono. L'accroche et les trois temps sous les yeux pendant qu'on filme.
- **L'interlocuteur** : dans le mode tournage, quelqu'un en face pour répéter à voix haute. Tu réponds, il relance.
  Quatre voix au choix — l'intervieweur qui creuse, le chercheur qui cite les maîtres, le sceptique que rien
  n'impressionne, celui qui en bave et ne veut pas de théorie. Il ne donne jamais la réponse à ta place : c'est en
  lui répondant que tu la trouves. « Garder ce que j'ai dit » verse tes réponses dans les notes de la fiche.
  Pour que ça se passe vraiment à voix haute : **Parler** dicte ta réponse au lieu de la taper, **Qu'il parle**
  fait lire la sienne par le téléphone. Les deux passent par le moteur de parole de l'appareil, pas par l'appli.
  Il faut une clé Anthropic ([console.anthropic.com](https://console.anthropic.com/settings/keys)), collée en bas de
  la page. Elle reste dans le navigateur de l'appareil, n'entre pas dans l'export, n'est jamais dans le dépôt.
  C'est la seule chose de l'appli qui sorte de l'appareil, et le seul morceau qui ne marche pas hors ligne.
  Anthropic ne publie pas de solde lisible depuis une appli, alors l'atelier compte lui-même : chaque réponse
  déclare ses jetons, et le total est converti au tarif du modèle. Dis-lui ce que tu as chargé, il te dira ce
  qu'il en reste. Le chiffre qui fait foi reste celui de la page Cost de la console.
- **Le rythme** : les dix dernières semaines en grille, la série de jours en cours, le record, le compte du mois,
  et la semaine en cours face à la cadence visée (5/semaine par défaut).
- **La banque** : 70 sujets livrés sur 12 thèmes — éveil, pièges, mental, méditation, non-dualité, corps, émotions,
  relations, croyances, pratique, quotidien, spiritualité-business. Filtres par état et par thème, recherche,
  capture rapide (un titre suffit) et fiche complète.
- **Les quatre états** d'une vidéo : idée → à tourner → tourné → publié.
- **Tes données** restent sur l'appareil (localStorage) : rien n'est envoyé nulle part. Exporte-les avant de changer
  d'appareil, ou pour passer tes fiches du téléphone à l'ordinateur. L'import complète la banque sans rien effacer.

## Organisation des fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page et la structure de l'interface |
| `css/style.css` | Tout le style (feuilles, fiche, grille du rythme, mode tournage) |
| `js/discussion.js` | L'interlocuteur : les quatre rôles, la consigne, l'appel à l'API d'Anthropic |
| `js/app.js` | Toute la logique : tirage, états, séries, banque, export/import |
| `js/sujets.js` | La banque de sujets livrée avec l'appli (70 fiches) |
| `sw.js` | Le cache hors ligne (changer `VERSION` à chaque mise à jour) |
| `manifest.webmanifest` | Nom, couleurs et icônes de l'appli installée |
| `outils/icones.js` | Génère les icônes : `node outils/icones.js` |

## Ajouter ou modifier des sujets

Deux endroits, deux usages :

- **Depuis l'appli** (« Fiche complète », « Modifier ») : pour tes sujets au fil de l'eau. Ça reste sur l'appareil.
- **Dans `js/sujets.js`** : pour la banque livrée avec l'appli, celle que retrouve un nouvel appareil.
  Le bouton « Compléter avec les sujets livrés » ajoute les fiches de ce fichier qui manquent dans la banque.

Une fiche : `id`, `titre`, `croyance`, `retournement`, `accroche`, `temps` (exactement trois),
`sortie`, `tags`, `duree`, `profondeur`.
