---
paths:
  - "shared/utils/trainingForm.ts"
  - "test/unit/trainingForm.test.ts"
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
