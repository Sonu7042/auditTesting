import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { env } from '../config/env';
import { notificationApi } from '../api/notification.api';
import { storage } from '../storage/storage';
import { useAuth } from './AuthContext';
import { AppNotification } from '../types/domain';

type Value = {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
};
const C = createContext<Value | null>(null);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const refresh = useCallback(async () => {
    try {
      setNotifications(await notificationApi.unread());
    } catch {
      /* keep last known list on failure */
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setNotifications([]);
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const token = await storage.token();
      if (!token || !active) return;
      const socketUrl = env.apiUrl.replace(/\/api\/?$/, '');
      const socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
      socket.on('notifications:new', (notification: AppNotification) => {
        setNotifications(current => [
          notification,
          ...current.filter(item => item.id !== notification.id),
        ]);
      });
    })();
    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(current => current.filter(item => item.id !== id));
    try {
      await notificationApi.read(id);
    } catch {
      /* optimistic; badge may briefly be stale */
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications([]);
    try {
      await notificationApi.readAll();
    } catch {
      /* optimistic */
    }
  }, []);

  const removeNotification = useCallback(
    async (id: string) => {
      const previous = notifications;
      setNotifications(current => current.filter(item => item.id !== id));
      try {
        await notificationApi.remove(id);
      } catch {
        setNotifications(previous);
      }
    },
    [notifications],
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: notifications.length,
      refresh,
      markAsRead,
      markAllAsRead,
      removeNotification,
    }),
    [notifications, refresh, markAsRead, markAllAsRead, removeNotification],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useNotifications = () => {
  const v = useContext(C);
  if (!v) throw Error('NotificationProvider missing');
  return v;
};
