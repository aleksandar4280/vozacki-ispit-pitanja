// file: app/pogresna/page.tsx  (NOVA STRANICA)
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string; created_at?: string };
type Sub = { id: number; name: string; area_id: number; created_at?: string };
type Answer = { id: number; text: string; is_correct: boolean };
type Question = {
  id: number;
  text: string;
  image_url: string | null;
  points: number;
  multi_correct: boolean;
  subarea_id: number;
  answers: Answer[];
};
type WrongRow = {
  question_id: number;
  questions: Question;
};

function formatTacni(count: number): string {
  if (count === 1) return "Jedan tačan";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const srednji = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
  return srednji ? `${count} tačna odgovora` : `${count} tačnih odgovora`;
}

function QuestionCard({
  q,
  revealed,
  onToggleReveal,
  onPreview,
}: {
  q: Question;
  revealed: boolean;
  onToggleReveal: () => void;
  onPreview: (url: string) => void;
}) {
  const correctCount = q.answers.reduce((n, a) => n + (a.is_correct ? 1 : 0), 0);
  const meta = correctCount === 1 ? "Jedan tačan" : formatTacni(correctCount);
  const hasImage = !!q.image_url;

  return (
    <div className="border rounded p-3 space-y-3">
      <div className={hasImage ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        <div>
          <div className="font-medium whitespace-pre-wrap">{q.text}</div>
          <div className="text-sm text-gray-600">Bodovi: {q.points} • {meta}</div>
        </div>
        {hasImage && (
          <div className="md:pl-2">
            <div className="mt-1">
              <img
                src={q.image_url as string}
                alt="slika pitanja"
                loading="lazy"
                className="max-h-64 w-auto ml-auto cursor-zoom-in rounded"
                onClick={() => onPreview(q.image_url!)}
              />
              <div className="text-right">
                <button className="text-sm underline" onClick={() => onPreview(q.image_url!)}>
                  Uvećaj
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {q.answers.map((a) => {
          const isCorrect = revealed && a.is_correct;
          return (
            <div
              key={a.id}
              className={[
                "w-full rounded border px-3 py-2",
                isCorrect ? "bg-green-100 border-green-300 font-medium" : "border-gray-200",
              ].join(" ")}
            >
              {a.text}
            </div>
          );
        })}
      </div>

      <button className="border rounded px-3 py-1 text-sm" onClick={onToggleReveal}>
        {revealed ? "Sakrij tačan odgovor" : "Prikaži tačan odgovor"}
      </button>
    </div>
  );
}

export default function WrongAnswersPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");
  const [freqInput, setFreqInput] = useState<number>(1); // 1= sve (>=1), 2= tačno 2, 3+=3+
  const [rows, setRows] = useState<WrongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        sb.from("areas").select("*").order("created_at", { ascending: true }),
        sb.from("subareas").select("*").order("created_at", { ascending: true }),
      ]);
      setAreas((a ?? []) as Area[]);
      setSubs((s ?? []) as Sub[]);
    })();
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from("candidate_exam_wrong_questions")
        .select(
          "question_id, questions:questions(id, text, image_url, points, multi_correct, subarea_id, answers:answers(id, text, is_correct))"
        )
        .order("created_at", { ascending: true }).returns<WrongRow[]>();
      setLoading(false);
      if (error) {
        console.error(error.message);
        setRows([]);
        return;
      }
      setRows(data ?? []);
    })();
  }, []);

  // Mape za brzo filtriranje i brojače za dropdown (sa duplikatima)
  const subToArea = useMemo(() => {
    const m = new Map<number, number>();
    subs.forEach((s) => m.set(s.id, s.area_id));
    return m;
  }, [subs]);

  const counts = useMemo(() => {
    const areaCount = new Map<number, number>();
    const subCount = new Map<number, number>();
    rows.forEach((r) => {
      const sid = r.questions?.subarea_id;
      if (!sid) return;
      const aid = subToArea.get(sid);
      if (aid) areaCount.set(aid, (areaCount.get(aid) ?? 0) + 1); // sa duplikatima
      subCount.set(sid, (subCount.get(sid) ?? 0) + 1); // sa duplikatima
    });
    return { areaCount, subCount };
  }, [rows, subToArea]);

  // Frekvencija po pitanju (za distinct i filter)
  const questionFreq = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r) => {
      if (!r.question_id) return;
      m.set(r.question_id, (m.get(r.question_id) ?? 0) + 1);
    });
    return m;
  }, [rows]);

  // Distinct pitanja (zadržavamo prvi viđeni zapis)
  const distinctQuestions = useMemo(() => {
    const seen = new Set<number>();
    const list: Question[] = [];
    for (const r of rows) {
      const q = r.questions;
      if (!q) continue;
      if (!seen.has(q.id)) {
        seen.add(q.id);
        list.push(q);
      }
    }
    return list;
  }, [rows]);

  // Normalizuj unos frekvencije: 1, 2 ili 3 (3 znači 3+)
  function normalizeFreq(n: number): 1 | 2 | 3 {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    return 3;
  }

  const filtered = useMemo(() => {
    const nf = normalizeFreq(Number(freqInput) || 1);

    return distinctQuestions.filter((q) => {
      const sid = q.subarea_id;
      const aid = subToArea.get(sid || -1);

      if (areaId && aid !== areaId) return false;
      if (subId && sid !== subId) return false;

      const f = questionFreq.get(q.id) ?? 0;
      if (nf === 1) return f >= 1;
      if (nf === 2) return f === 2;
      return f >= 3;
    });
  }, [distinctQuestions, questionFreq, areaId, subId, freqInput, subToArea]);

  // Prikaz broja rezultata + opc. sort po frekvenciji
  const filteredSorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const fa = questionFreq.get(a.id) ?? 0;
      const fb = questionFreq.get(b.id) ?? 0;
      return fb - fa;
    });
  }, [filtered, questionFreq]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Pogrešno odgovorena pitanja</h1>

      {/* Filter bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm">Oblast</label>
          <select
            className="w-full border rounded p-2"
            value={String(areaId)}
            onChange={(e) => {
              const v = e.target.value;
              setAreaId(v ? Number(v) : "");
              setSubId("");
            }}
          >
            <option value="">Sve oblasti</option>
            {areas.map((a) => {
              const c = counts.areaCount.get(a.id) ?? 0;
              return (
                <option key={a.id} value={a.id}>
                  {a.name} ({c})
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm">Podoblast</label>
          <select
            className="w-full border rounded p-2"
            value={String(subId)}
            onChange={(e) => setSubId(e.target.value ? Number(e.target.value) : "")}
            disabled={!areaId}
          >
            <option value="">Sve podoblasti</option>
            {subs
              .filter((s) => s.area_id === (typeof areaId === "number" ? areaId : -1))
              .map((s) => {
                const c = counts.subCount.get(s.id) ?? 0;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name} ({c})
                  </option>
                );
              })}
          </select>
        </div>

        <div>
          <label className="block text-sm">Broj ponavljanja</label>
          <input
            type="number"
            min={1}
            max={3}
            className="w-full border rounded p-2"
            value={freqInput}
            onChange={(e) => {
              const n = Number(e.target.value || 1);
              setFreqInput(n);
            }}
          />
          <div className="text-xs text-gray-500 mt-1">
            1 = sva; 2 = tačno 2; 3 = 3 ili više (veće od 3 tretira se kao 3).
          </div>
        </div>

        <div className="flex items-end">
          <div className="text-sm text-gray-700">
            {loading ? "Učitavanje…" : <>Pronađeno: <b>{filteredSorted.length}</b></>}
          </div>
        </div>
      </div>

      {/* Lista pitanja */}
      <div className="space-y-4">
        {filteredSorted.map((q) => (
          <div key={q.id}>
            {/* badge sa frekvencijom (opciono) */}
            <div className="text-xs text-gray-600 mb-1">
              Pojavljivanja: <b>{questionFreq.get(q.id) ?? 0}</b>
            </div>
            <QuestionCard
              q={q}
              revealed={!!reveal[q.id]}
              onToggleReveal={() => setReveal((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
              onPreview={(u) => setPreviewUrl(u)}
            />
          </div>
        ))}
      </div>

      {!loading && filteredSorted.length === 0 && (
        <div className="text-gray-600">Nema pitanja za date filtere.</div>
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="max-w-5xl max-h-[85vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="slika pitanja" className="max-h-[80vh] w-auto" />
            <div className="text-center mt-2">
              <button
                className="border rounded px-3 py-1 text-sm bg-white"
                onClick={() => setPreviewUrl(null)}
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}