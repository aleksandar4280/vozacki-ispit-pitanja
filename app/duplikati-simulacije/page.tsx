// file: app/duplikati-simulacije/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

type SimRow = {
  id: number;
  simulation_questions: { question_id: number }[];
};

export default function DuplikatiSimulacijePage() {
  const [rows, setRows] = useState<SimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await sb
        .from("simulations")
        .select("id, simulation_questions(question_id)")
        .order("id", { ascending: true })
        .returns<SimRow[]>();
      if (error) setErr(error.message);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const result = useMemo(() => {
    // key = sortirani skup 41 question_id (CSV)
    const byKey = new Map<string, number[]>();
    const skipped: number[] = [];

    for (const s of rows) {
      const ids = Array.from(
        new Set((s.simulation_questions ?? []).map((q) => q.question_id))
      ).sort((a, b) => a - b);

      if (ids.length !== 41) {
        // ignorišemo simulacije koje nisu kompletne (po zahtevu)
        skipped.push(s.id);
        continue;
      }

      const key = ids.join(",");
      const list = byKey.get(key);
      if (list) list.push(s.id);
      else byKey.set(key, [s.id]);
    }

    const groups = Array.from(byKey.entries())
      .map(([key, sims]) => ({ key, sims: sims.sort((a, b) => a - b) }))
      .filter((g) => g.sims.length > 1) // samo duplikati
      .sort((a, b) => a.sims[0] - b.sims[0]);

    return { groups, skipped };
  }, [rows]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Duplikati simulacija</h1>

      {loading && <div>Učitavanje…</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      {!loading && !err && (
        <>
          <div className="text-sm text-gray-700">
            Ukupno simulacija: <b>{rows.length}</b> •
            Grupe duplikata: <b>{result.groups.length}</b>
            {result.skipped.length > 0 && (
              <span className="ml-2 text-gray-500">
                (preskočeno jer nemaju 41 pitanje: {result.skipped.join(", ")})
              </span>
            )}
          </div>

          <div className="space-y-3">
            {result.groups.length === 0 ? (
              <div className="text-gray-600">Nema pronađenih duplikata.</div>
            ) : (
              result.groups.map((g, idx) => (
                <div
                  key={g.key}
                  className="border rounded-xl p-3 bg-white shadow-sm"
                >
                  <div className="text-sm text-gray-600 mb-1">
                    Grupa #{idx + 1} – identičan skup od 41 pitanja
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.sims.map((id) => (
                      <Link
                        key={id}
                        href={`/simulacije/${id}`}
                        className="px-2.5 py-1 rounded-full text-xs bg-gray-100 border hover:bg-gray-200"
                        title={`Otvori simulaciju ${id}`}
                      >
                        Simulacija {id}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
