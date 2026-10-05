import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useHousehold } from '../lib/useHousehold.js';
import { makeActions } from '../lib/actions.js';
import { groupOf, whenLabel } from '../lib/plans.js';
import { Icon, Toasts, useToasts } from '../components/ui.jsx';
import { resyncPush } from '../lib/push.js';
import { haptic } from '../lib/haptics.js';
import { useLocationSharing } from '../lib/location.js';
import PlansTab from './PlansTab.jsx';
import ListTab from './ListTab.jsx';
import MoneyTab from './MoneyTab.jsx';
import Settings from './Settings.jsx';

// The map library is large, so it only loads when the Map tab opens.
const MapTab = lazy(() => import('./MapTab.jsx'));

const TABS = [
  { id: 'plans', label: 'Plans', icon: Icon.calendar },
  { id: 'list', label: 'List', icon: Icon.cart },
  { id: 'map', label: 'Map', icon: Icon.map },
  { id: 'money', label: 'Money', icon: Icon.money },
];
const ORDER = TABS.map(t => t.id);
const TITLES = { plans: 'Plans', list: 'Shopping', map: 'Places', money: 'Money', settings: 'Settings' };

const readTab = () => {
  try {
    const fromLink = new URLSearchParams(window.location.search).get('tab'); // e.g. from a notification
    if (ORDER.includes(fromLink)) return fromLink;
    const t = localStorage.getItem('homelist-tab');
    return ORDER.includes(t) ? t : 'plans';
  } catch { return 'plans'; }
};

export default function Home({ membership, me, onLeft }) {
  const household = membership.households;
  const [tab, setTab] = useState(readTab);
  const [lastTab, setLastTab] = useState(readTab);
  const [motion, setMotion] = useState('none'); // which way the new page slides in
  const [now, setNow] = useState(Date.now());
  const [toasts, notify] = useToasts();

  function go(next) {
    if (next === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const from = ORDER.indexOf(tab), to = ORDER.indexOf(next);
    setMotion(next === 'settings' ? 'up' : from === -1 ? 'down' : to > from ? 'from-right' : 'from-left');
    if (ORDER.includes(next)) setLastTab(next);
    setTab(next);
  }

  const nameFrom = (list, id) => {
    if (!id) return 'Someone';
    if (id === me) return 'You';
    return list.find(m => m.user_id === id)?.display_name || 'Someone';
  };

  // Realtime callbacks fire later, so they read the latest data from a ref.
  const latest = useRef({ members: [], places: [] });
  const hh = useHousehold(household.id, me, {
    onRemoteInsert: (key, row) => {
      const { members, places } = latest.current;
      let text;
      if (key === 'plans') {
        const who = nameFrom(members, row.created_by);
        text = row.owner ? `${who}'s schedule: ${row.title} · ${whenLabel(row)}` : `${who} planned ${row.title} · ${whenLabel(row)}`;
      } else if (key === 'presence') {
        const place = places.find(p => p.id === row.place_id)?.name || 'a saved place';
        text = `${nameFrom(members, row.user_id)} ${row.inside ? 'arrived at' : 'left'} ${place}`;
      } else {
        text = `${nameFrom(members, row.added_by)} added ${row.name}`;
      }
      notify(text);
      if (document.visibilityState === 'visible') haptic('notify');
    },
  });
  latest.current = { members: hh.members, places: hh.places };

  const nameOf = id => nameFrom(hh.members, id);
  const actions = makeActions({ householdId: household.id, me, hh, notify });
  const sharing = Boolean(hh.members.find(m => m.user_id === me)?.share_location);

  // Share this phone's position while Weee is open (only if this person turned it on).
  const lastGeoError = useRef(0);
  useLocationSharing({
    householdId: household.id, me, enabled: sharing,
    onError: err => {
      if (Date.now() - lastGeoError.current < 60000) return; // don't repeat the same warning
      lastGeoError.current = Date.now();
      if (err?.code === 1) notify('Location is blocked for Weee, so your position is not updating.');
    },
  });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { resyncPush(household.id); }, [household.id]);
  useEffect(() => {
    try { if (ORDER.includes(tab)) localStorage.setItem('homelist-tab', tab); } catch { /* private mode */ }
    window.scrollTo(0, 0);
  }, [tab]);

  const badges = {
    plans: hh.plans.filter(p => !p.done && (!p.owner || p.owner === me) && ['missed', 'today'].includes(groupOf(p, now))).length,
    list: hh.items.filter(i => i.status === 'need').length,
  };
  const partner = hh.members.find(m => m.user_id !== me);
  const others = hh.members.filter(m => m.user_id !== me).length;
  const myName = hh.members.find(m => m.user_id === me)?.display_name || membership.display_name;
  const shared = { hh, actions, nameOf, notify, now, me };
  const tabIndex = ORDER.indexOf(tab);

  return (
    <>
      <div className="wrap">
        <header>
          {tab === 'settings' && <button className="icon big" onClick={() => go(lastTab)} aria-label="Back"><Icon.back /></button>}
          <div className="grow">
            <h1 className="brand">{TITLES[tab]}</h1>
            <div className="sync">
              <span className={`dot ${hh.status}`} />
              <span className="sync-text">
                {household.name} · {hh.status === 'live'
                  ? (others === 0 ? 'invite your partner from Settings' : others === 1 ? `with ${partner.display_name}` : `${others + 1} people`)
                  : hh.status === 'offline' ? 'offline, will sync when back' : 'connecting…'}
              </span>
            </div>
          </div>
          {tab !== 'settings' && <>
            <button className="icon big" onClick={() => window.dispatchEvent(new Event('weee:add'))} aria-label="Add"><Icon.plus /></button>
            <button className="icon big" onClick={() => go('settings')} aria-label="Settings"><Icon.gear /></button>
          </>}
        </header>

        <div key={tab} className={`page page-${motion}`}>
          {tab === 'plans' && <PlansTab {...shared} />}
          {tab === 'list' && <ListTab {...shared} />}
          {tab === 'map' && <Suspense fallback={<div className="map-card"><div className="map" /></div>}><MapTab {...shared} /></Suspense>}
          {tab === 'money' && <MoneyTab {...shared} />}
          {tab === 'settings' && <Settings {...shared} household={household} myName={myName} onLeft={onLeft} />}
        </div>
      </div>

      <nav className="tabs" aria-label="Sections">
        <div className="in" role="tablist" style={{ '--tab-count': ORDER.length }}>
          <span className="tab-pill" aria-hidden="true"
            style={{ transform: `translateX(${Math.max(tabIndex, 0) * 100}%)`, opacity: tabIndex === -1 ? 0 : 1 }} />
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} data-haptic="select" onClick={() => go(t.id)}>
              <t.icon />{t.label}
              {badges[t.id] > 0 && <span className="badge">{badges[t.id]}</span>}
            </button>
          ))}
        </div>
      </nav>
      <Toasts toasts={toasts} />
    </>
  );
}
