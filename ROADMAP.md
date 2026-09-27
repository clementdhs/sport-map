# Roadmap

Le suivi des évolutions se fait dans les [issues GitHub](https://github.com/clementdhs/sport-map/issues) :

- les priorités en cours sont regroupées dans le milestone [V1.1](https://github.com/clementdhs/sport-map/milestone/1) ;
- les labels indiquent le thème (`éditeur`, `découverte`, `mobile`, `infra`, `tests`) et l'effort estimé (`effort: faible`, `effort: moyen`, `effort: élevé`) ;
- chaque commit qui termine une évolution référence son issue (`Closes #N`), ce qui la ferme automatiquement.

## Fait — MVP (septembre 2026)

- Squelette : Nuxt 4, Nuxt UI, Supabase (auth, PostGIS, RLS), carte MapLibre + MapTiler, PWA
- Éditeur de parcours : tracé à main levée, distance en direct, enregistrement, page de détail rendue côté serveur
- Suivi des chemins et dénivelé via OpenRouteService, profil altimétrique
- Import / export GPX
- Recherche des parcours publics sur la carte (zone visible, lieu, sport, distance)
- Profils : mes parcours, sauvegardés, réalisés ; profil public ; suppression d'un parcours

## Notes

- Dénivelé : calculé sur un profil lissé sur 100 m avec un seuil de 3 m. Les données brutes (SRTM) contiennent des pics qui gonflaient le D+ d'environ 20 %.
- Quotas gratuits à surveiller : MapTiler (tuiles et géocodage), OpenRouteService (2 000 requêtes/jour, 40/min), Supabase (pause après 7 jours d'inactivité).
