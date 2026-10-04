import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/actions.js';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const creds = { email: email.trim(), password };
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) setMessage({ tone: 'error', text: error.message === 'Invalid login credentials' ? 'That email and password do not match.' : friendlyError(error) });
    } else {
      const { data, error } = await supabase.auth.signUp({ ...creds, options: { emailRedirectTo: window.location.origin } });
      if (error) setMessage({ tone: 'error', text: friendlyError(error) });
      else if (!data.session) {
        setMode('signin');
        setMessage({ tone: 'ok', text: `We sent a confirmation link to ${creds.email}. Tap it, then come back here and sign in. If the link opens a "can't connect" page, that's fine: your account is still confirmed.` });
      }
    }
    setBusy(false);
  }

  return (
    <main className="center-screen">
      <div className="auth-card">
        <h1 className="brand big">Weee</h1>
        <p className="sub">Your home, together. Plans, groceries, pantry and spending, shared live with the people you live with.</p>

        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => { setMode('signin'); setMessage(null); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => { setMode('signup'); setMessage(null); }}>Create account</button>
        </div>

        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Email</span>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="field"><span>Password</span>
            <input id="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {message && <p className={`notice ${message.tone}`}>{message.text}</p>}
          <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </main>
  );
}
