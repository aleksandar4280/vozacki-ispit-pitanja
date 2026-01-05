// file: app/simulacije/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Simulation = { id: number; title: string | null; created_at: string };

export default function SimulacijePage() {
  const [sims, setSims] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data } = await sb
        .from("simulations")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<Simulation[]>();
      setSims(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Simulacije</h1>
        <Link href="/simulacije/sve" className="border rounded px-3 py-2">
  Sve simulacije
</Link>
        <Link href="/simulacije/new" className="border rounded px-3 py-2">Nova simulacija</Link>
      </div>

      {loading && <div>Učitavanje…</div>}

      <div className="space-y-3">
        {sims.map((s, idx) => (
          <Link
            key={s.id}
            href={`/simulacije/${s.id}`}
            className="block border rounded p-3 hover:shadow"
          >
            <div className="font-medium">Simulacija {idx + 1}</div>
            {s.title && <div className="text-sm text-gray-600">{s.title}</div>}
          </Link>
        ))}
        {!loading && sims.length === 0 && (
          <div className="text-gray-600">Još nema simulacija.</div>
        )}
      </div>
    </div>
  );
}
