// file: app/pregled/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string; created_at?: string };
type Sub = { id: number; name: string; area_id: number; created_at?: string };
type Answer = { id: number; text: string; is_correct: boolean };
type Question = {
  id: number;
  text: string;
  image_url: string | null;
  points: number;
  multi_correct: boolean;
  subarea_id?: number;         // ✅ EDIT: potrebno za izmenu
  mup_id?: string | null;      // ✅ EDIT: novo polje
  answers: Answer[];
};

function formatTacni(count: number): string {
  if (count === 1) return "Jedan tačan";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const srednji = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  return srednji ? `${count} tačna odgovora` : `${count} tačnih odgovora`;
}

function QuestionCard({
  q,
  revealed,
  onToggleReveal,
  onPreview,
  onEdit, // ✅ EDIT: callback za modal
}: {
  q: Question;
  revealed: boolean;
  onToggleReveal: () => void;
  onPreview: (url: string) => void;
  onEdit: () => void;
}) {
  const correctCount = q.answers.reduce((n, a) => n + (a.is_correct ? 1 : 0), 0);
  const meta = correctCount === 1 ? "Jedan tačan" : formatTacni(correctCount);
  const hasImage = !!q.image_url;

  return (
    <div className="border rounded p-3 space-y-3">
      <div className={hasImage ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        <div>
          <div className="font-medium whitespace-pre-wrap">{q.text}</div>
          <div className="text-sm text-gray-600">Bodovi: {q.points} • {meta}</div>
        </div>
        {hasImage && (
          <div className="md:pl-2">
            <div className="mt-1">
              <img
                src={q.image_url as string}
                alt="slika pitanja"
                className="max-h-64 w-auto ml-auto cursor-zoom-in rounded"
                onClick={() => onPreview(q.image_url!)}
              />
              <div className="text-right">
                <button className="text-sm underline" onClick={() => onPreview(q.image_url!)}>
                  Uvećaj
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {q.answers.map((a) => {
          const isCorrect = revealed && a.is_correct;
          return (
            <div
              key={a.id}
              className={[
                "w-full rounded border px-3 py-2",
                isCorrect ? "bg-green-100 border-green-300 font-medium" : "border-gray-200",
              ].join(" ")}
            >
              {a.text}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button className="border rounded px-3 py-1 text-sm" onClick={onToggleReveal}>
          {revealed ? "Sakrij tačan odgovor" : "Prikaži tačan odgovor"}
        </button>
        <button className="border rounded px-3 py-1 text-sm" onClick={onEdit}>
          Izmeni
        </button>
      </div>
    </div>
  );
}

export default function PregledPage() {
  // --- Filtriranje po oblasti/podoblasti ---
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealBySub, setRevealBySub] = useState<Record<number, boolean>>({});

  // --- Globalna pretraga ---
  const [globalQ, setGlobalQ] = useState<string>("");
  const [globalResults, setGlobalResults] = useState<Question[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const [revealGlobal, setRevealGlobal] = useState<Record<number, boolean>>({});
  const lastReq = useRef<number>(0);

  // ✅ EDIT modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editQ, setEditQ] = useState<{
    id: number;
    text: string;
    points: number;
    subarea_id: number | null;
    mup_id: string | "";
    image_url: string | null;
    answers: { id?: number; text: string; is_correct: boolean }[];
    newImageFile?: File | null;
  } | null>(null);

  const supabase = useMemo(() => supabaseBrowser(), []);
  const filteredSubs = useMemo(
    () => subs.filter((s) => s.area_id === (typeof areaId === "number" ? areaId : -1)),
    [subs, areaId]
  );

  // Init
  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("areas").select("*").order("created_at", { ascending: true });
      setAreas((a ?? []) as Area[]);
      const { data: s } = await supabase.from("subareas").select("*").order("created_at", { ascending: true });
      setSubs((s ?? []) as Sub[]);
    })();
  }, [supabase]);

  // Učitavanje po podoblasti
  async function loadBySubarea() {
    if (!subId) return;
    const { data: qs, error } = await supabase
      .from("questions")
      .select("id, text, image_url, points, multi_correct, subarea_id, mup_id, answers:answers(id, text, is_correct)")
      .eq("subarea_id", subId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setQuestions((qs ?? []) as Question[]);
    setRevealBySub({});
    setLoaded(true);
  }

  // Globalni search
  useEffect(() => {
    const term = globalQ.trim();
    setGlobalErr(null);
    if (term.length < 2) {
      setGlobalResults([]);
      setRevealGlobal({});
      return;
    }
    const reqId = Date.now();
    lastReq.current = reqId;
    setGlobalLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("questions")
          .select("id, text, image_url, points, multi_correct, subarea_id, mup_id, answers:answers(id, text, is_correct)")
          .ilike("text", `%${term}%`)
          .order("created_at", { ascending: true })
          .limit(300);
        if (lastReq.current !== reqId) return;
        if (error) {
          setGlobalErr(error.message);
          setGlobalResults([]);
          setRevealGlobal({});
          return;
        }
        setGlobalResults((data ?? []) as Question[]);
        setRevealGlobal({});
      } catch (e: any) {
        if (lastReq.current !== reqId) return;
        setGlobalErr(e?.message || "Greška pri pretrazi.");
        setGlobalResults([]);
        setRevealGlobal({});
      } finally {
        if (lastReq.current === reqId) setGlobalLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [globalQ, supabase]);

  // Common preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ✅ EDIT: open modal helper
  function openEdit(q: Question) {
    setEditQ({
      id: q.id,
      text: q.text,
      points: q.points,
      subarea_id: q.subarea_id ?? null,
      mup_id: q.mup_id ?? "",
      image_url: q.image_url ?? null,
      answers: q.answers.map(a => ({ id: a.id, text: a.text, is_correct: a.is_correct })),
      newImageFile: null,
    });
    setEditOpen(true);
  }

  // ✅ EDIT: save changes
  async function saveEdit() {
    if (!editQ) return;
    const s = supabaseBrowser();

    // 1) upload nove slike ako je izabrana
    let newImageUrl = editQ.image_url;
    if (editQ.newImageFile) {
      const file = editQ.newImageFile;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `q-${editQ.id}-${Date.now()}.${ext}`;
      const { data: up, error: upErr } = await s.storage.from("question-images").upload(path, file, { upsert: true });
      if (upErr) { alert(upErr.message); return; }
      const { data: pub } = s.storage.from("question-images").getPublicUrl(up.path);
      newImageUrl = pub?.publicUrl || newImageUrl;
    }

    // 2) update question (uklj. mup_id)
    const { error: upqErr } = await s.from("questions").update({
      text: editQ.text.trim(),
      points: Number(editQ.points) || 0,
      subarea_id: editQ.subarea_id,
      image_url: newImageUrl,
      mup_id: editQ.mup_id?.trim() || null,
      // multi_correct se računa iz odgovora – ne diramo direktno
    }).eq("id", editQ.id);
    if (upqErr) { alert(upqErr.message); return; }

    // 3) answers: pobriši pa upiši nove (jednostavno i robusno)
    const { error: delErr } = await s.from("answers").delete().eq("question_id", editQ.id);
    if (delErr) { alert(delErr.message); return; }

    const cleanAnswers = editQ.answers
      .map(a => ({ text: a.text.trim() }))
      .filter(a => a.text.length > 0);

    if (cleanAnswers.length < 2) {
      alert("Pitanje mora imati bar 2 ponuđena odgovora.");
      return;
    }

    const toInsert = editQ.answers
      .filter(a => a.text.trim().length > 0)
      .map(a => ({
        question_id: editQ.id,
        text: a.text.trim(),
        is_correct: !!a.is_correct,
      }));

    const { error: insErr } = await s.from("answers").insert(toInsert);
    if (insErr) { alert(insErr.message); return; }

    // refresh oba listinga (ako su aktivni)
    if (subId) await loadBySubarea();
    if (globalQ.trim().length >= 2) {
      // re-trigger global search
      setGlobalQ(prev => prev + ""); // mali trik da useEffect odradi refresh sa istim terminom
    }

    setEditOpen(false);
    setEditQ(null);
  }

  // ✅ EDIT: add/remove/toggle answers
  function addAnswerRow() {
    if (!editQ) return;
    setEditQ({ ...editQ, answers: [...editQ.answers, { text: "", is_correct: false }] });
  }
  function removeAnswerRow(idx: number) {
    if (!editQ) return;
    const dup = editQ.answers.slice();
    dup.splice(idx, 1);
    setEditQ({ ...editQ, answers: dup });
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Pregled pitanja</h1>

      {/* BLOK 1: Filtriranje po oblasti/podoblasti */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm">Oblast</label>
            <select
              className="w-full border rounded p-2"
              value={String(areaId)}
              onChange={(e) => {
                const v = e.target.value;
                setAreaId(v ? Number(v) : "");
                setSubId("");
                setLoaded(false);
                setQuestions([]);
              }}
            >
              <option value="">Izaberi oblast</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm">Podoblast</label>
            <select
              className="w-full border rounded p-2"
              value={String(subId)}
              onChange={(e) => {
                const v = e.target.value;
                setSubId(v ? Number(v) : "");
                setLoaded(false);
                setQuestions([]);
              }}
              disabled={!areaId}
            >
              <option value="">Izaberi podoblast</option>
              {subs.filter(s=>s.area_id === (typeof areaId === "number" ? areaId : -1)).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button onClick={loadBySubarea} disabled={!subId} className="w-full bg-black text-white rounded p-2 disabled:opacity-50">
              Prikaži pitanja
            </button>
          </div>
        </div>

        {loaded && (
          <div className="text-sm text-gray-700">
            Ukupno pitanja u podoblasti: <b>{questions.length}</b>
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              revealed={!!revealBySub[q.id]}
              onToggleReveal={() => setRevealBySub((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
              onPreview={(u) => setPreviewUrl(u)}
              onEdit={() => openEdit(q)} // ✅
            />
          ))}
          {loaded && questions.length === 0 && <div className="text-gray-600">Nema pitanja za izabranu podoblast.</div>}
        </div>
      </div>

      <hr className="my-4" />

      {/* BLOK 2: Globalna pretraga */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="block text-sm">Pretraga po tekstu pitanja (globalno – sve oblasti i podoblasti)</label>
        </div>
        <input
          className="w-full border rounded p-2"
          placeholder="Unesi bar 2 znaka (npr. 'parkiranje na trotoaru')"
          value={globalQ}
          onChange={(e) => setGlobalQ(e.target.value)}
        />
        <div className="text-sm text-gray-700">
          {globalLoading ? "Pretražujem…" : globalQ.trim().length >= 2 ? <>Pronađeno: <b>{globalResults.length}</b></> : "Unesi bar 2 znaka za globalnu pretragu."}
          {globalErr && <span className="text-red-600 ml-2">{globalErr}</span>}
        </div>

        <div className="space-y-4">
          {globalResults.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              revealed={!!revealGlobal[q.id]}
              onToggleReveal={() => setRevealGlobal((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
              onPreview={(u) => setPreviewUrl(u)}
              onEdit={() => openEdit(q)} // ✅
            />
          ))}
          {!globalLoading && globalQ.trim().length >= 2 && globalResults.length === 0 && (
            <div className="text-gray-600">Nema rezultata za zadati upit.</div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-5xl max-h-[85vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="slika pitanja" className="max-h-[80vh] w-auto" />
            <div className="text-center mt-2">
              <button className="border rounded px-3 py-1 text-sm bg-white" onClick={() => setPreviewUrl(null)}>Zatvori</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ EDIT: Modal za izmenu pitanja */}
      {editOpen && editQ && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setEditOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl p-4 space-y-3" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Izmena pitanja</div>
              <button onClick={()=>setEditOpen(false)} className="text-sm">Zatvori</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm">Tekst pitanja</label>
                <textarea className="w-full border rounded p-2" rows={4} value={editQ.text} onChange={e=>setEditQ({...editQ, text: e.target.value})} />
              </div>

              <div>
                <label className="block text-sm">Bodovi</label>
                <input type="number" min={0} className="w-full border rounded p-2" value={editQ.points} onChange={e=>setEditQ({...editQ, points: Number(e.target.value)})} />
              </div>

              <div>
                <label className="block text-sm">MUP ID</label>
                <input className="w-full border rounded p-2" value={editQ.mup_id} onChange={e=>setEditQ({...editQ, mup_id: e.target.value})} placeholder="npr. 12345" />
              </div>

              <div>
                <label className="block text-sm">Oblast</label>
                <select
                  className="w-full border rounded p-2"
                  value={String(subs.find(s=>s.id===editQ.subarea_id)?.area_id ?? "")}
                  onChange={(e)=>{
                    const newArea = Number(e.target.value);
                    const firstSub = subs.find(s=>s.area_id===newArea);
                    setEditQ({...editQ, subarea_id: firstSub ? firstSub.id : null});
                  }}
                >
                  <option value="">Izaberi oblast</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm">Podoblast</label>
                <select
                  className="w-full border rounded p-2"
                  value={String(editQ.subarea_id ?? "")}
                  onChange={(e)=>setEditQ({...editQ, subarea_id: e.target.value ? Number(e.target.value) : null})}
                >
                  <option value="">Izaberi podoblast</option>
                  {subs
                    .filter(s=>s.area_id === (subs.find(x=>x.id===editQ.subarea_id)?.area_id ?? subs.find(y=>y.id===editQ.subarea_id)?.area_id))
                    .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm">Slika (opciono – ako izabereš, zamenjuje postojeću)</label>
                <input type="file" accept="image/*" onChange={(e)=>setEditQ({...editQ, newImageFile: e.target.files?.[0] ?? null})} />
                {editQ.image_url && <div className="text-xs text-gray-600 mt-1">Trenutna slika je postavljena.</div>}
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm">Odgovori</label>
                  <button type="button" className="text-sm underline" onClick={addAnswerRow}>+ Dodaj odgovor</button>
                </div>
                <div className="space-y-2">
                  {editQ.answers.map((a, idx)=>(
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="flex-1 border rounded p-2"
                        value={a.text}
                        onChange={e=>{
                          const dup = editQ.answers.slice();
                          dup[idx].text = e.target.value;
                          setEditQ({...editQ, answers: dup});
                        }}
                      />
                      <label className="text-sm flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={a.is_correct}
                          onChange={e=>{
                            const dup = editQ.answers.slice();
                            dup[idx].is_correct = e.target.checked;
                            setEditQ({...editQ, answers: dup});
                          }}
                        />
                        Tačan
                      </label>
                      <button className="text-sm underline" onClick={()=>removeAnswerRow(idx)}>Ukloni</button>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Napomena: pitanje mora imati ≥ 2 odgovora; označi jedan ili više tačnih.
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="border rounded px-3 py-2" onClick={()=>setEditOpen(false)}>Otkaži</button>
              <button className="bg-black text-white rounded px-3 py-2" onClick={saveEdit}>Sačuvaj izmene</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
