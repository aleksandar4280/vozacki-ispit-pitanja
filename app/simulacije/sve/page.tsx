// file: app/simulacije/sve/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Area = { id: number; name: string };
type Subarea = { id: number; name: string; area_id: number };
type QMeta = {
  id: number;
  text: string;
  image_url: string | null;
  points: number;
  multi_correct: boolean;
  area_id: number | null;
  subarea_id: number | null;
  answers: { id: number; text: string; is_correct: boolean }[];
};
type SQ = { simulation_id: number; question_id: number };

type GroupCount = { key: number | null; count: number };

export default function AllSimulationQuestionsPage() {
  const sb = supabaseBrowser();

  // data
  const [areas, setAreas] = useState<Area[]>([]);
  const [subs, setSubs] = useState<Subarea[]>([]);
  const [pairs, setPairs] = useState<SQ[]>([]);
  const [questions, setQuestions] = useState<QMeta[]>([]);

  // totals (DB) i unique-on-sims po oblastima/podoblastima
  const [totalByArea, setTotalByArea] = useState<Map<number, number>>(new Map());
  const [totalBySub, setTotalBySub] = useState<Map<number, number>>(new Map());
  const [uniqOnSimsByArea, setUniqOnSimsByArea] = useState<Map<number, number>>(new Map());
  const [uniqOnSimsBySub, setUniqOnSimsBySub] = useState<Map<number, number>>(new Map());

  // UI state
  const [areaId, setAreaId] = useState<number | "all">("all");
  const [subId, setSubId] = useState<number | "all">("all");
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        // 1) parovi simulacija↔pitanje (za frekvenciju / skup)
        const { data: sq } = await sb
          .from("simulation_questions")
          .select("simulation_id, question_id")
          .returns<SQ[]>();

        // 2) šifrarnici
        const [{ data: ars }, { data: sbs }] = await Promise.all([
          sb.from("areas").select("id,name").order("created_at", { ascending: true }).returns<Area[]>(),
          sb.from("subareas").select("id,name,area_id").order("created_at", { ascending: true }).returns<Subarea[]>(),
        ]);

        // 3) totals po oblasti/podoblasti: umesto .group() učitaj sve i saberi lokalno
const { data: allQRows, error: allQErr } = await sb
  .from("questions")
  .select("id, area_id, subarea_id")
  .returns<{ id: number; area_id: number | null; subarea_id: number | null }[]>();

if (allQErr) throw allQErr;

const tArea = new Map<number, number>();
const tSub  = new Map<number, number>();

(allQRows ?? []).forEach((q) => {
  if (q.area_id != null) {
    tArea.set(q.area_id, (tArea.get(q.area_id) ?? 0) + 1);
  }
  if (q.subarea_id != null) {
    tSub.set(q.subarea_id, (tSub.get(q.subarea_id) ?? 0) + 1);
  }
});

//setAllQForTotals(allQRows ?? []); // ako ti dalje treba
setTotalByArea(tArea);
setTotalBySub(tSub);


        // 4) unique-on-sims po oblasti/podobl: join preko questions!inner(...)
        const [{ data: usedA }, { data: usedS }] = await Promise.all([
          sb.from("simulation_questions")
            .select("question_id, questions!inner(area_id)")
            .returns<{ question_id: number; questions: { area_id: number | null } }[]>(),
          sb.from("simulation_questions")
            .select("question_id, questions!inner(subarea_id)")
            .returns<{ question_id: number; questions: { subarea_id: number | null } }[]>(),
        ]);

        const uniqArea = new Map<number, Set<number>>();
        (usedA ?? []).forEach(r => {
          const a = r.questions?.area_id;
          if (a == null) return;
          const set = uniqArea.get(a) ?? new Set<number>();
          set.add(r.question_id);
          uniqArea.set(a, set);
        });
        const uniqSub = new Map<number, Set<number>>();
        (usedS ?? []).forEach(r => {
          const s = r.questions?.subarea_id;
          if (s == null) return;
          const set = uniqSub.get(s) ?? new Set<number>();
          set.add(r.question_id);
          uniqSub.set(s, set);
        });

        const uniqAreaCount = new Map<number, number>();
        uniqArea.forEach((set, k) => uniqAreaCount.set(k, set.size));
        const uniqSubCount = new Map<number, number>();
        uniqSub.forEach((set, k) => uniqSubCount.set(k, set.size));

        // 5) meta pitanja + odgovori samo za korišćena pitanja
        const usedIds = Array.from(new Set((sq ?? []).map(p => p.question_id)));
        let qMeta: QMeta[] = [];
        if (usedIds.length > 0) {
          const chunk = <T,>(arr: T[], n: number) =>
            Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
          const parts: QMeta[] = [];
          for (const ids of chunk(usedIds, 1000)) {
            const { data } = await sb
              .from("questions")
              .select("id,text,image_url,points,multi_correct,area_id,subarea_id,answers(id,text,is_correct)")
              .in("id", ids)
              .returns<QMeta[]>();
            parts.push(...(data ?? []));
          }
          qMeta = parts;
        }

        setPairs(sq ?? []);
        setAreas(ars ?? []);
        setSubs(sbs ?? []);
        setQuestions(qMeta);
        setTotalByArea(tArea);
        setTotalBySub(tSub);
        setUniqOnSimsByArea(uniqAreaCount);
        setUniqOnSimsBySub(uniqSubCount);
      } catch (e: any) {
        setErr(e?.message || "Greška pri učitavanju podataka.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // frekvencija pojavljivanja po pitanju (koliko simulacija ga sadrži)
  const freq = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pairs) m.set(p.question_id, (m.get(p.question_id) ?? 0) + 1);
    return m;
  }, [pairs]);

  // filtrirana lista pitanja
  const filtered = useMemo(() => {
    return questions
      .filter(q => (areaId === "all" || q.area_id === areaId))
      .filter(q => (subId === "all" || q.subarea_id === subId))
      .sort((a, b) => (freq.get(b.id)! - freq.get(a.id)!));
  }, [questions, areaId, subId, freq]);

  const formatTacni = (n: number) => {
    if (n === 1) return "Jedan tačan";
    const mod10 = n % 10, mod100 = n % 100;
    const srednji = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
    return srednji ? `${n} tačna odgovora` : `${n} tačnih odgovora`;
  };

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">Sva pitanja sa svih simulacija</h1>

        {/* Filtri */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm block mb-1">Oblast</label>
            <select
              className="w-full border rounded p-2"
              value={areaId === "all" ? "" : String(areaId)}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : "all";
                setAreaId(v);
                setSubId("all");
              }}
            >
              <option value="">Sve oblasti</option>
              {areas.map(a => {
                const u = uniqOnSimsByArea.get(a.id) ?? 0;
                const t = totalByArea.get(a.id) ?? 0;
                // osiguranje: unik <= total
                const safeU = Math.min(u, t);
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({safeU}/{t})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-sm block mb-1">Podoblast</label>
            <select
              className="w-full border rounded p-2"
              value={subId === "all" ? "" : String(subId)}
              onChange={(e) => setSubId(e.target.value ? Number(e.target.value) : "all")}
            >
              <option value="">Sve podoblasti</option>
              {subs
                .filter(s => areaId === "all" || s.area_id === areaId)
                .map(s => {
                  const u = uniqOnSimsBySub.get(s.id) ?? 0;
                  const t = totalBySub.get(s.id) ?? 0;
                  const safeU = Math.min(u, t);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({safeU}/{t})
                    </option>
                  );
                })}
            </select>
          </div>
        </div>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}

        {/* Lista pitanja – kompletan card */}
        <div className="space-y-3">
          {filtered.map(q => {
            const correctCount = q.answers.reduce((n, a) => n + (a.is_correct ? 1 : 0), 0);
            const shown = !!reveal[q.id];
            return (
              <div key={q.id} className="border rounded-xl p-3 bg-white">
                <div className={q.image_url ? "grid grid-cols-1 md:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
                  {/* Tekst + meta */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium break-words">{q.text}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      Bodovi: {q.points} • {correctCount === 1 ? "Jedan tačan" : formatTacni(correctCount)} • Ponavljanja: <b>{freq.get(q.id) ?? 0}</b>
                    </div>
                  </div>
                  {/* Slika (ako ima) */}
                  {q.image_url && (
                    <div className="w-full border rounded overflow-hidden bg-gray-50">
                      <img src={q.image_url} alt="slika pitanja" className="w-full h-40 object-contain" loading="lazy" />
                    </div>
                  )}
                </div>

                {/* Odgovori */}
                <div className="mt-2 space-y-2">
                  {q.answers.map(a => (
                    <div
                      key={a.id}
                      className={[
                        "w-full rounded border px-3 py-2 text-sm",
                        shown && a.is_correct ? "bg-green-100 border-green-300" : "border-gray-200",
                      ].join(" ")}
                    >
                      {a.text}
                    </div>
                  ))}
                </div>

                <div className="mt-2">
                  <button
                    className="border rounded px-3 py-1 text-sm"
                    onClick={() => setReveal(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                  >
                    {shown ? "Sakrij tačan odgovor" : "Prikaži tačan odgovor"}
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="text-gray-600">Nema pitanja za odabrani filter.</div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
