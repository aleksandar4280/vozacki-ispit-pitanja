// file: app/simulacije/new/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Answer = { id: number; text: string; is_correct: boolean };
type Question = {
  id: number;
  text: string;
  image_url: string | null;
  points: number;
  multi_correct: boolean;
  answers: Answer[];
};

async function findDuplicateSimulation(
  sb: ReturnType<typeof supabaseBrowser>,
  newIdsSorted: number[]
): Promise<number | null> {
  if (newIdsSorted.length !== 41) return null;

  // A) pronađi simulacije čiji su SVA njihova pitanja u našem
  const { data: inRows, error: eIn } = await sb
    .from("simulation_questions")
    .select("simulation_id, question_id")
    .in("question_id", newIdsSorted);
  if (eIn) throw eIn;

  const inCount = new Map<number, Set<number>>();
  for (const r of inRows ?? []) {
    const set = inCount.get(r.simulation_id) ?? new Set<number>();
    set.add(r.question_id);
    inCount.set(r.simulation_id, set);
  }
  const candidates = [...inCount.entries()]
    .filter(([, set]) => set.size === 41)
    .map(([simId]) => simId);

  if (candidates.length === 0) return null;

  // B) proveri da kandidati NEMAJU drugih pitanja (ukupno tačno 41)
  const { data: allRows, error: eAll } = await sb
    .from("simulation_questions")
    .select("simulation_id, question_id")
    .in("simulation_id", candidates);
  if (eAll) throw eAll;

  const totalCount = new Map<number, Set<number>>();
  for (const r of allRows ?? []) {
    const set = totalCount.get(r.simulation_id) ?? new Set<number>();
    set.add(r.question_id);
    totalCount.set(r.simulation_id, set);
  }

  for (const simId of candidates) {
    if ((totalCount.get(simId)?.size ?? 0) === 41) {
      // identičan skup (pošto su svi njihovi ID-jevi u našem + ukupno 41)
      return simId;
    }
  }
  return null;
}


function formatTacni(count: number): string {
  if (count === 1) return "Jedan tačan";
  const mod10 = count % 10, mod100 = count % 100;
  const srednji = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  return srednji ? `${count} tačna odgovora` : `${count} tačnih odgovora`;
}

// PATCH: zameni samo komponentu QuestionRow u file: app/simulacije/new/page.tsx

function QuestionRow({ q, onAdd }: { q: Question; onAdd: (q: Question) => void }) {
  const correctCount = q.answers.reduce((n, a) => n + (a.is_correct ? 1 : 0), 0);
  const hasImage = !!q.image_url;

  return (
    <div className="border rounded p-3 hover:shadow">
      <div className={hasImage ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        {/* Leva kolona: slika (ako postoji) + odgovori ispod slike */}
        <div>
          {hasImage && (
            <div className="w-full border rounded overflow-hidden bg-gray-50">
              <img
                src={q.image_url as string}
                alt="slika pitanja"
                loading="lazy"
                className="w-full h-48 object-contain"
              />
            </div>
          )}

          {/* Odgovori – uvek pune širine ove kolone; sa slikom su ispod slike */}
          <div className="mt-2 space-y-2">
            {q.answers.map((a) => (
              <div
                key={a.id}
                className={[
                  "w-full rounded border px-3 py-2 text-sm",
                  a.is_correct ? "bg-green-50 border-green-200" : "border-gray-200",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[10px] px-1.5 py-0.5 rounded mr-2",
                    a.is_correct ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700",
                  ].join(" ")}
                >
                  {a.is_correct ? "tačan" : "odgovor"}
                </span>
                {a.text}
              </div>
            ))}
          </div>
        </div>

        {/* Desna (ili jedina) kolona: tekst + meta + Dodaj */}
        <div className={!hasImage ? "" : "flex flex-col"}>
          <div className="flex-1">
            <div className="text-sm font-medium break-words">{q.text}</div>
            <div className="text-xs text-gray-600 mt-1">
              Bodovi: {q.points} • {correctCount === 1 ? "Jedan tačan" : formatTacni(correctCount)}
            </div>
          </div>
          <div className="mt-2 text-right">
            <button className="text-sm underline" onClick={() => onAdd(q)}>
              Dodaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function NewSimulationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Question[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const count = picked.length;
  const totalPoints = useMemo(() => picked.reduce((s, q) => s + (q.points || 0), 0), [picked]);

  // Debounced pretraga pitanja

useEffect(() => {
  const t = term.trim();
  if (debounceRef.current) clearTimeout(debounceRef.current);
  if (t.length < 2) { setHits([]); return; }

  debounceRef.current = setTimeout(async () => {
    setLoading(true);
    try {
      const sb = supabaseBrowser();

      // 1) Pretraga po tekstu pitanja
      const { data: qByText } = await sb
        .from("questions")
        .select("id, text, image_url, points, multi_correct, answers:answers(id, text, is_correct)")
        .ilike("text", `%${t}%`)
        .order("created_at", { ascending: true })
        .limit(100);

      const byText = (qByText ?? []) as Question[];

      // 2) Pretraga po tekstu odgovora → najpre iz answers izvući question_id
      const { data: ansRows } = await sb
        .from("answers")
        .select("question_id")
        .ilike("text", `%${t}%`)
        .limit(500);

      const idsFromAnswers = Array.from(
        new Set((ansRows ?? []).map(r => r.question_id as number))
      );

      // ukloni već dohvaćena pitanja da ne dupliramo upit
      const existingIds = new Set(byText.map(q => q.id));
      const missingIds = idsFromAnswers.filter(id => !existingIds.has(id));

      let byAnswers: Question[] = [];
      if (missingIds.length > 0) {
        const { data: qByAns } = await sb
          .from("questions")
          .select("id, text, image_url, points, multi_correct, answers:answers(id, text, is_correct)")
          .in("id", missingIds)
          .order("created_at", { ascending: true })
          .limit(500);
        byAnswers = (qByAns ?? []) as Question[];
      }

      // 3) Spoji bez duplikata
      const mergedMap = new Map<number, Question>();
      for (const q of [...byText, ...byAnswers]) mergedMap.set(q.id, q);
      setHits(Array.from(mergedMap.values()));
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, 350);

  return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
}, [term]);


  function add(q: Question) {
    if (picked.find((p) => p.id === q.id)) return;
    if (picked.length >= 41) return;
    setPicked((prev) => [...prev, q]);
  }
  function remove(id: number) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }
  function move(id: number, dir: -1 | 1) {
    setPicked((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const clone = prev.slice();
      const tmp = clone[idx]; clone[idx] = clone[j]; clone[j] = tmp;
      return clone;
    });
  }

  const ready = count === 41;

  async function save() {
  if (!ready) {
    alert("Potrebno je tačno 41 pitanje i zbir bodova 100.");
    return;
  }
  const sb = supabaseBrowser();

  // sortiran fingerprint novih 41 ID-jeva
  const newIds = picked.map(q => q.id).sort((a, b) => a - b);

  try {
    const dupId = await findDuplicateSimulation(sb, newIds);
    if (dupId) {
      alert(`Simulacija sa istim skupom pitanja već postoji (ID: ${dupId}). Nova nije sačuvana.`);
      return;
    }
  } catch (e: any) {
    alert(e?.message ?? "Greška pri proveri duplikata.");
    return;
  }

  // upis simulacije
  const { data: sim, error: e1 } = await sb
    .from("simulations")
    .insert({ title: title.trim() || null })
    .select("id")
    .single();
  if (e1) { alert(e1.message); return; }

  const rows = picked.map((q, i) => ({
    simulation_id: sim!.id,
    question_id: q.id,
    order_index: i,
  }));
  const { error: e2 } = await sb.from("simulation_questions").insert(rows);
  if (e2) { alert(e2.message); return; }

  router.push(`/simulacije/${sim!.id}`);
}


  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Nova simulacija</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm">Naziv simulacije (opciono)</label>
          <input
            className="w-full border rounded p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="npr. Serija A-1"
          />
        </div>
        <div className="flex items-end">
          <div className="text-sm">
            Pitanja: <b>{count}/41</b> • Bodovi: <b>{totalPoints}/100</b>
          </div>
        </div>
      </div>

      {/* Pretraga i rezultati + odabrana lista */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rezultati pretrage sa odgovorima */}
        <div>
          <label className="block text-sm">Pretraga pitanja po tekstu</label>
          <input
            className="w-full border rounded p-2"
            placeholder="Unesi deo teksta (min. 2 znaka)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <div className="text-xs text-gray-600 mt-1">
            Klik na “Dodaj” ubacuje pitanje u simulaciju (max 41).
          </div>

          <div className="mt-2 space-y-2 max-h-[60vh] overflow-auto">
            {loading && <div>Pretražujem…</div>}
            {hits.map((q) => (
              <QuestionRow key={q.id} q={q} onAdd={add} />
            ))}
            {!loading && hits.length === 0 && term.trim().length >= 2 && (
              <div className="text-sm text-gray-600">Nema rezultata.</div>
            )}
          </div>
        </div>

        {/* Odabrana pitanja + redosled */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Odabrana pitanja ({count})</div>
            <div className="text-xs text-gray-600">Bodovi: {totalPoints}/100</div>
          </div>
          <div className="mt-2 space-y-2 max-h-[60vh] overflow-auto">
            {picked.map((q, idx) => (
              <div key={q.id} className="border rounded p-2">
                <div className="flex gap-2 items-start">
                  <div className="text-xs w-5 text-gray-600 mt-1">{idx + 1}.</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium break-words">{q.text}</div>
                    <div className="text-xs text-gray-600">Bodovi: {q.points}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button className="text-xs border rounded px-2 py-0.5" onClick={() => move(q.id, -1)}>Gore</button>
                    <button className="text-xs border rounded px-2 py-0.5" onClick={() => move(q.id, 1)}>Dole</button>
                    <button className="text-xs text-red-600 underline" onClick={() => remove(q.id)}>Ukloni</button>
                  </div>
                </div>
              </div>
            ))}
            {picked.length === 0 && (
              <div className="text-sm text-gray-600">Još ništa nije dodato.</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="border rounded px-4 py-2" onClick={() => history.back()}>Otkaži</button>
        <button
          className={`rounded px-4 py-2 ${ready ? "bg-black text-white" : "bg-gray-200 text-gray-500"}`}
          disabled={!ready}
          onClick={save}
          title="Potrebno je tačno 41 pitanja i zbir bodova 100"
        >
          Sačuvaj simulaciju
        </button>
      </div>
    </div>
  );
}
