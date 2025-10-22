// file: app/admin/candidates/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type School = { id: number; name: string };
type Candidate = {
  id: number;
  first_name: string;
  last_name: string;
  id_number: string;
  phone: string | null;                 // ← NOVO
  school_id: number;
  exam_date: string | null;
  exam_passed: boolean | null;
  first_lesson_date: string | null;
  last_lesson_date: string | null;
};

export default function EditCandidatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const candId = Number(params.id);

  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const [{ data: sc }, { data: c, error }] = await Promise.all([
        supabase.from("schools").select("*").order("created_at", { ascending: true }),
        supabase.from("candidates").select("*").eq("id", candId).single()
      ]);
      if (error) { setErr(error.message); setLoading(false); return; }
      setSchools(sc ?? []);
      const cand = c as Candidate;
      if (!cand.phone) cand.phone = null;
      setForm(cand);
      setLoading(false);
    })();
  }, [candId]);

  function normalizePhone(v: string) {
    return v.replace(/[^\d+]/g, "");
  }

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
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      id_number: form.id_number.trim(),
      phone: form.phone ? normalizePhone(form.phone) : null, // ← NOVO
      school_id: form.school_id,
      exam_date: form.exam_date || null,
      exam_passed: form.exam_passed,
      first_lesson_date: form.first_lesson_date || null,
      last_lesson_date: form.last_lesson_date || null
    };
    const { error } = await supabase.from("candidates").update(payload).eq("id", candId);
    if (error) return setErr(error.message);

    setOk("Sačuvano.");
    setTimeout(() => router.push("/admin/candidates"), 600);
  }

  if (loading) return <AdminGuard><p>Učitavanje...</p></AdminGuard>;
  if (!form) return <AdminGuard><p className="text-red-600">Kandidat nije pronađen.</p></AdminGuard>;

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Izmena kandidata</h1>
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

          {err && <p className="text-red-600 text-sm">{err}</p>}
          {ok && <p className="text-green-600 text-sm">{ok}</p>}

          <div className="flex gap-2">
            <button className="bg-black text-white rounded px-4 py-2">Sačuvaj izmene</button>
            <button type="button" className="border rounded px-4 py-2" onClick={()=>router.push("/admin/candidates")}>Otkaži</button>
          </div>
        </form>
      </div>
    </AdminGuard>
  );
}
