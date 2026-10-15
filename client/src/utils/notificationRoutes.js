// Server-created notifications carry a precomputed `link` (see server/src/utils/notificationService.js).
export const resolveNotificationLink = (notification) => notification?.link || null;
