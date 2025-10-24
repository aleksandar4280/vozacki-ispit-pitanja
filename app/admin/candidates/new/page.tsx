// file: app/admin/candidates/new/page.tsx
"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type School = { id: number; name: string };

export default function NewCandidatePage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState(""); // ← NOVO
  const [examDate, setExamDate] = useState<string>("");
  const [examPassed, setExamPassed] = useState<boolean | "">("");
  const [firstLesson, setFirstLesson] = useState<string>("");
  const [lastLesson, setLastLesson] = useState<string>("");
  const [notMyCandidate, setNotMyCandidate] = useState<boolean>(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data } = await supabase.from("schools").select("*").order("created_at", { ascending: true });
      setSchools(data ?? []);
    })();
  }, []);

  function normalizePhone(v: string) {
    // zašto: čuva + i cifre (lokalna normalizacija radi urednosti)
    return v.replace(/[^\d+]/g, "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!firstName.trim() || !lastName.trim()) return setErr("Ime i prezime su obavezni.");
    if (!idNumber.trim()) return setErr("ID broj je obavezan.");
    if (!schoolId) return setErr("Izaberi autoškolu.");
    if (firstLesson && lastLesson && new Date(lastLesson) < new Date(firstLesson)) {
      return setErr("Poslednji čas ne može biti pre prvog časa.");
    }

    const supabase = supabaseBrowser();
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      id_number: idNumber.trim(),
      phone: phone ? normalizePhone(phone) : null, // ← NOVO
      school_id: schoolId,
      exam_date: examDate || null,
      exam_passed: examPassed === "" ? null : !!examPassed,
      first_lesson_date: firstLesson || null,
      last_lesson_date: lastLesson || null,
      not_my_candidate: !!notMyCandidate
    };

    const { error } = await supabase.from("candidates").insert(payload);
    if (error) return setErr(error.message);

    // reset (zadržavamo izabranu školu)
    setFirstName(""); setLastName(""); setIdNumber(""); setPhone("");
    setExamDate(""); setExamPassed("");
    setFirstLesson(""); setLastLesson("");
    setNotMyCandidate(false);
    setOk("Kandidat je sačuvan.");
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Novi kandidat</h1>
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border rounded p-2" placeholder="Ime" value={firstName} onChange={e=>setFirstName(e.target.value)} />
            <input className="border rounded p-2" placeholder="Prezime" value={lastName} onChange={e=>setLastName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="border rounded p-2 w-full" placeholder="ID broj" value={idNumber} onChange={e=>setIdNumber(e.target.value)} />
            <input className="border rounded p-2 w-full" placeholder="Telefon (npr. +381601234567)" value={phone} onChange={e=>setPhone(e.target.value)} />
          </div>

          <select className="border rounded p-2" value={schoolId} onChange={e=>setSchoolId(Number(e.target.value))}>
            <option value="">Izaberi autoškolu</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-sm block mb-1">Datum teorijskog ispita</label>
              <input type="date" className="border rounded p-2 w-full" value={examDate} onChange={e=>setExamDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm block mb-1">Ishod</label>
              <select className="border rounded p-2 w-full" value={examPassed === "" ? "" : examPassed ? "true" : "false"} onChange={e=>{
                const v = e.target.value;
                setExamPassed(v === "" ? "" : v === "true");
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
              <input type="date" className="border rounded p-2 w-full" value={firstLesson} onChange={e=>setFirstLesson(e.target.value)} />
            </div>
            <div>
              <label className="text-sm block mb-1">Poslednji čas</label>
              <input type="date" className="border rounded p-2 w-full" value={lastLesson} onChange={e=>setLastLesson(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
              {/* Zašto: direktan boolean za jasne filtere i izveštaje */}
              <input
                id="notMyCandidate"
                type="checkbox"
                checked={notMyCandidate}
                onChange={(e) => setNotMyCandidate(e.target.checked)}
              />
              <label htmlFor="notMyCandidate" className="text-sm select-none">
                Nije moj kandidat
              </label>
            </div>
          

          {err && <p className="text-red-600 text-sm">{err}</p>}
          {ok && <p className="text-green-600 text-sm">{ok}</p>}

          <button className="bg-black text-white rounded px-4 py-2">Sačuvaj kandidata</button>
        </form>
      </div>
    </AdminGuard>
  );
}
