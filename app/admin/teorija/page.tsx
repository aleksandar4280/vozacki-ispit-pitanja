// 2) Next.js strana: app/admin/teorija/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Theme = { id: number; code: string; name: string | null; lesson_count: number };
type Lesson = { id: number; code: string; theme_id: number; seq: number };

export default function TheoryAdminPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true); setErr(null); setOk(null);
    const sb = supabaseBrowser();
    const [{ data: t, error: e1 }, { data: l, error: e2 }] = await Promise.all([
      sb.from("theory_themes").select("*").order("code", { ascending: true }),
      sb.from("theory_lessons").select("id, code, theme_id, seq").order("code", { ascending: true })
    ]);
    if (e1 || e2) setErr((e1 || e2)?.message ?? "Greška pri učitavanju.");
    setThemes((t ?? []) as Theme[]);
    setLessons((l ?? []) as Lesson[]);
    setLoading(false);
  }

  const totalPlanned = useMemo(
    () => themes.reduce((s, x) => s + (Number.isFinite(x.lesson_count) ? x.lesson_count : 0), 0),
    [themes]
  );

  function updateCount(themeId: number, count: number) {
    setThemes(prev => prev.map(t => (t.id === themeId ? { ...t, lesson_count: Number.isFinite(count) ? count : 0 } : t)));
  }

  async function saveThemes() {
    setSaving(true); setErr(null); setOk(null);
    const sb = supabaseBrowser();
    try {
      // upsert svake teme sa lesson_count
      for (const t of themes) {
        const { error } = await sb
          .from("theory_themes")
          .update({ lesson_count: t.lesson_count, name: t.name })
          .eq("id", t.id);
        if (error) throw error;
      }
      setOk("Teme sačuvane.");
    } catch (e: any) {
      setErr(e?.message || "Greška pri čuvanju tema.");
    } finally {
      setSaving(false);
    }
  }

  async function generateLessons() {
    // Zašto brišemo pa unosimo: da kodovi i sekvence budu uvek konzistentni
    setGenLoading(true); setErr(null); setOk(null);
    const sb = supabaseBrowser();
    try {
      // 1) obriši sve postojeće lekcije
      const { error: delErr } = await sb.from("theory_lessons").delete().neq("id", 0);
      if (delErr) throw delErr;

      // 2) pripremi redove
      const rows: { theme_id: number; seq: number; code: string }[] = [];
      for (const t of themes.sort((a,b)=>Number(a.code.slice(1))-Number(b.code.slice(1)))) {
        for (let i = 1; i <= (t.lesson_count || 0); i++) {
          rows.push({ theme_id: t.id, seq: i, code: `${t.code}-${i}` });
        }
      }
      if (rows.length === 0) {
        setOk("Nema lekcija za unos (broj časova je 0).");
        setLessons([]);
        setGenLoading(false);
        return;
      }

      // 3) batch insert
      const { error: insErr } = await sb.from("theory_lessons").insert(rows);
      if (insErr) throw insErr;

      // 4) refresh
      await loadAll();
      setOk(`Generisano ${rows.length} časova.`);
    } catch (e: any) {
      setErr(e?.message || "Greška pri generisanju časova.");
    } finally {
      setGenLoading(false);
    }
  }

  return (
    <AdminGuard>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">Teorijska obuka – teme i časovi</h1>
        <p className="text-sm text-gray-600">
          Unesi broj časova za svaku temu (T1–T14), zatim klikni <b>Sačuvaj teme</b> i <b>Generiši časove</b>.
          Kodovi časova se automatski kreiraju (npr. T1-1, T1-2).
        </p>

        {loading ? <div>Učitavanje…</div> : (
          <>
            {/* Forma za teme */}
            <div className="border rounded-xl p-3 bg-white shadow-sm space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {themes.map(t => (
                  <div key={t.id} className="border rounded p-2">
                    <div className="text-sm font-medium">{t.code}</div>
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full border rounded p-1"
                      value={t.lesson_count}
                      onChange={e => updateCount(t.id, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-700">
                Planirano ukupno časova: <b>{totalPlanned}</b> {totalPlanned !== 40 && "(napomena: očekivano 40)"}
              </div>
              <div className="flex gap-2">
                <button className="border rounded px-3 py-2" onClick={saveThemes} disabled={saving}>
                  {saving ? "Čuvam…" : "Sačuvaj teme"}
                </button>
                <button className="border rounded px-3 py-2" onClick={generateLessons} disabled={genLoading}>
                  {genLoading ? "Generišem…" : "Generiši časove"}
                </button>
              </div>
              {err && <div className="text-sm text-red-600">{err}</div>}
              {ok && <div className="text-sm text-green-700">{ok}</div>}
            </div>

            {/* Lista generisanih kodova */}
            <div className="border rounded-xl p-3 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Generisani časovi</h2>
                <div className="text-sm text-gray-600">Ukupno: <b>{lessons.length}</b></div>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {lessons.map(l => (
                  <div key={l.id} className="border rounded px-2 py-1 text-sm text-center">
                    {l.code}
                  </div>
                ))}
                {lessons.length === 0 && <div className="text-sm text-gray-600">Još nema generisanih časova.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  );
}
