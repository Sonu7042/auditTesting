import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass } from "../siteOnboarding/ui";
import { SKILL_LABELS, STATUS_META, TAG_META } from "../auditorOnboarding/meta";

// How each auditor is doing: the rolling score from the last three QC reviews decides whether they can be planned
// (80+ eligible, 60-79 needs retraining, below 60 cannot be planned). Certification expiry shows who is due a refresher.
export default function AuditorPerformance() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    axios
      .get(`${domain}/admin-hub/performance`)
      .then(({ data: d }) => setData(d));
  }, []);
  if (!data)
    return (
      <div>
        <Header />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  const t = data.totals;

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Auditor Onboarding" }, { label: "Performance" }]}
        title="Auditor performance"
        subtitle="Scores come from QC reviews of each audit. They decide who can be planned."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Auditors", t.auditors],
          ["Eligible (80+)", t.eligible],
          ["Retraining (60-79)", t.retrain],
          ["Cannot plan (<60)", t.blocked],
          ["Refresher due", t.refresherDue],
        ].map(([label, n]) => (
          <div
            key={label}
            className="rounded-2xl bg-white p-4 shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
          >
            <div className="text-2xl font-semibold">{n}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>
      <section className={cardClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2">Auditor</th>
                <th>Status</th>
                <th>Skills</th>
                <th>Score</th>
                <th>Trend</th>
                <th>Audits</th>
                <th>Quiz attempts</th>
                <th>Certification</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-[#eef0f3] hover:bg-[#f7f8fa]"
                  onClick={() =>
                    navigate(`/admin-dashboard/auditor-onboarding/${r.id}`)
                  }
                >
                  <td className="py-2 font-medium">{r.name}</td>
                  <td>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${(STATUS_META[r.status] || STATUS_META.LEGACY).cls}`}
                    >
                      {(STATUS_META[r.status] || STATUS_META.LEGACY).label}
                    </span>
                  </td>
                  <td className="max-w-[200px] text-xs">
                    {r.skills.map((s) => SKILL_LABELS[s] || s).join(", ") ||
                      "—"}
                  </td>
                  <td>
                    {r.score === null ? (
                      "—"
                    ) : (
                      <span className="flex items-center gap-2">
                        <b>{r.score}%</b>
                        {r.tag && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${TAG_META[r.tag].cls}`}
                          >
                            {TAG_META[r.tag].label}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="w-28">
                    {r.lastScores.length > 1 ? (
                      <div className="h-8 w-24">
                        <ResponsiveContainer>
                          <LineChart data={r.lastScores}>
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#287a37"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Not enough reviews
                      </span>
                    )}
                  </td>
                  <td>{r.auditsDone}</td>
                  <td>{r.quizAttempts}</td>
                  <td className="whitespace-nowrap text-xs">
                    {r.certificationExpiresAt
                      ? new Date(r.certificationExpiresAt).toLocaleDateString(
                          "en-IN",
                        )
                      : "—"}
                    {r.refresher === "DUE" && (
                      <span className="ml-2 rounded-full bg-[#fff3e0] px-2 py-0.5 text-[#9a5200]">
                        Refresher due
                      </span>
                    )}
                    {r.refresher === "EXPIRED" && (
                      <span className="ml-2 rounded-full bg-[#fdecec] px-2 py-0.5 text-[#b42318]">
                        Expired
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
