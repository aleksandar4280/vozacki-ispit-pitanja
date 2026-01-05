// file: app/admin/raspored/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";

const PAIRS: Array<[string, string]> = [
  ["T6-1", "T8-1"],
  ["T10-1", "T11-1"],
  ["P-T2-1", "P-T9-1"],
];
const pairMap = new Map<string, string>();
for (const [a, b] of PAIRS) { pairMap.set(a, b); pairMap.set(b, a); }

type Lesson = { id: number; code: string; is_special: boolean };
type School = { id: number; name: string };

const LOCALE = "sr-RS";

export default function NewSchedulePage() {
  const router = useRouter();

  // datum + vreme (24h)
  const [dateStr, setDateStr] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");

  // opis + škola
  const [desc, setDesc] = useState<string>("");
  const [schoolId, setSchoolId] = useState<number | "">("");

  // šifrarnik
  const [schools, setSchools] = useState<School[]>([]);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);

  // izbor časova
  const [pickOpen, setPickOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // mapiranja
  const byCode = useMemo(() => {
    const m = new Map<string, Lesson>();
    allLessons.forEach(l => m.set(l.code, l));
    return m;
  }, [allLessons]);
  const byId = useMemo(() => {
    const m = new Map<number, Lesson>();
    allLessons.forEach(l => m.set(l.id, l));
    return m;
  }, [allLessons]);

  function groupKey(code: string) {
    const peer = pairMap.get(code);
    return peer ? [code, peer].sort().join("+") : code;
  }

  const selectedGroups = useMemo(() => {
    const g = new Set<string>();
    selectedIds.forEach(id => {
      const les = byId.get(id);
      if (les) g.add(groupKey(les.code));
    });
    return g;
  }, [selectedIds, byId]);
  const groupCount = selectedGroups.size;

  const tableRows = useMemo(() => {
    const map = new Map<string, { firstIndex: number; lessonIds: number[]; codes: string[] }>();
    selectedIds.forEach((id, idx) => {
      const les = byId.get(id);
      if (!les) return;
      const key = groupKey(les.code);
      if (!map.has(key)) map.set(key, { firstIndex: idx, lessonIds: [], codes: [] });
      const it = map.get(key)!;
      if (!it.lessonIds.includes(id)) it.lessonIds.push(id);
      if (!it.codes.includes(les.code)) it.codes.push(les.code);
    });
    return Array.from(map.entries())
      .sort((a,b)=>a[1].firstIndex-b[1].firstIndex)
      .map(([key,v])=>({ key, lessonIds:v.lessonIds, codes:v.codes.sort() }));
  }, [selectedIds, byId]);

  function combineISO(d: string, t: string) {
    if (!d || !t) return "";
    const local = new Date(`${d}T${t}`);
    return isNaN(local.getTime()) ? "" : local.toISOString();
  }
  function slotTimes(baseDate: string, baseTime: string, index: number) {
    if (!baseDate || !baseTime) return { start: "", end: "" };
    const base = new Date(`${baseDate}T${baseTime}`);
    if (isNaN(base.getTime())) return { start: "", end: "" };
    const start = new Date(base.getTime() + index * 55 * 60_000);
    const end = new Date(start.getTime() + 45 * 60_000);
    const fmt = (d: Date) => d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
    return { start: fmt(start), end: fmt(end) };
  }

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      setLoading(true);
      const [{ data: sch }, { data: les, error: e2 }] = await Promise.all([
        sb.from("schools").select("id, name").order("created_at", { ascending: true }),
        sb.from("theory_lessons").select("id, code, is_special").order("code", { ascending: true })
      ]);
      if (e2) setErr(e2.message);
      setSchools((sch ?? []) as School[]);
      setAllLessons((les ?? []) as Lesson[]);
      setLoading(false);
    })();
  }, []);

  function toggleLesson(code: string) {
    const a = byCode.get(code);
    if (!a) return;
    const peerCode = pairMap.get(code) || null;
    const idsToToggle = [a.id];
    if (peerCode) {
      const p = byCode.get(peerCode);
      if (p) idsToToggle.push(p.id);
    }
    const willAdd = !idsToToggle.every(id => selectedIds.includes(id));
    if (willAdd) {
      const key = groupKey(code);
      const newGroups = new Set(selectedGroups); newGroups.add(key);
      if (newGroups.size > 3) {
        setErr("Maksimalno 3 časa po rasporedu."); setTimeout(()=>setErr(null),1500); return;
      }
      setSelectedIds(prev => Array.from(new Set([...prev, ...idsToToggle])));
    } else {
      setSelectedIds(prev => prev.filter(id => !idsToToggle.includes(id)));
    }
  }

  function removeRow(groupKeyStr: string) {
    const idsToRemove: number[] = [];
    for (const id of selectedIds) {
      const les = byId.get(id);
      if (les && groupKey(les.code) === groupKeyStr) idsToRemove.push(id);
    }
    setSelectedIds(prev => prev.filter(id => !idsToRemove.includes(id)));
  }

  async function save() {
    setErr(null);
    if (!schoolId) return setErr("Izaberi autoškolu.");
    if (!dateStr || !timeStr) return setErr("Unesi datum i vreme.");
    if (tableRows.length === 0) return setErr("Izaberi bar jedan čas.");

    setSaving(true);
    const sb = supabaseBrowser();
    const startsISO = combineISO(dateStr, timeStr);
    const { data: sched, error: e1 } = await sb
      .from("schedules")
      .insert({ school_id: Number(schoolId), starts_at: startsISO, description: desc || null })
      .select("id")
      .single();
    if (e1) { setErr(e1.message); setSaving(false); return; }

    const rows = selectedIds.map(lesson_id => ({ schedule_id: sched.id, lesson_id }));
    const { error: e2 } = await sb.from("schedule_lessons").insert(rows);
    if (e2) { setErr(e2.message); setSaving(false); return; }

    router.push("/admin/raspored");
  }

  return (
    <AdminGuard>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">Novi raspored</h1>

        <div className="space-y-4 border rounded-2xl p-4 bg-white shadow-sm">
          {/* Škola + datum + vreme */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium">Autoškola</label>
              <select
                className="w-full border rounded-lg p-2"
                value={schoolId}
                onChange={(e)=>setSchoolId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Izaberi autoškolu</option>
                {schools.map(s=>(
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium">Datum</label>
              <input
                type="date"
                className="w-full border rounded-lg p-2"
                value={dateStr}
                onChange={(e)=>setDateStr(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium">Vreme (24h)</label>
              <input
                type="time"
                lang="en-GB"
                step={60}
                className="w-full border rounded-lg p-2"
                value={timeStr}
                onChange={(e)=>setTimeStr(e.target.value)}
              />
            </div>
          </div>

          {/* Opis */}
          <div>
            <label className="block text-sm mb-1 font-medium">Opis rasporeda</label>
            <textarea
              className="w-full border rounded-lg p-2 h-[42px] md:h-[86px] resize-y"
              placeholder="npr. Grupa A, napomena..."
              value={desc}
              onChange={(e)=>setDesc(e.target.value)}
            />
          </div>

          {/* Časovi + tabela */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Časovi teorijske obuke</h2>
              <button type="button" className="border rounded-lg px-3 py-1.5 hover:bg-gray-50" onClick={()=>setPickOpen(true)} disabled={loading}>
                Izaberi čas
              </button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border">
                <thead className="bg-gray-50 text-sm">
                  <tr>
                    <th className="border px-2 py-1 text-left w-16">Redni broj</th>
                    <th className="border px-2 py-1 text-left">Oznaka časa</th>
                    <th className="border px-2 py-1 text-left w-32">Početak</th>
                    <th className="border px-2 py-1 text-left w-32">Kraj</th>
                    <th className="border px-2 py-1 text-center w-16">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => {
                    const label = row.codes.length > 1 ? row.codes.join(" + ") : row.codes[0];
                    const { start, end } = slotTimes(dateStr, timeStr, i);
                    return (
                      <tr key={row.key} className="text-sm">
                        <td className="border px-2 py-1">{i + 1}</td>
                        <td className="border px-2 py-1">{label}</td>
                        <td className="border px-2 py-1">{start || "—"}</td>
                        <td className="border px-2 py-1">{end || "—"}</td>
                        <td className="border px-2 py-1 text-center">
                          <button className="rounded bg-red-100 hover:bg-red-200 px-2 py-1" title="Obriši čas" onClick={()=>removeRow(row.key)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                  {tableRows.length === 0 && (
                    <tr><td className="border px-2 py-2 text-sm text-gray-500" colSpan={5}>Nije odabran nijedan čas.</td></tr>
                  )}
                </tbody>
              </table>
              <div className="text-xs text-gray-600 mt-2">Odabrano časova: <b>{tableRows.length}</b> / 3</div>
            </div>

            {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
          </div>

          <div className="flex gap-2 justify-end">
            <button className="border rounded-lg px-4 py-2 hover:bg-gray-50" onClick={()=>history.back()}>Otkaži</button>
            <button className="bg-black text-white rounded-lg px-4 py-2 hover:opacity-90" onClick={save} disabled={saving}>
              Sačuvaj raspored
            </button>
          </div>
        </div>

        {/* Modal: izbor časova */}
        {pickOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=>setPickOpen(false)}>
            <div className="bg-white rounded-2xl shadow w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={(e)=>e.stopPropagation()}>
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
                <h3 className="font-semibold">Izbor časova</h3>
                <button className="text-sm underline" onClick={()=>setPickOpen(false)}>Zatvori</button>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {allLessons.map((l) => {
                  const peer = pairMap.get(l.code);
                  const checked = selectedIds.includes(l.id);
                  return (
                    <label key={l.id} className={`border rounded-lg p-2 flex items-center gap-2 hover:bg-gray-50 ${checked ? "bg-gray-50" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleLesson(l.code)} />
                      <span className="text-sm">{l.code}{peer ? " (par)" : ""}{l.is_special ? " • Posebni" : ""}</span>
                    </label>
                  );
                })}
              </div>
              <div className="p-4 pt-0 text-xs text-gray-600">Parovi: <b>T6-1↔T8-1</b>, <b>T10-1↔T11-1</b>, <b>P-T2-1↔P-T9-1</b>.</div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
