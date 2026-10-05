// Sends Web Push notifications to the other people in a household.
//
// Called two ways:
//  1. By the database trigger on new items / plans, with header x-webhook-secret.
//  2. By a signed-in user from Settings ("Send a test"), with their login token;
//     the test goes only to that user's own devices.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://homelist-tan.vercel.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
type Message = { title: string; body: string; tag: string; url: string };

const pad = (n: number) => String(n).padStart(2, '0');
function formatTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + pad(m) : ''} ${h < 12 ? 'am' : 'pm'}`;
}
function formatDate(d: string | null) {
  if (!d) return 'No date yet';
  const [y, mo, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, day)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// "25 min", "2 h 5 min", "1 d 3 h"
function stayed(minutes: number) {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

async function displayName(householdId: string, userId: string | null) {
  if (!userId) return 'Someone';
  const { data } = await admin.from('household_members').select('display_name')
    .eq('household_id', householdId).eq('user_id', userId).maybeSingle();
  return data?.display_name || 'Someone';
}

async function messageFor(table: string, r: Record<string, any>): Promise<{ msg: Message; actor: string | null } | null> {
  if (table === 'items') {
    const who = await displayName(r.household_id, r.added_by);
    return {
      actor: r.added_by,
      msg: { title: `${who} added ${r.name}`, body: r.qty ? `${r.qty} · Shopping list` : 'Shopping list', tag: `item-${r.id}`, url: '/?tab=list' },
    };
  }
  if (table === 'plans') {
    const who = await displayName(r.household_id, r.created_by);
    const time = r.plan_time ? ` · ${formatTime(r.plan_time)}${r.end_time ? ' – ' + formatTime(r.end_time) : ''}` : '';
    const where = r.place ? ` · ${r.place}` : '';
    return {
      actor: r.created_by,
      msg: {
        title: r.owner ? `${who}'s schedule: ${r.title}` : `${who} planned: ${r.title}`,
        body: `${formatDate(r.plan_date)}${time}${where}`,
        tag: `plan-${r.id}`,
        url: '/?tab=plans',
      },
    };
  }
  if (table === 'messages') {
    const who = await displayName(r.household_id, r.user_id);
    const text = String(r.body ?? '');
    return {
      actor: r.user_id,
      msg: { title: who, body: text.length > 160 ? text.slice(0, 157) + '…' : text, tag: `chat-${r.household_id}`, url: '/?tab=chat' },
    };
  }
  if (table === 'place_event') {
    const who = await displayName(r.household_id, r.user_id);
    return {
      actor: r.user_id,
      msg: {
        title: r.event === 'arrived' ? `${who} arrived at ${r.place}`
          : `${who} left ${r.place}${r.minutes != null ? ` after ${stayed(r.minutes)}` : ''}`,
        body: 'Open Weee to see the map',
        tag: `place-${r.id}-${r.user_id}`,
        url: '/?tab=map',
      },
    };
  }
  return null;
}

async function send(subs: Sub[], msg: Message) {
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The phone unsubscribed or the app was removed: forget this subscription.
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push failed', status, (err as Error).message);
    }
  }));
  return sent;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // 1. Database trigger
  const secret = req.headers.get('x-webhook-secret');
  if (secret) {
    if (secret !== Deno.env.get('PUSH_WEBHOOK_SECRET')) return json({ error: 'bad secret' }, 401);
    const { table, record } = await req.json();
    const built = await messageFor(table, record);
    if (!built) return json({ sent: 0, reason: 'ignored table' });
    let q = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('household_id', record.household_id);
    if (built.actor) q = q.neq('user_id', built.actor);
    const { data: subs, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ sent: await send(subs ?? [], built.msg) });
  }

  // 2. Test from Settings: signed-in user, own devices only
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not signed in' }, 401);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'not signed in' }, 401);
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user.id);
  if (!subs?.length) return json({ sent: 0, reason: 'no devices' });
  const sent = await send(subs, { title: 'Weee notifications are on', body: "You'll hear when your partner adds to the list or makes a plan.", tag: 'test', url: '/' });
  return json({ sent });
});
