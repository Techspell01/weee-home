import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { Splash } from './components/ui.jsx';
import AuthScreen from './screens/AuthScreen.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';

function useSession() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function SignedIn({ userId }) {
  const [membership, setMembership] = useState(undefined);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, display_name, households(id, name, invite_code, together_since)')
      .eq('user_id', userId)
      .order('joined_at')
      .limit(1);
    if (error) setError(error);
    else setMembership(data[0] ?? null);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <main className="center-screen">
        <div className="auth-card">
          <h1 className="brand big">Can't reach Weee</h1>
          <p className="sub">Check your internet connection, then try again.</p>
          <button className="btn block" onClick={load}>Try again</button>
        </div>
      </main>
    );
  }
  if (membership === undefined) return <Splash />;
  if (!membership) return <Onboarding onDone={load} />;
  return <Home key={membership.household_id} membership={membership} me={userId} onLeft={load} onHouseholdChanged={load} />;
}

// Let the start animation finish (about a second from launch) before the app appears.
function useIntro(ms = 1150) {
  const [done, setDone] = useState(() => performance.now() >= ms);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setDone(true), ms - performance.now());
    return () => clearTimeout(t);
  }, [done, ms]);
  return done;
}

export default function App() {
  const session = useSession();
  const introDone = useIntro();
  if (session === undefined || !introDone) return <Splash />;
  if (!session) return <AuthScreen />;
  return <SignedIn key={session.user.id} userId={session.user.id} />;
}
