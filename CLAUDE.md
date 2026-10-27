# Notes pour Claude Code

- Appli web perso, en français, pour Fabien. Interface et commentaires en français, tutoiement dans les textes.
- Table de travail pour la chaîne YouTube « Les enseignements de rien » : trouver des sujets à démystifier,
  les tourner, et tenir un rythme de publication. Née comme artifact claude.ai (« L'atelier du rien », 27/10/2026),
  devenue appli iPhone.
- Le bottleneck à servir, c'est le démarrage à froid : une fiche doit permettre de lancer la caméra sans réfléchir
  (accroche à dire telle quelle, trois temps). Ne pas transformer l'appli en gestionnaire de tâches.
- Pas de framework ni d'étape de build : HTML + CSS + JS classiques, servis tels quels par GitHub Pages,
  installés sur l'iPhone via Safari > Sur l'écran d'accueil.
- Données dans le `localStorage` (clé `atelier-du-rien.v1`) : `{version, sujets, journal, reglages}`.
  Rien ne part sur un serveur. Toute évolution du format doit rester lisible par les exports existants.
- `js/sujets.js` est la banque livrée (70 fiches, 12 thèmes). L'appli y puise au premier lancement et quand on
  touche « Compléter avec les sujets livrés ». Chaque fiche a exactement trois `temps`.
- À chaque changement de fichier, incrémenter `VERSION` dans `sw.js` et garder la liste `FILES` à jour.
- Icônes générées par `node outils/icones.js` (pas de module à installer).
- Polices locales (Fraunces, Bricolage Grotesque, Space Mono) dans `fonts/` : pas d'appel réseau, hors ligne compris.
- Tester sur mobile en portrait (iPhone d'abord) : zones sûres (`env(safe-area-inset-*)`) et appli lancée depuis
  l'écran d'accueil. Vérifier aussi le thème sombre (tout passe par les variables de `:root`).
