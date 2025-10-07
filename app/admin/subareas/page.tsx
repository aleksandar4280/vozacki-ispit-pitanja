"use client";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string; };
type Sub = { id: number; name: string; area_id: number; };

export default function SubareasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const supabase = supabaseBrowser();
    const { data: a } = await supabase.from("areas").select("*").order("created_at", { ascending: true });
    setAreas(a ?? []);
    const { data: s } = await supabase.from("subareas").select("*").order("created_at", { ascending: true });
    setSubs(s ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !areaId) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("subareas").insert({ name: name.trim(), area_id: areaId });
    if (error) return setErr(error.message);
    setName(""); setAreaId("");
    load();
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Podoblasti</h1>
        <form className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start" onSubmit={add}>
          <select className="border rounded p-2" value={areaId} onChange={e=>setAreaId(Number(e.target.value))}>
            <option value="">Izaberi oblast</option>
            {areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
            <input className="border rounded p-2" placeholder="Naziv podoblasti" value={name} onChange={e=>setName(e.target.value)} />
            <button className="bg-black text-white rounded px-4 py-2">Dodaj</button>
        </form>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <div className="bg-white rounded shadow divide-y">
          {subs.map(s=>(
            <div key={s.id} className="p-3 text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-gray-500"> (oblast #{s.area_id})</span>
            </div>
          ))}
        </div>
      </div>
    </AdminGuard>
  );
}