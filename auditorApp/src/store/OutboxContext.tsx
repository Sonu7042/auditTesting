import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import {fieldApi} from '../api/field.api';
import {isNetworkError} from '../api/client';
import {Session} from '../types/field';
import {useAuth} from './AuthContext';

export type OutboxPhoto = {path: string; field: 'evidence' | 'correctionEvidence'; type: string; name: string; size: number};
export type OutboxItem = {
  id: string;
  jobId: string;
  itemId: string;
  questionCode: string;
  createdAt: string;
  fields: Record<string, string>;
  photos: OutboxPhoto[];
  error?: string;
};

const QUEUE = '@field/outbox';
const SYNCED = '@field/last-sync';
const sessionKey = (jobId: string) => `@field/session/${jobId}`;
const DIR = `${RNFS.DocumentDirectoryPath}/outbox`;

type Value = {
  items: OutboxItem[];
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  enqueue: (item: Omit<OutboxItem, 'id' | 'createdAt' | 'photos'>, photos: Array<{uri: string; type: string; name: string; size: number; field: OutboxPhoto['field']}>) => Promise<void>;
  flush: () => Promise<void>;
  discard: (id: string) => Promise<void>;
  pendingFor: (jobId: string) => OutboxItem[];
  cacheSession: (session: Session) => Promise<void>;
  cachedSession: (jobId: string) => Promise<Session | null>;
};

const C = createContext<Value | null>(null);

export function OutboxProvider({children}: {children: React.ReactNode}) {
  const {user} = useAuth();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const itemsRef = useRef<OutboxItem[]>([]);
  const busy = useRef(false);

  const persist = useCallback(async (next: OutboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await AsyncStorage.setItem(QUEUE, JSON.stringify(next));
  }, []);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(QUEUE), AsyncStorage.getItem(SYNCED)]).then(([q, t]) => {
      try {
        const parsed = q ? (JSON.parse(q) as OutboxItem[]) : [];
        itemsRef.current = parsed;
        setItems(parsed);
      } catch {
        itemsRef.current = [];
      }
      setLastSyncAt(t);
    });
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || !user) return;
    busy.current = true;
    setSyncing(true);
    try {
      // Oldest first, so the server receives answers in the order they were given.
      for (const item of [...itemsRef.current].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        const form = new FormData();
        Object.entries(item.fields).forEach(([k, v]) => form.append(k, v));
        for (const p of item.photos) {
          if (await RNFS.exists(p.path)) form.append(p.field, {uri: `file://${p.path}`, type: p.type, name: p.name} as any);
        }
        try {
          await fieldApi.saveResponse(item.jobId, item.itemId, form);
          await Promise.all(item.photos.map(p => RNFS.unlink(p.path).catch(() => undefined)));
          await persist(itemsRef.current.filter(x => x.id !== item.id));
          const now = new Date().toISOString();
          setLastSyncAt(now);
          await AsyncStorage.setItem(SYNCED, now);
        } catch (e) {
          if (isNetworkError(e)) break;
          await persist(itemsRef.current.map(x => (x.id === item.id ? {...x, error: (e as Error).message} : x)));
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [persist, user]);

  useEffect(
    () =>
      NetInfo.addEventListener(state => {
        const up = Boolean(state.isConnected && state.isInternetReachable !== false);
        setOnline(up);
        if (up && itemsRef.current.some(x => !x.error)) flush();
      }),
    [flush],
  );

  const enqueue = useCallback<Value['enqueue']>(
    async (item, photos) => {
      await RNFS.mkdir(DIR);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved: OutboxPhoto[] = [];
      for (const [i, p] of photos.entries()) {
        const path = `${DIR}/${id}-${i}.jpg`;
        await RNFS.copyFile(p.uri.replace('file://', ''), path);
        saved.push({path, field: p.field, type: p.type, name: p.name, size: p.size});
      }
      // A newer answer for the same point replaces the one still waiting.
      const older = itemsRef.current.filter(x => x.jobId === item.jobId && x.itemId === item.itemId);
      const keptPhotos = older.flatMap(x => x.photos);
      await persist([...itemsRef.current.filter(x => !older.includes(x)), {...item, id, createdAt: new Date().toISOString(), photos: [...keptPhotos, ...saved]}]);
    },
    [persist],
  );

  const discard = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find(x => x.id === id);
      await Promise.all((item?.photos || []).map(p => RNFS.unlink(p.path).catch(() => undefined)));
      await persist(itemsRef.current.filter(x => x.id !== id));
    },
    [persist],
  );

  const pendingFor = useCallback((jobId: string) => items.filter(x => x.jobId === jobId), [items]);
  const cacheSession = useCallback(async (session: Session) => {
    await AsyncStorage.setItem(sessionKey(session.jobId), JSON.stringify(session)).catch(() => undefined);
  }, []);
  const cachedSession = useCallback(async (jobId: string) => {
    const raw = await AsyncStorage.getItem(sessionKey(jobId));
    try {
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({items, online, syncing, lastSyncAt, enqueue, flush, discard, pendingFor, cacheSession, cachedSession}),
    [items, online, syncing, lastSyncAt, enqueue, flush, discard, pendingFor, cacheSession, cachedSession],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useOutbox = () => {
  const v = useContext(C);
  if (!v) throw Error('OutboxProvider missing');
  return v;
};

/* Shows answers that are still waiting to upload as if they were saved, so the auditor can keep working offline. */
export function withPending(session: Session, pending: OutboxItem[]): Session {
  if (!pending.length) return session;
  const byItem = new Map(pending.map(p => [p.itemId, p]));
  return {
    ...session,
    modules: session.modules.map(m => ({
      ...m,
      sections: m.sections.map(sec => ({
        ...sec,
        questions: sec.questions.map(q => {
          const p = byItem.get(q.id);
          if (!p) return q;
          const f = p.fields;
          const local = p.photos.map((ph, i) => ({id: `local-${p.id}-${i}`, imageUrl: `file://${ph.path}`, kind: ph.field === 'correctionEvidence' ? 'CORRECTION' : 'ISSUE'}));
          return {
            ...q,
            response: {
              ...(q.response || {id: `local-${p.id}`}),
              responseStatus: (f.responseStatus as any) || 'DRAFT',
              answer: (f.answer as any) || null,
              result: (f.answer as any) || null,
              observation: f.observation || null,
              recommendation: f.recommendation || null,
              naReason: f.naReason || null,
              measurementValue: f.measurementValue ? Number(f.measurementValue) : null,
              closedOnSpot: f.closedOnSpot === 'true',
              correctionComment: f.correctionComment || null,
              evidence: [...(q.response?.evidence || []), ...local],
              pending: true,
            },
          };
        }),
      })),
    })),
  };
}
