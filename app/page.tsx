// file: app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type School = { id: number; name: string };
type ExamRow = {
  candidate_id: number;
  exam_date: string;
  passed: boolean;
  created_at: string;
  candidates: {
    id: number;
    school_id: number;
    not_my_candidate: boolean | null;
  } | null;
};

type OwnershipFilter = "" | "mine" | "not_mine";

export default function HomePage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filteri
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [owner, setOwner] = useState<OwnershipFilter>("");

  // PATCH u: app/page.tsx  (samo deo useEffect fetcha)

useEffect(() => {
  const sb = supabaseBrowser();
  (async () => {
    setLoading(true);
    setErr(null);
    try {
      const [{ data: sc }, { data: ex }] = await Promise.all([
        sb.from("schools")
          .select("*")
          .order("created_at", { ascending: true })
          .returns<School[]>(),

        sb
          .from("candidate_exams")
          .select(`
            candidate_id,
            exam_date,
            passed,
            created_at,
            candidates:candidates (
              id,
              school_id,
              not_my_candidate
            )
          `)
          .order("candidate_id", { ascending: true })
          .order("exam_date", { ascending: true })
          .order("created_at", { ascending: true })
          .returns<ExamRow[]>(), // ✅ ključni deo
      ]);

      setSchools(sc ?? []);
      setRows(ex ?? []); // ✅ više nema crvene linije
    } catch (e: any) {
      setErr(e?.message || "Greška pri učitavanju podataka.");
    } finally {
      setLoading(false);
    }
  })();
}, []);


  // Filtrirani redovi po kandidatima (škola, (nije) moj)
  const filtered = useMemo(() => {
    if (!rows.length) return [] as ExamRow[];
    return rows.filter((r) => {
      const c = r.candidates;
      if (!c) return false;
      if (schoolId && c.school_id !== schoolId) return false;
      if (owner === "mine" && c.not_my_candidate) return false; // moj = not_my_candidate === false
      if (owner === "not_mine" && !c.not_my_candidate) return false;
      return true;
    });
  }, [rows, schoolId, owner]);

  // Grupisanje po kandidatu i izbor PRVOG ispita
  const { total, passedFirst } = useMemo(() => {
    if (filtered.length === 0) return { total: 0, passedFirst: 0 };
    const firstByCand = new Map<number, ExamRow>();
    for (const r of filtered) {
      if (!firstByCand.has(r.candidate_id)) {
        firstByCand.set(r.candidate_id, r); // već je sortirano po (candidate_id, exam_date, created_at)
      }
    }
    const allFirst = Array.from(firstByCand.values());
    const totalLocal = allFirst.length;
    const passedLocal = allFirst.filter((r) => r.passed).length;
    return { total: totalLocal, passedFirst: passedLocal };
  }, [filtered]);

  const percent = total > 0 ? Math.round((passedFirst / total) * 100) : 0;

  // Donut graf (SVG)
  const size = 140;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (percent / 100) * circ;
  const dashArray = `${filled} ${circ - filled}`;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Statistika: Položili iz prvog puta</h1>
        <p className="text-sm text-gray-600">
          Procena uspešnosti kandidata na prvom izlasku, sa filterima po autoškoli i statusu “nije moj kandidat”.
        </p>
      </header>

      {/* Filteri */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm">Autoškola</label>
          <select
            className="w-full border rounded p-2"
            value={String(schoolId)}
            onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Sve autoškole</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm">Kandidat</label>
          <select
            className="w-full border rounded p-2"
            value={owner}
            onChange={(e) => setOwner(e.target.value as OwnershipFilter)}
          >
            <option value="">Svi</option>
            <option value="mine">Samo moji kandidati</option>
            <option value="not_mine">Samo “nije moj kandidat”</option>
          </select>
        </div>

        <div className="flex items-end">
          <div className="text-sm text-gray-700">
            {loading ? "Učitavanje…" : (
              <>
                Kandidata sa ispitom: <b>{total}</b>
              </>
            )}
            {err && <span className="text-red-600 ml-2">{err}</span>}
          </div>
        </div>
      </section>

      {/* Vizualizacija */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div className="flex items-center justify-center">
          <svg width={size} height={size} className="-rotate-90">
            {/* pozadina kruga */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              stroke="#e5e7eb"
              fill="none"
            />
            {/* progress */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={dashArray}
              stroke="#10b981"
              fill="none"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <div className="text-4xl font-semibold">{percent}%</div>
          <div className="text-sm text-gray-700">
            Položili iz prvog puta: <b>{passedFirst}</b> od <b>{total}</b> kandidata sa bar jednim izlaskom.
          </div>
          <ul className="text-sm text-gray-600 list-disc list-inside">
            <li>Prvi izlazak je određen najranijim datumom ispita (a u istom danu najranijim unosom).</li>
            <li>Filteri se primenjuju po kandidatu (autoškola i “nije moj kandidat”).</li>
          </ul>
        </div>
      </section>

      {!loading && total === 0 && (
        <div className="text-sm text-gray-600">
          Nema kandidata sa unetim ispitima za zadate filtere.
        </div>
      )}
    </div>
  );
}
