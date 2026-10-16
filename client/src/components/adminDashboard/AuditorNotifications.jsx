import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, RefreshCw, X } from "lucide-react";
import useNotifications from "../../hooks/useNotifications";
import { resolveNotificationLink } from "../../utils/notificationRoutes";
import { Skeleton } from "../siteOnboarding/ui";

const formatNotificationTime = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AuditorNotifications() {
  const navigate = useNavigate();
  const { fetchHistory, markAsRead, deleteNotification } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError("");
      const { data } = await fetchHistory();
      setNotifications(data);
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
    }

    const link = resolveNotificationLink(notification, "AUDITOR");
    if (link) navigate(link);
  };

  const removeNotification = async (event, id) => {
    event.stopPropagation();
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    try {
      await deleteNotification(id);
    } catch {
      loadHistory();
    }
  };

  return (
    <div className="-mx-5 mt-6 bg-[#f1f1f1] px-5">
      <div className="flex min-h-[calc(100vh-88px)] flex-col">
        {/* Header */}
        <header className="flex items-start justify-between pt-2">
          <h1 className="text-[19px] font-semibold tracking-[0.04em] text-[#161616]">
            Notifications
          </h1>

          <button
            type="button"
            onClick={loadHistory}
            disabled={loading}
            className="flex items-center gap-1 text-xs font-medium text-[#555] underline disabled:opacity-50"
          >
            <RefreshCw size={12} />
            {loading ? "Refreshing" : "Refresh Notifications"}
          </button>
        </header>

        {/* Content */}
        <main className="mt-8 flex-1">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-5">
              {notifications.map((item) => (
                <article
                  key={item.id}
                  onClick={() => handleOpen(item)}
                  className={`relative flex min-h-[74px] cursor-pointer items-center gap-5 rounded-[10px] px-4 py-3 shadow-[0_3px_12px_rgba(0,0,0,0.14)] transition hover:opacity-90 ${
                    item.isRead ? "bg-white" : "bg-[#e9edff]"
                  }`}
                >
                  <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[8px] bg-[#5646ef] text-white">
                    <Bell size={24} strokeWidth={1.8} />
                  </div>

                  <div className="min-w-0 pr-6">
                    <h2 className="truncate text-[16px] font-medium text-[#1e1e1e]">
                      {item.title}
                    </h2>

                    <p className="mt-1 truncate text-[13px] font-medium text-[#3f3f46]">
                      {item.message}
                    </p>

                    <p className="mt-1 text-xs text-[#888]">
                      {formatNotificationTime(item.createdAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => removeNotification(event, item.id)}
                    className="absolute right-3 top-3 text-[#777] transition hover:text-red-500"
                    aria-label="Delete notification"
                  >
                    <X size={17} />
                  </button>
                </article>
              ))}
            </div>
          ) : loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-[#ececec] bg-white p-5 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center py-20">
              <p className="text-sm text-gray-500">
                No notifications available
              </p>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="pb-6 pt-10 text-center">
          <h3 className="font-bold text-[#4F46E5]">
            Audit Smartly
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Keep your sites compliant and inspections on track
          </p>
        </footer>
      </div>
    </div>
  );
}
