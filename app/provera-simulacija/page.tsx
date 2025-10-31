// file: app/provera-simulacija/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import Link from "next/link";

type Simulation = { id: number; title: string | null };
type SimQ = { simulation_id: number; question_id: number };

type Candidate = {
  id: number;
  first_name: string;
  last_name: string;
  id_number: string;
};

type ExamRow = {
  id: number;
  candidate_id: number;
  exam_date: string;
  // ugnježdeno povlačenje:
  candidates: Candidate | null;
  wrong_questions: { question_id: number }[];
};

type MatchRow = {
  exam_id: number;
  exam_date: string;
  wrong_count: number;
  candidate: Candidate;
  simulation: Simulation;
};

export default function ProveraSimulacijaPage() {
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [simPairs, setSimPairs] = useState<SimQ[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // 1) Simulacije
        const { data: sims } = await sb
          .from("simulations")
          .select("id, title")
          .order("created_at", { ascending: true })
          .returns<Simulation[]>();

        // 2) Parovi simulation_questions (simulation_id, question_id)
        const { data: pairs } = await sb
          .from("simulation_questions")
          .select("simulation_id, question_id")
          .order("simulation_id", { ascending: true })
          .returns<SimQ[]>();

        // 3) Teorijski ispiti + kandidat + netačna pitanja
        const { data: ex } = await sb
          .from("candidate_exams")
          .select(
            `
            id,
            candidate_id,
            exam_date,
            candidates:candidates ( id, first_name, last_name, id_number ),
            wrong_questions:candidate_exam_wrong_questions ( question_id )
          `
          )
          .order("created_at", { ascending: true })
          .returns<ExamRow[]>();

        setSimulations(sims ?? []);
        setSimPairs(pairs ?? []);
        setExams(ex ?? []);
      } catch (e: any) {
        setErr(e?.message || "Greška pri učitavanju podataka.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // simId -> Set(question_id)
  const simSets = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const row of simPairs) {
      if (!map.has(row.simulation_id)) map.set(row.simulation_id, new Set<number>());
      map.get(row.simulation_id)!.add(row.question_id);
    }
    return map;
  }, [simPairs]);

  // Provera subset-a za svaki ispit
  useEffect(() => {
    if (loading) return;
    const out: MatchRow[] = [];

    for (const exam of exams) {
      const wrongIds = (exam.wrong_questions ?? []).map((w) => w.question_id).filter(Boolean);
      if (wrongIds.length === 0) continue; // nema grešaka - nema šta da uporedi
      const wrongSet = new Set<number>(wrongIds);

      // pokušaj da nađeš simulaciju koja pokriva SVE greške
      let found: number | null = null;
      for (const sim of simulations) {
        const sset = simSets.get(sim.id);
        if (!sset) continue;
        // test: wrongSet ⊆ sset
        let ok = true;
        for (const qid of wrongSet) {
          if (!sset.has(qid)) { ok = false; break; }
        }
        if (ok) { found = sim.id; break; }
      }

      if (found !== null && exam.candidates) {
        const sim = simulations.find((s) => s.id === found)!;
        out.push({
          exam_id: exam.id,
          exam_date: exam.exam_date,
          wrong_count: wrongIds.length,
          candidate: exam.candidates,
          simulation: sim,
        });
      }
    }

    setMatches(out);
  }, [loading, exams, simulations, simSets]);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Provera poklapanja sa simulacijama</h1>
      </div>

      <div className="text-sm text-gray-700">
        {loading ? "Učitavanje…" : <>Pronađenih poklapanja: <b>{matches.length}</b></>}
        {err && <span className="text-red-600 ml-2">{err}</span>}
      </div>

      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 text-sm font-medium px-3 py-2">
          <div className="col-span-3">Kandidat</div>
          <div className="col-span-2">ID broj</div>
          <div className="col-span-2">Datum ispita</div>
          <div className="col-span-2">Grešaka</div>
          <div className="col-span-3">Simulacija</div>
        </div>
        <div className="divide-y">
          {matches.map((m) => (
            <div key={m.exam_id} className="grid grid-cols-12 px-3 py-2 text-sm">
              <div className="col-span-3">
                {m.candidate.first_name} {m.candidate.last_name}
              </div>
              <div className="col-span-2">{m.candidate.id_number}</div>
              <div className="col-span-2">{m.exam_date}</div>
              <div className="col-span-2">{m.wrong_count}</div>
              <div className="col-span-3">
                <Link href={`/simulacije/${m.simulation.id}`} className="underline">
                  Simulacija {m.simulation.id}{m.simulation.title ? ` – ${m.simulation.title}` : ""}
                </Link>
              </div>
            </div>
          ))}
          {!loading && matches.length === 0 && (
            <div className="px-3 py-6 text-sm text-gray-600">Nema pronađenih poklapanja.</div>
          )}
        </div>
      </div>
    </div>
  );
}
