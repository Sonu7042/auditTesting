// import React, { useEffect, useState } from "react";
// import Login from "./components/Login";
// import SetPin from "./components/SetPin";
// import DemoLaunch from "./components/DemoLaunch";
// import DemoPortals from "./components/adminHub/DemoPortals";
// import ApprovalsInbox from "./components/adminHub/ApprovalsInbox";
// import HierarchyTree from "./components/adminHub/HierarchyTree";
// import InstrumentsRegister from "./components/adminHub/InstrumentsRegister";
// import AuditorPerformance from "./components/adminHub/AuditorPerformance";
// import SiteChangeRequests from "./components/adminHub/SiteChangeRequests";
// import TrainingContentAdmin from "./components/auditorOnboarding/TrainingContentAdmin";
// import {
//   BrowserRouter,
//   Routes,
//   Route,
//   Navigate,
//   useNavigate,
// } from "react-router-dom";
// import AdminLayout from "./components/adminDashboard/AdminLayout";
// import AuditorNotifications from "./components/adminDashboard/AuditorNotifications";
// import ChangePassword from "./components/ChangePassword";
// import { Toaster } from "react-hot-toast";
// import ConfirmProvider from "./components/common/ConfirmProvider";
// import toast from "react-hot-toast";
// import HelpCenter from "./components/help/HelpCenter";
// import HelpAdmin from "./components/help/HelpAdmin";
// import { applyTheme, getStoredTheme } from "./utils/theme";
// import SiteOnboarding from "./components/siteOnboarding/SiteOnboarding";
// import CompanySites from "./components/siteOnboarding/CompanySites";
// import SiteSetupWizard from "./components/siteOnboarding/SiteSetupWizard";
// import ReviewQueue from "./components/siteOnboarding/ReviewQueue";
// import AuditorCards from "./components/auditorOnboarding/AuditorCards";
// import AuditorDetail from "./components/auditorOnboarding/AuditorDetail";
// import AuditorTraining from "./components/auditorOnboarding/AuditorTraining";
// import MyProfile from "./components/auditorOnboarding/MyProfile";
// import AuditorJobs from "./components/auditFlow/AuditorJobs";
// import AuditRun from "./components/auditFlow/AuditRun";
// import ScheduleAudit from "./components/auditFlow/ScheduleAudit";
// import ClientCalendar from "./components/auditFlow/ClientCalendar";
// import NoticesLog from "./components/auditFlow/NoticesLog";
// import ChecklistProposals from "./components/auditFlow/ChecklistProposals";
// import SiteDetail from "./components/auditFlow/SiteDetail";
// import InProgress from "./components/auditFlow/InProgress";
// import QcQueue from "./components/auditFlow/QcQueue";
// import ReportDetail from "./components/auditFlow/ReportDetail";
// import ReportsHub from "./components/auditFlow/ReportsHub";
// import RiskRegister from "./components/auditFlow/RiskRegister";
// import NetworkDashboard from "./components/governance/NetworkDashboard";
// import Rankings from "./components/governance/Rankings";
// import Awards from "./components/governance/Awards";
// import AccessControl from "./components/governance/AccessControl";
// import VerifyCertificate from "./components/governance/VerifyCertificate";
// import VerifyAuditor from "./components/governance/VerifyAuditor";
// import StageLanding from "./components/siteOnboarding/StageLanding";
// import ClientChecklistDesigner from "./components/clientSetup/ClientChecklistDesigner";
// import ClientNcCapaDashboard from "./components/clientSetup/ClientNcCapaDashboard";
// import ClientAuditReports from "./components/clientSetup/ClientAuditReports";

// const ThemeFloatingToggle = () => null;

// const AuthExpiredRedirect = () => {
//   const navigate = useNavigate();

//   useEffect(() => {
//     const handleAuthExpired = () => {
//       navigate("/", { replace: true });
//     };

//     window.addEventListener("auth-expired", handleAuthExpired);
//     return () => window.removeEventListener("auth-expired", handleAuthExpired);
//   }, [navigate]);

//   return null;
// };

// const ToastAlertBridge = () => {
//   useEffect(() => {
//     const nativeAlert = window.alert;

//     window.alert = (message) => {
//       const text = String(message || "");
//       const normalized = text.toLowerCase();

//       if (
//         normalized.includes("success") ||
//         normalized.includes("created") ||
//         normalized.includes("updated") ||
//         normalized.includes("uploaded") ||
//         normalized.includes("added") ||
//         normalized.includes("sent")
//       ) {
//         toast.success(text, { id: `success-${text}` });
//         return;
//       }

//       if (
//         normalized.includes("failed") ||
//         normalized.includes("error") ||
//         normalized.includes("wrong") ||
//         normalized.includes("invalid") ||
//         normalized.includes("denied") ||
//         normalized.includes("cannot") ||
//         normalized.includes("unable") ||
//         normalized.includes("please")
//       ) {
//         toast.error(text, { id: `error-${text}` });
//         return;
//       }

//       toast(text, { id: `info-${text}` });
//     };

//     return () => {
//       window.alert = nativeAlert;
//     };
//   }, []);

//   return null;
// };

// const USER_ROLES = ["SITE_USER", "SITE_INCHARGE", "CORPORATE_MANAGER", "REGIONAL_MANAGER", "ZONAL_MANAGER"];

// const getDashboardPath = () => {
//   const role = localStorage.getItem("role");
//   if (role === "ADMIN") return "/admin-dashboard";
//   if (role === "AUDITOR") return "/auditor-dashboard";
//   return "/user-dashboard";
// };

// const PublicRoute = ({ children }) => {
//   const token = localStorage.getItem("token");
//   const pin = sessionStorage.getItem("devicePin");

//   if (token && pin) {
//     return <Navigate to={getDashboardPath()} replace />;
//   }

//   if (token) {
//     return <Navigate to="/set-pin" replace />;
//   }

//   return children;
// };

// const PinRoute = ({ children }) => {
//   const token = localStorage.getItem("token");
//   const pin = sessionStorage.getItem("devicePin");

//   if (!token) {
//     return <Navigate to="/" replace />;
//   }

//   if (pin) {
//     return <Navigate to={getDashboardPath()} replace />;
//   }

//   return children;
// };

// const ProtectedRoute = ({ children, allowedRoles }) => {
//   const token = localStorage.getItem("token");
//   const pin = sessionStorage.getItem("devicePin");
//   const role = localStorage.getItem("role");

//   if (!token) {
//     return <Navigate to="/" replace />;
//   }

//   if (!pin) {
//     return <Navigate to="/set-pin" replace />;
//   }

//   if (allowedRoles && !allowedRoles.includes(role)) {
//     return <Navigate to={getDashboardPath()} replace />;
//   }

//   return children;
// };

// const App = () => {
//   const [theme, setTheme] = useState(getStoredTheme);

//   useEffect(() => {
//     applyTheme(theme);
//   }, [theme]);

//   useEffect(() => {
//     const handleThemeChange = (event) => {
//       setTheme(event.detail?.theme || getStoredTheme());
//     };

//     window.addEventListener("themeChanged", handleThemeChange);
//     return () => window.removeEventListener("themeChanged", handleThemeChange);
//   }, []);

//   return (
//     <BrowserRouter>
//       <ConfirmProvider>
//       <Toaster position="bottom-right" reverseOrder={false} />
//       <AuthExpiredRedirect />
//       <ToastAlertBridge />
//       <ThemeFloatingToggle />
//       <Routes>
//         <Route
//           path="/"
//           element={
//             <PublicRoute>
//               <Login />
//             </PublicRoute>
//           }
//         />
//         <Route path="/demo-launch" element={<DemoLaunch />} />
//         <Route path="/verify/:code" element={<VerifyCertificate />} />
//         <Route path="/verify-auditor/:code" element={<VerifyAuditor />} />
//         <Route
//           path="/set-pin"
//           element={
//             <PinRoute>
//               <SetPin />
//             </PinRoute>
//           }
//         />
//         <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
//           <Route index element={<NetworkDashboard />} />
//           <Route path="site/:locationId" element={<SiteDetail />} />
//           <Route path="stage/:stageNo" element={<StageLanding />} />
//           <Route path="change-password" element={<ChangePassword />} />
//           <Route path="help" element={<HelpCenter />} />
//           <Route path="help-support" element={<HelpCenter />} />
//           <Route path="site-onboarding" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteOnbdevoarding /></ProtectedRoute>} />
//           <Route path="site-onboarding/review" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReviewQueue /></ProtectedRoute>} />
//           <Route path="site-onboarding/request/:requestId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteSetupWizard /></ProtectedRoute>} />
//           <Route path="site-onboarding/:companyId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><CompanySites /></ProtectedRoute>} />
//           <Route path="auditor-onboarding" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorCards /></ProtectedRoute>} />
//           <Route path="auditor-onboarding/:userId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorDetail /></ProtectedRoute>} />
//           <Route path="demo-portals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><DemoPortals /></ProtectedRoute>} />
//           <Route path="approvals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ApprovalsInbox /></ProtectedRoute>} />
//           <Route path="hierarchy" element={<ProtectedRoute allowedRoles={["ADMIN"]}><HierarchyTree /></ProtectedRoute>} />
//           <Route path="instruments" element={<ProtectedRoute allowedRoles={["ADMIN"]}><InstrumentsRegister /></ProtectedRoute>} />
//           <Route path="performance" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorPerformance /></ProtectedRoute>} />
//           <Route path="site-change-requests" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteChangeRequests /></ProtectedRoute>} />
//           <Route path="training-content" element={<ProtectedRoute allowedRoles={["ADMIN"]}><TrainingContentAdmin /></ProtectedRoute>} />
//           <Route path="help-admin" element={<ProtectedRoute allowedRoles={["ADMIN"]}><HelpAdmin /></ProtectedRoute>} />
//           <Route path="client-checklist-designer" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientChecklistDesigner /></ProtectedRoute>} />
//           <Route path="client-audit-scheduling" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ScheduleAudit /></ProtectedRoute>} />
//           <Route path="client-calendar" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientCalendar /></ProtectedRoute>} />
//           <Route path="client-notices" element={<ProtectedRoute allowedRoles={["ADMIN"]}><NoticesLog /></ProtectedRoute>} />
//           <Route path="checklist-proposals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ChecklistProposals /></ProtectedRoute>} />
//           <Route path="audits-in-progress" element={<ProtectedRoute allowedRoles={["ADMIN"]}><InProgress /></ProtectedRoute>} />
//           <Route path="qc" element={<ProtectedRoute allowedRoles={["ADMIN"]}><QcQueue /></ProtectedRoute>} />
//           <Route path="qc/anomalies" element={<ProtectedRoute allowedRoles={["ADMIN"]}><QcQueue anomaliesOnly /></ProtectedRoute>} />
//           <Route path="qc/report/:reportId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReportDetail base="/admin-dashboard/qc" /></ProtectedRoute>} />
//           <Route path="reports-hub" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReportsHub /></ProtectedRoute>} />
//           <Route path="rankings" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Rankings /></ProtectedRoute>} />
//           <Route path="awards" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Awards /></ProtectedRoute>} />
//           <Route path="access" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AccessControl /></ProtectedRoute>} />
//           <Route path="risk-register" element={<ProtectedRoute allowedRoles={["ADMIN"]}><RiskRegister /></ProtectedRoute>} />
//           <Route path="client-nc-capa" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientNcCapaDashboard /></ProtectedRoute>} />
//           <Route path="client-audit-reports" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientAuditReports /></ProtectedRoute>} />
//         </Route>

//         <Route path="/user-dashboard" element={<ProtectedRoute allowedRoles={USER_ROLES}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
//           <Route index element={<NetworkDashboard />} />
//           <Route path="site/:locationId" element={<SiteDetail />} />
//           <Route path="stage/:stageNo" element={<StageLanding />} />
//           <Route path="change-password" element={<ChangePassword />} />
//           <Route path="help" element={<HelpCenter />} />
//           <Route path="help-support" element={<HelpCenter />} />
//           <Route path="client-calendar" element={<ClientCalendar />} />
//           <Route path="reports-hub" element={<ReportsHub />} />
//           <Route path="reports-hub/:reportId" element={<ReportDetail base="/user-dashboard/reports-hub" />} />
//           <Route path="rankings" element={<Rankings />} />
//           <Route path="awards" element={<Awards />} />
//           <Route path="risk-register" element={<RiskRegister />} />
//           <Route path="client-nc-capa" element={<ClientNcCapaDashboard />} />
//           <Route path="client-audit-reports" element={<ClientAuditReports />} />
//         </Route>

//         <Route path="/auditor-dashboard" element={<ProtectedRoute allowedRoles={["AUDITOR"]}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
//           <Route index element={<AuditorJobs />} />
//           <Route path="stage/:stageNo" element={<StageLanding />} />
//           <Route path="change-password" element={<ChangePassword />} />
//           <Route path="help" element={<HelpCenter />} />
//           <Route path="help-support" element={<HelpCenter />} />
//           <Route path="training" element={<AuditorTraining />} />
//           <Route path="profile" element={<MyProfile />} />
//           <Route path="new-report" element={<AuditorJobs />} />
//           <Route path="audit/:jobId" element={<AuditRun />} />
//           <Route path="notifications" element={<AuditorNotifications />} />
//           <Route path="client-calendar" element={<ClientCalendar />} />
//           <Route path="reports-hub" element={<ReportsHub />} />
//           <Route path="reports-hub/:reportId" element={<ReportDetail base="/auditor-dashboard/reports-hub" />} />
//           <Route path="client-nc-capa" element={<ClientNcCapaDashboard />} />
//         </Route>

//         <Route path="*" element={<Navigate to="/" replace />} />
//       </Routes>
//       </ConfirmProvider>
//     </BrowserRouter>
//   );
// };

// export default App;



import React, { useEffect, useState } from "react";
import Login from "./components/Login";
import SetPin from "./components/SetPin";
import DemoLaunch from "./components/DemoLaunch";
import DemoPortals from "./components/adminHub/DemoPortals";
import ApprovalsInbox from "./components/adminHub/ApprovalsInbox";
import HierarchyTree from "./components/adminHub/HierarchyTree";
import InstrumentsRegister from "./components/adminHub/InstrumentsRegister";
import AuditorPerformance from "./components/adminHub/AuditorPerformance";
import SiteChangeRequests from "./components/adminHub/SiteChangeRequests";
import TrainingContentAdmin from "./components/auditorOnboarding/TrainingContentAdmin";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import AdminLayout from "./components/adminDashboard/AdminLayout";
import AuditorNotifications from "./components/adminDashboard/AuditorNotifications";
import ChangePassword from "./components/ChangePassword";
import { Toaster } from "react-hot-toast";
import ConfirmProvider from "./components/common/ConfirmProvider";
import toast from "react-hot-toast";
import HelpCenter from "./components/help/HelpCenter";
import HelpAdmin from "./components/help/HelpAdmin";
import { applyTheme, getStoredTheme } from "./utils/theme";
import SiteOnboarding from "./components/siteOnboarding/SiteOnboarding";
import CompanySites from "./components/siteOnboarding/CompanySites";
import SiteSetupWizard from "./components/siteOnboarding/SiteSetupWizard";
import ReviewQueue from "./components/siteOnboarding/ReviewQueue";
import AuditorCards from "./components/auditorOnboarding/AuditorCards";
import AuditorDetail from "./components/auditorOnboarding/AuditorDetail";
import AuditorTraining from "./components/auditorOnboarding/AuditorTraining";
import MyProfile from "./components/auditorOnboarding/MyProfile";
import AuditorJobs from "./components/auditFlow/AuditorJobs";
import AuditRun from "./components/auditFlow/AuditRun";
import ScheduleAudit from "./components/auditFlow/ScheduleAudit";
import ClientCalendar from "./components/auditFlow/ClientCalendar";
import NoticesLog from "./components/auditFlow/NoticesLog";
import ChecklistProposals from "./components/auditFlow/ChecklistProposals";
import SiteDetail from "./components/auditFlow/SiteDetail";
import InProgress from "./components/auditFlow/InProgress";
import QcQueue from "./components/auditFlow/QcQueue";
import ReportDetail from "./components/auditFlow/ReportDetail";
import ReportsHub from "./components/auditFlow/ReportsHub";
import RiskRegister from "./components/auditFlow/RiskRegister";
import NetworkDashboard from "./components/governance/NetworkDashboard";
import Rankings from "./components/governance/Rankings";
import Awards from "./components/governance/Awards";
import AccessControl from "./components/governance/AccessControl";
import VerifyCertificate from "./components/governance/VerifyCertificate";
import VerifyAuditor from "./components/governance/VerifyAuditor";
import StageLanding from "./components/siteOnboarding/StageLanding";
import ClientChecklistDesigner from "./components/clientSetup/ClientChecklistDesigner";
import ClientNcCapaDashboard from "./components/clientSetup/ClientNcCapaDashboard";
import ClientAuditReports from "./components/clientSetup/ClientAuditReports";

const ThemeFloatingToggle = () => null;

const AuthExpiredRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthExpired = () => {
      navigate("/", { replace: true });
    };

    window.addEventListener("auth-expired", handleAuthExpired);
    return () => window.removeEventListener("auth-expired", handleAuthExpired);
  }, [navigate]);

  return null;
};

const ToastAlertBridge = () => {
  useEffect(() => {
    const nativeAlert = window.alert;

    window.alert = (message) => {
      const text = String(message || "");
      const normalized = text.toLowerCase();

      if (
        normalized.includes("success") ||
        normalized.includes("created") ||
        normalized.includes("updated") ||
        normalized.includes("uploaded") ||
        normalized.includes("added") ||
        normalized.includes("sent")
      ) {
        toast.success(text, { id: `success-${text}` });
        return;
      }

      if (
        normalized.includes("failed") ||
        normalized.includes("error") ||
        normalized.includes("wrong") ||
        normalized.includes("invalid") ||
        normalized.includes("denied") ||
        normalized.includes("cannot") ||
        normalized.includes("unable") ||
        normalized.includes("please")
      ) {
        toast.error(text, { id: `error-${text}` });
        return;
      }

      toast(text, { id: `info-${text}` });
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  return null;
};

const USER_ROLES = ["SITE_USER", "SITE_INCHARGE", "CORPORATE_MANAGER", "REGIONAL_MANAGER", "ZONAL_MANAGER"];

const getDashboardPath = () => {
  const role = localStorage.getItem("role");
  if (role === "ADMIN") return "/admin-dashboard";
  if (role === "AUDITOR") return "/auditor-dashboard";
  return "/user-dashboard";
};

const PublicRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const pin = sessionStorage.getItem("devicePin");

  if (token && pin) {
    return <Navigate to={getDashboardPath()} replace />;
  }

  if (token) {
    return <Navigate to="/set-pin" replace />;
  }

  return children;
};

const PinRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const pin = sessionStorage.getItem("devicePin");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (pin) {
    return <Navigate to={getDashboardPath()} replace />;
  }

  return children;
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const pin = sessionStorage.getItem("devicePin");
  const role = localStorage.getItem("role");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (!pin) {
    return <Navigate to="/set-pin" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={getDashboardPath()} replace />;
  }

  return children;
};

const App = () => {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = (event) => {
      setTheme(event.detail?.theme || getStoredTheme());
    };

    window.addEventListener("themeChanged", handleThemeChange);
    return () => window.removeEventListener("themeChanged", handleThemeChange);
  }, []);

  return (
    <BrowserRouter>
      <ConfirmProvider>
      <Toaster position="bottom-right" reverseOrder={false} />
      <AuthExpiredRedirect />
      <ToastAlertBridge />
      <ThemeFloatingToggle />
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route path="/demo-launch" element={<DemoLaunch />} />
        <Route path="/verify/:code" element={<VerifyCertificate />} />
        <Route path="/verify-auditor/:code" element={<VerifyAuditor />} />
        <Route
          path="/set-pin"
          element={
            <PinRoute>
              <SetPin />
            </PinRoute>
          }
        />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
          <Route index element={<NetworkDashboard />} />
          <Route path="site/:locationId" element={<SiteDetail />} />
          <Route path="stage/:stageNo" element={<StageLanding />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="help-support" element={<HelpCenter />} />
          <Route path="site-onboarding" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteOnboarding /></ProtectedRoute>} />
          <Route path="site-onboarding/review" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReviewQueue /></ProtectedRoute>} />
          <Route path="site-onboarding/request/:requestId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteSetupWizard /></ProtectedRoute>} />
          <Route path="site-onboarding/:companyId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><CompanySites /></ProtectedRoute>} />
          <Route path="auditor-onboarding" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorCards /></ProtectedRoute>} />
          <Route path="auditor-onboarding/:userId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorDetail /></ProtectedRoute>} />
          <Route path="demo-portals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><DemoPortals /></ProtectedRoute>} />
          <Route path="approvals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ApprovalsInbox /></ProtectedRoute>} />
          <Route path="hierarchy" element={<ProtectedRoute allowedRoles={["ADMIN"]}><HierarchyTree /></ProtectedRoute>} />
          <Route path="instruments" element={<ProtectedRoute allowedRoles={["ADMIN"]}><InstrumentsRegister /></ProtectedRoute>} />
          <Route path="performance" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AuditorPerformance /></ProtectedRoute>} />
          <Route path="site-change-requests" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SiteChangeRequests /></ProtectedRoute>} />
          <Route path="training-content" element={<ProtectedRoute allowedRoles={["ADMIN"]}><TrainingContentAdmin /></ProtectedRoute>} />
          <Route path="help-admin" element={<ProtectedRoute allowedRoles={["ADMIN"]}><HelpAdmin /></ProtectedRoute>} />
          <Route path="client-checklist-designer" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientChecklistDesigner /></ProtectedRoute>} />
          <Route path="client-audit-scheduling" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ScheduleAudit /></ProtectedRoute>} />
          <Route path="client-calendar" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientCalendar /></ProtectedRoute>} />
          <Route path="client-notices" element={<ProtectedRoute allowedRoles={["ADMIN"]}><NoticesLog /></ProtectedRoute>} />
          <Route path="checklist-proposals" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ChecklistProposals /></ProtectedRoute>} />
          <Route path="audits-in-progress" element={<ProtectedRoute allowedRoles={["ADMIN"]}><InProgress /></ProtectedRoute>} />
          <Route path="qc" element={<ProtectedRoute allowedRoles={["ADMIN"]}><QcQueue /></ProtectedRoute>} />
          <Route path="qc/anomalies" element={<ProtectedRoute allowedRoles={["ADMIN"]}><QcQueue anomaliesOnly /></ProtectedRoute>} />
          <Route path="qc/report/:reportId" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReportDetail base="/admin-dashboard/qc" /></ProtectedRoute>} />
          <Route path="reports-hub" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ReportsHub /></ProtectedRoute>} />
          <Route path="rankings" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Rankings /></ProtectedRoute>} />
          <Route path="awards" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Awards /></ProtectedRoute>} />
          <Route path="access" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AccessControl /></ProtectedRoute>} />
          <Route path="risk-register" element={<ProtectedRoute allowedRoles={["ADMIN"]}><RiskRegister /></ProtectedRoute>} />
          <Route path="client-nc-capa" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientNcCapaDashboard /></ProtectedRoute>} />
          <Route path="client-audit-reports" element={<ProtectedRoute allowedRoles={["ADMIN"]}><ClientAuditReports /></ProtectedRoute>} />
        </Route>

        <Route path="/user-dashboard" element={<ProtectedRoute allowedRoles={USER_ROLES}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
          <Route index element={<NetworkDashboard />} />
          <Route path="site/:locationId" element={<SiteDetail />} />
          <Route path="stage/:stageNo" element={<StageLanding />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="help-support" element={<HelpCenter />} />
          <Route path="client-calendar" element={<ClientCalendar />} />
          <Route path="reports-hub" element={<ReportsHub />} />
          <Route path="reports-hub/:reportId" element={<ReportDetail base="/user-dashboard/reports-hub" />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="awards" element={<Awards />} />
          <Route path="risk-register" element={<RiskRegister />} />
          <Route path="client-nc-capa" element={<ClientNcCapaDashboard />} />
          <Route path="client-audit-reports" element={<ClientAuditReports />} />
        </Route>

        <Route path="/auditor-dashboard" element={<ProtectedRoute allowedRoles={["AUDITOR"]}><AdminLayout theme={theme} setTheme={setTheme} /></ProtectedRoute>}>
          <Route index element={<AuditorJobs />} />
          <Route path="stage/:stageNo" element={<StageLanding />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="help" element={<HelpCenter />} />
          <Route path="help-support" element={<HelpCenter />} />
          <Route path="training" element={<AuditorTraining />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="new-report" element={<AuditorJobs />} />
          <Route path="audit/:jobId" element={<AuditRun />} />
          <Route path="notifications" element={<AuditorNotifications />} />
          <Route path="client-calendar" element={<ClientCalendar />} />
          <Route path="reports-hub" element={<ReportsHub />} />
          <Route path="reports-hub/:reportId" element={<ReportDetail base="/auditor-dashboard/reports-hub" />} />
          <Route path="client-nc-capa" element={<ClientNcCapaDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ConfirmProvider>
    </BrowserRouter>
  );
};

export default App;