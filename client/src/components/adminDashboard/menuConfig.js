import dashboardIcon from "../../assets/navbarIcons/dashboard_icon.svg";
import leaderboard from "../../assets/navbarIcons/leaderboard_icon.svg";
import project from "../../assets/navbarIcons/project_icon.svg";
import machinery from "../../assets/navbarIcons/machinery_icon.svg";
import auditor from "../../assets/navbarIcons/auditor_icon.svg";
import company from "../../assets/navbarIcons/company_icon.svg";
import checklist from "../../assets/navbarIcons/checklist_icon.svg";
import document from "../../assets/navbarIcons/document_icon.svg";
import operation from "../../assets/navbarIcons/operation_icon.svg";
import report from "../../assets/navbarIcons/reports_icon.svg";
import nc from "../../assets/navbarIcons/nc_icon.svg";

const STAGE_INFO = {
  1: "Companies and sites. Each site carries its own checklist, tools, manpower, users and proposed points, and is reviewed by Back-Admin before it goes live.",
  2: "The checklist library: edit checklists, import questions from Excel, and approve points auditors propose.",
  3: "Create, train, test and approve auditors before any assignment.",
  4: "Schedule visits, assign auditors and notify dealers.",
  5: "Run audits with geofenced, tamper-controlled evidence.",
  6: "Back-Admin checks scoring against evidence before release.",
  7: "Reports, dealer debrief and named sign-off.",
  8: "Track every finding to closure by priority.",
};

export function buildMenu({ basePath, isAdmin, isAuditor }) {
  // Sidebar follows the 8-stage process flow. Items marked `soon` are planned
  // screens that are not built yet; they render as disabled entries.
  const menu = (() => {
  const s = (label, icon) => ({ label, icon, soon: true });

  const dashboardItem = { icon: dashboardIcon, label: "Dashboard", link: basePath };
  const leaderboardItem = { icon: leaderboard, label: "Leaderboard", link: `${basePath}/rankings` };
  const awardsItem = { icon: leaderboard, label: "Awards & Certificates", link: `${basePath}/awards` };

  if (isAuditor) {
    return [
      dashboardItem,
      {
        label: "Auditor Onboarding",
        stage: 3,
        icon: auditor,
        isDropdown: true,
        children: [{ label: "Training & Quiz", icon: checklist, link: `${basePath}/training` }],
      },
      {
        label: "Scheduling",
        stage: 4,
        icon: document,
        isDropdown: true,
        children: [{ label: "Calendar", icon: document, link: `${basePath}/client-calendar` }],
      },
      {
        label: "Audit Execution",
        stage: 5,
        icon: operation,
        isDropdown: true,
        children: [{ label: "New Report", icon: report, link: `${basePath}/new-report` }],
      },
      {
        label: "Client Submission",
        stage: 7,
        icon: report,
        isDropdown: true,
        children: [{ label: "Reports", icon: report, link: `${basePath}/reports-hub` }],
      },
      {
        label: "Closure Tracking",
        stage: 8,
        icon: nc,
        isDropdown: true,
        children: [{ label: "NC & CAPA", icon: nc, link: `${basePath}/client-nc-capa` }],
      },
    ];
  }

  if (!isAdmin) {
    return [
      dashboardItem,
      leaderboardItem,
      awardsItem,
      {
        label: "Scheduling",
        stage: 4,
        icon: document,
        isDropdown: true,
        children: [{ label: "Calendar", icon: document, link: `${basePath}/client-calendar` }],
      },
      {
        label: "Client Submission",
        stage: 7,
        icon: report,
        isDropdown: true,
        children: [
          { label: "Reports", icon: report, link: `${basePath}/reports-hub` },
          { label: "Corrections", icon: document, link: `${basePath}/client-audit-reports` },
        ],
      },
      {
        label: "Closure Tracking",
        stage: 8,
        icon: nc,
        isDropdown: true,
        children: [
          { label: "NC & CAPA", icon: nc, link: `${basePath}/client-nc-capa` },
          { label: "Risk Register", icon: report, link: `${basePath}/risk-register` },
        ],
      },
      { label: "Help & Training", icon: checklist, link: `${basePath}/help` },
    ];
  }

  return [
    dashboardItem,
    leaderboardItem,
    awardsItem,
    {
      label: "Site Onboarding",
      stage: 1,
      icon: company,
      isDropdown: true,
      children: [
        { label: "Companies & Sites", icon: company, link: "/admin-dashboard/site-onboarding" },
        { label: "Review Queue", icon: report, link: "/admin-dashboard/site-onboarding/review" },
        { label: "Hierarchy", icon: project, link: "/admin-dashboard/hierarchy" },
        { label: "Change Requests", icon: document, link: "/admin-dashboard/site-change-requests" },
      ],
    },
    {
      label: "Checklist Configuration",
      stage: 2,
      icon: checklist,
      isDropdown: true,
      children: [
        { label: "Checklist Library", icon: checklist, link: "/admin-dashboard/client-checklist-designer" },
        { label: "Proposed Points", icon: checklist, link: "/admin-dashboard/checklist-proposals" },
      ],
    },
    {
      label: "Auditor Onboarding",
      stage: 3,
      icon: auditor,
      isDropdown: true,
      children: [
        { label: "Auditors", icon: auditor, link: "/admin-dashboard/auditor-onboarding" },
        { label: "Training Content", icon: checklist, link: "/admin-dashboard/training-content" },
        { label: "Reviews & Approvals", icon: report, link: "/admin-dashboard/approvals" },
        { label: "Instruments", icon: machinery, link: "/admin-dashboard/instruments" },
        { label: "Performance", icon: leaderboard, link: "/admin-dashboard/performance" },
      ],
    },
    {
      label: "Scheduling & Notification",
      stage: 4,
      icon: document,
      isDropdown: true,
      children: [
        { label: "Scheduling", icon: document, link: "/admin-dashboard/client-audit-scheduling" },
        { label: "Calendar", icon: document, link: "/admin-dashboard/client-calendar" },
        { label: "Notifications & Escalations", icon: nc, link: "/admin-dashboard/client-notices" },
      ],
    },
    {
      label: "Audit Execution",
      stage: 5,
      icon: operation,
      isDropdown: true,
      children: [
        { label: "New Report", icon: report, link: "/admin-dashboard/client-audit-scheduling?demo=1" },
        { label: "In Progress", icon: report, link: "/admin-dashboard/audits-in-progress" },
        s("Evidence Review", document),
      ],
    },
    {
      label: "QC Review",
      stage: 6,
      icon: report,
      isDropdown: true,
      children: [
        { label: "QC Queue", icon: report, link: "/admin-dashboard/qc" },
        { label: "Anomaly Flags", icon: nc, link: "/admin-dashboard/qc/anomalies" },
      ],
    },
    {
      label: "Client Submission",
      stage: 7,
      icon: report,
      isDropdown: true,
      children: [
        { label: "Reports", icon: report, link: "/admin-dashboard/reports-hub" },
        { label: "Corrections", icon: document, link: "/admin-dashboard/client-audit-reports" },
      ],
    },
    {
      label: "Closure Tracking",
      stage: 8,
      icon: nc,
      isDropdown: true,
      children: [
        { label: "NC & CAPA", icon: nc, link: "/admin-dashboard/client-nc-capa" },
        { label: "Risk Register", icon: report, link: "/admin-dashboard/risk-register" },
      ],
    },
    { label: "Access & Roles", icon: auditor, link: "/admin-dashboard/access" },
    { label: "Demo Portals", icon: dashboardIcon, link: "/admin-dashboard/demo-portals" },
    { label: "Help Content", icon: document, link: "/admin-dashboard/help-admin" },
    { label: "Help & Training", icon: checklist, link: "/admin-dashboard/help" },
  ];
  })();

  return menu.map((item) => {
    const n = item.stage;
    if (!n) return item;
    const landing =
      isAdmin && n === 1
        ? "/admin-dashboard/site-onboarding"
        : isAdmin && n === 3
          ? "/admin-dashboard/auditor-onboarding"
          : isAuditor && n === 3
            ? `${basePath}/training`
            : `${basePath}/stage/${n}`;
    return { ...item, stage: n, description: STAGE_INFO[n], landing };
  });
}
