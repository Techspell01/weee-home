import { useEffect, useRef, useState } from 'react';
import { useHousehold } from '../lib/useHousehold.js';
import { makeActions } from '../lib/actions.js';
import { isRunningLow } from '../lib/groceries.js';
import { groupOf, whenLabel } from '../lib/plans.js';
import { Icon, Toasts, useToasts } from '../components/ui.jsx';
import { resyncPush } from '../lib/push.js';
import PlansTab from './PlansTab.jsx';
import ListTab from './ListTab.jsx';
import PantryTab from './PantryTab.jsx';
import MoneyTab from './MoneyTab.jsx';
import Settings from './Settings.jsx';

const TABS = [
  { id: 'plans', label: 'Plans', icon: Icon.calendar },
  { id: 'list', label: 'List', icon: Icon.cart },
  { id: 'pantry', label: 'Pantry', icon: Icon.pantry },
  { id: 'money', label: 'Money', icon: Icon.money },
];
const ORDER = TABS.map(t => t.id);

const readTab = () => {
  try { const t = localStorage.getItem('homelist-tab'); return ORDER.includes(t) ? t : 'plans'; } catch { return 'plans'; }
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

  // The realtime callback fires later, so it reads the latest members from a ref.
  const membersRef = useRef([]);
  const hh = useHousehold(household.id, me, {
    onRemoteInsert: (key, row) => {
      const who = nameFrom(membersRef.current, row.created_by);
      const text = key === 'plans'
        ? (row.owner ? `${who}'s schedule: ${row.title} · ${whenLabel(row)}` : `${who} planned ${row.title} · ${whenLabel(row)}`)
        : `${nameFrom(membersRef.current, row.added_by)} added ${row.name}`;
      notify(text);
    },
  });
  membersRef.current = hh.members;

  const nameOf = id => nameFrom(hh.members, id);
  const actions = makeActions({ householdId: household.id, me, hh, notify });

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { resyncPush(household.id); }, [household.id]);
  useEffect(() => {
    try { if (ORDER.includes(tab)) localStorage.setItem('homelist-tab', tab); } catch { /* private mode */ }
    window.scrollTo(0, 0);
  }, [tab]);

  const badges = {
    plans: hh.plans.filter(p => !p.done && (!p.owner || p.owner === me) && ['missed', 'today'].includes(groupOf(p, now))).length,
    list: hh.items.filter(i => i.status === 'need').length,
    pantry: hh.pantry.filter(p => isRunningLow(p, now)).length,
  };
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
            <h1 className="brand">{tab === 'settings' ? 'Settings' : household.name}</h1>
            <div className="sync">
              <span className={`dot ${hh.status}`} />
              {hh.status === 'live'
                ? (others ? `Live · shared with ${others === 1 ? nameOf(hh.members.find(m => m.user_id !== me).user_id) : `${others} people`}` : 'Live · invite your partner from Settings')
                : hh.status === 'offline' ? 'Offline · changes will sync when you reconnect' : 'Connecting…'}
            </div>
          </div>
          {tab !== 'settings' && <button className="icon big" onClick={() => go('settings')} aria-label="Settings"><Icon.gear /></button>}
        </header>

        <div key={tab} className={`page page-${motion}`}>
          {tab === 'plans' && <PlansTab {...shared} />}
          {tab === 'list' && <ListTab {...shared} />}
          {tab === 'pantry' && <PantryTab {...shared} />}
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
