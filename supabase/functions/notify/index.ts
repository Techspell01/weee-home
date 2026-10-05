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
type Message = { title: string; body: string; tag: string; url: string; kind?: 'chat' | 'reminder' | 'item' | 'plan' | 'nudge' | 'countdown' | 'test' };

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

async function displayName(householdId: string, userId: string | null) {
  if (!userId) return 'Someone';
  const { data } = await admin.from('household_members').select('display_name')
    .eq('household_id', householdId).eq('user_id', userId).maybeSingle();
  return data?.display_name || 'Someone';
}

async function messageFor(table: string, r: Record<string, any>): Promise<{ msg: Message; actor: string | null; only?: string } | null> {
  if (table === 'items') {
    const who = await displayName(r.household_id, r.added_by);
    return {
      actor: r.added_by,
      msg: { title: `${who} added ${r.name}`, body: r.qty ? `${r.qty} · Shopping list` : 'Shopping list', tag: `item-${r.id}`, url: '/?tab=list', kind: 'item' },
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
        kind: 'plan',
      },
    };
  }
  if (table === 'messages') {
    const who = await displayName(r.household_id, r.user_id);
    const text = String(r.body ?? '');
    return {
      actor: r.user_id,
      msg: { title: who, body: text.length > 160 ? text.slice(0, 157) + '…' : text, tag: `chat-${r.household_id}`, url: '/?tab=chat', kind: 'chat' },
    };
  }
  if (table === 'nudges') {
    const who = await displayName(r.household_id, r.from_user);
    return {
      actor: r.from_user,
      msg: { title: `💗 ${who} is thinking of you`, body: 'Tap to send one back', tag: `nudge-${r.household_id}`, url: '/?tab=discover&nudge=1', kind: 'nudge' },
    };
  }
  if (table === 'countdown_today') {
    const years = r.yearly && r.years > 0 ? ` · ${r.years} ${r.years === 1 ? 'year' : 'years'}` : '';
    return {
      actor: null,
      msg: { title: `🎉 Today: ${r.title}${years}`, body: 'The countdown is over. Have a lovely day!', tag: `countdown-${r.id}-${r.day}`, url: '/?tab=plans', kind: 'countdown' },
    };
  }
  if (table === 'tracker_due') {
    const STAGE: Record<string, string> = { applied: 'Applied', followed_up: 'Followed up', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
    const stage = r.stage ? STAGE[r.stage] : '';
    const body = r.details || (r.kind === 'job'
      ? `${stage ? stage + ' · ' : ''}${r.followups ? `followed up ${r.followups}×` : 'not followed up yet'}`
      : 'Time to follow up');
    return {
      actor: null,
      only: r.owner, // reminders go to the person who set them
      msg: { title: `Follow up: ${r.title}`, body, tag: `tracker-${r.id}`, url: '/?tab=tracker', kind: 'reminder' },
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
    let q = admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('household_id', record.household_id);
    if (built.only) q = q.eq('user_id', built.only);
    else if (built.actor) q = q.neq('user_id', built.actor);
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
  const sent = await send(subs, { title: 'Weee notifications are on', body: "You'll hear when your partner adds to the list or makes a plan.", tag: 'test', url: '/', kind: 'test' });
  return json({ sent });
});
