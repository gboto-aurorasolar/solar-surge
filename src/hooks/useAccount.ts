import { useCallback, useState } from 'react';

const ACCOUNT_KEY = 'solar-surge:account';
const USERS_KEY = 'solar-surge:users';

export interface Account {
  email: string;
}

type UserStore = Record<string, string>;

// NOTE: This is a backend-less prototype. "Accounts" live entirely in
// localStorage and are only meant to personalize saved high scores on this
// device — they are not real authentication and store no secrets safely.
function readUsers(): UserStore {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}') as UserStore;
  } catch {
    return {};
  }
}

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

export function useAccount() {
  const [account, setAccount] = useState<Account | null>(() => readAccount());

  const persist = useCallback((next: Account | null) => {
    setAccount(next);
    if (next) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    else localStorage.removeItem(ACCOUNT_KEY);
  }, []);

  const signUp = useCallback(
    (email: string, password: string): { ok: boolean; error?: string } => {
      const key = email.trim().toLowerCase();
      const users = readUsers();
      if (users[key]) return { ok: false, error: 'An account with this email already exists. Try signing in.' };
      users[key] = password;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      persist({ email: key });
      return { ok: true };
    },
    [persist],
  );

  const logIn = useCallback(
    (email: string, password: string): { ok: boolean; error?: string } => {
      const key = email.trim().toLowerCase();
      const users = readUsers();
      if (!users[key]) return { ok: false, error: 'No account found for this email. Create one instead.' };
      if (users[key] !== password) return { ok: false, error: 'Incorrect password. Please try again.' };
      persist({ email: key });
      return { ok: true };
    },
    [persist],
  );

  const logOut = useCallback(() => persist(null), [persist]);

  return { account, signUp, logIn, logOut };
}
