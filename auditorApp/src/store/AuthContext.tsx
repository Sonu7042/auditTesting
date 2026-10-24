import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {authApi} from '../api/auth.api';
import {setUnauthorizedHandler} from '../api/client';
import {fieldApi} from '../api/field.api';
import {storage} from '../storage/storage';
import {User} from '../types/domain';

type AuthUser = User & {mustChangePassword?: boolean};
type Value = {
  user: AuthUser | null;
  booting: boolean;
  pinRequired: boolean;
  hasPin: boolean;
  oneTimePassword: string;
  login: (u: string, p: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  completePin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
};
const C = createContext<Value | null>(null);
const MAX_PIN_TRIES = 5;

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [pinRequired, setPinRequired] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [oneTimePassword, setOneTimePassword] = useState('');
  const wrongPins = useRef(0);

  const logout = useCallback(async () => {
    await storage.clear();
    wrongPins.current = 0;
    setOneTimePassword('');
    setUser(null);
    setPinRequired(false);
    setHasPin(false);
  }, []);

  useEffect(() => {
    Promise.all([storage.user(), storage.hasPin()])
      .then(([savedUser, savedPin]) => {
        setUser(savedUser);
        setHasPin(savedPin);
        setPinRequired(Boolean(savedUser));
      })
      .finally(() => setBooting(false));
    setUnauthorizedHandler(() => {
      setUser(null);
      setPinRequired(false);
    });
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    const result = await authApi.login(u.trim(), p);
    if (result.user.role !== 'AUDITOR') throw new Error('This app is for auditors only.');
    await storage.session(result.token, result.user);
    setHasPin(await storage.hasPin());
    setOneTimePassword(result.user && (result.user as AuthUser).mustChangePassword ? p : '');
    wrongPins.current = 0;
    setUser(result.user);
    setPinRequired(true);
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      await fieldApi.changePassword(current, next);
      if (!user) return;
      const updated = {...user, mustChangePassword: false};
      const token = await storage.token();
      if (token) await storage.session(token, updated);
      setOneTimePassword('');
      setUser(updated);
    },
    [user],
  );

  const completePin = useCallback(
    async (pin: string) => {
      if (hasPin) {
        const valid = await storage.verifyPin(pin);
        if (valid) {
          wrongPins.current = 0;
          setPinRequired(false);
          return true;
        }
        wrongPins.current += 1;
        if (wrongPins.current >= MAX_PIN_TRIES) await logout();
        return false;
      }
      await storage.setPin(pin);
      setHasPin(true);
      setPinRequired(false);
      return true;
    },
    [hasPin, logout],
  );

  const value = useMemo(
    () => ({user, booting, pinRequired, hasPin, oneTimePassword, login, changePassword, completePin, logout}),
    [user, booting, pinRequired, hasPin, oneTimePassword, login, changePassword, completePin, logout],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useAuth = () => {
  const v = useContext(C);
  if (!v) throw Error('AuthProvider missing');
  return v;
};
export const PIN_TRIES = MAX_PIN_TRIES;
