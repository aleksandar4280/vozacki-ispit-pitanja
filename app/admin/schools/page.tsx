// file: app/admin/schools/page.tsx
"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type School = { id: number; name: string };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from("schools").select("*").order("created_at", { ascending: true });
    setSchools(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = name.trim();
    if (!n) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("schools").insert({ name: n });
    if (error) return setErr(error.message);
    setName("");
    load();
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Škole</h1>
        <form className="flex gap-2" onSubmit={add}>
          <input className="border rounded p-2 flex-1" placeholder="Naziv škole" value={name} onChange={e=>setName(e.target.value)} />
          <button className="bg-black text-white rounded px-4">Dodaj</button>
        </form>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <ul className="bg-white rounded shadow divide-y">
          {schools.map(s => <li key={s.id} className="p-3">{s.name}</li>)}
        </ul>
      </div>
    </AdminGuard>
  );
}
