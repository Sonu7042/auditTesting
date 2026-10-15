const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

let io;

const userRoom = (userId) => `user:${userId}`;

const initNotificationSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("No token provided"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    if (!socket.user?.id) return;

    // Every authenticated socket joins its own room so a notification can
    // be pushed to one specific user (an auditor, a site user, etc.)
    // regardless of role.
    socket.join(userRoom(socket.user.id));

    if (socket.user.role === "ADMIN") {
      socket.join("admins");
    }

    socket.emit("notifications:connected", { ok: true });
  });

  return io;
};

// Pushes a just-created Notification row to whoever it targets:
// recipientRole "ADMIN" -> every connected admin, recipientId -> that one
// user's room. A notification may have either or (rarely) both set.
const broadcastNotification = (notification) => {
  if (!io || !notification) return;

  if (notification.recipientRole === "ADMIN") {
    io.to("admins").emit("notifications:new", notification);
  }

  if (notification.recipientId) {
    io.to(userRoom(notification.recipientId)).emit("notifications:new", notification);
  }
};

module.exports = {
  initNotificationSocket,
  broadcastNotification,
};
