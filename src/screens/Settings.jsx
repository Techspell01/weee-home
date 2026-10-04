import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { ConfirmButton } from '../components/ui.jsx';
import PushSettings from '../components/PushSettings.jsx';
import { haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '../lib/haptics.js';

export default function Settings({ household, me, myName, hh, actions, nameOf, notify, onLeft }) {
  const [displayName, setDisplayName] = useState(myName);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const alone = hh.members.filter(m => m.user_id !== me).length === 0;
  const [houseName, setHouseName] = useState(household.name);
  const [vibrate, setVibrate] = useState(hapticsEnabled);

  async function copyCode() {
    try { await navigator.clipboard.writeText(household.invite_code); notify('Invite code copied'); }
    catch { notify(`Invite code: ${household.invite_code}`); }
  }

  return (
    <section>
      <div className="label">Invite someone</div>
      <div className="panel">
        <p className="sub tight">On their phone they create an account, choose <b>Join with an invite code</b>, and type this code.</p>
        <div className="invite">
          <span className="code">{household.invite_code}</span>
          <button className="btn ghost small" onClick={copyCode}>Copy</button>
        </div>
      </div>

      <div className="label">People in {household.name}</div>
      <div className="list">
        {hh.members.map(m => (
          <div key={m.user_id} className="row">
            <div className="avatar" aria-hidden="true">{(m.display_name[0] || '?').toUpperCase()}</div>
            <div className="main"><div className="name">{m.display_name}{m.user_id === me && <span className="qty">you</span>}</div></div>
          </div>
        ))}
      </div>

      <div className="label">Names</div>
      <form className="form" onSubmit={e => { e.preventDefault(); if (displayName.trim()) actions.renameMe(displayName.trim()).then(ok => ok && notify('Name saved')); }}>
        <label className="field"><span>Your name</span><input id="myName" maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>
        <button className="btn ghost">Save my name</button>
      </form>
      <form className="form gap-top" onSubmit={e => { e.preventDefault(); if (houseName.trim()) actions.renameHousehold(houseName.trim()).then(ok => ok && notify('Household renamed')); }}>
        <label className="field"><span>Household name</span><input id="houseRename" maxLength={60} value={houseName} onChange={e => setHouseName(e.target.value)} /></label>
        <button className="btn ghost">Rename household</button>
      </form>

      <div className="label">Notifications</div>
      <PushSettings householdId={household.id} notify={notify} />

      {hapticsSupported() && <>
        <div className="label">Feel</div>
        <label className="panel toggle-row">
          <span className="grow"><b>Vibrate on tap</b><span className="meta block">A small buzz when you press buttons and tick things off.</span></span>
          <input id="hapticsToggle" type="checkbox" role="switch" checked={vibrate}
            onChange={e => { setHapticsEnabled(e.target.checked); setVibrate(e.target.checked); if (e.target.checked) haptic('success'); }} />
        </label>
      </>}

      <div className="label">Account</div>
      <div className="stack-row">
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        <ConfirmButton className="btn danger" label="Leave household" confirmLabel="Tap again to leave"
          onConfirm={async () => { if (await actions.leave()) onLeft(); }}>Leave household</ConfirmButton>
      </div>
      <p className="hint">Leaving removes you from {household.name}; the lists stay for everyone else.</p>

      <div className="label">Delete account</div>
      <form className="panel danger-zone" onSubmit={async e => {
        e.preventDefault();
        if (confirmText.trim().toUpperCase() !== 'DELETE') return;
        setDeleting(true);
        if (!(await actions.deleteAccount())) setDeleting(false);
      }}>
        <p className="sub tight">
          This permanently deletes your Weee account and your personal schedule. {alone
            ? <>You're the only person in {household.name}, so the whole household and all its lists are deleted too.</>
            : <>{household.name} and its shared lists stay for the others, and items you added stay on the list.</>} This can't be undone.
        </p>
        <label className="field"><span>Type DELETE to confirm</span>
          <input id="deleteConfirm" autoComplete="off" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
        </label>
        <button className="btn danger" disabled={deleting || confirmText.trim().toUpperCase() !== 'DELETE'}>{deleting ? 'Deleting…' : 'Delete my account'}</button>
      </form>
    </section>
  );
}
