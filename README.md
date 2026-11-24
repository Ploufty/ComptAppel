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
- Zone, rythme et niveaux sont communs à toute l'année et mémorisés pour l'usager (préférences de l'appareil) : ils restent après un rechargement, un changement d'année ou le chargement d'un fichier. Chaque mois garde son total manuel et ses jours sans classe. Décocher un niveau le retire de tous les mois ; ses saisies sont conservées.
- Un nouveau mois reprend les niveaux et les effectifs du mois précédent (élèves + arrivées − départs), modifiables. Un mois est « fait » (surligné ✓) quand chaque niveau a ses élèves et ses absences saisis.
- « Copier le résultat » copie un tableau sans mise en forme : texte aligné (zones de texte) et tableau simple (documents, tableurs, mails).
- Saisie rapide : les absences acceptent une addition (`3+2+4`), le bouton « Aucune absence » met 0 aux niveaux dont les absences sont vides, et un jour ou une période « du … au … » sans classe se saisit dans « Calendrier du mois ».
- **Sauvegarde et reprise** : les données vivent dans le navigateur ; « Enregistrer un fichier » crée un `.json` complet (saisie, zone, rythme, niveaux, date), vérifié avant d'être proposé (relu à l'identique). « Charger un fichier » reprend tout après confirmation (résumé du fichier affiché) : les réglages du fichier remplacent ceux de l'usager. L'onglet Année indique l'état de la dernière sauvegarde, et un rappel s'affiche quand un mois est terminé et non sauvegardé. Les préférences d'affichage (thème, texte…) ne sont pas dans le fichier.
- Le détail du calcul (statut de chaque jour du mois, demi-journées, présences possibles, absences, pourcentages) s'ouvre en cliquant sur un chiffre du résultat, sur « Voir le détail du calcul », sur un mois du cumul, ou s'affiche en permanence sous le résultat via l'option « Affichage ».
- Le cumul de l'année donne le % de présents de la classe entière et de chaque niveau, par mois et en total.

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

## Police

Figtree (variable, sous-ensemble latin) est hébergée dans `fonts/`, sous licence SIL Open Font License 1.1 (`fonts/OFL.txt`). Aucune requête vers un site tiers n'est faite au chargement.
