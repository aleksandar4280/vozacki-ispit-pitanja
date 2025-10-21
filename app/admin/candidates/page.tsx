// file: app/admin/candidates/page.tsx
"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type School = { id: number; name: string };
type Candidate = {
  id: number;
  first_name: string;
  last_name: string;
  id_number: string;
  school_id: number;
  exam_date: string | null;
  exam_passed: boolean | null;
  first_lesson_date: string | null;
  last_lesson_date: string | null;
  school?: { name: string } | null;
};

export default function CandidatesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);

  const [schoolFilter, setSchoolFilter] = useState<number | "">("");
  const [examFilter, setExamFilter] = useState<"" | "true" | "false">("");
  const [idSearch, setIdSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data } = await supabase.from("schools").select("*").order("created_at", { ascending: true });
      setSchools(data ?? []);
    })();
  }, []);

  async function load() {
    setLoading(true);
    const supabase = supabaseBrowser();
    let q = supabase
      .from("candidates")
      .select("id,first_name,last_name,id_number,school_id,exam_date,exam_passed,first_lesson_date,last_lesson_date,school:schools(name)")
      .order("created_at", { ascending: true });

    if (schoolFilter) q = q.eq("school_id", schoolFilter);
    if (examFilter !== "") q = q.eq("exam_passed", examFilter === "true");

    if (idSearch.trim()) q = q.ilike("id_number", `%${idSearch.trim()}%`);
    if (nameSearch.trim()) {
      const t = nameSearch.trim();
      q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
    }

    const { data, error } = await q;
    setLoading(false);
    if (error) return console.error(error);
    setCands(data ?? []);
  }

  useEffect(() => { load(); /* init */ }, []);

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Kandidati</h1>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-sm block mb-1">Pretraga po imenu/prezimenu</label>
            <input className="border rounded p-2 w-full" placeholder="npr. Marko" value={nameSearch} onChange={e=>setNameSearch(e.target.value)} />
          </div>
          <div>
            <label className="text-sm block mb-1">Pretraga po ID broju</label>
            <input className="border rounded p-2 w-full" placeholder="npr. 012345" value={idSearch} onChange={e=>setIdSearch(e.target.value)} />
          </div>
          <div>
            <label className="text-sm block mb-1">Autoškola</label>
            <select className="border rounded p-2 w-full" value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Sve</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm block mb-1">Teorijski ispit</label>
            <select className="border rounded p-2 w-full" value={examFilter} onChange={e=>setExamFilter(e.target.value as any)}>
              <option value="">Svi</option>
              <option value="true">Položen</option>
              <option value="false">Nije položen</option>
            </select>
          </div>
          <div className="md:col-span-5 flex gap-2">
            <button className="bg-black text-white rounded px-4 py-2" onClick={load} disabled={loading}>{loading ? "Učitavanje..." : "Primeni filtere"}</button>
            <button className="border rounded px-4 py-2" onClick={() => { setSchoolFilter(""); setExamFilter(""); setIdSearch(""); setNameSearch(""); load(); }}>Reset</button>
          </div>
        </div>

        <div className="text-sm text-gray-700">Ukupno kandidata: <span className="font-semibold">{cands.length}</span></div>

        <div className="bg-white rounded shadow divide-y">
          {cands.map(c => (
            <div key={c.id} className="p-3 text-sm grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="font-medium">{c.first_name} {c.last_name}</div>
              <div>ID: {c.id_number}</div>
              <div>Škola: {c.school?.name ?? "-"}</div>
              <div>Ispit: {c.exam_passed == null ? "-" : (c.exam_passed ? "Položen" : "Nije položen")}{c.exam_date ? ` (${c.exam_date})` : ""}</div>
              <div>Prvi čas: {c.first_lesson_date ?? "-"}</div>
              <div>Poslednji čas: {c.last_lesson_date ?? "-"}</div>
            </div>
          ))}
          {cands.length === 0 && <div className="p-4 text-sm text-gray-600">Nema rezultata.</div>}
        </div>
      </div>
    </AdminGuard>
  );
}
