// file: app/pregled/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string };
type Sub = { id: number; name: string; area_id: number };
type Answer = { id: number; text: string; is_correct: boolean };
type Question = {
  id: number;
  text: string;
  image_url: string | null;
  points: number;
  multi_correct: boolean;
  answers: Answer[];
};

function formatTacni(count: number): string {
  if (count === 1) return "Jedan tačan odgovor";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const srednji = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  return srednji ? `${count} tačna odgovora` : `${count} tačnih odgovora`;
}

export default function PregledPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // zašto: da znamo da je korisnik tražio prikaz

  const filteredSubs = useMemo(() => subs.filter((s) => s.area_id === areaId), [subs, areaId]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: a } = await supabase.from("areas").select("*").order("created_at", { ascending: true });
      setAreas(a ?? []);
      const { data: s } = await supabase.from("subareas").select("*").order("created_at", { ascending: true });
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
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    setQuestions(qs ?? []);
    setReveal({});
    setLoaded(true);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pregled pitanja</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          className="border rounded p-2"
          value={areaId}
          onChange={(e) => { setAreaId(Number(e.target.value)); setSubId(""); setLoaded(false); }}
        >
          <option value="">Izaberi oblast</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          className="border rounded p-2"
          value={subId}
          onChange={(e) => { setSubId(Number(e.target.value)); setLoaded(false); }}
          disabled={!areaId}
        >
          <option value="">Izaberi podoblast</option>
          {filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <button className="bg-black text-white rounded px-4" onClick={load} disabled={!subId}>
          Prikaži pitanja
        </button>
      </div>

      {/* Ukupan broj pitanja za izabranu podoblast */}
      {loaded && (
        <div className="text-sm text-gray-700">
          Ukupno pitanja: <span className="font-semibold">{questions.length}</span>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q) => {
          const correctCount = q.answers.reduce((acc, a) => acc + (a.is_correct ? 1 : 0), 0);
          const meta = correctCount === 1 ? "Jedan tačan" : formatTacni(correctCount);

          return (
            <div key={q.id} className="bg-white rounded-xl shadow p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{q.text}</p>
                  <p className="text-xs text-gray-500">Bodovi: {q.points} • {meta}</p>
                </div>

                {q.image_url && (
                  <div className="relative shrink-0">
                    <div className="w-72 h-44 md:w-96 md:h-56 border rounded overflow-hidden bg-gray-50">
                      <img
                        src={q.image_url}
                        alt="slika pitanja"
                        className="w-full h-full object-contain cursor-zoom-in"
                        onClick={() => setPreviewUrl(q.image_url!)} // zašto: brzi pregled u punoj veličini
                      />
                    </div>
                    <div className="text-right mt-1">
                      <button className="text-xs underline" onClick={() => setPreviewUrl(q.image_url!)}>
                        Uvećaj
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {q.answers.map((a) => {
                  const isShown = reveal[q.id];
                  const isCorrect = a.is_correct && isShown;
                  return (
                    <li
                      key={a.id}
                      className={`border rounded p-2 ${isCorrect ? "bg-green-100 border-green-300" : ""}`}
                    >
                      {a.text}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex gap-2">
                <button
                  className="border rounded px-3 py-1"
                  onClick={() => setReveal((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                >
                  {reveal[q.id] ? "Sakrij tačan odgovor" : "Prikaži tačan odgovor"}
                </button>
              </div>
            </div>
          );
        })}

        {loaded && questions.length === 0 && (
          <p className="text-sm text-gray-600">Nema pitanja za izabranu podoblast.</p>
        )}
      </div>

      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="max-w-5xl max-h-[85vh] w-full" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="uvećana slika" className="w-full h-full object-contain rounded" />
            <div className="text-right mt-2">
              <button className="bg-white text-black rounded px-3 py-1" onClick={() => setPreviewUrl(null)}>
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
