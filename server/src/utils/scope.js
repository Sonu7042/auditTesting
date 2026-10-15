const prisma = require("../config/prisma");

// Prisma `where` for DealerLocation limited to what the user may see.
// Admins see everything. Others see the union of their scopes; without any scope
// they fall back to their company (existing behaviour).
const locationWhereForUser = async (user) => {
  if (user.role === "ADMIN") return {};
  const [scopes, account] = await Promise.all([
    prisma.userScope.findMany({ where: { userId: user.id } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { companyId: true } }),
  ]);
  if (!scopes.length) return account?.companyId ? { programme: { companyId: account.companyId } } : { id: "__none__" };
  return {
    OR: scopes.map((s) => ({
      ...(s.companyId ? { programme: { companyId: s.companyId } } : {}),
      ...(s.zone ? { zone: s.zone } : {}),
      ...(s.regionalOffice ? { regionalOffice: s.regionalOffice } : {}),
      ...(s.locationId ? { id: s.locationId } : {}),
    })),
  };
};

module.exports = { locationWhereForUser };
