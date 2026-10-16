const { assertAuditEditable } = require("../utils/auditLifecycle");

// Checklist sections/questions are shared across every audit cycle of a
// project+checklistType track, so a questionId/sectionId no longer maps to
// exactly one audit. The caller must say explicitly which cycle it's editing.
const resolveAuditId = async (req) => {
  if (req.body?.auditId) return req.body.auditId;
  if (req.params?.auditId) return req.params.auditId;

  return null;
};

const preventCompletedAuditEdit = async (req, res, next) => {
  if (req.user?.role !== "AUDITOR") return next();

  try {
    const auditId = await resolveAuditId(req);
    if (auditId) {
      await assertAuditEditable(auditId, req.user.id);
    }
    return next();
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "This completed audit is read-only.",
    });
  }
};

module.exports = { preventCompletedAuditEdit };
