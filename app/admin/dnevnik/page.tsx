// file: app/admin/dnevnik/page.tsx

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type JournalRow = {
  id: number;
  journal_date: string; // YYYY-MM-DD
  schedules: { starts_at: string; schools: { name: string } | null } | null;
};

export default function JournalsPage() {
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true); setErr(null);
      const { data, error } = await sb
        .from("journals")
        .select(`id, journal_date, schedules(starts_at, schools(name))`)
        .order("journal_date", { ascending: false })
        .returns<JournalRow[]>();
      if (error) setErr(error.message);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <AdminGuard>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Dnevnik teorijske obuke</h1>
          <Link href="/admin/dnevnik/new" className="border rounded px-3 py-2">Kreiraj novi dnevnik</Link>
        </div>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="border rounded-xl p-3 bg-white shadow-sm flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {new Date(r.journal_date + "T00:00:00").toLocaleDateString("sr-RS")}
                </div>
                <div className="text-sm text-gray-600">
                  Raspored: {r.schedules ? new Date(r.schedules.starts_at).toLocaleString("sr-RS", { hour12: false }) : "—"} • {r.schedules?.schools?.name ?? "Autoškola"}
                </div>
              </div>
              <Link href={`/admin/dnevnik/${r.id}`} className="border rounded px-3 py-1">Izmeni</Link>
            </div>
          ))}
          {!loading && rows.length === 0 && <div className="text-gray-600">Još nema kreiranih dnevnika.</div>}
        </div>
      </div>
    </AdminGuard>
  );
}