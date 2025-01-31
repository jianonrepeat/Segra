import {useState, useEffect} from 'react';
import {Session} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase/client';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState(session?.user ?? null);

  useEffect(() => {
    const {data: authListener} = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => authListener?.subscription.unsubscribe();
  }, []);

  return {user, session};
}