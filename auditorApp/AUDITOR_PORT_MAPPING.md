# Auditor Web → Native Mapping

This inventory is derived from `client/src/App.jsx` and `client/src/components/auditorDashboard`. The web implementation remains the behavioral and visual source of truth.

| Web component/route | Existing API dependencies | Native target |
|---|---|---|
| `AuditorDashboard` `/auditor-dashboard` | schedules, audit reports | `DashboardScreen` |
| `AuditorSechule` `/schedule` | schedules | `ScheduleScreen` |
| `ProjectSelection` `/projectSelection` | projects, timer get/start, reports, re-audit | `ProjectSelectionScreen` |
| `StartAudit` `/startAudit` | reports, timer get/start/update | `AuditOverviewScreen` + timer hook |
| `AuditAssessment` `/auditAssessment` | report, progress, timer, signature/report save | `AssessmentScreen` feature shell |
| `PreviousNcReview*` | previous-NC get/update and closure multipart | `PreviousNC` feature |
| `PreventiveManagement/Questions/Plan` | checklist, previous NC, project-checklist mutations, question responses | `Checklist` feature |
| `ComplianceUp`, `NonComplianceDown*` | multipart audit question response | reusable response editor |
| `AuditWorkForce`, `NonComplianceForm`, `WorkforceNonCompliances` | workers, workforce NC list/create/action evidence, progress | `Workforce` feature |
| `AuditMachinery`, machinery NC screens | machinery, verification, NC list/create/action evidence, progress | `Machinery` feature |
| `AuditChemical`, chemical NC screens | chemicals, verification, NC list/create/action evidence, progress | `Chemicals` feature |
| `VisitSheet` | report upsert, signature save/delete, checklist/report reads | `VisitSheet` and `Signature` features |
| `AuditorReports` `/Reports` | audit reports and downloads | `ReportsScreen` |
| `AuditorNotifications` `/notifications` | unread/history/read/read-all/delete + Socket.IO | `NotificationsScreen` + provider |
| `AuditorUpdates` `/ncTracker` | timer, operational resources, documents, projects, next-audit selections | `Updates` feature |

## Storage translation

JWT is stored in iOS Keychain/Android Keystore through `react-native-keychain`. User and selected project/audit context use a centralized AsyncStorage adapter. Screens never access native storage directly.

## API compatibility rules

- Base paths, JSON bodies, status strings, IDs, and multipart field names remain unchanged.
- Android emulator development uses `10.0.2.2`; iOS simulator uses `localhost`.
- Backend timer state is authoritative. Foreground restoration must refetch timer state.
- Completed-report edit locking remains enforced by the existing backend.

## Delivery status

The bare native foundation, authentication, secure storage, typed navigation, dashboard, schedule, report list, notification list, project/audit selection, re-audit decision, timer start, assessment/checklist, previous-NC review, workforce/machinery/chemical NC, visit sheet, documents, and `AuditorUpdates`/`ncTracker` ("Update") are implemented. The persistent hamburger sidebar (`AuditorHeader`, matching the web `AuditorHeader` component: Home, New Audit, Reports, Schedule, Update + bell + profile menu) is shared across Dashboard, Project Selection, Reports, Schedule, Notifications, and Updates, mirroring the web `AdminLayout` auditor chrome. The notification bell badge and Socket.IO `notifications:new` live updates are wired through `NotificationContext`.

`ScheduleScreen` now matches the web `AuditorSechule` feature set: the Monthly Audit Load card, List/Calendar toggle, month-navigable calendar grid (scheduled days highlighted), and the expandable Upcoming Schedule cards (audit type, total/remaining timeline, assigned auditors). `ReportHistoryScreen` matches `AuditorReports`: numbered cards with company/project/audit-cycle, Excel/Word/Open-NC downloads (via `react-native-fs` + `react-native-share`), the visited-report checkmark, and the Visit Date/Date Closed/Non-Compliance/Status grid, opening the same read-only `Assessment` view as the web `auditAssessment` route.

Not yet ported: the persistent header is not applied inside the deep audit-workflow screens (`AuditOverview`, `Assessment`, `ControlMeasures`, `ChecklistResponse`, `Documents`, `AssetVerification`, `VisitSheet`, `PreviousNcReview`), which keep native back-button headers instead, matching a mobile wizard pattern rather than the web's always-visible sidebar. The Monthly Audit Load card and gradients elsewhere use a flat brand-blue fill rather than a true CSS gradient (no gradient library is installed). No backend or web files are replaced.
