// file: app/admin/raspored/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";

type Row = {
  id: number;
  starts_at: string;
  description: string | null;
  school_id: number;
  schools: { name: string } | null;
  lessons: { lesson_id: number; theory_lessons: { code: string } | null }[];
};
type School = { id: number; name: string };

export default function SchedulesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const sb = supabaseBrowser();

    const { data: sch } = await sb.from("schools").select("id, name").order("created_at", { ascending: true });

    let q = sb
      .from("schedules")
      .select(`id, starts_at, description, school_id, schools(name),
        lessons:schedule_lessons(
          lesson_id,
          theory_lessons(code)
        )`)
      .order("starts_at", { ascending: false });

    if (schoolFilter !== "all") q = q.eq("school_id", Number(schoolFilter));

    const { data, error } = await q.returns<Row[]>();
    if (error) setErr(error.message);

    setSchools((sch ?? []) as School[]);
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [schoolFilter]);

  return (
    <AdminGuard>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-semibold">Rasporedi</h1>
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={schoolFilter}
              onChange={(e)=>setSchoolFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">Sve autoškole</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Link href="/admin/raspored/new" className="border rounded px-3 py-2">Novi raspored</Link>
          </div>
        </div>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}

        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="border rounded-2xl p-3 bg-white shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-gray-600">
                  {new Date(r.starts_at).toLocaleString("sr-RS", { hour12: false })}
                </div>
                <span className="px-2 py-1 rounded text-xs bg-gray-100 border">
                  {r.schools?.name ?? "Autoškola"}
                </span>
              </div>

              {r.description && <div className="mt-1 font-medium break-words">{r.description}</div>}

              <div className="mt-2 flex flex-wrap gap-2">
                {r.lessons?.map(l => (
                  <span key={l.lesson_id} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 border">
                    {l.theory_lessons?.code ?? l.lesson_id}
                  </span>
                ))}
                {(!r.lessons || r.lessons.length === 0) && (
                  <span className="text-xs text-gray-500">Nema dodeljenih časova.</span>
                )}
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 && <div className="text-gray-600">Nema rasporeda za odabrani filter.</div>}
        </div>
      </div>
    </AdminGuard>
  );
}
