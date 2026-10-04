// Turning push notifications on and off for this device.
import { supabase } from './supabase.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'needs-install' | 'unsupported' | 'denied' | 'default' | 'granted'
export function pushPermission() {
  if (isIOS && !isStandalone) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined' || !VAPID_PUBLIC_KEY) return 'unsupported';
  return Notification.permission;
}

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function save(sub, householdId) {
  const j = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from('push_subscriptions').upsert(
    { user_id: user.id, household_id: householdId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: 'endpoint' },
  );
}

// Must be called from a tap (iOS only shows the permission prompt then).
export async function enablePush(householdId) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { permission };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const { error } = await save(sub, householdId);
  return { permission, error };
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// Is this device currently subscribed?
export async function isSubscribed() {
  if (pushPermission() !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return Boolean(await reg.pushManager.getSubscription());
}

// On app start, make sure the server still knows this device (e.g. after
// switching households or the browser refreshing its subscription).
export async function resyncPush(householdId) {
  try {
    if (pushPermission() !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await save(sub, householdId);
  } catch { /* best-effort */ }
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('notify', { body: { test: true } });
  return error ? { sent: 0, error } : data;
}
