"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string; };

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.from("areas").select("*").order("created_at", { ascending: true });
    setAreas(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("areas").insert({ name: name.trim() });
    if (error) return setErr(error.message);
    setName("");
    load();
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Oblasti</h1>
        <form className="flex gap-2" onSubmit={addArea}>
          <input className="border rounded p-2 flex-1" placeholder="Naziv oblasti" value={name} onChange={e=>setName(e.target.value)} />
          <button className="bg-black text-white rounded px-4">Dodaj</button>
        </form>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <ul className="bg-white rounded shadow divide-y">
          {areas.map(a=>(
            <li key={a.id} className="p-3">{a.name}</li>
          ))}
        </ul>
      </div>
    </AdminGuard>
  );
}