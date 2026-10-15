import { Link, useParams } from "react-router-dom";
import Header from "../adminDashboard/Header";
import { buildMenu } from "../adminDashboard/menuConfig";
import { PageTitle } from "./ui";

export default function StageLanding() {
  const { stageNo } = useParams();
  const role = localStorage.getItem("role");
  const isAdmin = role === "ADMIN";
  const isAuditor = role === "AUDITOR";
  const basePath = isAdmin ? "/admin-dashboard" : isAuditor ? "/auditor-dashboard" : "/user-dashboard";
  const group = buildMenu({ basePath, isAdmin, isAuditor }).find((item) => item.stage === Number(stageNo));

  if (!group) {
    return <div><Header /><p className="text-sm text-gray-500">This stage is not available for your role.</p></div>;
  }
  return (
    <div>
      <Header />
      <PageTitle title={group.label} subtitle={group.description} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {group.children.map((child) => {
          const body = (
            <>
              <img src={child.icon} alt="" className="h-7 w-7 invert-dark" />
              <h3 className="mt-4 text-base font-semibold text-[#20242c]">{child.label}</h3>
              <p className="mt-1 text-xs text-gray-500">{child.soon ? "Coming soon" : "Open"}</p>
            </>
          );
          return child.soon ? (
            <div key={child.label} className="cursor-not-allowed rounded-3xl bg-white p-5 opacity-50 shadow-[0_2px_6px_rgba(0,0,0,0.08)]">{body}</div>
          ) : (
            <Link key={child.label} to={child.link} className="rounded-3xl bg-white p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)]">{body}</Link>
          );
        })}
      </div>
    </div>
  );
}
