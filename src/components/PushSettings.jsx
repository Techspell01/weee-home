import { useEffect, useState } from 'react';
import { disablePush, enablePush, isSubscribed, pushPermission, sendTestPush } from '../lib/push.js';

// Settings panel for phone notifications on this device.
export default function PushSettings({ householdId, notify }) {
  const [permission, setPermission] = useState(pushPermission);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { isSubscribed().then(setSubscribed).catch(() => setSubscribed(false)); }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const { permission: p, error } = await enablePush(householdId);
      setPermission(p);
      if (p === 'granted' && !error) {
        setSubscribed(true);
        window.dispatchEvent(new Event('weee:push-changed'));
        notify('Notifications are on');
        const r = await sendTestPush();
        if (!r?.sent) notify("Couldn't send a test notification yet. Try the Send a test button in a moment.");
      } else if (error) notify("Notifications were allowed but couldn't be saved. Check your internet and try again.");
    } catch {
      notify("This device couldn't turn on notifications.");
    }
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    try { await disablePush(); setSubscribed(false); notify('Notifications are off on this device'); window.dispatchEvent(new Event('weee:push-changed')); } catch { /* ignore */ }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPush();
    notify(r?.sent ? 'Test sent. It should appear in a few seconds.' : "Couldn't send a test. Turn notifications off and on again.");
    setBusy(false);
  }

  return (
    <div className="panel">
      <p className="sub tight">Get a notification when your partner adds to the shopping list or makes a plan, even when Weee is closed.</p>

      {permission === 'needs-install' ? (
        <ol className="steps">
          <li>On iPhone, notifications only work from the Home Screen app. Open this page in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          <li>Open <b>Weee</b> from your Home Screen, come back to Settings, and turn notifications on.</li>
        </ol>
      ) : permission === 'unsupported' ? (
        <p className="meta">This browser can't show notifications. Try Chrome on Android, or the Home Screen app on iPhone (iOS 16.4 or later).</p>
      ) : permission === 'denied' ? (
        <p className="meta">Notifications are blocked for Weee. On iPhone: Settings → Notifications → Weee → Allow Notifications. On Android: tap the lock icon by the address, then Permissions → Notifications.</p>
      ) : subscribed ? (
        <div className="stack-row">
          <span className="on-list">Notifications are on for this device</span>
          <button className="btn ghost small" onClick={test} disabled={busy}>Send a test</button>
          <button className="btn ghost small" onClick={turnOff} disabled={busy}>Turn off</button>
        </div>
      ) : (
        <button className="btn" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
      )}
    </div>
  );
}
