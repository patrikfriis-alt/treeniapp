import { createClient } from 'npm:@supabase/supabase-js@2';

type SB = ReturnType<typeof createClient>;

function todayHelsinkiIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function helsinkiTodayAsUtcMidnight(): Date {
  return new Date(`${todayHelsinkiIso()}T00:00:00Z`);
}

function isoDaysAgo(days: number): string {
  const d = helsinkiTodayAsUtcMidnight();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

function mondayOfWeeksAgo(weeksAgo: number): Date {
  const today = helsinkiTodayAsUtcMidnight();
  const dow = today.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diff - weeksAgo * 7);
  return monday;
}

function calcAge(birthDateIso: string): number {
  const today = helsinkiTodayAsUtcMidnight();
  const birth = new Date(`${birthDateIso}T00:00:00Z`);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function calcSleepScore(row: { duration_min: number | null; deep_sleep_min: number | null; rem_sleep_min: number | null; awakenings: number | null }): number | null {
  const { duration_min, deep_sleep_min, rem_sleep_min, awakenings } = row;
  if (duration_min == null || deep_sleep_min == null || rem_sleep_min == null || awakenings == null) return null;
  if (duration_min <= 0) return null;
  const durationScore = Math.min(40, Math.round(duration_min / 480 * 40));
  const deepPct = deep_sleep_min / duration_min * 100;
  const deepScore = Math.max(0, Math.min(25, 25 - Math.abs(deepPct - 18) * 1.5));
  const remPct = rem_sleep_min / duration_min * 100;
  const remScore = Math.max(0, Math.min(20, 20 - Math.abs(remPct - 22.5) * 1.2));
  const awakeningsScore = Math.max(0, 15 - awakenings * 5);
  return Math.round(durationScore + deepScore + remScore + awakeningsScore);
}

function calcBmr(profile: any, weightRow: any): number | null {
  if (!profile || !profile.sex || !profile.height_cm || !profile.birth_date || !weightRow) return null;
  const weight = weightRow.weight_kg;
  const height = profile.height_cm;
  if (weightRow.fat_pct != null) {
    const leanMass = weight * (1 - weightRow.fat_pct / 100);
    return Math.round(370 + 21.6 * leanMass);
  }
  const age = calcAge(profile.birth_date);
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(profile.sex === 'male' ? base + 5 : base - 161);
}

export async function buildDataContext(sb: SB): Promise<string> {
  const todayIso = todayHelsinkiIso();
  const twelveWeeksAgoIso = isoDate(mondayOfWeeksAgo(11));
  const threeWeeksAgoIso = isoDaysAgo(21);
  const ninetyDaysAgoIso = isoDaysAgo(89);

  const [
    { data: profile },
    { data: weightRows },
    { data: gymSetsAll },
    { data: activitiesAll },
    { data: sleepAll },
    { data: foodAll },
    { data: recentSets },
    { data: activeDaysAct },
    { data: activeDaysGym },
    { data: todaySessions },
    { data: appSettings },
    { data: notesRow },
    { data: stepsAll },
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date,weight_kg,reps').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min,awakenings').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
    sb.from('coach_notes').select('notes').eq('id', 1).maybeSingle(),
    sb.from('step_data').select('step_date,steps').gte('step_date', twelveWeeksAgoIso).lte('step_date', todayIso),
  ]);

  const lines: string[] = [];

  if (notesRow && (notesRow as any).notes) {
    lines.push(`Muistiinpanot käyttäjästä (aiemmista keskusteluista): ${(notesRow as any).notes}`);
  }

  lines.push(`Tämän päivän päivämäärä: ${todayIso}.`);

  if (profile) {
    lines.push(`Profiili: sukupuoli ${profile.sex ?? '—'}, pituus ${profile.height_cm ?? '—'} cm, syntymäaika ${profile.birth_date ?? '—'}.`);
  } else {
    lines.push('Profiilia ei ole vielä asetettu.');
  }

  lines.push('\nViikkoyhteenvedot (viim. 12 viikkoa, uusin viimeisenä):');
  for (let w = 11; w >= 0; w--) {
    const monday = mondayOfWeeksAgo(w);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const from = isoDate(monday);
    const to = isoDate(sunday);
    const weekLabel = w === 0 ? ' (tämä viikko, ei vielä päättynyt)' : w === 1 ? ' (viime viikko)' : '';

    const gymDays = new Set(
      (gymSetsAll || []).filter((r: any) => r.workout_date >= from && r.workout_date <= to).map((r: any) => r.workout_date),
    ).size;
    const weekActivities = (activitiesAll || []).filter((r: any) => r.activity_date >= from && r.activity_date <= to);
    const totalKm = weekActivities.reduce((s: number, r: any) => s + (r.distance_km || 0), 0);
    const weekSleep = (sleepAll || []).filter((r: any) => r.sleep_date >= from && r.sleep_date <= to && r.duration_min != null);
    const avgSleepH = weekSleep.length
      ? weekSleep.reduce((s: number, r: any) => s + r.duration_min, 0) / weekSleep.length / 60
      : null;
    const weekWeights = (weightRows || []).filter((r: any) => r.measured_at >= from && r.measured_at <= to);
    const weekWeight = weekWeights.length ? weekWeights[weekWeights.length - 1].weight_kg : null;
    const weekSteps = (stepsAll || []).filter((r: any) => r.step_date >= from && r.step_date <= to);
    const avgSteps = weekSteps.length
      ? Math.round(weekSteps.reduce((s: number, r: any) => s + r.steps, 0) / weekSteps.length)
      : null;
    const weekSleepScores = weekSleep
      .map((r: any) => calcSleepScore(r))
      .filter((s: number | null) => s != null) as number[];
    const avgSleepScore = weekSleepScores.length
      ? Math.round(weekSleepScores.reduce((s: number, v: number) => s + v, 0) / weekSleepScores.length)
      : null;

    const weekTonnage = (gymSetsAll || [])
      .filter((r: any) => r.workout_date >= from && r.workout_date <= to && r.weight_kg != null && r.reps != null)
      .reduce((s: number, r: any) => s + r.weight_kg * r.reps, 0);

    const prevMonday = mondayOfWeeksAgo(w + 1);
    const prevSunday = new Date(prevMonday);
    prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
    const prevFrom = isoDate(prevMonday);
    const prevTo = isoDate(prevSunday);
    const prevTonnage = (gymSetsAll || [])
      .filter((r: any) => r.workout_date >= prevFrom && r.workout_date <= prevTo && r.weight_kg != null && r.reps != null)
      .reduce((s: number, r: any) => s + r.weight_kg * r.reps, 0);
    const prevSleepScores = (sleepAll || [])
      .filter((r: any) => r.sleep_date >= prevFrom && r.sleep_date <= prevTo)
      .map((r: any) => calcSleepScore(r))
      .filter((s: number | null) => s != null) as number[];
    const prevAvgSleepScore = prevSleepScores.length
      ? Math.round(prevSleepScores.reduce((s: number, v: number) => s + v, 0) / prevSleepScores.length)
      : null;

    let overloadClause = '';
    if (prevTonnage > 0 && avgSleepScore != null && prevAvgSleepScore != null && weekSleepScores.length >= 3 && prevSleepScores.length >= 3) {
      const tonnageChangePct = (weekTonnage - prevTonnage) / prevTonnage;
      const sleepScoreChange = avgSleepScore - prevAvgSleepScore;
      if (tonnageChangePct >= 0.10 && sleepScoreChange <= -10) {
        overloadClause = ` Huom: treenimäärä nousi ${Math.round(tonnageChangePct * 100)}% ja unipisteet laski ${Math.abs(sleepScoreChange)}p edelliseen viikkoon verrattuna — mahdollinen ylikuormitus.`;
      }
    }

    lines.push(
      `${from}–${to}${weekLabel}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}, ` +
      `askeleet keskim. ${avgSteps != null ? avgSteps + '/pv' : '—'}, unipisteet keskim. ${avgSleepScore != null ? avgSleepScore + 'p' : '—'}.` +
      overloadClause,
    );
  }

  lines.push('\nTreenisessiot (viim. 3 viikkoa, liikkeittäin):');
  const setsByDateEx = new Map<string, { weight: number | null; reps: number | null }[]>();
  for (const s of (recentSets || []) as any[]) {
    const key = `${s.workout_date}|${s.exercise_name}`;
    if (!setsByDateEx.has(key)) setsByDateEx.set(key, []);
    setsByDateEx.get(key)!.push({ weight: s.weight_kg, reps: s.reps });
  }
  if (setsByDateEx.size) {
    for (const [key, sets] of setsByDateEx) {
      const [date, exName] = key.split('|');
      const setsStr = sets.map((s) => `${s.weight ?? '?'}×${s.reps ?? '?'}`).join(', ');
      lines.push(`${date} ${exName}: ${setsStr}`);
    }
  } else {
    lines.push('Ei kirjattuja sarjoja viimeisen 3 viikon aikana.');
  }

  lines.push('\nRuokailu (viim. 3 viikkoa, päiväkohtaiset kcal-summat):');
  const foodByDate = new Map<string, number>();
  for (const f of (foodAll || []) as any[]) {
    if (f.logged_at >= threeWeeksAgoIso && f.kcal != null) {
      foodByDate.set(f.logged_at, (foodByDate.get(f.logged_at) || 0) + f.kcal);
    }
  }
  if (foodByDate.size) {
    for (const [date, kcal] of [...foodByDate.entries()].sort()) {
      lines.push(`${date}: ${Math.round(kcal)} kcal`);
    }
  } else {
    lines.push('Ei ruokakirjauksia viimeisen 3 viikon aikana.');
  }

  const activeDays = new Set<string>();
  (activeDaysAct || []).forEach((r: any) => activeDays.add(r.activity_date));
  (activeDaysGym || []).forEach((r: any) => activeDays.add(r.workout_date));
  let streak = 0;
  const todayForStreak = helsinkiTodayAsUtcMidnight();
  for (let i = 0; i < 90; i++) {
    const d = new Date(todayForStreak);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = isoDate(d);
    if (activeDays.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue;
      break;
    }
  }

  const correction = (appSettings && (appSettings as any).calorie_correction) ?? 1;
  const latestWeight = weightRows && weightRows.length ? weightRows[weightRows.length - 1] : null;
  const bmr = calcBmr(profile, latestWeight);
  const todayExerciseKcal =
    (activitiesAll || [])
      .filter((r: any) => r.activity_date === todayIso)
      .reduce((s: number, r: any) => s + (r.calories != null ? r.calories * correction : 0), 0) +
    (todaySessions || []).reduce((s: number, r: any) => s + (r.calories || 0), 0);
  const todayFoodKcal = (foodAll || [])
    .filter((r: any) => r.logged_at === todayIso)
    .reduce((s: number, r: any) => s + (r.kcal || 0), 0);

  lines.push('\nTämän hetken tilannekuva:');
  lines.push(`Nykyinen aktiivisuusputki: ${streak} päivää.`);
  if (bmr != null) {
    const net = Math.round(todayFoodKcal - bmr - todayExerciseKcal);
    lines.push(
      `Tänään: BMR ${bmr} kcal, liikunta +${Math.round(todayExerciseKcal)} kcal, ruoka −${Math.round(todayFoodKcal)} kcal ` +
      `→ netto ${net >= 0 ? '+' : ''}${net} kcal (negatiivinen = vaje, positiivinen = ylijäämä).`,
    );
  } else {
    lines.push('Päivän kalorien nettolaskentaan tarvittavaa profiilia/painoa ei ole vielä asetettu.');
  }

  return lines.join('\n');
}
