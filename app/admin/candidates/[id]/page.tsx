// file: app/admin/candidates/[id]/page.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type School = { id: number; name: string };
type Candidate = {
  id: number;
  first_name: string;
  last_name: string;
  id_number: string;
  phone: string | null;
  school_id: number;
  exam_date: string | null;
  exam_passed: boolean | null;
  first_lesson_date: string | null;
  last_lesson_date: string | null;
  not_my_candidate?: boolean;
};
type Exam = {
  id: number;
  exam_date: string;
  score: number;
  passed: boolean;
  wrong_questions: { question_id: number; questions: { id: number; text: string } }[];
};
type AnswerMini = { id: number; text: string; is_correct: boolean };
type QuestionMini = { id: number; text: string; image_url: string | null; answers: AnswerMini[] };

export default function EditCandidatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const candId = Number(params.id);

  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Teorijski ispiti
  const [showExams, setShowExams] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [exErr, setExErr] = useState<string | null>(null);

  // Novi ispit
  const [newExamOpen, setNewExamOpen] = useState(false);
  const [examDate, setExamDate] = useState<string>("");
  const [examScore, setExamScore] = useState<number>(0);
  const [examPassed, setExamPassed] = useState<"true" | "false">("false");

  // Pogrešni odgovori – poboljšana pretraga
  const [wrongSearchOpen, setWrongSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchRes, setSearchRes] = useState<QuestionMini[]>([]);
  const [selectedWrong, setSelectedWrong] = useState<QuestionMini[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);

  //MUP ID pretraga
  const [mupQ, setMupQ] = useState<string>("");
  const [mupLoading, setMupLoading] = useState(false);
  const [mupErr, setMupErr] = useState<string | null>(null);
  const [mupHits, setMupHits] = useState<{ id: number; text: string; image_url: string | null; mup_id: string | null }[]>([]);

  // PATCH: zameni ceo postojeći useEffect koji učitava candidate + schools ovim blokom

useEffect(() => {
  const supabase = supabaseBrowser();
  (async () => {
    setLoading(true); setErr(null);

    // 1) škole + kandidat
    const [{ data: sc }, { data: c, error: candErr }] = await Promise.all([
      supabase.from("schools").select("*").order("created_at", { ascending: true }),
      supabase.from("candidates").select("*").eq("id", candId).single()
    ]);

    if (candErr) {
      setErr(candErr.message);
      setLoading(false);
      return;
    }

    setSchools(sc ?? []);
    const cand = c as Candidate;
    if (!cand.phone) cand.phone = null;

    // 2) poslednji teorijski ispit kandidata (ako postoji)
    const { data: exRows, error: exErr } = await supabase
      .from("candidate_exams")
      .select("exam_date, passed")
      .eq("candidate_id", candId)
      .order("exam_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    // 3) ako postoji ispit → prefill; inače ostavi postojeće vrednosti iz kandidata
    const last = exRows && exRows.length > 0 ? exRows[0] as { exam_date: string; passed: boolean } : null;

    setForm({
      ...cand,
      exam_date: last ? last.exam_date : cand.exam_date,
      exam_passed: last ? last.passed : cand.exam_passed
    });

    setLoading(false);
  })();
}, [candId]);


  function update<K extends keyof Candidate>(key: K, value: Candidate[K]) {
    if (!form) return;
    setForm({ ...form, [key]: value });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErr(null); setOk(null);

    if (!form.first_name.trim() || !form.last_name.trim()) return setErr("Ime i prezime su obavezni.");
    if (!form.id_number.trim()) return setErr("ID broj je obavezan.");
    if (!form.school_id) return setErr("Izaberi autoškolu.");
    if (form.first_lesson_date && form.last_lesson_date && new Date(form.last_lesson_date) < new Date(form.first_lesson_date)) {
      return setErr("Poslednji čas ne može biti pre prvog časa.");
    }

    const supabase = supabaseBrowser();
    const normalizePhone = (v: string) => v.replace(/[^\d+]/g, "");
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      id_number: form.id_number.trim(),
      phone: form.phone ? normalizePhone(form.phone) : null,
      school_id: form.school_id,
      exam_date: form.exam_date || null,
      exam_passed: form.exam_passed,
      first_lesson_date: form.first_lesson_date || null,
      last_lesson_date: form.last_lesson_date || null,
      not_my_candidate: !!form.not_my_candidate
    };
    const { error } = await supabase.from("candidates").update(payload).eq("id", candId);
    if (error) return setErr(error.message);

    setOk("Sačuvano.");
    setTimeout(() => router.push("/admin/candidates"), 600);
  }

  async function loadExams() {
    setExamsLoading(true); setExErr(null);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase
      .from("candidate_exams")
      .select(`id, exam_date, score, passed,
        wrong_questions:candidate_exam_wrong_questions(
          question_id,
          questions(id, text)
        )`)
      .eq("candidate_id", candId)
      .order("created_at", { ascending: true })
      .returns<Exam[]>();
    setExamsLoading(false);
    if (error) { setExErr(error.message); return; }
    setExams(data ?? []);
  }

  // Debounce pretraga
  useEffect(() => {
    if (!wrongSearchOpen) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      void searchQuestions();
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, wrongSearchOpen]);

   // Debounced pretraga po MUP ID
 useEffect(() => {
   const term = mupQ.trim();
   setMupErr(null);
   if (!term) { setMupHits([]); return; }
   const supabase = supabaseBrowser();
   setMupLoading(true);
   const t = setTimeout(async () => {
     try {
       // ako korisnik unese tačno (sve cifre / exact), pokušaj eq; u suprotnom fallback na ilike
       const exact = term;
       let query = supabase
         .from("questions")
         .select("id, text, image_url, mup_id")
         .order("created_at", { ascending: true })
         .limit(50);
       if (exact.length > 0) {
         // prvo eq
         const { data: d1, error: e1 } = await query.eq("mup_id", exact);
         if (e1) throw e1;
         if (d1 && d1.length > 0) {
           setMupHits(d1 as any);
         } else {
           // fallback: ilike sadrži
           const { data: d2, error: e2 } = await supabase
             .from("questions")
             .select("id, text, image_url, mup_id")
             .ilike("mup_id", `%${term}%`)
             .order("created_at", { ascending: true })
             .limit(50);
           if (e2) throw e2;
           setMupHits((d2 ?? []) as any);
         }
       }
     } catch (e: any) {
       setMupErr(e?.message || "Greška pri pretrazi po MUP ID.");
       setMupHits([]);
     } finally {
       setMupLoading(false);
     }
   }, 300);
   return () => clearTimeout(t);
 }, [mupQ]);


  async function searchQuestions() {
    const term = searchTerm.trim();
    const supabase = supabaseBrowser();
    if (!term) { setSearchRes([]); return; }
    setSearchLoading(true);
    const { data, error } = await supabase
      .from("questions")
      .select("id, text, image_url, answers:answers(id, text, is_correct)")
      .ilike("text", `%${term}%`)
      .order("created_at", { ascending: true });
    setSearchLoading(false);
    if (error) { setExErr(error.message); return; }
    setSearchRes((data ?? []) as QuestionMini[]);
  }

  function addWrong(q: QuestionMini) {
    if (selectedWrong.find(x => x.id === q.id)) return;
    setSelectedWrong(prev => [...prev, q]);
  }
  function removeWrong(id: number) {
    setSelectedWrong(prev => prev.filter(x => x.id !== id));
  }

  async function saveNewExam() {
    setExErr(null);
    if (!examDate) return setExErr("Unesi datum ispita.");
    if (examScore < 0) return setExErr("Broj poena mora biti ≥ 0.");

    const supabase = supabaseBrowser();
    const { data: ex, error: exErr } = await supabase
      .from("candidate_exams")
      .insert({
        candidate_id: candId,
        exam_date: examDate,
        score: examScore,
        passed: examPassed === "true"
      })
      .select("id")
      .single();
    if (exErr) return setExErr(exErr.message);

    if (selectedWrong.length > 0) {
      const rows = selectedWrong.map(w => ({ exam_id: ex.id, question_id: w.id }));
      const { error: mapErr } = await supabase.from("candidate_exam_wrong_questions").insert(rows);
      if (mapErr) return setExErr(mapErr.message);
    }

    // reset forme za novi ispit
    setExamDate(""); setExamScore(0); setExamPassed("false");
    setSelectedWrong([]); setWrongSearchOpen(false); setNewExamOpen(false);
    await loadExams();
  }

  function highlight(text: string, term: string) {
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200">{text.slice(idx, idx + term.length)}</mark>
        {text.slice(idx + term.length)}
      </>
    );
  }

  if (loading) return <AdminGuard><p>Učitavanje...</p></AdminGuard>;
  if (!form) return <AdminGuard><p className="text-red-600">Kandidat nije pronađen.</p></AdminGuard>;

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Izmena kandidata</h1>

        {/* Osnovna forma kandidata */}
        <form className="space-y-3" onSubmit={save}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border rounded p-2" placeholder="Ime" value={form.first_name} onChange={e=>update("first_name", e.target.value)} />
            <input className="border rounded p-2" placeholder="Prezime" value={form.last_name} onChange={e=>update("last_name", e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border rounded p-2 w-full" placeholder="ID broj" value={form.id_number} onChange={e=>update("id_number", e.target.value)} />
            <input className="border rounded p-2 w-full" placeholder="Telefon (npr. +381601234567)" value={form.phone ?? ""} onChange={e=>update("phone", e.target.value)} />
          </div>

          <select className="border rounded p-2" value={form.school_id} onChange={e=>update("school_id", Number(e.target.value))}>
            <option value="">Izaberi autoškolu</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-sm block mb-1">Datum teorijskog ispita</label>
              <input type="date" className="border rounded p-2 w-full" value={form.exam_date ?? ""} onChange={e=>update("exam_date", e.target.value || null)} />
            </div>
            <div>
              <label className="text-sm block mb-1">Ishod</label>
              <select className="border rounded p-2 w-full"
                value={form.exam_passed === null ? "" : form.exam_passed ? "true" : "false"}
                onChange={e=>{
                  const v = e.target.value;
                  update("exam_passed", v === "" ? null : v === "true");
                }}>
                <option value="">Nije zadato</option>
                <option value="true">Položen</option>
                <option value="false">Nije položen</option>
              </select>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-sm block mb-1">Prvi čas</label>
              <input type="date" className="border rounded p-2 w-full" value={form.first_lesson_date ?? ""} onChange={e=>update("first_lesson_date", e.target.value || null)} />
            </div>
            <div>
              <label className="text-sm block mb-1">Poslednji čas</label>
              <input type="date" className="border rounded p-2 w-full" value={form.last_lesson_date ?? ""} onChange={e=>update("last_lesson_date", e.target.value || null)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
              <input
                id="notMyCandidate"
                type="checkbox"
                checked={!!form.not_my_candidate}
                onChange={(e) => update("not_my_candidate", e.target.checked)}
              />
              <label htmlFor="notMyCandidate" className="text-sm select-none">
                Nije moj kandidat
              </label>
            </div>

          {err && <p className="text-red-600 text-sm">{err}</p>}
          {ok && <p className="text-green-600 text-sm">{ok}</p>}

          <div className="flex gap-2 flex-wrap">
            <button className="bg-black text-white rounded px-4 py-2">Sačuvaj izmene</button>
            <button type="button" className="border rounded px-4 py-2" onClick={()=>router.push("/admin/candidates")}>Otkaži</button>
            <button
              type="button"
              className="border rounded px-4 py-2"
              onClick={async ()=>{
                setShowExams(v=>!v);
                if (!showExams) await loadExams();
              }}
            >
              Teorijski ispit
            </button>
          </div>
        </form>

        {/* Panel: Teorijski ispiti */}
        {showExams && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Teorijski ispiti</h2>
              <button className="border rounded px-3 py-1" onClick={()=>setNewExamOpen(true)}>Unesi novi teorijski ispit</button>
            </div>

            {examsLoading && <p>Učitavanje...</p>}
            {exErr && <p className="text-red-600 text-sm">{exErr}</p>}
            {!examsLoading && exams.length === 0 && <p className="text-sm text-gray-600">Nema unetih ispita.</p>}

            <div className="space-y-3">
              {exams.map(ex => (
                <div key={ex.id} className="border rounded p-3">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="font-medium">Datum: {ex.exam_date}</div>
                    <div>Poeni: <span className="font-medium">{ex.score}</span></div>
                    <div>
                      Status:{" "}
                      <span className={`px-2 py-0.5 rounded text-xs ${ex.passed ? "bg-green-100 text-green-800":"bg-red-100 text-red-800"}`}>
                        {ex.passed ? "Položen" : "Nije položen"}
                      </span>
                    </div>
                    <div>Grešaka: <span className="font-medium">{ex.wrong_questions?.length ?? 0}</span></div>
                  </div>
                  {ex.wrong_questions && ex.wrong_questions.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-sm space-y-1">
                      {ex.wrong_questions.map(w => (
                        <li key={w.question_id} className="break-words">{w.questions?.text}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VELIKI modal: Novi teorijski ispit + poboljšana pretraga */}
        {newExamOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=>setNewExamOpen(false)}>
            <div className="bg-white rounded-xl shadow p-4 w-full max-w-6xl max-h-[90vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <h3 className="font-semibold mb-3">Novi teorijski ispit</h3>

              {/* Osnovni podaci ispita */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm block mb-1">Datum</label>
                  <input type="date" className="border rounded p-2 w-full" value={examDate} onChange={e=>setExamDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm block mb-1">Poeni</label>
                  <input type="number" min={0} className="border rounded p-2 w-full" value={examScore} onChange={e=>setExamScore(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-sm block mb-1">Status</label>
                  <select className="border rounded p-2 w-full" value={examPassed} onChange={e=>setExamPassed(e.target.value as any)}>
                    <option value="true">Položen</option>
                    <option value="false">Nije položen</option>
                  </select>
                </div>
              </div>

              {/* Pogrešni odgovori – Toggler */}
              <div className="mt-4">
                <button className="border rounded px-3 py-1" onClick={()=>setWrongSearchOpen(v=>!v)}>
                  {wrongSearchOpen ? "Sakrij pogrešne odgovore" : "Pogrešni odgovori"}
                </button>
              </div>

              {/* Poboljšana pretraga: velike kartice pitanja */}
              {wrongSearchOpen && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
                  {/* Levo: rezultati (3/5) */}
                  <div className="lg:col-span-3">
                    <div className="space-y-1">
   <label className="block text-sm">Pretraga po MUP ID</label>
   <input
     className="w-full border rounded p-2"
     placeholder="Unesi MUP ID (npr. 12345 ili deo ID-a)"
     value={mupQ}
     onChange={(e) => setMupQ(e.target.value)}
   />
   <div className="text-xs text-gray-600">
     Unesi tačan ID za 1 rezultat ili deo ID-a za listu (max 50).
   </div>
 </div>

 {/* Rezultati po MUP ID */}
 {mupQ.trim() && (
   <div className="mt-2 space-y-2">
     <div className="text-sm text-gray-700">
       {mupLoading ? "Pretražujem…" : `Pronađeno: ${mupHits.length}`}
       {mupErr && <span className="text-red-600 ml-2">{mupErr}</span>}
     </div>
     <div className="space-y-2 max-h-72 overflow-auto border rounded p-2">
       {mupHits.map((q) => (
         <div key={q.id} className="flex items-start gap-2 border rounded p-2">
           {q.image_url && (
             <img src={q.image_url} alt="" className="h-10 w-14 object-cover rounded" />
           )}
           <div className="flex-1">
             <div className="text-sm font-medium">{q.text}</div>
             <div className="text-xs text-gray-600">MUP ID: {q.mup_id ?? "-"}</div>
           </div>
           <button
             type="button"
             className="border rounded px-2 py-1 text-sm"
             // POSLE (ispravno, koristi setSelectedWrong i dovlači answers)
onClick={async () => {
  // već je dodato?
  if (selectedWrong.some((x) => x.id === q.id)) return;

  // dovuci kompletno pitanje sa odgovorima da ispoštuješ QuestionMini
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("questions")
    .select("id, text, image_url, answers:answers(id, text, is_correct)")
    .eq("id", q.id)
    .single();

  if (!error && data) {
    setSelectedWrong((prev) => [...prev, data as QuestionMini]);
  }
}}

           >
             Dodaj
           </button>
         </div>
       ))}
       {(!mupLoading && mupHits.length === 0) && (
         <div className="text-sm text-gray-500">Nema rezultata.</div>
       )}
     </div>
   </div>
 )}
                    <div className="flex gap-2 mb-3">
                      <input
                        className="border rounded p-2 flex-1"
                        placeholder="Traži pitanje po tekstu…"
                        value={searchTerm}
                        onChange={e=>setSearchTerm(e.target.value)}
                      />
                      <button
                        className="border rounded px-3 py-1"
                        onClick={searchQuestions}
                        disabled={searchLoading}
                        title="Pokreni pretragu"
                      >
                        {searchLoading ? "Pretraga..." : "Pretraži"}
                      </button>
                    </div>

                    <div className="space-y-3">
                      {searchRes.map(q => (
                        <div
                          key={q.id}
                          className="border rounded-lg p-3 hover:shadow cursor-pointer"
                          onClick={() => addWrong(q)}
                        >
                          <div className="flex gap-3">
                            {q.image_url && (
                              <div className="w-40 h-28 border rounded overflow-hidden bg-gray-50 shrink-0">
                                <img src={q.image_url} alt="slika pitanja" className="w-full h-full object-contain" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium break-words">
                                {highlight(q.text, searchTerm)}
                              </div>
                              <ul className="mt-2 text-sm space-y-1">
                                {q.answers.map(a => (
                                  <li key={a.id} className="flex items-start gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded mt-[2px] ${a.is_correct ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                                      {a.is_correct ? "tačan" : "odgovor"}
                                    </span>
                                    <span className="break-words">{a.text}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          <div className="text-right mt-2">
                            <button className="text-sm underline" onClick={(e)=>{ e.stopPropagation(); addWrong(q); }}>
                              Dodaj
                            </button>
                          </div>
                        </div>
                      ))}
                      {searchRes.length === 0 && !searchLoading && (
                        <div className="text-sm text-gray-500">Nema rezultata. Unesite deo teksta pitanja pa pretražite.</div>
                      )}
                    </div>
                  </div>

                  {/* Desno: odabrana pogrešna (2/5) */}
                  <div className="lg:col-span-2">
                    <div className="border rounded-lg p-3 h-full">
                      <div className="text-sm font-medium mb-2">
                        Odabrana pogrešna pitanja ({selectedWrong.length})
                      </div>
                      <ul className="space-y-2 max-h-[60vh] overflow-auto pr-1">
                        {selectedWrong.map(q => (
                          <li key={q.id} className="border rounded p-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium break-words">{q.text}</div>
                                <div className="mt-1">
                                  <span className="text-xs text-gray-500">Odgovori: {q.answers.length}, tačnih: {q.answers.filter(a=>a.is_correct).length}</span>
                                </div>
                              </div>
                              <button className="text-xs text-red-600 underline shrink-0" onClick={()=>removeWrong(q.id)}>Ukloni</button>
                            </div>
                          </li>
                        ))}
                        {selectedWrong.length === 0 && <li className="text-xs text-gray-500">Još ništa nije odabrano.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {exErr && <p className="text-red-600 text-sm mt-3">{exErr}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button className="border rounded px-4 py-2" onClick={()=>setNewExamOpen(false)}>Otkaži</button>
                <button className="bg-black text-white rounded px-4 py-2" onClick={saveNewExam}>Sačuvaj ispit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
