import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/actions.js';

export default function Onboarding({ onDone }) {
  const [displayName, setDisplayName] = useState('');
  const [houseName, setHouseName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(fn, args) {
    if (!displayName.trim()) { setError('Enter your name first, so your partner knows who added what.'); return; }
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) setError(friendlyError(error));
    else onDone();
  }

  return (
    <main className="center-screen">
      <div className="auth-card">
        <h1 className="brand big">Set up your home</h1>
        <p className="sub">Start a new household, or join the one your partner or roommate already made.</p>

        <label className="field"><span>Your name</span>
          <input id="displayName" maxLength={40} placeholder="Priya" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </label>

        <form className="panel stack" onSubmit={e => { e.preventDefault(); call('create_household', { p_name: houseName.trim() || 'Our home', p_display_name: displayName.trim() }); }}>
          <h2 className="panel-title">Start a new household</h2>
          <label className="field"><span>Household name</span>
            <input id="houseName" maxLength={60} placeholder="Our home" value={houseName} onChange={e => setHouseName(e.target.value)} />
          </label>
          <button className="btn block" disabled={busy}>Create household</button>
        </form>

        <form className="panel stack" onSubmit={e => { e.preventDefault(); call('join_household', { p_code: code, p_display_name: displayName.trim() }); }}>
          <h2 className="panel-title">Join with an invite code</h2>
          <label className="field"><span>6-character code from Settings on their phone</span>
            <input id="inviteCode" className="code-input" maxLength={6} placeholder="A1B2C3" required value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
          </label>
          <button className="btn ghost block" disabled={busy}>Join household</button>
        </form>

        {error && <p className="notice error">{error}</p>}
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </main>
  );
}
