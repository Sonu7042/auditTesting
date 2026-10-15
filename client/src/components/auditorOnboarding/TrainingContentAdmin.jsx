import { useEffect, useState } from "react";
import axios from "axios";
import { Plus, Trash2 } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { useConfirm } from "../common/confirmContext";
import { Field, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";

const newQuestion = () => ({ id: `q${Date.now()}`, text: "", options: ["", "", "", ""], answer: 0 });
const newDemo = () => ({ id: `d${Date.now()}`, title: "", scenario: "", imageUrl: "", expected: "NOT_OK", expectedNote: "" });

// Back-Admin maintains the mandatory training: the video, the pass mark, the quiz and the demo checklist that every new
// or retraining auditor goes through. Changes apply to the next person who starts training.
export default function TrainingContentAdmin() {
  const { confirm } = useConfirm();
  const [content, setContent] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { axios.get(`${domain}/auditor-onboarding/content`).then(({ data }) => setContent(data.content)); }, []);
  if (!content) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;

  const set = (patch) => setContent((c) => ({ ...c, ...patch }));
  const setQuestion = (i, patch) => set({ quiz: content.quiz.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
  const setOption = (i, j, value) => setQuestion(i, { options: content.quiz[i].options.map((o, k) => (k === j ? value : o)) });
  const setDemo = (i, patch) => set({ demo: content.demo.map((d, k) => (k === i ? { ...d, ...patch } : d)) });

  const save = async () => {
    if (!(await confirm({ title: "Save the training content?", message: "Auditors who start or restart training from now on will see this version.", points: ["Auditors already approved are not affected", "Auditors partway through keep their current attempt"], confirmLabel: "Save content" }))) return;
    setSaving(true);
    try { await axios.put(`${domain}/auditor-onboarding/content`, content, { showSuccessToast: true }); } finally { setSaving(false); }
  };

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Auditor Onboarding", to: "/admin-dashboard/auditor-onboarding" }, { label: "Training Content" }]} title="Training content" subtitle="The mandatory video, quiz and demo checklist every auditor completes before approval, and again for refresher or retraining." actions={<button className={darkBtn} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save content"}</button>} />

      <section className={`${cardClass} mb-5`}>
        <h2 className="mb-3 text-lg font-semibold">1. Training video</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <Field label="Video link (https)"><input className={inputClass} placeholder="https://.../training.mp4" value={content.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} /></Field>
          <Field label="Pass mark (%)"><input type="number" min="50" max="100" className={inputClass} value={content.passMark} onChange={(e) => set({ passMark: e.target.value })} /></Field>
        </div>
        <p className={`mt-3 rounded-xl p-3 text-xs ${content.videoUrl ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fff3e0] text-[#9a5200]"}`}>
          {content.videoUrl ? "Auditors must watch the video before they can submit the quiz. Progress is recorded as the video plays." : "No video is published. Auditors will see a demo button to skip it. Add a video link to make the training mandatory."}
        </p>
      </section>

      <section className={`${cardClass} mb-5`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">2. Quiz ({content.quiz.length} questions)</h2><button className={lightBtn} onClick={() => set({ quiz: [...content.quiz, newQuestion()] })}><Plus size={16} /> Add question</button></div>
        <div className="space-y-4">
          {content.quiz.map((q, i) => (
            <div key={q.id} className="rounded-2xl border border-[#e1e5ea] p-4">
              <div className="flex gap-2"><span className="mt-2 text-sm font-semibold">{i + 1}.</span><input className={`${inputClass} !mt-0`} placeholder="Question" value={q.text} onChange={(e) => setQuestion(i, { text: e.target.value })} />
                <button className="text-gray-400 hover:text-[#b42318]" aria-label="Remove question" onClick={() => set({ quiz: content.quiz.filter((_, k) => k !== i) })}><Trash2 size={16} /></button></div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {q.options.map((opt, j) => (
                  <label key={j} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${q.answer === j ? "border-[#63C174] bg-[#f5fbf6]" : "border-[#e1e5ea]"}`}>
                    <input type="radio" name={`ans-${q.id}`} checked={q.answer === j} onChange={() => setQuestion(i, { answer: j })} title="Correct answer" />
                    <input className="w-full bg-transparent outline-none" placeholder={`Option ${j + 1}`} value={opt} onChange={(e) => setOption(i, j, e.target.value)} />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">Select the radio button next to the correct answer.</p>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">3. Demo checklist ({content.demo.length} items)</h2><button className={lightBtn} onClick={() => set({ demo: [...content.demo, newDemo()] })}><Plus size={16} /> Add item</button></div>
        <div className="space-y-4">
          {content.demo.map((d, i) => (
            <div key={d.id} className="rounded-2xl border border-[#e1e5ea] p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <Field label="Title"><input className={inputClass} value={d.title} onChange={(e) => setDemo(i, { title: e.target.value })} /></Field>
                <Field label="Expected answer"><select className={inputClass} value={d.expected} onChange={(e) => setDemo(i, { expected: e.target.value })}><option value="OK">OK</option><option value="NOT_OK">Not OK</option><option value="NA">Not applicable</option></select></Field>
                <button className="mt-6 text-gray-400 hover:text-[#b42318]" aria-label="Remove item" onClick={() => set({ demo: content.demo.filter((_, k) => k !== i) })}><Trash2 size={16} /></button>
              </div>
              <Field label="Scenario shown to the auditor"><textarea className={inputClass} rows={2} value={d.scenario} onChange={(e) => setDemo(i, { scenario: e.target.value })} /></Field>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Photo link (optional)"><input className={inputClass} placeholder="https://..." value={d.imageUrl || ""} onChange={(e) => setDemo(i, { imageUrl: e.target.value })} /></Field>
                <Field label="Note for the reviewer"><input className={inputClass} value={d.expectedNote || ""} onChange={(e) => setDemo(i, { expectedNote: e.target.value })} /></Field>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end"><button className={darkBtn} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save content"}</button></div>
      </section>
    </div>
  );
}
