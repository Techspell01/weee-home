// Does this person get arrive/leave alerts for this place? No saved choice = yes.
export function alertsOn(hh, placeId, userId) {
  const pref = hh.alertPrefs.find(p => p.place_id === placeId && p.user_id === userId);
  return pref ? pref.enabled : true;
}
