const express = require("express");
const cors = require("cors");
const http = require("http");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const companyRoutes = require("./routes/companyRoutes");
const clientProposalRoutes = require("./routes/clientProposalRoutes");
const governanceRoutes = require("./routes/governanceRoutes");
const clientQcRoutes = require("./routes/clientQcRoutes");
const auditorOnboardingRoutes = require("./routes/auditorOnboardingRoutes");
const clientAuditSetupRoutes = require("./routes/clientAuditSetupRoutes");
const clientAuditJobRoutes = require("./routes/clientAuditJobRoutes");
const clientAuditNcRoutes = require("./routes/clientAuditNcRoutes");
const clientAuditReportRoutes = require("./routes/clientAuditReportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const helpRoutes = require("./routes/helpRoutes");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");
const { initNotificationSocket } = require("./utils/notificationSocket");
const { startNoticeWorker } = require("./utils/auditNotices");

const app = express();
const server = http.createServer(app);
initNotificationSocket(server);

app.use(cors());
app.use(express.json({ limit: "3mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/client-audit-proposals", clientProposalRoutes);
app.use("/api/governance", governanceRoutes);
app.use("/api/client-qc", clientQcRoutes);
app.use("/api/auditor-onboarding", auditorOnboardingRoutes);
app.use("/api/client-audit-setup", clientAuditSetupRoutes);
app.use("/api/client-audit-jobs", clientAuditJobRoutes);
app.use("/api/client-audit-ncs", clientAuditNcRoutes);
app.use("/api/client-audit-reports", clientAuditReportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/site-change-requests", require("./routes/siteChangeRoutes"));
app.use("/api/admin-hub", require("./routes/adminHubRoutes"));
app.use("/api/projects", require("./routes/projectRoutes"));
app.use("/api/user-dashboard", require("./routes/userDashboardRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.send("Welcome to the Audit Portal API");
});

app.use(notFound);
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startNoticeWorker();
});