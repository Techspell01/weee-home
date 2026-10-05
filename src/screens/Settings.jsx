import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useRef } from 'react';
import { Avatar, ConfirmButton } from '../components/ui.jsx';
import PushSettings from '../components/PushSettings.jsx';
import { haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '../lib/haptics.js';
import { playSound, setSoundsEnabled, soundsEnabled } from '../lib/sounds.js';

export default function Settings({ household, me, myName, hh, actions, nameOf, notify, onLeft, onHouseholdChanged, avatars = {} }) {
  const [displayName, setDisplayName] = useState(myName);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const alone = hh.members.filter(m => m.user_id !== me).length === 0;
  const [houseName, setHouseName] = useState(household.name);
  const [vibrate, setVibrate] = useState(hapticsEnabled);
  const [sounds, setSounds] = useState(soundsEnabled);
  const [since, setSince] = useState(household.together_since || '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const myPhoto = hh.members.find(m => m.user_id === me)?.avatar_path;

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    if (await actions.setAvatar(file)) notify('Photo updated');
    setUploading(false);
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(household.invite_code); notify('Invite code copied'); }
    catch { notify(`Invite code: ${household.invite_code}`); }
  }

  return (
    <section>
      <div className="panel profile-card">
        <Avatar url={avatars[me]} name={myName} size={84} />
        <div className="grow">
          <div className="panel-title">{myName}</div>
          <div className="stack-row gap-top-sm">
            <button type="button" className="btn small" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : myPhoto ? 'Change photo' : 'Add a photo'}</button>
            {myPhoto && <button type="button" className="btn ghost small" onClick={async () => { if (await actions.removeAvatar()) notify('Photo removed'); }}>Remove</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
        </div>
      </div>

      <div className="label">Together since</div>
      <form className="form" onSubmit={async e => {
        e.preventDefault();
        if (await actions.setTogetherSince(since)) { notify(since ? 'Saved. The days-together counter is on Plans.' : 'Removed'); onHouseholdChanged?.(); }
      }}>
        <label className="field"><span>The day you got together (shown as days together on Plans)</span>
          <input id="togetherSince" type="date" max={new Date().toISOString().slice(0, 10)} value={since} onChange={e => setSince(e.target.value)} />
        </label>
        <button className="btn ghost">Save date</button>
      </form>

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
            <Avatar url={avatars[m.user_id]} name={m.display_name} size={38} />
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

      <div className="label">Sounds</div>
      <label className="panel toggle-row">
        <span className="grow"><b>Sounds in Weee</b><span className="meta block">An alarm when a follow-up is due, and a pop for new messages, while Weee is open.</span></span>
        <input id="soundsToggle" type="checkbox" role="switch" checked={sounds}
          onChange={e => { setSoundsEnabled(e.target.checked); setSounds(e.target.checked); if (e.target.checked) playSound('alarm'); }} />
      </label>
      <div className="stack-row sound-tests">
        <button type="button" className="btn ghost small" onClick={() => playSound('alarm')}>Play reminder</button>
        <button type="button" className="btn ghost small" onClick={() => playSound('chat')}>Play message</button>
      </div>
      <p className="hint">When Weee is closed, notifications use your phone's notification sound. On iPhone, check Settings → Notifications → Weee → Sounds is on.</p>

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
