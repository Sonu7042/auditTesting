// Starter content for the help centre. Back-Admin can edit all of it from the portal.
// The policy wording is a plain-language draft: have your legal adviser review it before you publish it to clients.
const CLIENT_ROLES = ["CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"];

const POLICIES = [
  { key: "TERMS", title: "Terms of use", audience: ["ALL"], sortOrder: 1, body: `## Using the Audit Portal
- The portal is provided for managing safety audits, reports and follow-up actions for the organisations that have been set up on it.
- You sign in with the username and one-time password you were given, then choose your own password. Keep it private; do not share your login.
- Use the portal only for the sites and work you are authorised for. Your access shows only your part of the network.
- Information you enter must be true and complete to the best of your knowledge.
- Misuse, attempts to bypass controls, or sharing access can lead to suspension of the account.

## Availability and changes
- We work to keep the portal available but cannot promise it will never be interrupted.
- We may update the portal and these terms. When we do, you will be asked to accept the new version.` },
  { key: "PRIVACY", title: "Privacy and data protection", audience: ["ALL"], sortOrder: 2, body: `## What we hold
- Account details (name, email, phone, role), audit records, photographs, GPS check-in locations, reports and the actions people take in the portal.

## Why
- To run audits, produce reports, track corrective actions, rank performance and keep the audit trail.

## Who sees it
- Only people whose role and site access allow it. Reports reach a dealer only after they are approved and issued.

## Your rights
- You can ask what we hold about you, ask for corrections, and ask questions about how it is used, through Help & Support.
- Auditor photographs and identity details appear on ID cards and verification pages; this is part of the authorised-auditor process.

## Security
- Passwords are stored in hashed form. Access is limited by role. Evidence is protected against tampering and every important action is recorded.` },
  { key: "CONFIDENTIALITY", title: "Confidentiality and acceptable use", audience: ["ALL"], sortOrder: 3, body: `- Audit findings, photographs and reports are confidential to the client and the audit team.
- Do not copy, forward, post or discuss reports outside the people who need them.
- Do not photograph or record anything unrelated to the audit.
- Report any suspected leak or lost device straight away through Help & Support.` },
  { key: "EVIDENCE", title: "Evidence and integrity policy", audience: ["AUDITOR", "ADMIN"], sortOrder: 4, body: `## Evidence rules
- Take photographs live in the audit screen. Photos must show the actual condition, not be staged, reused or edited.
- Check in at the site; your GPS location and the front-facade photograph are recorded.
- Each finding needs the minimum evidence the checklist asks for.

## Timelines
- Submit the report within 24 hours of finishing the audit. If you cannot (for example, no network), submit with the reason.

## Integrity
- Score honestly. Marking things compliant without checking, copying results, or pressuring a site is a serious breach and will be reviewed.` },
  { key: "CONDUCT", title: "Auditor code of conduct", audience: ["AUDITOR"], sortOrder: 5, body: `- Carry your ID card and authority letter on every visit and show them before you start.
- Be professional, courteous and impartial. Do not accept gifts, hospitality or favours from the site.
- Declare any conflict of interest before accepting an assignment.
- Follow the site's safety rules and use the required protective equipment.
- Keep what you see confidential. Share findings only through the portal report.
- Never take a photograph of people without a reason connected to the audit.` },
  { key: "CLIENT_USE", title: "Client user responsibilities", audience: CLIENT_ROLES, sortOrder: 6, body: `- Review issued reports promptly and plan the corrective actions (CAPA) for each finding within the closure targets.
- Upload honest evidence when you close an action. Closure is checked before it counts.
- Keep your site details, tools, manpower and contacts up to date.
- Give auditors access and cooperation on the visit day.` },
];

const GUIDES = {
  ADMIN: [
    { title: "Welcome, Back-Admin", text: "You run the audit programme from setup to closure. This quick tour shows the flow in eight steps. You can reopen it any time from Help & Training." },
    { title: "1. Companies and sites", text: "Add each company, then its sites. Every site carries its checklist, tools, manpower, users and proposed points. Import many sites at once from Excel; review and approve to make them live.", link: "site-onboarding" },
    { title: "2. Checklist library", text: "Edit the checklist, import questions from Excel and approve points that auditors propose.", link: "client-checklist-designer" },
    { title: "3. Auditors", text: "Create an auditor, send the one-time login, and check training, quiz and demo before approving. The approved auditor gets a photo ID card and authority letter.", link: "auditor-onboarding" },
    { title: "4. Schedule and notify", text: "Plan visits, assign auditors by skill, and notify the dealer. Reminders and escalations run on their own.", link: "client-audit-scheduling" },
    { title: "5-6. Execution and QC review", text: "Watch audits in progress, then check scoring against evidence in the QC queue before anything is released.", link: "qc" },
    { title: "7-8. Reports and closure", text: "Issue reports as PDF or Word, track findings to closure and keep the risk register current.", link: "reports-hub" },
    { title: "You are set", text: "Policies, training and support live under Help & Training. Open it whenever you need a reminder." },
  ],
  AUDITOR: [
    { title: "Welcome to the auditor portal", text: "Everything you need for field audits is here. This short tour covers the flow from training to submitting your report." },
    { title: "Training first", text: "Finish the training video, pass the quiz and complete the demo checklist. Back-Admin then approves you and issues your ID card.", link: "training" },
    { title: "Your ID card", text: "Your card and authority letter are under My ID. Carry them on every visit. Tap the card to see the other side.", link: "profile" },
    { title: "Your audits", text: "Assigned audits appear under New Audit. Open one, check in at the site (GPS and front-facade photo), then answer the checklist with photo evidence.", link: "new-report" },
    { title: "Submit within 24 hours", text: "Submit your report within 24 hours of finishing. If you cannot, you can still submit with a reason such as no network." },
    { title: "After submission", text: "QC may raise corrections. Fix them and resubmit. Findings the dealer must act on are tracked under NC & CAPA.", link: "client-nc-capa" },
  ],
  CLIENT: [
    { title: "Welcome", text: "This portal shows the safety audit performance of your part of the network, your reports, and the actions to close. A short tour follows." },
    { title: "Your dashboard", text: "Start at the top, then click down: network, zone, regional office, site. Each level shows scores, open critical findings and overdue actions." },
    { title: "Reports", text: "Issued reports are under Reports. Download each as PDF or Word, for one audit type or combined.", link: "reports-hub" },
    { title: "Close the findings", text: "Each finding has a priority and a closure target. Under NC & CAPA, record the corrective action with evidence; the auditor checks it before it closes.", link: "client-nc-capa" },
    { title: "Rankings and awards", text: "Sites, regions and zones are ranked on safety performance. Certificates are issued for the top performers each period.", link: "rankings" },
    { title: "Need help?", text: "Policies, training and support are under Help & Training." },
  ],
};

const T = (title, summary, audience, minutes, body, category = "GETTING_STARTED", sortOrder = 0) => ({ title, summary, audience, minutes, body, category, sortOrder, contentType: "ARTICLE" });
const TRAINING = [
  T("Getting started with the portal", "Sign in, choose your password and find your way around.", ["ALL"], 4, `## Signing in
- Use the username you were given (ten characters, like a PAN) or your email, and the one-time password.
- You are asked to choose your own password straight away. Use at least 8 characters with a letter and a number.
- If you forget it, ask Back-Admin to send new login details. There is no self-service reset.

## Finding your way
- The left menu follows the audit process from setup to closure. Open a group to see its pages.
- The bell shows notifications. Your profile menu has Change password, Help & Support and the theme (Warm, Dark, White or Auto).`, "GETTING_STARTED", 1),
  T("How an audit flows, step by step", "From scheduling to closure of findings, in eight steps.", ["ALL"], 6, `## The eight steps
1. Company and site set-up, with checklist, tools, manpower and users.
2. Checklist configuration, including points proposed by auditors.
3. Auditor onboarding: training, quiz, demo, approval, ID card.
4. Scheduling and notifying the dealer.
5. Audit execution with GPS check-in and photo evidence.
6. QC review of scoring against evidence.
7. Report issue, dealer debrief and sign-off.
8. Closure tracking of every finding by priority.

## Time limits to remember
- Auditors submit within 24 hours of finishing.
- QC review is expected within 48 hours of submission.`, "GETTING_STARTED", 2),
  T("Security basics", "Passwords, shared devices and what to do if something looks wrong.", ["ALL"], 3, `- Never share your login. Each person has their own.
- Log out on shared or borrowed devices.
- Do not forward reports to people who do not need them.
- If you lose a device or suspect someone used your login, raise a ticket in Help & Support straight away and ask for a password reset.`, "SECURITY", 3),
  T("Auditing with evidence: GPS, photos and timing", "What the auditor app records and why.", ["AUDITOR"], 7, `## At the site
- Check in at the site. Your GPS position and a front-facade photograph are recorded; they appear in the report.
- Each checklist item that needs evidence asks for photographs taken live in the app.

## Scoring
- Compliant, Non-compliant or Not applicable. For a finding, add the observation and recommendation, and close on the spot if it is fixed in front of you.

## Submission
- Submit within 24 hours. Late is allowed with a reason, and the reason is shown to QC.`, "AUDITING", 10),
  T("Proposing a new checklist point", "Spot a gap in the checklist? Propose it.", ["AUDITOR"], 3, `- During an audit, use Propose point on the checklist to describe the gap and attach a photo.
- Back-Admin reviews each proposal. If approved it joins the checklist for later audits.`, "AUDITING", 11),
  T("Reading your audit report", "Scores, risk levels and what each section means.", CLIENT_ROLES, 6, `- The Final Score is the share of applicable requirements met. Risk level: up to 25% High, up to 75% Medium, above 75% Low.
- Assessed Level: 0 non-compliance, 3 compliance, NA not applicable.
- Priority 1 findings are critical (fire scenario or missing mitigation), Priority 2 are legal or major gaps, Priority 3 are minor.
- Download the PDF to read, or the Word file to share and edit.`, "REPORTS", 20),
  T("Closing findings with CAPA", "Plan, act and prove it, within the closure targets.", CLIENT_ROLES, 5, `- Open NC & CAPA and choose a finding.
- Record the root cause, the corrective action and the preventive action, with a responsible person and a date.
- Upload evidence that it is fixed. The auditor checks it; when accepted the finding closes.
- Closure targets: Important & Urgent 2 weeks, Urgent 4-6 weeks, Important 1 quarter, the rest 6 months.`, "REPORTS", 21),
  T("QC review and approvals", "What to check before a report is issued.", ["ADMIN"], 6, `- Open the QC queue. Compare each score with the evidence photographs.
- Raise a correction when evidence is missing, blurred or does not match the answer.
- Approve only when every correction is accepted, then issue the report to the dealer.
- Any change after issue is recorded with comments so there is a full trail.`, "ADMIN", 30),
  T("Adding companies, sites and users", "How to set up a client and give people the right access.", ["ADMIN"], 6, `- Companies and Sites: add a company, then add sites one by one or import an Excel workbook.
- Every user gets a generated username and a one-time password. Give each person only the level they need: corporate, zone, regional office or site.
- Use Reset password when someone forgets theirs; it shows the new one-time password once.`, "ADMIN", 31),
];

module.exports = { POLICIES, GUIDES, TRAINING, CLIENT_ROLES };
