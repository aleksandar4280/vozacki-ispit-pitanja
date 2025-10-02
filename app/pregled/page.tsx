"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import Image from "next/image";

type Area = { id: number; name: string; };
type Sub = { id: number; name: string; area_id: number; };
type Answer = { id: number; text: string; is_correct: boolean };
type Question = {
  id: number; text: string; image_url: string | null; points: number; multi_correct: boolean;
  answers: Answer[];
};

export default function PregledPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});

  const filteredSubs = useMemo(() => subs.filter(s=>s.area_id === areaId), [subs, areaId]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: a } = await supabase.from("areas").select("*").order("name");
      setAreas(a ?? []);
      const { data: s } = await supabase.from("subareas").select("*").order("name");
      setSubs(s ?? []);
    })();
  }, []);

  async function load() {
    if (!subId) return;
    const supabase = supabaseBrowser();
    const { data: qs, error } = await supabase
      .from("questions")
      .select("id, text, image_url, points, multi_correct, answers:answers(id, text, is_correct)")
      .eq("subarea_id", subId)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    setQuestions(qs ?? []);
    setReveal({});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pregled pitanja</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className="border rounded p-2" value={areaId} onChange={e=>{ setAreaId(Number(e.target.value)); setSubId(""); }}>
          <option value="">Izaberi oblast</option>
          {areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="border rounded p-2" value={subId} onChange={e=>setSubId(Number(e.target.value))} disabled={!areaId}>
          <option value="">Izaberi podoblast</option>
          {filteredSubs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="bg-black text-white rounded px-4" onClick={load} disabled={!subId}>Prikaži pitanja</button>
      </div>

      <div className="space-y-4">
        {questions.map(q=>(
          <div key={q.id} className="bg-white rounded-xl shadow p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{q.text}</p>
                <p className="text-xs text-gray-500">Bodovi: {q.points} • {q.multi_correct ? "Više tačnih" : "Jedan tačan"}</p>
              </div>
              {q.image_url && (
                <div className="relative w-40 h-24 shrink-0">
                  <Image src={q.image_url} alt="slika pitanja" fill className="object-contain rounded"/>
                </div>
              )}
            </div>

            <ul className="mt-3 space-y-2">
              {q.answers.map(a=>{
                const isShown = reveal[q.id];
                const isCorrect = a.is_correct && isShown;
                return (
                  <li key={a.id} className={`border rounded p-2 ${isCorrect ? "bg-green-100 border-green-300" : ""}`}>
                    {a.text}
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex gap-2">
              <button className="border rounded px-3 py-1" onClick={()=>setReveal(prev=>({ ...prev, [q.id]: !prev[q.id] }))}>
                {reveal[q.id] ? "Sakrij tačan odgovor" : "Prikaži tačan odgovor"}
              </button>
            </div>
          </div>
        ))}
        {questions.length === 0 && <p className="text-sm text-gray-600">Nema pitanja za izabranu podoblast.</p>}
      </div>
    </div>
  );
}