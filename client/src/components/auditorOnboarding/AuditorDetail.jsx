import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { Field, Modal, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { SKILL_LABELS, STATUS_META, TAG_META } from "./meta";
import { Pill, ScoreRing } from "./shared";
import AuditorIdCard, { PhotoUpload } from "./AuditorIdCard";

const STEPS = ["Created", "Training & quiz", "Back-Admin review", "Approval"];
const completedSteps = (status) => ({ CREATED: 1, TRAINING: 1, RETRAINING: 1, UNDER_REVIEW: 2, AWAITING_APPROVAL: 3, APPROVED: 4, REJECTED: 3 }[status] ?? 0);
const RESULT_LABEL = { OK: "OK", NOT_OK: "Not OK", NA: "N/A" };

const CHANGE_LABELS = { fullName: "Name", phone: "Phone", emergencyContact: "Emergency contact", dateOfBirth: "Date of birth", baseLocation: "Base location", photo: "Photo" };

export default function AuditorDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewForm, setReviewForm] = useState({ demoScore: "", remarks: "" });
  const [reason, setReason] = useState("");
  const [auditScore, setAuditScore] = useState({ score: "", reference: "" });
  const [field, setField] = useState({ backgroundVerified: false, shadowAuditsCompleted: 0, authorityLetterNumber: "", certificationExpiresAt: "" });
  const [creds, setCreds] = useState(null);
  const [cardKey, setCardKey] = useState(0);
  const { confirm, ask } = useConfirm();

  const load = useCallback(async () => {
    const { data } = await axios.get(`${domain}/auditor-onboarding/${userId}`);
    setD(data);
    const q = data.qualification;
    if (q) setField({ backgroundVerified: q.backgroundVerified, shadowAuditsCompleted: q.shadowAuditsCompleted, authorityLetterNumber: q.authorityLetterNumber || "", certificationExpiresAt: q.certificationExpiresAt ? q.certificationExpiresAt.slice(0, 10) : "" });
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const call = async (path, body = {}, method = "post") => {
    const name = d?.auditor?.fullName || "this auditor";
    const gates = {
      "resend-credentials": d?.onboarding?.emailSent
        ? { title: "Resend login details?", tone: "danger", message: `This will override the password ${name} has set. Their current password stops working immediately.`, points: ["Use this only when they have forgotten their password: there is no self-service reset, it is always done by Back-Admin", "A new one-time password is generated and emailed to them", "They must choose their own password again at next login"], confirmLabel: "Override and resend" }
        : { title: "Send one-time login details?", message: `${name} receives their username and a one-time password by email.`, points: ["They sign in with the username or their email", "They must choose their own password at first login", "If email is not set up, you will see the details to share yourself"], confirmLabel: "Send login details" },
      approve: { title: `Approve ${name}?`, message: "This is the final approval for field work.", points: ["The auditor becomes eligible to be assigned to audits", "Their onboarding score becomes their starting performance score", "Background check, shadow audit and authority letter must still be recorded"], confirmLabel: "Approve auditor" },
      scores: { title: "Record this audit review score?", message: `It joins ${name}'s running performance score (average of the last 3 reviews).`, points: ["Below 80% the auditor needs retraining", "Below 60% they can no longer be planned for audits"], confirmLabel: "Record score" },
      "field-readiness": { title: "Save field readiness?", message: "These details decide whether the auditor can be assigned to a site.", confirmLabel: "Save" },
    };
    if (path === "review") {
      const pass = body.decision === "PASS";
      if (!(await confirm({ title: pass ? "Pass and send for approval?" : "Send for retraining?", tone: pass ? "primary" : "danger", message: pass ? `${name} goes to SGS / M&M for final approval.` : `${name} has to repeat the training and resubmit.`, points: pass ? ["Quiz 50% and demo 50% give the combined score", "Combined score must reach the pass mark"] : ["The auditor is notified to retake the training", "Their earlier answers are kept on record"], confirmLabel: pass ? "Pass & send for approval" : "Send for retraining" }))) return null;
    } else if (path === "reject") {
      const reason = await ask({ title: `Reject ${name}?`, tone: "danger", message: "Rejection blocks the account. The records are kept.", input: { label: "Reason for rejecting", required: true, defaultValue: body.reason || "" }, confirmLabel: "Reject auditor" });
      if (!reason) return null;
      body = { ...body, reason };
    } else if (path === "retrain") {
      const reason = await ask({ title: `Send ${name} for retraining?`, tone: "danger", message: "They cannot be planned for audits until they are approved again.", input: { label: "Reason", required: true }, confirmLabel: "Send for retraining" });
      if (!reason) return null;
      body = { ...body, reason };
    } else if (gates[path] && !(await confirm(gates[path]))) return null;
    setBusy(true);
    try {
      const res = await axios({ method, url: `${domain}/auditor-onboarding/${userId}/${path}`, data: body, showSuccessToast: true });
      await load();
      return res.data;
    } finally { setBusy(false); }
  };

  const decide = async (request, approve) => {
    const name = d?.auditor?.fullName || "the auditor";
    let remarks = "";
    if (approve) {
      if (!(await confirm({ title: "Apply this change to the ID card?", message: `${name}'s card and records are updated straight away.`, points: Object.keys(request.changes).map((k) => CHANGE_LABELS[k] || k), confirmLabel: "Approve and update" }))) return;
    } else {
      const reason = await ask({ title: "Decline this change?", tone: "danger", message: `${name} sees your reason on their profile page.`, input: { label: "Reason", required: true }, confirmLabel: "Decline request" });
      if (!reason) return;
      remarks = reason;
    }
    await axios.post(`${domain}/auditor-onboarding/${userId}/change-requests/${request.id}/decision`, { decision: approve ? "APPROVE" : "REJECT", remarks }, { showSuccessToast: true });
    setCardKey((k) => k + 1);
    load();
  };

  if (!d) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const { auditor: a, onboarding: o, content, scores, thresholds, changeRequests = [] } = d;
  if (!o) return <div><Header /><PageTitle title={a.fullName} subtitle="This auditor was created before the onboarding flow existed." /></div>;
  const done = completedSteps(a.status);
  const demoAns = o.demoAnswers || {};

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Auditor Onboarding", to: "/admin-dashboard/auditor-onboarding" }, { label: a.fullName }]}
        title={a.fullName}
        subtitle={`${a.email}${a.phone ? ` • ${a.phone}` : ""}${a.baseLocation ? ` • ${a.baseLocation}` : ""}`}
        actions={<><Pill meta={STATUS_META[a.status]} />{a.tag && <Pill meta={TAG_META[a.tag]} />}<ScoreRing value={a.score} /></>}
      />

      <div className={`mb-6 ${cardClass}`}>
        <ol className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((label, i) => {
            const complete = i < done && !(a.status === "REJECTED" && i === 3);
            const current = i === done && a.status !== "APPROVED" && a.status !== "REJECTED";
            return (
              <li key={label} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${complete ? "border-[#63C174] bg-[#63C174] text-white" : current ? "border-[#181919] font-semibold" : "border-gray-300 text-gray-500"}`}>{complete ? <Check size={16} /> : i + 1}</span>
                <span className={`text-sm ${current ? "font-semibold" : ""}`}>{label}</span>
              </li>
            );
          })}
        </ol>
        {a.status === "REJECTED" && <p className="mt-4 rounded-xl bg-[#fdecec] p-3 text-sm text-[#b42318]"><b>Rejected:</b> {o.rejectionReason}</p>}
        {a.status === "RETRAINING" && <p className="mt-4 rounded-xl bg-[#fff3e0] p-3 text-sm text-[#7a4f00]">Retraining required{o.reviewRemarks ? `: ${o.reviewRemarks}` : "."}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {["CREATED", "TRAINING", "RETRAINING"].includes(a.status) && (
            <section className={cardClass}>
              <h2 className="mb-2 text-lg font-semibold">Step 2 · Auditor training</h2>
              <p className="text-sm text-gray-600">Waiting for {a.fullName} to log in, finish the training video, pass the quiz and complete the demo checklist.</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{o.videoProgress}%</div>Video watched</div>
                <div className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{o.quizScore !== null ? `${o.quizScore}%` : "—"}</div>Last quiz score</div>
                <div className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{o.quizAttempts}</div>Quiz attempts</div>
              </div>
            </section>
          )}

          {a.status === "UNDER_REVIEW" && (
            <section className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold">Step 3 · Review and score</h2>
              <div className="mb-4 rounded-xl bg-[#f3f5f7] p-3 text-sm">Quiz score <b>{o.quizScore}%</b> (pass mark {content.passMark}%), attempt {o.quizAttempts}.</div>
              <h3 className="mb-2 text-sm font-semibold">Demo checklist answers</h3>
              <div className="space-y-3">
                {content.demo.map((item) => {
                  const ans = demoAns[item.id] || {}; const correct = ans.result === item.expected;
                  return (
                    <div key={item.id} className="rounded-xl border border-[#e1e5ea] p-3 text-sm">
                      <div className="flex items-center justify-between gap-3"><b>{item.title}</b><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${correct ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fdecec] text-[#b42318]"}`}>{correct ? "Matches expected" : "Differs from expected"}</span></div>
                      <p className="mt-1 text-gray-600">{item.scenario}</p>
                      <p className="mt-2">Auditor: <b>{RESULT_LABEL[ans.result] || "—"}</b>{ans.comment ? ` — ${ans.comment}` : ""}</p>
                      <p className="text-xs text-gray-500">Expected: {RESULT_LABEL[item.expected]} — {item.expectedNote}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Demo checklist score (0-100) *"><input type="number" className={inputClass} value={reviewForm.demoScore} onChange={(e) => setReviewForm({ ...reviewForm, demoScore: e.target.value })} /></Field>
                <Field label="Review remarks *" span="md:col-span-2"><input className={inputClass} value={reviewForm.remarks} onChange={(e) => setReviewForm({ ...reviewForm, remarks: e.target.value })} /></Field>
              </div>
              {reviewForm.demoScore !== "" && <p className="mt-2 text-sm text-gray-600">Combined score: <b>{Math.round(((o.quizScore + Number(reviewForm.demoScore)) / 2) * 10) / 10}%</b> (quiz 50% + demo 50%)</p>}
              <div className="mt-4 flex gap-2">
                <button className={darkBtn} disabled={busy} onClick={() => call("review", { ...reviewForm, decision: "PASS" })}>Pass · send for approval</button>
                <button className={lightBtn} disabled={busy} onClick={() => call("review", { ...reviewForm, decision: "RETRAIN" })}>Send for retraining</button>
              </div>
            </section>
          )}

          {a.status === "AWAITING_APPROVAL" && (
            <section className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold">Step 4 · Approval (SGS / M&M)</h2>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{o.quizScore}%</div>Quiz</div>
                <div className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{o.demoScore}%</div>Demo</div>
                <div className="rounded-xl bg-[#eaf8ed] p-3"><div className="text-lg font-semibold">{o.reviewScore}%</div>Combined</div>
              </div>
              <p className="mb-3 rounded-xl bg-[#f3f5f7] p-3 text-sm"><b>Reviewer remarks:</b> {o.reviewRemarks}</p>
              <textarea rows="2" className={inputClass} placeholder="Approval remarks, or the reason when rejecting" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="mt-3 flex gap-2">
                <button className={darkBtn} disabled={busy} onClick={() => call("approve", { remarks: reason })}>Approve auditor</button>
                <button className={`${lightBtn} !text-[#b42318]`} disabled={busy} onClick={() => call("reject", { reason })}>Reject</button>
              </div>
            </section>
          )}

          {a.status === "APPROVED" && (
            <>
              <section className={cardClass}>
                <h2 className="mb-1 text-lg font-semibold">ID card & authority letter</h2>
                <p className="mb-4 text-sm text-gray-500">Issued on approval. The auditor carries the card and the letter on every visit; dealers can verify the ID with the code.</p>
                <AuditorIdCard key={cardKey} userId={userId} onChanged={load} />
              </section>
              <section className={cardClass}>
                <h2 className="mb-1 text-lg font-semibold">Performance</h2>
                <p className="mb-4 text-sm text-gray-500">{a.scoreBasis}. {thresholds.ok}% or above is eligible, {thresholds.block}–{thresholds.ok}% needs retraining, below {thresholds.block}% cannot be planned.</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Audit review score (0-100)"><input type="number" className={inputClass} value={auditScore.score} onChange={(e) => setAuditScore({ ...auditScore, score: e.target.value })} /></Field>
                  <Field label="Audit reference" span="md:col-span-2"><input className={inputClass} placeholder="Site / report" value={auditScore.reference} onChange={(e) => setAuditScore({ ...auditScore, reference: e.target.value })} /></Field>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className={darkBtn} disabled={busy || auditScore.score === ""} onClick={async () => { const r = await call("scores", auditScore); if (r) setAuditScore({ score: "", reference: "" }); }}>Record score</button>
                  <button className={lightBtn} disabled={busy} onClick={() => call("retrain", {})}>Send for retraining</button>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-[#e1e5ea]">
                  {scores.length === 0 ? <p className="p-4 text-sm text-gray-500">No scores recorded yet.</p> : scores.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 border-b border-[#eef0f3] p-3 text-sm last:border-b-0">
                      <span className="w-14 font-semibold">{s.score}%</span>
                      <span className="w-28 text-xs text-gray-500">{s.source === "CALIBRATION" ? "Onboarding" : "Audit review"}</span>
                      <span className="flex-1 text-gray-600">{s.reference}</span>
                      <span className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className={cardClass}>
                <h2 className="mb-1 text-lg font-semibold">Field readiness</h2>
                <p className="mb-4 text-sm text-gray-500">Required before the auditor can be assigned to a site.</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.backgroundVerified} onChange={(e) => setField({ ...field, backgroundVerified: e.target.checked })} />Background verification completed</label>
                  <Field label="Shadow audits completed"><input type="number" className={inputClass} value={field.shadowAuditsCompleted} onChange={(e) => setField({ ...field, shadowAuditsCompleted: e.target.value })} /></Field>
                  <Field label="Authority letter number"><input className={inputClass} value={field.authorityLetterNumber} onChange={(e) => setField({ ...field, authorityLetterNumber: e.target.value })} /></Field>
                  <Field label="Certification valid till"><input type="date" className={inputClass} value={field.certificationExpiresAt} onChange={(e) => setField({ ...field, certificationExpiresAt: e.target.value })} /></Field>
                </div>
                <div className="mt-4"><button className={darkBtn} disabled={busy} onClick={() => call("field-readiness", field, "put")}>Save field readiness</button></div>
              </section>
            </>
          )}
        </div>

        <aside className="space-y-6">
          <section className={cardClass}>
            <h3 className="mb-3 text-sm font-semibold">Profile</h3>
            <div className="mb-3 flex flex-wrap items-center gap-3"><PhotoUpload userId={userId} hasPhoto={a.hasPhoto} onSaved={load} /><span className="text-xs text-gray-500">{a.hasPhoto ? "Photo on file" : "No photo yet"}</span></div>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-gray-500">Username</dt><dd>{a.username}</dd></div>
              <div>
                <dt className="text-xs text-gray-500">Emergency contact (on ID card)</dt>
                <dd><input type="tel" aria-label="Emergency contact number" placeholder="Not set" className="mt-1 w-full rounded-lg border border-[#d8dee8] bg-white px-2 py-1 text-sm" defaultValue={o.emergencyContact || ""}
                  onBlur={async (e) => { const v = e.target.value.trim(); if (v === (o.emergencyContact || "")) return; await axios.put(`${domain}/auditor-onboarding/${userId}/profile`, { emergencyContact: v }, { showSuccessToast: true }); load(); }} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Date of birth</dt>
                <dd><input type="date" aria-label="Date of birth" className="mt-1 rounded-lg border border-[#d8dee8] bg-white px-2 py-1 text-sm" max={new Date().toISOString().slice(0, 10)} defaultValue={o.dateOfBirth ? o.dateOfBirth.slice(0, 10) : ""}
                  onBlur={async (e) => { const v = e.target.value; if (v === (o.dateOfBirth ? o.dateOfBirth.slice(0, 10) : "")) return; await axios.put(`${domain}/auditor-onboarding/${userId}/profile`, { dateOfBirth: v }, { showSuccessToast: true }); load(); }} /></dd>
              </div>
              <div><dt className="text-xs text-gray-500">Regions</dt><dd>{(a.regions || []).join(", ") || "—"}</dd></div>
              <div><dt className="text-xs text-gray-500">Skills</dt><dd className="flex flex-wrap gap-1">{(a.skills || []).map((s) => <span key={s} className="whitespace-nowrap rounded-full bg-[#f3f5f7] px-2 py-0.5 text-xs">{SKILL_LABELS[s] || s}</span>)}</dd></div>
              <div>
                <dt className="text-xs text-gray-500">Login details emailed</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${o.emailSent ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fff6e8] text-[#9a5200]"}`}>{o.emailSent ? "Yes" : "Not sent yet"}</span>
                  <button type="button" className={lightBtn} disabled={busy} onClick={async () => { const r = await call("resend-credentials"); if (r) setCreds(r.credentials); }}>{o.emailSent ? "Resend login details" : "Send one-time login details"}</button>
                </dd>
              </div>
            </dl>
          </section>
          {changeRequests.length > 0 && (
            <section className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold">ID card change requests</h3>
              <ul className="space-y-3">
                {changeRequests.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-[#e1e5ea] p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2"><span className="font-medium">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span><span className={`rounded-full px-2 py-0.5 ${r.status === "PENDING" ? "bg-[#fff6e8] text-[#9a5200]" : r.status === "APPROVED" ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fdecec] text-[#b42318]"}`}>{r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Declined"}</span></div>
                    <dl className="space-y-1">{Object.entries(r.changes).map(([k, v]) => <div key={k}><dt className="text-gray-500">{CHANGE_LABELS[k] || k}</dt><dd className="font-medium">{k === "photo" ? <img src={v} alt="Requested" className="mt-1 h-16 w-12 rounded-lg border object-cover" /> : v}</dd></div>)}</dl>
                    {r.reason && <p className="mt-2 text-gray-600">Reason: {r.reason}</p>}
                    {r.status === "REJECTED" && r.remarks && <p className="mt-1 text-[#b42318]">Declined: {r.remarks}</p>}
                    {r.status === "PENDING" && <div className="mt-3 flex gap-2"><button className={darkBtn} onClick={() => decide(r, true)}>Approve</button><button className={lightBtn} onClick={() => decide(r, false)}>Decline</button></div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className={cardClass}>
            <h3 className="mb-3 text-sm font-semibold">History</h3>
            <ul className="space-y-2 text-xs">
              {[...(o.events || [])].reverse().map((e, i) => (
                <li key={i} className="border-l-2 border-[#d8dee8] pl-3"><div className="font-medium">{e.action.replaceAll("_", " ")}</div><div className="text-gray-500">{new Date(e.at).toLocaleString()}{e.note ? ` · ${e.note}` : ""}</div></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {creds && (
        <Modal title="One-time login details" onClose={() => setCreds(null)}>
          <div className="space-y-3 text-sm">
            <p>{creds.emailSent ? "The details were emailed to the auditor." : "Email is not configured, so share these details with the auditor yourself."}</p>
            <div className="rounded-xl bg-[#f3f5f7] p-4 font-mono"><div>Username: <b>{creds.username}</b></div><div>One-time password: <b>{creds.password}</b></div></div>
            <div className="flex justify-end"><button className={darkBtn} onClick={() => setCreds(null)}>Done</button></div>
          </div>
        </Modal>
      )}
      <button className="mt-6 inline-flex min-h-10 items-center rounded-xl px-2 text-sm text-gray-600 underline hover:bg-white" onClick={() => navigate("/admin-dashboard/auditor-onboarding")}>Back to auditors</button>
    </div>
  );
}
