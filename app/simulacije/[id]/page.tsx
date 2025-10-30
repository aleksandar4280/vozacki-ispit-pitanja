// file: app/simulacije/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

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

function formatTacni(count: number): string {
  if (count === 1) return "Jedan tačan";
  const mod10 = count % 10, mod100 = count % 100;
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

export default function SimulationDetailPage() {
  const params = useParams<{ id: string }>();
  const simId = Number(params.id);

  const [title, setTitle] = useState<string | null>(null);
  const [qs, setQs] = useState<Question[]>([]);
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [areaId, setAreaId] = useState<number | "">("");
  const [subId, setSubId] = useState<number | "">("");

  // Load static areas/subareas
  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        sb.from("areas").select("*").order("created_at", { ascending: true }).returns<Area[]>(),
        sb.from("subareas").select("*").order("created_at", { ascending: true }).returns<Sub[]>(),
      ]);
      setAreas(a ?? []);
      setSubs(s ?? []);
    })();
  }, []);

  // Load simulation data
  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true);
      const [{ data: sim }, { data: sq }] = await Promise.all([
        sb.from("simulations").select("id, title").eq("id", simId).single(),
        sb
          .from("simulation_questions")
          .select(
            "order_index, questions:questions(id, text, image_url, points, multi_correct, subarea_id, answers:answers(id, text, is_correct))"
          )
          .eq("simulation_id", simId)
          .order("order_index", { ascending: true }),
      ]);
      setTitle(sim?.title ?? null);
      setQs((sq ?? []).map((r: any) => r.questions) as Question[]);
      setLoading(false);
    })();
  }, [simId]);

  // subarea_id -> area_id
  const subToArea = useMemo(() => {
    const m = new Map<number, number>();
    subs.forEach((s) => m.set(s.id, s.area_id));
    return m;
  }, [subs]);

  // Counts within THIS simulation
  const { areaCounts, subCounts } = useMemo(() => {
    const ac = new Map<number, number>();
    const sc = new Map<number, number>();
    for (const q of qs) {
      const sid = q.subarea_id;
      sc.set(sid, (sc.get(sid) ?? 0) + 1);
      const aid = subToArea.get(sid);
      if (aid) ac.set(aid, (ac.get(aid) ?? 0) + 1);
    }
    return { areaCounts: ac, subCounts: sc };
  }, [qs, subToArea]);

  // Filtered list
  const filteredQs = useMemo(() => {
    return qs.filter((q) => {
      const sid = q.subarea_id;
      const aid = subToArea.get(sid);
      if (areaId && aid !== areaId) return false;
      if (subId && sid !== subId) return false;
      return true;
    });
  }, [qs, areaId, subId, subToArea]);

  const totalPoints = useMemo(() => filteredQs.reduce((s, q) => s + (q.points || 0), 0), [filteredQs]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Simulacija {simId}{title ? ` – ${title}` : ""}
        </h1>
        <div className="text-sm text-gray-700">
          Pitanja: <b>{filteredQs.length}</b> • Bodovi: <b>{totalPoints}</b>
        </div>
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({areaCounts.get(a.id) ?? 0})
              </option>
            ))}
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
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({subCounts.get(s.id) ?? 0})
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-end">
          <div className="text-sm text-gray-700">
            {loading ? "Učitavanje…" : <>Pronađeno: <b>{filteredQs.length}</b></>}
          </div>
        </div>
      </div>

      {/* Lista pitanja (filtrirana) */}
      <div className="space-y-4">
        {filteredQs.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            revealed={!!reveal[q.id]}
            onToggleReveal={() => setReveal((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
            onPreview={(u) => setPreviewUrl(u)}
          />
        ))}
      </div>

      {!loading && filteredQs.length === 0 && (
        <div className="text-gray-600">Nema pitanja za date filtere.</div>
      )}

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
