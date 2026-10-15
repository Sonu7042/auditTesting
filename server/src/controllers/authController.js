const prisma = require("../config/prisma");
const generateToken = require("../utils/generateToken");
const { matchesPassword, isHashed, hashPassword } = require("../utils/credentials");

const publicUser = (user) => ({ id: user.id, fullName: user.fullName, username: user.username, email: user.email, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) });

// Sign in with the generated username (for example KQXPR4821M) or the registered email.
exports.login = async (req, res) => {
  try {
    const identifier = String(req.body.username || req.body.email || "").trim();
    const password = String(req.body.password || "");
    if (!identifier || !password) return res.status(400).json({ message: "Enter your username (or email) and password." });

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { username: identifier.toUpperCase() }, { email: identifier.toLowerCase() }] },
    });
    if (!user || !(await matchesPassword(password, user.password))) return res.status(400).json({ message: "Invalid username or password" });
    if (!user.status) return res.status(403).json({ message: "Account disabled" });

    // Older accounts stored the password as plain text; store a hash from the first successful login.
    if (!isHashed(user.password)) await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });

    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.me = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: publicUser(user) });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!(await matchesPassword(String(currentPassword || ""), user.password))) return res.status(400).json({ message: "Current password is incorrect." });
    const next = String(newPassword || "");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return res.status(400).json({ message: "New password must be at least 8 characters with a letter and a number." });
    if (next === currentPassword) return res.status(400).json({ message: "Choose a password different from the current one." });
    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date() } });
    res.json({ success: true, message: "Password changed." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
