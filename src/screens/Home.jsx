import { useEffect, useRef, useState } from 'react';
import { useHousehold } from '../lib/useHousehold.js';
import { makeActions } from '../lib/actions.js';
import { groupOf, whenLabel } from '../lib/plans.js';
import { AlertBanner, HeartOverlay, Icon, Toasts, useToasts } from '../components/ui.jsx';
import TabBar from '../components/TabBar.jsx';
import { isSubscribed, resyncPush } from '../lib/push.js';
import { haptic } from '../lib/haptics.js';
import { playSound } from '../lib/sounds.js';
import { dueState } from '../lib/tracker.js';
import { visibleMessages } from '../lib/chat.js';
import { useAvatarUrls } from '../lib/avatars.js';
import { noteOf } from '../lib/notes.js';
import PlansTab from './PlansTab.jsx';
import TrackerTab from './TrackerTab.jsx';
import DiscoverTab from './DiscoverTab.jsx';
import ListTab from './ListTab.jsx';
import MoneyTab from './MoneyTab.jsx';
import ChatTab from './ChatTab.jsx';
import Settings from './Settings.jsx';

const TABS = [
  { id: 'plans', label: 'Plans', icon: Icon.calendar },
  { id: 'tracker', label: 'Tracker', icon: Icon.tracker },
  { id: 'discover', label: 'Discover', icon: Icon.discover },
];
const ORDER = TABS.map(t => t.id);
const SUBS = ['list', 'money', 'chat'];   // pages inside Discover
const TITLES = { plans: 'Plans', tracker: 'Tracker', discover: 'Discover', settings: 'Settings', list: 'Shopping', money: 'Money', chat: 'Chat' };

// Where to open: a notification link (?tab=chat) first, then where you left off.
function readStart() {
  try {
    const link = new URLSearchParams(window.location.search).get('tab');
    if (ORDER.includes(link)) return { tab: link, sub: null };
    if (SUBS.includes(link)) return { tab: 'discover', sub: link };
    const tab = localStorage.getItem('homelist-tab');
    const sub = localStorage.getItem('homelist-sub');
    if (ORDER.includes(tab)) return { tab, sub: tab === 'discover' && SUBS.includes(sub) ? sub : null };
    if (SUBS.includes(tab)) return { tab: 'discover', sub: tab }; // older saved value
  } catch { /* private mode */ }
  return { tab: 'plans', sub: null };
}

export default function Home({ membership, me, onLeft, onHouseholdChanged }) {
  const household = membership.households;
  const start = useRef(readStart()).current;
  const [tab, setTab] = useState(start.tab);
  const [sub, setSub] = useState(start.sub);
  const [lastTab, setLastTab] = useState(start.tab);
  const [motion, setMotion] = useState('none'); // which way the new page slides in
  const [now, setNow] = useState(Date.now());
  const [toasts, notify] = useToasts();
  const [alert, setAlert] = useState(null);
  const [heart, setHeart] = useState(null); // "X is thinking of you" moment
  const alertTimer = useRef(0);
  function showAlert(a) {
    clearTimeout(alertTimer.current);
    setAlert({ ...a, key: Date.now() });
    alertTimer.current = setTimeout(() => setAlert(null), 6000);
  }

  function go(next) {
    if (next === tab) {
      if (tab === 'discover' && sub) { setMotion('from-left'); setSub(null); return; } // back to the hub
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const from = ORDER.indexOf(tab), to = ORDER.indexOf(next);
    setMotion(next === 'settings' ? 'up' : from === -1 ? 'down' : to > from ? 'from-right' : 'from-left');
    if (ORDER.includes(next)) setLastTab(next);
    setTab(next);
  }
  function openSub(s) { setMotion('from-right'); setSub(s); }
  function back() {
    if (tab === 'settings') return go(lastTab);
    setMotion('from-left');
    setSub(null);
  }

  const nameFrom = (list, id) => {
    if (!id) return 'Someone';
    if (id === me) return 'You';
    return list.find(m => m.user_id === id)?.display_name || 'Someone';
  };

  // Realtime callbacks fire later, so they read the latest state from a ref.
  const latest = useRef({ members: [], trackers: [], inChat: false, pushOn: false });
  // Is this phone getting push notifications? Then the system notification
  // already makes a sound, so the app doesn't play a second one.
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    const check = () => isSubscribed().then(setPushOn).catch(() => setPushOn(false));
    check();
    window.addEventListener('weee:push-changed', check);
    return () => window.removeEventListener('weee:push-changed', check);
  }, []);
  const hh = useHousehold(household.id, me, {
    onRemoteInsert: (key, row) => {
      const { members, inChat, pushOn: viaPush } = latest.current;
      let text;
      if (key === 'nudges') {
        const asking = row.kind === 'where';
        if (!viaPush) playSound(asking ? 'chat' : 'heart');
        haptic(asking ? 'notify' : 'heartbeat');
        setHeart({ from: nameFrom(members, row.from_user), userId: row.from_user, key: row.id, kind: row.kind || 'heart' });
        return;
      }
      if (key === 'messages') {
        if (inChat) { if (!viaPush) playSound('soft'); return; } // already looking at it
        if (!viaPush) playSound('chat');
        haptic('notify');
        showAlert({ kind: 'chat', title: nameFrom(members, row.user_id), body: row.body.length > 90 ? row.body.slice(0, 87) + '…' : row.body, open: 'chat' });
        return;
      } else if (key === 'plans') {
        const who = nameFrom(members, row.created_by);
        text = row.owner ? `${who}'s schedule: ${row.title} · ${whenLabel(row)}` : `${who} planned ${row.title} · ${whenLabel(row)}`;
      } else {
        text = `${nameFrom(members, row.added_by)} added ${row.name}`;
      }
      notify(text);
      if (document.visibilityState === 'visible') haptic('notify');
    },
  });
  const inChat = tab === 'discover' && sub === 'chat';
  latest.current = { members: hh.members, trackers: hh.trackers, inChat, pushOn };

  const nameOf = id => nameFrom(hh.members, id);
  const avatars = useAvatarUrls(hh.members);
  const actions = makeActions({ householdId: household.id, me, hh, notify });
  const mine = hh.members.find(m => m.user_id === me);

  // In-app reminder: when one of my follow-ups becomes due while Weee is open,
  // show a banner and ring (the push notification covers the app being closed).
  const alerted = useRef(new Set());
  const openedAt = useRef(Date.now());
  useEffect(() => {
    const check = () => {
      const t = Date.now();
      for (const tr of latest.current.trackers) {
        if (tr.owner !== me || tr.done || !tr.next_at) continue;
        const at = Date.parse(tr.next_at);
        const key = `${tr.id}:${tr.next_at}`;
        if (at > t || at < openedAt.current - 60000 || alerted.current.has(key)) continue;
        alerted.current.add(key);
        if (!latest.current.pushOn) playSound('alarm');
        haptic('notify');
        showAlert({ kind: 'reminder', title: `Follow up: ${tr.title}`, body: tr.details || 'Time to follow up · tap to open', open: 'tracker' });
      }
    };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a heart notification: show the moment once the data is in.
  const fromHeartLink = useRef(new URLSearchParams(window.location.search).get('nudge') === '1');
  useEffect(() => {
    if (!fromHeartLink.current || !hh.loaded) return;
    fromHeartLink.current = false;
    const last = hh.nudges.find(n => n.from_user !== me && Date.now() - Date.parse(n.created_at) < 3600000);
    if (last) setHeart({ from: nameFrom(hh.members, last.from_user), userId: last.from_user, key: last.id, kind: last.kind || 'heart' });
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
  }, [hh.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Open Settings" buttons elsewhere (e.g. the notifications hint)
  useEffect(() => {
    const open = () => go('settings');
    window.addEventListener('weee:open-settings', open);
    return () => window.removeEventListener('weee:open-settings', open);
  });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { resyncPush(household.id); }, [household.id]);
  useEffect(() => {
    try {
      if (ORDER.includes(tab)) localStorage.setItem('homelist-tab', tab);
      localStorage.setItem('homelist-sub', sub || '');
    } catch { /* private mode */ }
    if (!inChat) window.scrollTo(0, 0);
  }, [tab, sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const readAt = mine?.chat_read_at ? Date.parse(mine.chat_read_at) : 0;
  const unread = visibleMessages(hh, me).filter(m => m.user_id !== me && Date.parse(m.created_at) > readAt).length;
  const badges = {
    plans: hh.plans.filter(p => !p.done && (!p.owner || p.owner === me) && ['missed', 'today'].includes(groupOf(p, now))).length,
    tracker: hh.trackers.filter(t => t.owner === me && dueState(t, now) === 'overdue').length,
    discover: unread,
  };
  const partner = hh.members.find(m => m.user_id !== me);
  const others = hh.members.filter(m => m.user_id !== me).length;
  const myName = mine?.display_name || membership.display_name;
  const shared = { hh, actions, nameOf, notify, now, me, avatars };
  const page = tab === 'discover' && sub ? sub : tab;
  const showBack = tab === 'settings' || (tab === 'discover' && sub);
  const showAdd = !['settings', 'discover', 'chat'].includes(page);

  return (
    <>
      <div className={`wrap${inChat ? ' chat-wrap' : ''}`}>
        <header>
          {showBack && <button className="icon big" onClick={back} aria-label="Back"><Icon.back /></button>}
          <div className="grow">
            <h1 className="brand">{TITLES[page]}</h1>
            <div className="sync">
              <span className={`dot ${hh.status}`} />
              <span className="sync-text">
                {household.name} · {hh.status === 'live' || hh.status === 'polling'
                  ? (others === 0 ? 'invite your partner from Settings' : others === 1 ? `with ${partner.display_name}` : `${others + 1} people`)
                  : hh.status === 'offline' ? 'offline, will sync when back' : 'connecting…'}
              </span>
            </div>
          </div>
          {showAdd && <button className="icon big" onClick={() => window.dispatchEvent(new Event('weee:add'))} aria-label="Add"><Icon.plus /></button>}
          {page === 'chat' && <button className="icon big" onClick={() => window.dispatchEvent(new Event('weee:clear-chat'))} aria-label="Clear chat"><Icon.trash /></button>}
          {tab !== 'settings' && <button className="icon big" onClick={() => go('settings')} aria-label="Settings"><Icon.gear /></button>}
        </header>

        <div key={page} className={`page page-${motion}`}>
          {page === 'plans' && <PlansTab {...shared} household={household} />}
          {page === 'tracker' && <TrackerTab {...shared} />}
          {page === 'discover' && <DiscoverTab {...shared} open={openSub} unread={unread} />}
          {page === 'list' && <ListTab {...shared} />}
          {page === 'money' && <MoneyTab {...shared} />}
          {page === 'chat' && <ChatTab {...shared} />}
          {page === 'settings' && <Settings {...shared} household={household} myName={myName} onLeft={onLeft} onHouseholdChanged={onHouseholdChanged} />}
        </div>
      </div>

      <TabBar tabs={TABS} current={tab} onSelect={go} badges={badges} />
      <Toasts toasts={toasts} />
      <HeartOverlay heart={heart && { ...heart, url: avatars[heart.userId] }} onClose={() => setHeart(null)}
        onSendBack={async kind => { setHeart(null); if (await actions.sendNudge(kind)) notify(noteOf(kind).sent); }}
        onReply={async text => { setHeart(null); if (await actions.sendMessage(`📍 ${text}`)) notify(`Sent: ${text}`); }}
        onShareLocation={async () => { if (await actions.shareLocation()) { setHeart(null); notify('Location sent in chat 📍'); } }}
        onOpenChat={() => { setHeart(null); if (tab !== 'discover') go('discover'); openSub('chat'); }} />
      <AlertBanner alert={alert} onClose={() => setAlert(null)}
        onOpen={() => {
          const to = alert?.open;
          setAlert(null);
          if (to === 'chat') { if (tab !== 'discover') go('discover'); openSub('chat'); }
          else if (to === 'tracker') go('tracker');
        }} />
    </>
  );
}
