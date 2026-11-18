# ComptAppel
ComptAppel calcule le pourcentage de présents du cahier d’appel, par mois, pour la classe et par niveau. Les demi-journées de classe se calculent seules (zone, vacances, jours sans classe). Cumul de l’année, export PDF et sauvegarde en fichier.

## Utiliser

Site 100 % statique, sans build ni dépendance :

```bash
python3 -m http.server 8080
```

Puis ouvrez `http://localhost:8080/`. La saisie reste dans le navigateur ; enregistrez un fichier pour la retrouver ailleurs.

## Méthode de calcul

- Demi-journées de classe du mois : lundi à vendredi hors vacances de la zone et jours fériés ; mercredi = 1 demi-journée en rythme 4,5 jours, 0 en 4 jours. Les jours sans classe saisis (grève, fermeture…) sont retirés ; le total reste modifiable à la main.
- Présences possibles = élèves × demi-journées + demi-journées d'inscription des élèves arrivés (à partir du jour d'arrivée inclus) ou partis (jusqu'au jour du départ inclus).
- % absents = absences / possibles ; % présents = 100 − % absents. Cumul de l'année : somme des possibles et des absences de chaque mois.
- Chaque mois garde ses propres réglages (zone, rythme, niveaux, total, jours sans classe).

## Calendriers

Années 2026-2027 et 2027-2028 dans `scripts/calendar.js` (sources et date de vérification en tête du fichier). Le lundi de Pentecôte est compté sans classe.

**Corse** : gérée pour 2026-2027 (rentrée le 3 septembre, vacances d'hiver et de printemps de la zone A ; Toussaint, Noël et été supposés communs, cases vides sur l'infographie officielle). Pour 2027-2028 le calendrier Corse est « non communiqué » : la zone A est utilisée en attendant.

Non gérés automatiquement : **Alsace-Moselle** (Vendredi saint, 26 décembre) et **outre-mer**. Ajoutez ces jours via « Jours sans classe ».

## Structure

```
index.html            Page
css/style.css         Styles
scripts/prefs.js      Préférences d'affichage (appliquées avant le rendu)
scripts/calendar.js   Calendriers et calcul des demi-journées
scripts/core.js       État, normalisation des données importées, calculs, cumul
scripts/pdf.js        Génération du PDF (sans bibliothèque)
scripts/app.js        Interface
tests/                Contrôles : node --test tests/*.test.js
outil.json            Fiche outil (intégration Apps1D76)
```

## Intégration dans Apps1D76

Copier ce dépôt (sans `.git`) sous `Outils/comptappel/` (fiche `outil.json` incluse), puis `npm run generer`. L'icône maison de l'en-tête renvoie vers `../../index.html` (accueil) et le pied de page vers `../../accessibilite.html` : ces deux liens ne fonctionnent qu'une fois le dossier à cet emplacement.

## Licence

ComptAppel est un logiciel libre, publié sous licence **GNU Affero General Public License v3.0 ou ultérieure** (AGPL-3.0-or-later). Le texte complet est dans le fichier [`LICENSE`](LICENSE). Toute version modifiée, y compris proposée en ligne, doit rester sous la même licence et fournir son code source.
