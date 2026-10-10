<!--
Titre de la PR en anglais, le même que celui du commit : l'un ou l'autre devient le titre du commit squashé sur main.
`npm run pr:impact` liste les rules, pages, routes API, migrations et services touchés par la branche.
Écrire « aucun » plutôt que supprimer une rubrique.
-->

## Résumé
Closes #

<!-- Ce qui change pour l'utilisateur, en quelques lignes. -->

## Domaines touchés
<!-- Rules de .claude/rules/ concernées, pages et routes API modifiées. -->

## Base de données
<!--
Migrations, RLS et policies, données existantes transformées, réversibilité.
Si une migration est ajoutée : Clem lance `npm run db:push` avant le merge.
-->

## Services externes et quotas
<!-- Requêtes ajoutées ou retirées vers MapTiler (100 000/mois), OpenRouteService (200 itinéraires/jour), IGN, Open-Meteo, Overpass. -->

## Risques de régression
<!-- Fonctionnalités qui partagent le code modifié ; hors ligne et service worker ; app Android. -->

## Revue de code
<!-- Niveau lancé (/code-review medium ou high), problèmes trouvés et corrigés, remarques écartées et pourquoi. -->

## Tests
<!-- Vitest et e2e ajoutés ou lancés, vérification dans le navigateur, ce qui n'est pas couvert. -->

## À faire par Clem
<!-- Tests sur le téléphone, réglages dans les tableaux de bord (Supabase, Vercel, Sentry…). -->

## Retour arrière
<!-- Un revert du commit squashé suffit-il ? Que faire pour la migration et les données ? -->
