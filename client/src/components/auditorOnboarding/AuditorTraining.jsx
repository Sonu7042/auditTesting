import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import toast from "react-hot-toast";
import { Field, PageTitle, ProgressBar, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { STATUS_META } from "./meta";
import { Pill } from "./shared";
import AuditorIdCard, { PhotoUpload } from "./AuditorIdCard";
import DocumentViewer from "../common/DocumentViewer";

export default function AuditorTraining() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [quiz, setQuiz] = useState({});
  const [demo, setDemo] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const lastSent = useRef(0);
  const { confirm } = useConfirm();

  const load = async () => {
    try {
      const { data: res } = await axios.get(`${domain}/auditor-onboarding/me/training`, { showErrorToast: false });
      setData(res);
    } catch (e) { setError(e.userMessage || "Training is not available for your account."); }
  };
  useEffect(() => { load(); }, []);

  if (error) return <div><Header /><PageTitle title="Training" subtitle={error} /></div>;
  if (!data) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const { onboarding: o, content } = data;
  const active = ["TRAINING", "RETRAINING"].includes(o.status);

  const sendProgress = async (p) => {
    if (p <= lastSent.current) return;
    lastSent.current = p;
    const { data: res } = await axios.post(`${domain}/auditor-onboarding/me/video-progress`, { progress: p }, { showErrorToast: false });
    setData((d) => ({ ...d, onboarding: { ...d.onboarding, videoProgress: res.videoProgress } }));
  };
  const onTime = (e) => { const v = e.target; if (v.duration) { const p = Math.floor((v.currentTime / v.duration) * 100); if (p >= lastSent.current + 10 || p >= 95) sendProgress(Math.min(100, p)); } };

  const startRefresher = async () => {
    if (!(await confirm({ title: "Start the refresher training?", message: "You will watch the training video, take the quiz and complete the demo checklist again. You stay plannable until your current certificate expires.", confirmLabel: "Start refresher" }))) return;
    await axios.post(`${domain}/auditor-onboarding/me/refresher`, {}, { showSuccessToast: true });
    setResult(null); lastSent.current = 0; await load();
  };

  const submit = async () => {
    if (!(await confirm({ title: "Submit your training for review?", message: "Your answers are scored and sent to Back-Admin.", points: ["A quiz score under the pass mark sends you back to retrain", "You cannot change your answers after submitting", "Back-Admin then scores your demo checklist"], confirmLabel: "Submit for review" }))) return;
    setBusy(true);
    try {
      const { data: res } = await axios.post(`${domain}/auditor-onboarding/me/submit`, { quizAnswers: quiz, demoAnswers: demo });
      setResult(res); setQuiz({}); setDemo({}); lastSent.current = 0; await load(); window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <Header />
      <PageTitle title="Training & certification" subtitle="Watch the training, pass the quiz and complete the demo checklist. Back-Admin then reviews your submission." actions={<Pill meta={STATUS_META[o.status]} />} />
      {result && <div className={`mb-5 rounded-2xl p-4 text-sm ${result.passed ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fdecec] text-[#b42318]"}`}>{result.message}</div>}
      {o.status === "UNDER_REVIEW" && <div className={`${cardClass} text-sm`}>Submitted. Quiz score <b>{o.quizScore}%</b>. Back-Admin will review your demo checklist and you will be notified.</div>}
      {o.status === "AWAITING_APPROVAL" && <div className={`${cardClass} text-sm`}>Your review is complete (<b>{o.reviewScore}%</b>) and is waiting for final approval.</div>}
      {o.status === "APPROVED" && (
        <div className="space-y-5">
          <div className={`${cardClass} text-sm`}>You are approved. Your onboarding score is <b>{o.reviewScore}%</b>. Field checks (shadow audit and authority letter) are completed by Back-Admin.</div>
          <section className={cardClass}>
            <h2 className="mb-1 text-lg font-semibold">Certification and refresher</h2>
            <p className="mb-3 text-sm text-gray-500">Your certificate is valid for 12 months. Refresher training opens 30 days before it ends, and you cannot be planned for audits after it expires.</p>
            <div className="grid gap-3 text-sm md:grid-cols-4">
              {[["Certified on", o.approvedAt ? new Date(o.approvedAt).toLocaleDateString("en-IN") : "—"], ["Valid till", o.expiresAt ? new Date(o.expiresAt).toLocaleDateString("en-IN") : "—"], ["Quiz / demo / overall", `${o.quizScore ?? "—"}% / ${o.demoScore ?? "—"}% / ${o.reviewScore ?? "—"}%`], ["Attempts", o.quizAttempts]].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[#f3f5f7] p-3"><div className="text-xs text-gray-500">{label}</div><div className="font-semibold">{value}</div></div>
              ))}
            </div>
            {o.expired && <p className="mt-3 rounded-xl bg-[#fdecec] p-3 text-xs text-[#b42318]">Your certification has expired. Complete the refresher training to be planned for audits again.</p>}
            {!o.expired && o.refresherDue && <p className="mt-3 rounded-xl bg-[#fff3e0] p-3 text-xs text-[#7a4f00]">Your certification ends in {o.daysLeft} day(s). Start the refresher training now.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={lightBtn} onClick={() => setViewer({ title: "Training certificate", subtitle: o.auditorCode, url: `${domain}/auditor-onboarding/me/certificate/pdf`, filename: `${o.auditorCode}-certificate.pdf` })}>View training certificate</button>
              {o.canStartRefresher && <button className={darkBtn} onClick={startRefresher}>Start refresher training</button>}
            </div>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold">My training record</h2>
            <ul className="space-y-2 text-xs">{[...(o.events || [])].reverse().map((e, i) => (<li key={i} className="border-l-2 border-[#d8dee8] pl-3"><div className="font-medium">{e.action.replaceAll("_", " ")}</div><div className="text-gray-500">{new Date(e.at).toLocaleString("en-IN")}{e.note ? ` · ${e.note}` : ""}</div></li>))}</ul>
          </section>
          <section className={cardClass}><h2 className="mb-1 text-lg font-semibold">My ID card</h2><p className="mb-4 text-sm text-gray-500">Carry this card and the authority letter on every visit.</p><AuditorIdCard /></section>
        </div>
      )}
      {o.status !== "APPROVED" && o.status !== "REJECTED" && (
        <div className={`${cardClass} mb-5 flex flex-wrap items-center gap-3 text-sm`}><PhotoUpload hasPhoto={false} onSaved={() => toast.success("Photo saved")} /><span className="text-gray-600">Add a clear photo now. It is used on your ID card once you are approved.</span></div>
      )}
      {o.status === "REJECTED" && <div className={`${cardClass} text-sm text-[#b42318]`}>Your onboarding was not approved: {o.rejectionReason}</div>}
      {o.status === "RETRAINING" && o.reviewRemarks && <div className="mb-5 rounded-2xl bg-[#fff3e0] p-4 text-sm text-[#7a4f00]">Reviewer feedback: {o.reviewRemarks}</div>}

      {active && (
        <div className="space-y-6">
          <section className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold">1. Training video</h2>
            {content.videoUrl ? (
              <video controls className="w-full rounded-xl bg-black" src={content.videoUrl} onTimeUpdate={onTime} onEnded={() => sendProgress(100)} />
            ) : (
              <div className="flex h-44 flex-col items-center justify-center rounded-xl bg-[#f3f5f7] text-sm text-gray-500">
                <p>Training video not uploaded yet.</p>
                <button className={`${lightBtn} mt-3`} onClick={() => sendProgress(100)}>Mark as watched (demo)</button>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3"><ProgressBar value={o.videoProgress} /><span className="text-sm">{o.videoProgress}%</span></div>
          </section>

          <section className={cardClass}>
            <h2 className="mb-1 text-lg font-semibold">2. Quiz</h2>
            <p className="mb-4 text-sm text-gray-500">Pass mark {content.passMark}%.</p>
            <div className="space-y-5">
              {content.quiz.map((q, i) => (
                <div key={q.id}>
                  <p className="text-sm font-medium">{i + 1}. {q.text}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {q.options.map((opt, j) => (
                      <label key={j} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${quiz[q.id] === j ? "border-[#63C174] bg-[#f5fcf6]" : "border-[#d8dee8]"}`}>
                        <input type="radio" name={q.id} checked={quiz[q.id] === j} onChange={() => setQuiz({ ...quiz, [q.id]: j })} />{opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="mb-1 text-lg font-semibold">3. Demo checklist</h2>
            <p className="mb-4 text-sm text-gray-500">Judge each sample as you would in the field. Add a comment for anything that is not OK.</p>
            <div className="space-y-4">
              {content.demo.map((item) => {
                const a = demo[item.id] || {};
                return (
                  <div key={item.id} className="rounded-2xl border border-[#e1e5ea] p-4">
                    <div className="font-semibold">{item.title}</div>
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="mt-2 max-h-48 rounded-xl" />}
                    <p className="mt-1 text-sm text-gray-600">{item.scenario}</p>
                    <div className="mt-3 flex gap-2">
                      {[["OK", "OK"], ["NOT_OK", "Not OK"], ["NA", "N/A"]].map(([v, label]) => (
                        <button key={v} type="button" onClick={() => setDemo({ ...demo, [item.id]: { ...a, result: v } })} className={`rounded-xl border px-4 py-2 text-sm ${a.result === v ? "border-[#181919] bg-[#181919] text-white" : "border-[#d8dee8]"}`}>{label}</button>
                      ))}
                    </div>
                    {a.result && a.result !== "OK" && <Field label="Comment and recommendation"><input className={inputClass} value={a.comment || ""} onChange={(e) => setDemo({ ...demo, [item.id]: { ...a, comment: e.target.value } })} /></Field>}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end"><button className={darkBtn} disabled={busy} onClick={submit}>Submit for review</button></div>
          </section>
        </div>
      )}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
