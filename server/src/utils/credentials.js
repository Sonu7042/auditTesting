const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const pick = (chars) => chars[crypto.randomInt(chars.length)];

// Ten characters in the shape of a PAN: five letters, four digits, one letter (for example KQXPR4821M).
const panStyle = () => `${Array.from({ length: 5 }, () => pick(LETTERS)).join("")}${String(crypto.randomInt(1000, 10000))}${pick(LETTERS)}`;

const newUsername = async () => {
  for (let i = 0; i < 30; i += 1) {
    const candidate = panStyle();
    if (!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }))) return candidate;
  }
  throw new Error("Could not generate a unique username.");
};

// One-time password: easy to read out and type (no look-alike characters).
const newPassword = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => pick(alphabet)).join("") + pick("!@#$%") ;
};

const hashPassword = (plain) => bcrypt.hash(plain, 10);
// Accepts a hashed password, or an older plain-text one (upgraded to a hash at the next login).
const matchesPassword = async (plain, stored) => (/^\$2[aby]\$/.test(stored || "") ? bcrypt.compare(plain, stored) : plain === stored);
const isHashed = (stored) => /^\$2[aby]\$/.test(stored || "");

// Creates the login for a new user. The returned plain password is shown once and must be changed at first login.
const issueCredentials = async () => {
  const password = newPassword();
  return { username: await newUsername(), password, hash: await hashPassword(password) };
};

module.exports = { newUsername, newPassword, hashPassword, matchesPassword, isHashed, issueCredentials };
