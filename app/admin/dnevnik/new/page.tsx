// file: app/admin/dnevnik/new/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";

type ScheduleLite = { id: number; starts_at: string; schools: { name: string } | null };
type JournalLite = { id: number; schedule_id: number };
const todayISODate = () => new Date().toISOString().slice(0,10); // YYYY-MM-DD

export default function NewJournalPage() {
  const router = useRouter();
  const [today] = useState<string>(todayISODate());
  const [pickOpen, setPickOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleLite[]>([]);
  const [usedSchedIds, setUsedSchedIds] = useState<number[]>([]);
  const [selSchedule, setSelSchedule] = useState<ScheduleLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const freeSchedules = useMemo(
    () => schedules.filter(s => !usedSchedIds.includes(s.id)),
    [schedules, usedSchedIds]
  );

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true); setErr(null);

      const start = new Date(today + "T00:00:00");
      const end = new Date(today + "T23:59:59.999");

      // 1) Svi rasporedi za današnji dan
      const { data: sch, error: e1 } = await sb
        .from("schedules")
        .select("id, starts_at, schools(name)")
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString())
        .order("starts_at", { ascending: true })
        .returns<ScheduleLite[]>();

      // 2) Već iskorišćeni u dnevnicima (za današnji dan)
      const { data: jn, error: e2 } = await sb
        .from("journals")
        .select("id, schedule_id")
        .eq("journal_date", today)
        .returns<JournalLite[]>();

      if (e1) setErr(e1.message);
      if (e2) setErr(prev => prev ?? e2.message);

      setSchedules(sch ?? []);
      setUsedSchedIds((jn ?? []).map(x => x.schedule_id));
      setLoading(false);
    })();
  }, [today]);

  async function save() {
    setErr(null);
    if (!selSchedule) return setErr("Izaberi raspored za dnevnik.");
    setSaving(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb
      .from("journals")
      .insert({ journal_date: today, schedule_id: selSchedule.id })
      .select("id")
      .single();
    setSaving(false);
    if (error) return setErr(error.message);
    router.push(`/admin/dnevnik/${data!.id}`);
  }

  return (
    <AdminGuard>
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">Novi dnevnik</h1>

        <div className="border rounded-xl p-4 bg-white space-y-3">
          <div>
            <div className="text-sm text-gray-600">Datum</div>
            <div className="font-medium">{new Date(today + "T00:00:00").toLocaleDateString("sr-RS")}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">Raspored održavanja TO</div>
            <button className="border rounded px-3 py-1" onClick={() => setPickOpen(true)} disabled={loading}>🔍</button>
          </div>

          <div className="text-sm text-gray-700">
            {selSchedule
              ? <>Izabran raspored: <b>{new Date(selSchedule.starts_at).toLocaleString("sr-RS", { hour12: false })}</b> • {selSchedule.schools?.name ?? "Autoškola"}</>
              : "Nije izabran raspored."}
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex justify-end gap-2">
            <button className="border rounded px-4 py-2" onClick={() => history.back()}>Otkaži</button>
            <button className="bg-black text-white rounded px-4 py-2" onClick={save} disabled={saving}>Sačuvaj dnevnik</button>
          </div>
        </div>

        {/* Modal: izbor rasporeda */}
        {pickOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPickOpen(false)}>
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Rasporedi za danas</h3>
                <button className="text-sm underline" onClick={() => setPickOpen(false)}>Zatvori</button>
              </div>

              <div className="mt-3 space-y-2">
                {freeSchedules.map(s => (
                  <label key={s.id} className="border rounded p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{new Date(s.starts_at).toLocaleString("sr-RS", { hour12: false })}</div>
                      <div className="text-xs text-gray-600">{s.schools?.name ?? "Autoškola"}</div>
                    </div>
                    <input
                      type="radio"
                      name="sched"
                      checked={selSchedule?.id === s.id}
                      onChange={() => setSelSchedule(s)}
                    />
                  </label>
                ))}
                {!loading && freeSchedules.length === 0 && <div className="text-sm text-gray-500">Nema slobodnih rasporeda za današnji dan.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}