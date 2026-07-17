# Apple Watch Workout Sync: Building the Shortcuts Automation

Follow this guide inside the **Shortcuts** app on your iPhone. No code — just Shortcuts actions.

## 1. Create a Personal Automation

1. Open **Shortcuts** → **Automation** tab → **+** (Create Personal Automation)
2. Choose trigger: **Workout** → **When I End a Workout**
3. Choose **Run Immediately** — NOT "Ask Before Running", so the automation fires without confirmation

## 2. Find the workout that just ended

1. Add the **Find Workouts** action
2. Set: Sort by **End Date**, descending order, **Limit 1**

## 3. Extract the workout's details

Add **Set Variable** actions for each of the following workout fields (available from the "Find Workouts" result's Magic Variable menu):
- `WorkoutType` ← the workout's **Workout Type**
- `Duration` ← **Duration** in minutes
- `Calories` ← **Total Active Energy**, in kcal
- `AvgHR` ← **Average Heart Rate** — round it to a whole number with the **Round Number** action before storing it in the variable (HealthKit's heart rate is almost always a decimal, e.g. 142.37)
- `Distance` ← **Total Distance**, in km (can be empty for gym workouts)
- `WorkoutUUID` ← the workout's **UUID**
- `EndDate` ← **End Date**, formatted with the **Format Date** action as `yyyy-MM-dd`

## 4. Route by workout type (If/Otherwise)

Add an **If** action: `WorkoutType` **contains** `Strength`

### If YES (gym):

**Get Contents of URL:**
- Method: `PATCH`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/workout_sessions?workout_date=eq.[EndDate]`
- Headers:
  - `apikey`: `<anon key from index.html>`
  - `Authorization`: `Bearer <same anon key>`
  - `Content-Type`: `application/json`
- Request body (JSON):
  ```json
  { "calories": [Calories], "avg_heart_rate": [AvgHR] }
  ```

### If NO — nested If: `WorkoutType` **contains** `Run`

**Get Contents of URL:**
- Method: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/activity_data?on_conflict=healthkit_uuid`
- Headers: same `apikey`/`Authorization`/`Content-Type` + `Prefer`: `resolution=merge-duplicates`
- Body:
  ```json
  {
    "activity_date": "[EndDate]",
    "activity_type": "Juoksu",
    "duration_min": [Duration],
    "calories": [Calories],
    "avg_heart_rate": [AvgHR],
    "distance_km": [Distance],
    "source": "watch",
    "healthkit_uuid": "[WorkoutUUID]"
  }
  ```

### If NO — nested If: `WorkoutType` **contains** `Walk`

Same as above, but `"activity_type": "Kävely"`.

### If NO — nested If: `WorkoutType` **contains** `Hockey`

Same as above, but `"activity_type": "Jääkiekko"`.

### Otherwise (any other type)

Same structure, but `"activity_type": "[WorkoutType]"` (the Watch's own type name, passed through as the Magic Variable).

**Note:** the `activity_type` values (`Juoksu`, `Kävely`, `Jääkiekko`) are intentionally kept in Finnish — they're the exact strings the Treeniapp web app matches against for icons and its manual-entry dropdown. Don't translate these three literal strings.

## 5. Test it

Tap **"Run"** on the automation manually, without doing a real workout — if you have a recently-ended Watch workout in the Health app, "Find Workouts" will pick it up, and you can confirm the data landed in the right table via the Supabase dashboard (Table Editor).

## 6. Troubleshooting

- **No row appears:** check that the anon key was copied correctly (found in `index.html`'s `SB_KEY` constant), and that the migration file `supabase/migrations/20260708_apple_watch_sync.sql` has been run.
- **Gym calories don't update:** make sure you've marked that day's session as "done" in Treeniapp before or shortly after ending the Watch workout — the `workout_sessions` row must already exist for the `PATCH` to find it.
- **Save fails with an error referencing `avg_heart_rate`:** make sure you used the **Round Number** action on the `AvgHR` variable in step 3 — HealthKit's decimal value can be rejected if the database column doesn't accept decimals.
- **Steps never appear:** check that the migration file `supabase/migrations/20260715_step_data.sql` has been run, and that Shortcuts has permission to read Steps in the Health app's privacy settings (Health app → profile icon → Apps → Shortcuts → Steps must be enabled).
- **Sleep fields stay empty (deep/REM/awakenings never populate):** check you used the correct Sleep Analysis filter in each **Find Health Samples** action, and that the Watch actually recorded stage-level data (older Watch models or watchOS versions may only record a single combined "Asleep" value with no stage breakdown — in that case the stage-specific fields can't be filled and a sleep score can't be computed).

## 7. Step Count Sync

Steps aren't tied to a workout, so this needs a second, separate personal automation that runs on a schedule instead of a workout trigger.

### Create the automation

1. Open **Shortcuts** → **Automation** tab → **+** (Create Personal Automation)
2. Choose trigger: **Time of Day** → pick a time (e.g. 10:00) → set **Run Immediately**
3. Repeat this automation a few times through the day (e.g. 10:00, 14:00, 18:00, 22:00 — create one automation per time) — each run just overwrites today's total with the latest count, so running it more than once a day keeps the figure reasonably current without needing a continuous trigger.

### Read today's steps

1. Add the **Find Health Samples** action
2. Set: Sample Type **Steps**, Date **Today**, aggregate as **Sum**
3. Add a **Set Variable** action to store the result as `StepCount`
4. Add a **Format Date** action for **Current Date**, formatted as `yyyy-MM-dd`, stored as `Today`

### Push it to Supabase

**Get Contents of URL:**
- Method: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/step_data?on_conflict=step_date`
- Headers:
  - `apikey`: `<anon key from index.html>`
  - `Authorization`: `Bearer <same anon key>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Request body (JSON):
  ```json
  { "step_date": "[Today]", "steps": [StepCount], "source": "watch" }
  ```

### Test it

Tap **"Run"** on the automation manually — confirm a row for today appears in the `step_data` table via the Supabase dashboard (Table Editor), and that running it again updates the same row instead of creating a new one.

## 8. Sleep Sync

Sleep isn't a discrete event like a workout, or a simple growing number like steps — it's a series of timestamped stage segments (light/deep/REM/awake) the Watch records overnight. This automation runs once a day in the morning, by which point the previous night's data has fully synced.

### Create the automation

1. Open **Shortcuts** → **Automation** tab → **+** (Create Personal Automation)
2. Choose trigger: **Time of Day** → pick a morning time (e.g. 9:00) → set **Run Immediately**

### Read the night's sleep stages

Each sleep stage (Core/Deep/REM/Awake) is queried separately, since each needs its own sum or count.

1. Add four **Find Health Samples** actions, each with Sample Type **Sleep Analysis**, Date **Last 24 Hours** (also try **Yesterday** if "Last 24 Hours" doesn't land on the right night):
   - One filtered "Sleep Analysis is Asleep (Deep)"
   - One filtered "Sleep Analysis is Asleep (REM)"
   - One filtered "Sleep Analysis is Asleep (Core)"
   - One filtered "Sleep Analysis is Awake"
2. For the first three (Deep/REM/Core): add a **Calculate Statistics** action directly below its own **Find Health Samples** action (don't add all four queries first and the statistics afterward — since there are four identically-named actions, Shortcuts can otherwise bind the statistic to the wrong query), operation **Sum** on Duration → store in variables `DeepMin`, `RemMin`, `CoreMin`. When adding each Calculate Statistics action, check the Magic Variable picker to confirm it actually references the Find Health Samples result directly above it (e.g. "Find Health Samples Result 2"), not some other query by default.
3. For the fourth (Awake): add a **Calculate Statistics** action the same way, directly below its own query, operation **Count** → store in variable `Awakenings`
4. Add a **Set Variable** action computing total duration: `DeepMin + RemMin + CoreMin` → store in `TotalMin`
5. Add a **Format Date** action for **Current Date**, formatted as `yyyy-MM-dd`, stored as `Today`

### Push it to Supabase

**Get Contents of URL:**
- Method: `POST`
- URL: `https://dodrzzgbdlucjbkmxbjn.supabase.co/rest/v1/sleep_data?on_conflict=sleep_date`
- Headers:
  - `apikey`: `<anon key from index.html>`
  - `Authorization`: `Bearer <same anon key>`
  - `Content-Type`: `application/json`
  - `Prefer`: `resolution=merge-duplicates`
- Request body (JSON):
  ```json
  { "sleep_date": "[Today]", "duration_min": [TotalMin], "deep_sleep_min": [DeepMin], "rem_sleep_min": [RemMin], "awakenings": [Awakenings] }
  ```

### Test it

Tap **"Run"** on the automation manually — confirm a row for the previous night appears in the `sleep_data` table with all four fields filled in. Exact action names (especially the filter options) may vary slightly by iOS version from what's described here — if you can't find these exact labels, check what filter options **Find Health Samples** actually offers for the Sleep Analysis sample type and adjust accordingly.
