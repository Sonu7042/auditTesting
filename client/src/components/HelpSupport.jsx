import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import Header from "./adminDashboard/Header";

const panelContent = {
  ADMIN: {
    label: "Admin",
    dashboard: "/admin-dashboard",
    intro:
      "Manage companies, users, projects, audit schedules, approvals, and published reports.",
    guides: [
      {
        icon: Users,
        title: "Users and companies",
        text: "Create companies, add users, assign roles, and keep account details up to date.",
      },
      {
        icon: ClipboardCheck,
        title: "Projects and audits",
        text: "Create projects, prepare checklist templates, schedule audits, and assign auditors.",
      },
      {
        icon: ShieldCheck,
        title: "Approvals and reports",
        text: "Review submitted records, monitor non-compliances, and manage audit reports.",
      },
    ],
  },
  AUDITOR: {
    label: "Auditor",
    dashboard: "/auditor-dashboard",
    intro:
      "Access assigned audits, complete assessments, record evidence, and prepare reports.",
    guides: [
      {
        icon: ClipboardCheck,
        title: "Start an audit",
        text: "Open New Audit, select an assigned project, and begin the required assessment.",
      },
      {
        icon: FileText,
        title: "Evidence and findings",
        text: "Record observations, add supporting evidence, and raise non-compliances where needed.",
      },
      {
        icon: BookOpen,
        title: "Schedules and reports",
        text: "Check upcoming assignments and review reports from completed audit work.",
      },
    ],
  },
  USER: {
    label: "User",
    dashboard: "/user-dashboard",
    intro:
      "View project activity, maintain operational records, respond to audits, and track findings.",
    guides: [
      {
        icon: ClipboardCheck,
        title: "Audit schedule",
        text: "Review scheduled audits and make sure project information is ready before the visit.",
      },
      {
        icon: Users,
        title: "Operational records",
        text: "Maintain workforce, machinery, chemical, and document records for your site.",
      },
      {
        icon: FileText,
        title: "Reports and NCs",
        text: "Review audit reports, follow non-compliances, and track corrective actions.",
      },
    ],
  },
};

const commonQuestions = [
  {
    question: "Why is some information missing from my panel?",
    answer:
      "Check the selected company or project in the header. Your role and assigned projects also determine which records you can view.",
  },
  {
    question: "What should I do if a page does not refresh correctly?",
    answer:
      "Refresh the page once and try again. If the issue continues, sign out and sign back in so your permissions and latest project data are reloaded.",
  },
  {
    question: "Why can’t I open a feature?",
    answer:
      "Some features are limited by role. Confirm that you are signed in with the correct account and that an administrator has assigned the required access.",
  },
  {
    question: "How do I change the display theme?",
    answer:
      "Open your profile menu or use the sidebar Night Mode switch. Both controls stay synchronized.",
  },
];

const getRoleKey = () => {
  const role = localStorage.getItem("role");
  if (role === "ADMIN" || role === "AUDITOR") return role;
  return "USER";
};

export default function HelpSupport() {
  const navigate = useNavigate();
  const roleKey = getRoleKey();
  const content = panelContent[roleKey];
  const isAuditor = roleKey === "AUDITOR";
  const [openQuestion, setOpenQuestion] = useState(0);

  return (
    <>
      {!isAuditor && <Header />}

      <main className={isAuditor ? "pb-10 pt-8" : "pb-10 pt-6"}>
        <button
          type="button"
          onClick={() => navigate(content.dashboard)}
          className="inline-flex items-center gap-2 rounded-full border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#303030] shadow-sm transition hover:bg-[#f8f8f8]"
        >
          <ArrowLeft size={16} />
          Back to {content.label} dashboard
        </button>

        <section className="mt-5 overflow-hidden rounded-[28px] bg-[#181919] px-6 py-8 text-white shadow-[0_12px_30px_rgba(0,0,0,0.12)] md:px-8">
          <div className="flex max-w-3xl items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <LifeBuoy size={25} />
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/60">
                {content.label} panel
              </p>
              <h1 className="mt-2 text-[28px] font-semibold md:text-[34px]">
                Help & Support
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-white/75">
                {content.intro}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center gap-2">
            <BookOpen size={20} />
            <h2 className="text-[20px] font-semibold text-[#181919]">
              {content.label} quick guide
            </h2>
          </div>

          <div
            className={`mt-4 grid gap-4 ${
              isAuditor ? "grid-cols-1" : "md:grid-cols-3"
            }`}
          >
            {content.guides.map((guide) => {
              const Icon = guide.icon;

              return (
                <article
                  key={guide.title}
                  className="rounded-[22px] border border-[#e2e2e2] bg-white p-5 shadow-[0_4px_14px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef2ff] text-[#4f46e5]">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold text-[#181919]">
                    {guide.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#666]">
                    {guide.text}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-[#e2e2e2] bg-white p-5 shadow-[0_4px_14px_rgba(0,0,0,0.05)] md:p-6">
          <div className="flex items-center gap-2">
            <CircleHelp size={20} />
            <h2 className="text-[20px] font-semibold text-[#181919]">
              Common questions
            </h2>
          </div>

          <div className="mt-4 divide-y divide-[#e8e8e8]">
            {commonQuestions.map((item, index) => {
              const isOpen = openQuestion === index;

              return (
                <div key={item.question}>
                  <button
                    type="button"
                    onClick={() => setOpenQuestion(isOpen ? -1 : index)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[14px] font-semibold text-[#242424]">
                      {item.question}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <p className="pb-4 pr-8 text-[13px] leading-6 text-[#666]">
                      {item.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-4 rounded-[24px] border border-[#d9dcff] bg-[#f5f6ff] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-start gap-3">
            <RefreshCw size={20} className="mt-0.5 shrink-0 text-[#4f46e5]" />
            <div>
              <h2 className="text-[16px] font-semibold text-[#181919]">
                Still having trouble?
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-[#666]">
                Note the page, project, and action that caused the issue, then
                share those details with your portal administrator.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(content.dashboard)}
            className="shrink-0 rounded-full bg-[#181919] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-85"
          >
            Return to dashboard
          </button>
        </section>
      </main>
    </>
  );
}
