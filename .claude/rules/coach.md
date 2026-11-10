---
paths:
  - "shared/utils/trainingForm.ts"
  - "shared/utils/coachSessions.ts"
  - "shared/utils/coachGoal.ts"
  - "test/unit/trainingForm.test.ts"
  - "test/unit/coachSessions.test.ts"
  - "server/api/profile/me/coach-goal*"
  - "app/components/CoachGoal*.vue"
  - "app/components/CoachSessionCard.vue"
  - "app/components/CoachForm*.vue"
  - "app/composables/useFormSentence.ts"
  - "app/pages/coach/**"
  - "test/nuxt/coachForm.test.ts"
  - "test/e2e/specs/coach*.spec.ts"
---

# Coach (#261)

No plan over weeks and no AI: fixed, tested rules on what the member really did (decisions and open points in #261, mockups on the Claude Design canvas linked there).

## Form of the moment (#263)

- Pure in `shared/utils/trainingForm.ts` (unit-tested), computed in the browser from `MyProfile.outings` like the profile statistics (`stats-and-slopes.md`): GPS outings plus routes only marked as done, with the route's distance and gain. No request of its own: `/coach/forme` fetches `/api/profile/me`, the coach page (`/coach`, #262) fetches it too and passes its outings to `CoachFormCard`, shown only once loaded (an error leaves the page without the card).
- Load in **km-effort**: km + D+ / 100, the same day's outings summed. Days are French local dates (`localDate`). Cycling is left out (`countsForForm`: `SPORT_KINDS` ride), running, trail and hiking count: Clem's open point in #263, to revisit with a rule of its own for bikes.
- **Form** = load of the last 7 days (today included) ÷ the **baseline**, the weekly average of the 28 days before. Under × 0.8 recovery, × 0.8 to 1.5 progress (both included), over × 1.5 overload.
- **History**: from the oldest outing before a gap of more than 28 days without any, so a member back from a long break starts learning again. Under 21 days of history the state is `learning` (start card, 21 boxes: days with an outing filled, rest days empty, today ringed, future days dashed, the coach's verdict on the last). The baseline averages only the days of history inside the 28 (`baselineDays`, 14 at least), so a member with 3 weeks isn't judged on 4; the cartouche's tooltip then says so.
- Chart (`formWeeks`): 8 windows of 7 days ending today (rolling, not calendar weeks: the last one is the form itself), each with the baseline it was judged against as a dashed ink line, none while that window's history was too short. HTML bars like the statistics (`--chart-bar`, the last in `--chart-current`) and an `sr-only` table.
- Gauge (`CoachFormGauge`, `role="meter"`): zones on 30 / 45 / 25 % of the width up to × 2 (`gaugePosition`), colours `--form-recovery|progress|overload` (`main.css`, dataviz validator on paper and surface in both modes, 3:1 in `themeContrast.test.ts`), each zone written under it. The state's name stays in ink: text never wears a data colour.
- e2e (`coach-form.spec.ts`): outings dated through `POST /api/routes/:id/outings` (`started_at` in the past) on a private ~50 km route, whose load dwarfs the short outings other specs leave on the shared account; listed outings are filtered by that route's name.

## Session of the day (#264)

- **Goal** (`coachGoal.ts`): `resume` (ease back in), `progress`, `race` (date, distance, optional gain). Table `coach_goals`, one row per member, RLS for the member alone; `GET|PUT /api/profile/me/coach-goal` (null until chosen: the coach then aims at progress), in the data export (`objectif-coach.json`). A race date can't be saved in the past; a past race is ignored by the rules and shown « passée ». Shown at the top of `/coach` (`CoachGoalLine`, « Modifier » opens `CoachGoalForm` in a modal); while learning, the form sits on the page instead, under the start card.
- **Library** (`coachSessions.ts`, `buildSession`): rest, race day, recovery jog, endurance, long run (flat or hilly), short hills (1 min up / 2 min down), long hills (3 / 3), intervals (3 fast / 2 jog). Repeats sit between a warm-up and a cool-down (10 + 5 min up to 45 min, 15 + 10 beyond), what's left goes to the cool-down. Distance and gain in km-effort at the member's running pace (`paces` preference, `DEFAULT_PACES.running` without one, `paces.md`), like `estimateDurationMin`: intervals at × 0.8, jogs × 1.3, hill efforts × 0.85 on 10 % (short) or 7 % (long) slopes, back down the same distance; easy terrain 5 m/km, hilly long run 25 m/km at least (or the trail race's own gain per km). Rounded to 100 m and 10 m.
- **Rules** (`sessionOfTheDay`), in this order: race day → rest; last 7 days before a race → endurance of 45 min at most (both even while learning); learning → endurance only; overload → recovery jog of 30 min at most, rest over × 2; `resume` → endurance (long run too from 1 h 30); otherwise key session in recovery, and in progress **one outing day out of two** (`outingDaysBefore`: the parity of the days with an outing inside the history, before today; it only changes when the member goes out, so the proposal doesn't flip on rest days and stays the same once today's outing is recorded). We don't know what the member actually ran: the alternation assumes they followed the coach. Key sessions per duration in `KEY_BY_DURATION`; a race ahead with 1 h 30 or more gives its long run instead, half the race distance 7 weeks out or more, up to all of it 2 weeks before (`raceLongRunKm`), an hour at least, capped by the time available, hilly from 15 m/km of race gain.
- **Stable for the day**: the pick among the allowed sessions is `(days since 1970 + clicks on « Autre séance ») % count`, so a reload gives the same session and the next day another. Duration (60 min by default) and « Autre séance » stay in the page (Clem's open point in #264: the simplest choice), not saved; changing the duration resets « Autre séance ». The form used is the card's (today included): recording today's outing can change the state, not the alternation.
- **Card** (`CoachSessionCard`): ink header with the date, title and `DurationSign` (the session's own minutes, less than chosen when capped), the reason sentence, the outline strip (width = minutes, height and the form colours = effort: easy blue, rolling green, effort orange; `role="img"` with the written outline), distance / D+ / easy pace, the duration pills (`aria-pressed`), « Autre séance » only with more than one session allowed.
- e2e (`coach-session.spec.ts`): same dated outings as `coach-form.spec.ts` (progress), goal set to a race then `resume`, whose sessions follow the duration without depending on the alternation.
