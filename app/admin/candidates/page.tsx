// file: app/admin/candidates/page.tsx
"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
  school?: { name: string } | null;
};

function formatPhone(v?: string | null) {
  if (!v) return "–";
  const only = v.replace(/[^\d+]/g, "");
  // grupisanje radi čitljivosti (nema striktne validacije)
  return only.replace(/^(\+?\d{1,3})(\d{2,3})(\d{3})(\d+)$/, "$1 $2 $3 $4");
}
function examBadge(passed: boolean | null, date?: string | null) {
  const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs";
  if (passed === true) return <span className={`${base} bg-green-100 text-green-800`}>Položen{date ? ` • ${date}` : ""}</span>;
  if (passed === false) return <span className={`${base} bg-red-100 text-red-800`}>Nije položen{date ? ` • ${date}` : ""}</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>Nije zadato</span>;
}

export default function CandidatesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<number | "">("");
  const [examFilter, setExamFilter] = useState<"" | "true" | "false">("");
  const [idSearch, setIdSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      .select(
        "id,first_name,last_name,id_number,phone,school_id,exam_date,exam_passed,first_lesson_date,last_lesson_date,school:schools(name)"
      )
      .order("created_at", { ascending: true });

    if (schoolFilter) q = q.eq("school_id", schoolFilter);
    if (examFilter !== "") q = q.eq("exam_passed", examFilter === "true");
    if (idSearch.trim()) q = q.ilike("id_number", `%${idSearch.trim()}%`);
    if (nameSearch.trim()) {
      const t = nameSearch.trim();
      q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
    }

    const { data, error } = await q.returns<Candidate[]>();
    setLoading(false);
    if (error) return console.error(error);
    setCands(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number) {
    if (!confirm("Da li stvarno želite da obrišete kandidata?")) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) {
      alert("Brisanje neuspešno: " + error.message);
      return;
    }
    await load();
  }

  return (
    <AdminGuard>
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Kandidati</h1>

        {/* Filter traka */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
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

        {/* Lista kandidata - novi dizajn */}
        <div className="space-y-3">
          {cands.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold leading-tight">{c.first_name} {c.last_name}</h3>
                  <div className="mt-1">{examBadge(c.exam_passed, c.exam_date)}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="border rounded px-3 py-1"
                    onClick={() => router.push(`/admin/candidates/${c.id}`)}
                  >
                    Izmeni
                  </button>
                  <button
                    className="border rounded px-3 py-1 text-red-600"
                    onClick={() => handleDelete(c.id)}
                  >
                    Obriši
                  </button>
                </div>
              </div>

              {/* Telo: info grid */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kolona 1 */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between md:justify-start md:gap-6">
                    <div>
                      <div className="text-xs text-gray-500">ID broj</div>
                      <div className="font-medium break-all">{c.id_number}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Telefon</div>
                      <div className="font-medium">{formatPhone(c.phone)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Autoškola</div>
                    <div className="font-medium whitespace-pre-line">{c.school?.name ?? "–"}</div>
                  </div>
                </div>

                {/* Kolona 2 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Prvi čas</div>
                    <div className="font-medium">{c.first_lesson_date ?? "–"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Poslednji čas</div>
                    <div className="font-medium">{c.last_lesson_date ?? "–"}</div>
                  </div>
                  {/* Rezervisano za dodatna polja u budućnosti */}
                </div>
              </div>
            </div>
          ))}

          {cands.length === 0 && (
            <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-600">Nema rezultata.</div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
