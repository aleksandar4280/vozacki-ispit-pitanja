"use client";
import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string; };
type Sub = { id: number; name: string; area_id: number; };

type AnswerDraft = { text: string; is_correct: boolean };

export default function NewQuestionPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");
  const [text, setText] = useState("");
  const [points, setPoints] = useState<number>(1);
  const [multi, setMulti] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<AnswerDraft[]>([
    { text: "", is_correct: false },
    { text: "", is_correct: false },
    { text: "", is_correct: false }
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const filteredSubs = useMemo(
    () => subs.filter(s => s.area_id === areaId),
    [subs, areaId]
  );

  async function loadRefs() {
    const supabase = supabaseBrowser();
    const { data: a } = await supabase.from("areas").select("*").order("name");
    setAreas(a ?? []);
    const { data: s } = await supabase.from("subareas").select("*").order("name");
    setSubs(s ?? []);
  }

  useEffect(() => { loadRefs(); }, []);

  function updateAnswer(i: number, patch: Partial<AnswerDraft>) {
    setAnswers(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }
  function addAnswer() { setAnswers(prev => [...prev, { text: "", is_correct: false }]); }
  function removeAnswer(i: number) { setAnswers(prev => prev.filter((_, idx) => idx !== i)); }

  async function uploadImageIfAny(): Promise<string | null> {
    if (!file) return null;
    const supabase = supabaseBrowser();
    const fileName = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("question-images").upload(fileName, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("question-images").getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!areaId || !subId) return setErr("Izaberi oblast i podoblast.");
    if (!text.trim()) return setErr("Unesi tekst pitanja.");
    const filtered = answers.filter(a => a.text.trim().length > 0);
    if (filtered.length < 2) return setErr("Dodaj bar 2 odgovora.");
    const correctCount = filtered.filter(a => a.is_correct).length;
    if (correctCount === 0) return setErr("Označi bar jedan tačan odgovor.");
    if (!multi && correctCount !== 1) return setErr("Za single choice dozvoljen je tačno 1 tačan odgovor.");

    try {
      const imageUrl = await uploadImageIfAny();

      const supabase = supabaseBrowser();
      const { data: q, error: qErr } = await supabase
        .from("questions")
        .insert({
          area_id: areaId,
          subarea_id: subId,
          text: text.trim(),
          image_url: imageUrl,
          points,
          multi_correct: multi
        })
        .select("id")
        .single();
      if (qErr) throw qErr;

      const toInsert = filtered.map(a => ({ question_id: q.id, text: a.text.trim(), is_correct: a.is_correct }));
      const { error: aErr } = await supabase.from("answers").insert(toInsert);
      if (aErr) throw aErr;

      setOk("Pitanje sačuvano.");
      // reset forme
      setText(""); setFile(null); setPoints(1); setMulti(false);
      setAnswers([{ text: "", is_correct: false }, { text: "", is_correct: false }, { text: "", is_correct: false }]);
    } catch (e: any) {
      setErr(e.message ?? "Greška pri čuvanju.");
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Novo pitanje</h1>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className="border rounded p-2" value={areaId} onChange={e=>{ setAreaId(Number(e.target.value)); setSubId(""); }}>
              <option value="">Izaberi oblast</option>
              {areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="border rounded p-2" value={subId} onChange={e=>setSubId(Number(e.target.value))} disabled={!areaId}>
              <option value="">Izaberi podoblast</option>
              {filteredSubs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <textarea className="w-full border rounded p-2" rows={4} placeholder="Tekst pitanja" value={text} onChange={e=>setText(e.target.value)} />
          <div className="flex items-center gap-3">
            <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={multi} onChange={e=>setMulti(e.target.checked)} />
              <span>Više tačnih odgovora</span>
            </label>
            <label className="flex items-center gap-2">
              <span>Bodovi:</span>
              <input type="number" min={0} className="border rounded p-1 w-20" value={points} onChange={e=>setPoints(Number(e.target.value))} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Odgovori</h3>
              <button type="button" onClick={addAnswer} className="text-sm underline">Dodaj odgovor</button>
            </div>
            {answers.map((a, i)=>(
              <div key={i} className="flex items-center gap-2">
                <input className="flex-1 border rounded p-2" placeholder={`Odgovor #${i+1}`} value={a.text} onChange={e=>updateAnswer(i, { text: e.target.value })} />
                <label className="text-sm flex items-center gap-1">
                  <input type="checkbox" checked={a.is_correct} onChange={e=>updateAnswer(i, { is_correct: e.target.checked })} />
                  tačan
                </label>
                <button type="button" onClick={()=>removeAnswer(i)} className="text-xs text-red-600">Ukloni</button>
              </div>
            ))}
          </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}
          {ok && <p className="text-green-600 text-sm">{ok}</p>}
          <button className="bg-black text-white rounded px-4 py-2">Sačuvaj pitanje</button>
        </form>
      </div>
    </AdminGuard>
  );
}