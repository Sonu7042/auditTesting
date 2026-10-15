const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "No token provided"
    });
  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    // A demo window is a read-only "view as" session started by Back-Admin: it can look at everything its role can see,
    // and change nothing (marking notifications as read is the one exception).
    if (decoded.demo && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.originalUrl.startsWith("/api/notifications")) {
      return res.status(403).json({ message: "This is a read-only demo window. Nothing can be changed here." });
    }

    next();

  } catch (error) {

    res.status(401).json({
      message: "Invalid token"
    });

  }

};