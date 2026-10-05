// Sharing this phone's position with the household while Weee is open.
//
// Browsers only give a web app its location while it is on screen, so updates
// stop when Weee is closed or in the background. (A native Android app can keep
// sharing in the background; see README "Android app".) Battery level comes from
// the Battery Status API, which Chrome on Android supports and iPhone Safari does not.
import { useEffect, useRef } from 'react';
import { supabase } from './supabase.js';

export const geoSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;
export const batterySupported = () => typeof navigator !== 'undefined' && 'getBattery' in navigator;

export function distanceM(a, b) {
  const R = 6371000, rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// Ask for permission with one reading (call from a tap).
export function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) { reject(new Error('unsupported')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

const MIN_MOVE_M = 25;      // send when moved this far (but at most every 5 s)…
const MIN_GAP_MS = 5000;
const MAX_QUIET_MS = 60000; // …or at least once a minute

// Speed (m/s) to what someone is doing. GPS speed jitters, so it is smoothed first.
export function activityFor(speed) {
  if (speed == null || !Number.isFinite(speed)) return null;
  if (speed < 0.7) return 'still';     // < 2.5 km/h
  if (speed < 2.8) return 'walking';   // < 10 km/h
  if (speed < 6.5) return 'cycling';   // < 23 km/h (bike, scooter in traffic, running)
  return 'driving';
}
export const ACTIVITY_LABEL = { still: 'Not moving', walking: 'Walking', cycling: 'Riding', driving: 'Driving' };
export const kmh = speed => Math.round((speed || 0) * 3.6);
// Movement info is only shown while the position is recent.
export const isFresh = (loc, now = Date.now()) => loc && now - Date.parse(loc.updated_at) < 3 * 60000;

export function useLocationSharing({ householdId, me, enabled, onError }) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !geoSupported()) return;
    let watchId = null;
    let last = null, lastSent = 0, lastPos = null;
    let prevFix = null, smooth = null, lastActivity = null;
    let battery = null;
    let cancelled = false;

    // Speed from the GPS when available, otherwise from distance over time.
    function measure(pos) {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const t = pos.timestamp || Date.now();
      let v = Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : null;
      if (v === null && prevFix && (pos.coords.accuracy || 99) <= 40) {
        const dt = (t - prevFix.t) / 1000;
        if (dt >= 3) v = distanceM(prevFix, here) / dt;
      }
      if (!prevFix || t - prevFix.t >= 1000) prevFix = { ...here, t };
      if (v !== null) smooth = smooth === null ? v : smooth * 0.55 + v * 0.45;
      return here;
    }

    async function send(pos, force = false) {
      const here = pos === lastPos ? last || measure(pos) : measure(pos);
      lastPos = pos;
      // Standing still with no new fix for a while: speed is effectively zero.
      if (force === 'refresh' && smooth !== null && Date.now() - (pos.timestamp || 0) > 20000) smooth *= 0.3;
      const activity = activityFor(smooth);
      const moved = last ? distanceM(last, here) : Infinity;
      const since = Date.now() - lastSent;
      const changed = activity !== lastActivity;
      if (!force && !changed && !(moved >= MIN_MOVE_M && since >= MIN_GAP_MS) && since < MAX_QUIET_MS) return;
      last = here;
      lastSent = Date.now();
      lastActivity = activity;
      const { error } = await supabase.from('member_locations').upsert({
        household_id: householdId,
        user_id: me,
        lat: here.lat,
        lng: here.lng,
        accuracy: Math.round(pos.coords.accuracy || 0),
        battery: battery ? Math.round(battery.level * 100) : null,
        charging: battery ? battery.charging : null,
        speed: smooth === null ? null : Math.round(smooth * 10) / 10,
        heading: Number.isFinite(pos.coords.heading) ? Math.round(pos.coords.heading) % 360 : null,
        activity,
      }, { onConflict: 'household_id,user_id' });
      if (error && !cancelled) onErrorRef.current?.(error);
    }

    const start = () => {
      if (watchId !== null || document.visibilityState !== 'visible') return;
      watchId = navigator.geolocation.watchPosition(
        p => send(p),
        err => { if (!cancelled) onErrorRef.current?.(err); },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
      );
    };
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    const onVisible = () => (document.visibilityState === 'visible' ? start() : stop());

    // Battery: resend the last position when the level or charging changes.
    const onBattery = () => { if (lastPos) send(lastPos, true); };
    if (batterySupported()) {
      navigator.getBattery().then(b => {
        if (cancelled) return;
        battery = b;
        b.addEventListener('levelchange', onBattery);
        b.addEventListener('chargingchange', onBattery);
        onBattery();
      }).catch(() => {});
    }
    // While on screen and standing still, still refresh every minute so
    // "updated" and battery stay current.
    const keepFresh = setInterval(() => { if (lastPos && document.visibilityState === 'visible') send(lastPos, 'refresh'); }, MAX_QUIET_MS);

    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      stop();
      clearInterval(keepFresh);
      document.removeEventListener('visibilitychange', onVisible);
      if (battery) {
        battery.removeEventListener('levelchange', onBattery);
        battery.removeEventListener('chargingchange', onBattery);
      }
    };
  }, [enabled, householdId, me]);
}
