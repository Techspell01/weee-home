import { BigValue, Icon } from '../components/ui.jsx';
import { monthKey, monthLabel, settlements, spending } from '../lib/money.js';
import { ago } from '../lib/time.js';
import { visibleMessages } from '../lib/chat.js';
import Countdowns from '../components/Countdowns.jsx';

// Discover: the hub for Shopping, Money, Chat and Countdowns.
export default function DiscoverTab({ hh, actions, notify, nameOf, me, now, open, unread }) {
  const need = hh.items.filter(i => i.status === 'need');
  const urgent = need.filter(i => i.urgent).length;
  const month = monthKey(now);
  const spent = spending(hh.expenses, month);
  const owed = settlements(hh.expenses, hh.members.map(m => m.user_id));
  const visible = visibleMessages(hh, me);
  const last = visible[visible.length - 1];
  const whole = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const balance = !owed.length ? 'All square'
    : owed.length === 1 ? `${nameOf(owed[0].from)} ${owed[0].from === me ? 'owe' : 'owes'} ${owed[0].to === me ? 'you' : nameOf(owed[0].to)} ₹${whole(owed[0].amount)}`
    : `${owed.length} balances open`;

  return (
    <section>
      <div className="bento">
        <button type="button" className="tile" onClick={() => open('list')}>
          <div className="tile-top"><span className="tile-icon"><Icon.cart /></span></div>
          <BigValue value={need.length} unit={need.length === 1 ? 'item' : 'items'} />
          <div className="tile-title">Shopping list</div>
          <div className="tile-sub">{urgent ? `${urgent} needed today` : need.length ? 'Tap to open the list' : 'All done'}</div>
        </button>

        <button type="button" className="tile gold" onClick={() => open('money')}>
          <div className="tile-top"><span className="tile-icon"><Icon.money /></span></div>
          <BigValue value={<><span className="unit pre">₹</span>{whole(spent.total)}</>} className="fit" />
          <div className="tile-title">Money</div>
          <div className="tile-sub">{monthLabel(month).split(' ')[0]} · {balance}</div>
        </button>

        <button type="button" className="tile wide chat-tile" onClick={() => open('chat')}>
          <div className="tile-top">
            <span className="tile-icon"><Icon.chat /></span>
            {unread > 0 && <span className="unread">{unread} new</span>}
          </div>
          <div className="tile-title">Chat</div>
          <div className="tile-sub chat-preview">
            {last ? <><b>{last.user_id === me ? 'You' : nameOf(last.user_id)}:</b> {last.body}</> : 'Start a conversation'}
          </div>
          {last && <div className="tile-sub faint">{ago(last.created_at, now)}</div>}
        </button>
      </div>

      <div className="discover-countdowns">
        <Countdowns hh={hh} actions={actions} notify={notify} now={now} />
      </div>
    </section>
  );
}
