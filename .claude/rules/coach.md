---
paths:
  - "shared/utils/trainingForm.ts"
  - "shared/utils/coachSessions.ts"
  - "shared/utils/coachGoal.ts"
  - "shared/utils/coachReview.ts"
  - "test/unit/trainingForm.test.ts"
  - "test/unit/coachSessions.test.ts"
  - "test/unit/coachReview.test.ts"
  - "app/utils/coachChoice.ts"
  - "server/api/routes/*/outings/*.patch.ts"
  - "server/api/profile/me/coach-goal*"
  - "app/components/CoachGoal*.vue"
  - "app/components/CoachSessionCard.vue"
  - "app/components/CoachForm*.vue"
  - "app/components/CoachImport.vue"
  - "app/composables/useFormSentence.ts"
  - "app/pages/coach/**"
  - "test/nuxt/coachForm.test.ts"
  - "test/e2e/specs/coach*.spec.ts"
---

# Coach (#261)

No plan over weeks and no AI: fixed, tested rules on what the member really did (decisions and open points in #261, mockups on the Claude Design canvas linked there).

## Form of the moment (#263)

- Pure in `shared/utils/trainingForm.ts` (unit-tested), computed in the browser from `MyProfile.outings` like the profile statistics (`stats-and-slopes.md`): GPS outings plus routes only marked as done, with the route's distance and gain. No request of its own: `/coach/forme` fetches `/api/profile/me`, the coach page (`/coach`, #262) fetches it too and passes its outings to `CoachFormCard`, shown only once loaded (an error leaves the page without the card).
- Load in **km-effort**: km + D+ / 100, weighed by the outing's feeling (#267: easy × 0.8, ok × 1, hard × 1.15, very hard × 1.3, none × 1; `FEELING_FACTORS`), the same day's outings summed. Days are French local dates (`localDate`). Cycling is left out (`countsForForm`: `SPORT_KINDS` ride), running, trail and hiking count: Clem's open point in #263, to revisit with a rule of its own for bikes.
- **Form** = load of the last 7 days (today included) ÷ the **baseline**, the weekly average of the 28 days before. Under × 0.8 recovery, × 0.8 to 1.5 progress (both included), over × 1.5 overload.
- **History**: from the oldest outing before a gap of more than 28 days without any, so a member back from a long break starts learning again. Under 21 days of history the state is `learning` (start card, 21 boxes: days with an outing filled, rest days empty, today ringed, future days dashed, the coach's verdict on the last). The baseline averages only the days of history inside the 28 (`baselineDays`, 14 at least), so a member with 3 weeks isn't judged on 4; the cartouche's tooltip then says so.
- Chart (`formWeeks`): 8 windows of 7 days ending today (rolling, not calendar weeks: the last one is the form itself), each with the baseline it was judged against as a dashed ink line, none while that window's history was too short. HTML bars like the statistics (`--chart-bar`, the last in `--chart-current`) and an `sr-only` table.
- Gauge (`CoachFormGauge`, `role="meter"`): zones on 30 / 45 / 25 % of the width up to × 2 (`gaugePosition`), colours `--form-recovery|progress|overload` (`main.css`, dataviz validator on paper and surface in both modes, 3:1 in `themeContrast.test.ts`), each zone written under it. The state's name stays in ink: text never wears a data colour.
- Import (#268): while learning, `CoachImport` (mockup 5, "Choisir des fichiers") under the start card imports GPX, FIT or TCX outings (`outing-import.md`); they count in the form like any GPS outing.
- e2e (`coach-form.spec.ts`): outings dated through `POST /api/routes/:id/outings` (`started_at` in the past) on a private ~50 km route, whose load dwarfs the short outings other specs leave on the shared account; listed outings are filtered by that route's name.

## Session of the day (#264)

- **Goal** (`coachGoal.ts`): `resume` (ease back in), `progress`, `race` (date, distance, optional gain). Table `coach_goals`, one row per member, RLS for the member alone; `GET|PUT /api/profile/me/coach-goal` (null until chosen: the coach then aims at progress), in the data export (`objectif-coach.json`). A race date can't be saved in the past; a past race is ignored by the rules and shown « passée ». Shown at the top of `/coach` (`CoachGoalLine`, « Modifier » opens `CoachGoalForm` in a modal); while learning, the form sits on the page instead, under the start card.
- **Library** (`coachSessions.ts`, `buildSession`): rest, race day, recovery jog, endurance, long run (flat or hilly), short hills (1 min up / 2 min down), long hills (3 / 3), intervals (3 fast / 2 jog). Repeats sit between a warm-up and a cool-down (10 + 5 min up to 45 min, 15 + 10 beyond), what's left goes to the cool-down. Distance and gain in km-effort at the member's running pace (`paces` preference, `DEFAULT_PACES.running` without one, `paces.md`), like `estimateDurationMin`: intervals at × 0.8, jogs × 1.3, hill efforts × 0.85 on 10 % (short) or 7 % (long) slopes, back down the same distance; easy terrain 5 m/km, hilly long run 25 m/km at least (or the trail race's own gain per km). Rounded to 100 m and 10 m.
- **Rules** (`sessionOfTheDay`), in this order: race day → rest; last 7 days before a race → endurance of 45 min at most (both even while learning); learning → endurance only; overload → recovery jog of 30 min at most, rest over × 2; `resume` → endurance (long run too from 1 h 30); otherwise key session in recovery, and in progress **one outing day out of two** (`outingDaysBefore`: the parity of the days with an outing inside the history, before today; it only changes when the member goes out, so the proposal doesn't flip on rest days and stays the same once today's outing is recorded). We don't know what the member actually ran: the alternation assumes they followed the coach. Key sessions per duration in `KEY_BY_DURATION`; a race ahead with 1 h 30 or more gives its long run instead, half the race distance 7 weeks out or more, up to all of it 2 weeks before (`raceLongRunKm`), an hour at least, capped by the time available, hilly from 15 m/km of race gain.
- **Stable for the day**: the pick among the allowed sessions is `(days since 1970 + clicks on « Autre séance ») % count`, so a reload gives the same session and the next day another. Duration (60 min by default) and « Autre séance » aren't saved on the server (Clem's open point in #264: the simplest choice); since #267 they are kept in this browser for the day (`coachChoice.ts`), restored when the card mounts; changing the duration resets « Autre séance ». The form used is the card's (today included): recording today's outing can change the state, not the alternation.
- **Card** (`CoachSessionCard`): ink header with the date, title and `DurationSign` (the session's own minutes, less than chosen when capped), the reason sentence, the outline strip (width = minutes, height and the form colours = effort: easy blue, rolling green, effort orange; `role="img"` with the written outline), distance / D+ / easy pace, the duration pills (`aria-pressed`), « Autre séance » only with more than one session allowed.
- e2e (`coach-session.spec.ts`): same dated outings as `coach-form.spec.ts` (progress), goal set to a race then `resume`, whose sessions follow the duration without depending on the alternation.

## Review after an outing (#267)

- Saving an outing from `/record` or follow mode opens `/coach/bilan/<outing id>` (mockup 4) when its sport counts in the form (`countsForForm`), the route page as before otherwise; « Terminer » then leads to the route's Passages tab. The outing is saved first, the review comes after (unlike the mockup, whose button saved it): nothing is lost if the page closes. `POST /api/recordings` answers the outing's id too (`saveRecording` returns both).
- **Session of the day**: worked out again on the review from the outings without this one (its form before) and the duration and « Autre séance » clicks the coach page last showed today, kept in this browser for the day (`coachChoice.ts`, `sport-map:coach-choice`; `CoachSessionCard` restores it on mount and writes it on each change); without them the default 60 min. Nothing about the session is stored on the server. The outing **is** the session when it ended today (French date) and its moving time is within a quarter of the session's, 10 min at least (`matchesSession`; the session's route of #266 doesn't exist yet). « Ce n'était pas la séance du jour » detaches it in this browser only (`sport-map:coach-detached`, last 20 ids), undone by « C'était la séance du jour ». Client-side only (`onMounted`), so SSR never shows the stamp.
- **Repeats** (`repeatTimes`, hill and interval sessions while attached; the track is loaded from `GET /api/routes/:id/outings/:outingId`): hills are `climbs()` found with a gain of 40 % and a dip tolerance of 30 % of the session's own effort gain (`toleranceM`, a short hill gains ~10 m, under the default 20 m), the largest `count` kept in order, each timed in moving time from its last low GPS point to its first top point within 50 m of the smoothed extremes (`climbEnds`: the smoothing rounds them off by ~10 s, a flat warm-up drags the start back). Intervals: the `count` fastest non-overlapping stretches of the effort's length in moving time, as a pace. At least 2, else no section. `regularity`: spread ÷ median, very regular up to 8 %, regular up to 15 %, « La dernière a coûté un peu plus » when the last is the slowest.
- **Feeling**: `route_outings.feeling` (`easy | ok | hard | very_hard`, null until given), `PATCH /api/routes/:id/outings/:outingId` (member's own outings: update policy of #140 + `grant update (feeling)`), in `ownRecordedOutings` and the export. Readable by whoever sees the outing, like its times. Applied at once in the page (the form follows), taken back on an error.
- **Effect on the form** (`formEffect`): today's outings only (an older one says nothing about today's form): ratio without the outing → with it and its feeling, a lighter needle for before on `CoachFormGauge` (`before`), the new state, and « Demain : » from `tomorrowSession`: the rules of #264 on tomorrow's form (`trainingForm(outings, tomorrow)`), today's outing counted among the days before, the same duration.
- e2e (`coach-review.spec.ts`): the same dated 50 km outings, no goal set (`coach-session.spec.ts` runs after it on the same account on CI, 1 worker, and starts without one), 30 min chosen on `/coach`, 25 min recorded with `page.clock` (installed half an hour back so the outing ends before now), feeling then detaching, each kept after a reload; `data-ratio` on the form section compares easy and very hard. `record.spec.ts` and `follow.spec.ts` go through the review (« Terminer ») to the route.
