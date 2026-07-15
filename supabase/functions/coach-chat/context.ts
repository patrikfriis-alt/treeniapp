import { createClient } from 'npm:@supabase/supabase-js@2';

type SB = ReturnType<typeof createClient>;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function mondayOfWeeksAgo(weeksAgo: number): Date {
  const now = new Date();
  const dow = now.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff - weeksAgo * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcAge(birthDateIso: string): number {
  const today = new Date();
  const birth = new Date(birthDateIso);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
  const todayIso = isoDate(new Date());
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
  ] = await Promise.all([
    sb.from('user_profile').select('*').eq('id', 1).maybeSingle(),
    sb.from('body_metrics').select('weight_kg,fat_pct,measured_at').gte('measured_at', twelveWeeksAgoIso).order('measured_at', { ascending: true }),
    sb.from('workout_sets').select('workout_date').gte('workout_date', twelveWeeksAgoIso).lte('workout_date', todayIso),
    sb.from('activity_data').select('activity_type,activity_date,duration_min,distance_km,calories').gte('activity_date', twelveWeeksAgoIso).lte('activity_date', todayIso),
    sb.from('sleep_data').select('sleep_date,duration_min,deep_sleep_min,rem_sleep_min').gte('sleep_date', twelveWeeksAgoIso).lte('sleep_date', todayIso),
    sb.from('food_log_entries').select('logged_at,kcal').gte('logged_at', twelveWeeksAgoIso).lte('logged_at', todayIso),
    sb.from('workout_sets').select('workout_date,exercise_name,weight_kg,reps').gte('workout_date', threeWeeksAgoIso).lte('workout_date', todayIso).order('workout_date', { ascending: true }),
    sb.from('activity_data').select('activity_date').gte('activity_date', ninetyDaysAgoIso).lte('activity_date', todayIso),
    sb.from('workout_sets').select('workout_date').gte('workout_date', ninetyDaysAgoIso).lte('workout_date', todayIso),
    sb.from('workout_sessions').select('calories').eq('workout_date', todayIso),
    sb.from('app_settings').select('calorie_correction').eq('id', 1).maybeSingle(),
  ]);

  const lines: string[] = [];

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

    lines.push(
      `${from}–${to}: salikäyntejä ${gymDays}, aktiviteetteja ${weekActivities.length} (${totalKm.toFixed(1)} km), ` +
      `uni keskim. ${avgSleepH != null ? avgSleepH.toFixed(1) + 'h' : '—'}, paino ${weekWeight != null ? weekWeight + ' kg' : '—'}.`,
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
  for (let i = 0; i < 90; i++) {
    const d = new Date();
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
