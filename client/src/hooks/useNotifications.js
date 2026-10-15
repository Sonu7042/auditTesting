import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import domain from "../api/domain";

// Shared, role-agnostic notification bell/list logic - used by the admin
// Header, the auditor Header, and the full-page notification history views.
// The server scopes every request by the logged-in user (role-wide broadcast
// for admins, per-user targeting for everyone else), so this hook doesn't
// need to know the caller's role.
export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`${domain}/notifications`);
      setNotifications(res.data?.data || []);
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async ({ limit = 30, offset = 0 } = {}) => {
    const res = await axios.get(`${domain}/notifications/history`, {
      params: { limit, offset },
    });
    return {
      data: res.data?.data || [],
      total: res.data?.total || 0,
    };
  }, []);

  const markAsRead = useCallback(async (notificationId) => {
    setNotifications((current) =>
      current.filter((item) => item.id !== notificationId),
    );

    try {
      await axios.patch(`${domain}/notifications/read`, {
        notificationId,
      });
    } catch {
      // local state already updated optimistically; a stale unread badge
      // is preferable to blocking the UI on a failed mark-as-read call
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications([]);

    try {
      await axios.patch(`${domain}/notifications/read-all`);
    } catch {
      // see markAsRead
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId) => {
    setNotifications((current) =>
      current.filter((item) => item.id !== notificationId),
    );

    await axios.delete(`${domain}/notifications/${notificationId}`);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;

    const socketUrl = domain.replace(/\/api\/?$/, "");
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("notifications:new", (notification) => {
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ]);
    });

    socket.on("connect_error", (err) => {
      console.log(err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Cross-component read sync: ChecklistPage.jsx/DocumentPage.jsx mark a
  // checklist notification read via URL deep-link and broadcast this event
  // so any mounted bell drops it from its local unread list too.
  useEffect(() => {
    const handleNotificationRead = (event) => {
      const detail = event.detail || {};

      setNotifications((current) =>
        current.filter((notification) => {
          if (detail.notificationId) return notification.id !== detail.notificationId;
          if (detail.questionId) return notification.questionId !== detail.questionId;
          if (detail.sectionId) return notification.sectionId !== detail.sectionId;
          if (detail.auditId) return notification.auditId !== detail.auditId;
          return true;
        }),
      );
    };

    window.addEventListener("notification-read", handleNotificationRead);
    return () =>
      window.removeEventListener("notification-read", handleNotificationRead);
  }, []);

  return {
    notifications,
    unreadCount: notifications.length,
    loading,
    error,
    fetchNotifications,
    fetchHistory,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
