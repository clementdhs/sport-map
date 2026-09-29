---
paths:
  - "server/api/routes/*/reviews*"
  - "server/api/routes/*/reviews/**"
  - "server/utils/reviews.ts"
  - "app/components/RouteReviews.vue"
  - "app/components/RatingStars.vue"
---

# Reviews

Reviews (`route_reviews`, one per user and route, not on one's own route) are moderated in the database: the route's owner hides a comment with `set_review_hidden`, a trigger hides it after 3 `review_reports`, and RLS only shows hidden reviews to their author and the route's owner. Their ratings keep counting: triggers maintain `routes.rating_avg` / `rating_count`, used by lists and the `best_rated` sort. Authors can only update `rating` and `comment` (column grants). Embed their author as `profiles!route_reviews_user_id_fkey`: `review_reports` makes a bare `profiles` ambiguous.
