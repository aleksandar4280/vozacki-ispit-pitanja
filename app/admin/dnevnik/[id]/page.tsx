// file: app/admin/dnevnik/[id]/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'

type School = { name: string }
type SchedLesson = {
  lesson_id: number // theory_lessons.id
  created_at: string | null
  theory_lessons: { code: string } | null
}
type Schedule = {
  id: number
  starts_at: string | null
  schools: School | null
  schedule_lessons: SchedLesson[]
}
type Journal = {
  id: number
  journal_date: string
  schedule_id: number
  schedules: Schedule | null
}

type Candidate = {
  id: number
  first_name: string
  last_name: string
  id_number: string
}

type AttRow = { candidate_id: number; lesson_id: number; present: boolean }

// Parovi časova
const LESSON_PAIRS: Array<[string, string]> = [
  ['T6-1', 'T8-1'],
  ['T10-1', 'T11-1'],
  ['P-T2-1', 'P-T9-1'],
]

function arePaired(code1: string, code2: string): boolean {
  return LESSON_PAIRS.some(
    ([a, b]) => (a === code1 && b === code2) || (a === code2 && b === code1)
  )
}

function hhmm(d: Date) {
  return d.toLocaleTimeString('sr-RS', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function JournalPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const sb = supabaseBrowser()

  // sigurno parsiraj ID
  const journalId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params.id[0] : params?.id
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [params])

  const [j, setJ] = useState<Journal | null>(null)
  const [cands, setCands] = useState<Candidate[]>([])
  const [pendingCands, setPendingCands] = useState<Candidate[]>([]) // kandidati dodati lokalno, još bez zapisa u attendance
  const [att, setAtt] = useState<AttRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // modal pretrage kandidata
  const [openAdd, setOpenAdd] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)

  const [listenedSet, setListenedSet] = useState<Set<string>>(new Set())
  // čuva ključeve koje smo mi dodali tokom ovog učitavanja stranice (da dozvolimo undo)
  const [addedHere, setAddedHere] = useState<Set<string>>(new Set())

  function keyOf(candidateId: number, lessonId: number) {
    return `${candidateId}:${lessonId}`
  }

  useEffect(() => {
    if (journalId == null) {
      setErr('Neispravan ID dnevnika u URL-u.')
      setLoading(false)
      return
    }
    void loadPage(journalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId])

  // Automatska pretraga pri kucanju
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (q.trim()) {
        void searchCandidates()
      } else {
        setHits([])
      }
    }, 300) // debounce 300ms

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function loadPage(jid: number) {
    setLoading(true)
    setErr(null)
    try {
      // dnevnik + raspored
      const { data: dj, error: e1 } = await sb
        .from('journals')
        .select(
          `
          id, journal_date, schedule_id,
          schedules:schedule_id (
            id,
            starts_at,
            school_id,
            schools(name),
            schedule_lessons(
              lesson_id,
              created_at,
              theory_lessons(code)
            )
          )
        `
        )
        .eq('id', jid)
        .maybeSingle()

      if (e1) throw e1
      if (!dj) {
        setJ(null)
        setCands([])
        setAtt([])
        return
      }

      // prisustva + kandidat (preko FK candidate_id)
      const { data: da, error: e2 } = await sb
        .from('journal_attendance')
        .select(
          `
          candidate_id,
          lesson_id,
          present,
          candidates(id, first_name, last_name, id_number)
        `
        )
        .eq('journal_id', jid)

      if (e2) throw e2

      const attRows: AttRow[] = (da ?? []).map((r: any) => ({
        candidate_id: r.candidate_id,
        lesson_id: r.lesson_id,
        present: r.present,
      }))

      // distinct kandidati iz prisutnosti
      const map = new Map<number, Candidate>()
      ;(da ?? []).forEach((r: any) => {
        const c = r.candidates as Candidate | null
        if (c) map.set(c.id, c)
      })

      const candidateIds = Array.from(
        new Set((da ?? []).map((r: any) => r.candidate_id as number))
      )
      const lessonIds = ((dj as any)?.schedules?.schedule_lessons ?? []).map(
        (sl: any) => Number(sl.lesson_id)
      )

      if (candidateIds.length > 0 && lessonIds.length > 0) {
        const { data: cl, error: e4 } = await sb
          .from('candidate_lessons')
          .select('candidate_id, lesson_id')
          .in('candidate_id', candidateIds)
          .in('lesson_id', lessonIds)

        if (e4) throw e4

        const s = new Set<string>()
        ;(cl ?? []).forEach((r: any) =>
          s.add(keyOf(r.candidate_id, r.lesson_id))
        )
        setListenedSet(s)
      } else {
        setListenedSet(new Set())
      }

      setAddedHere(new Set()) // reset “session undo”

      setJ(dj as unknown as Journal)
      setCands(Array.from(map.values()))
      setPendingCands([]) // prazno pri učitavanju
      setAtt(attRows)
    } catch (e: any) {
      setErr(e?.message || 'Greška pri učitavanju dnevnika.')
      setJ(null)
      setCands([])
      setAtt([])
      setPendingCands([])
    } finally {
      setLoading(false)
    }
  }

  // kolone časova (realni lesson_id iz theory_lessons)
  // kolone časova - grupiši parove
  const uiLessons = useMemo(() => {
    const list = j?.schedules?.schedule_lessons
      ? [...j.schedules.schedule_lessons]
      : []
    list.sort((a, b) => {
      const ac = a.created_at ? new Date(a.created_at).getTime() : 0
      const bc = b.created_at ? new Date(b.created_at).getTime() : 0
      return ac - bc
    })

    const base = j?.schedules?.starts_at
      ? new Date(j.schedules.starts_at)
      : null
    const grouped: Array<{ lessonIds: number[]; label: string }> = []

    for (let i = 0; i < list.length; i++) {
      const curr = list[i]
      const currCode = curr.theory_lessons?.code ?? 'Čas'

      const next = list[i + 1]
      const nextCode = next?.theory_lessons?.code ?? ''

      if (next && arePaired(currCode, nextCode)) {
        // Par časova
        const slotIndex = grouped.length
        let label = `${currCode} + ${nextCode}`
        if (base) {
          const startMin = slotIndex === 0 ? 0 : slotIndex * 55
          const endMin = startMin + 45
          const s = new Date(base.getTime() + startMin * 60000)
          const e = new Date(base.getTime() + endMin * 60000)
          label = `${currCode} + ${nextCode} • ${hhmm(s)}–${hhmm(e)}`
        }
        grouped.push({
          lessonIds: [Number(curr.lesson_id), Number(next.lesson_id)],
          label,
        })
        i++ // Preskoči sledeći
      } else {
        // Obični čas
        const slotIndex = grouped.length
        let label = currCode
        if (base) {
          const startMin = slotIndex === 0 ? 0 : slotIndex * 55
          const endMin = startMin + 45
          const s = new Date(base.getTime() + startMin * 60000)
          const e = new Date(base.getTime() + endMin * 60000)
          label = `${currCode} • ${hhmm(s)}–${hhmm(e)}`
        }
        grouped.push({
          lessonIds: [Number(curr.lesson_id)],
          label,
        })
      }
    }

    return grouped
  }, [j?.schedules?.schedule_lessons, j?.schedules?.starts_at])

  function presentOf(candidateId: number, lessonIds: number[]): boolean {
    // Svi lesson_id-evi moraju biti present
    return lessonIds.every((lessonId) =>
      att.some(
        (a) =>
          a.candidate_id === candidateId &&
          a.lesson_id === lessonId &&
          a.present
      )
    )
  }

  async function togglePresence(candidateId: number, lessonIds: number[]) {
    if (!j) return

    const allPresent = presentOf(candidateId, lessonIds)
    const next = !allPresent

    // Provera za svaki lesson_id u paru
    for (const lessonId of lessonIds) {
      const k = keyOf(candidateId, lessonId)
      if (next && listenedSet.has(k) && !addedHere.has(k)) {
        alert(
          'Kandidat je već odslušao neki od ovih časova. Ne možeš ponovo evidentirati prisustvo.'
        )
        return
      }
    }

    // Optimistic update za sve lesson_id-eve
    setAtt((prev) => {
      let updated = [...prev]
      for (const lessonId of lessonIds) {
        const i = updated.findIndex(
          (a) => a.candidate_id === candidateId && a.lesson_id === lessonId
        )
        if (i === -1) {
          updated.push({
            candidate_id: candidateId,
            lesson_id: lessonId,
            present: next,
          })
        } else {
          updated[i] = { ...updated[i], present: next }
        }
      }
      return updated
    })

    // Upisuj SVE lesson_id-eve u bazu
    for (const lessonId of lessonIds) {
      const k = keyOf(candidateId, lessonId)

      // 1) journal_attendance
      const { error: e1 } = await sb.from('journal_attendance').upsert(
        {
          journal_id: j.id,
          candidate_id: candidateId,
          lesson_id: lessonId,
          present: next,
        },
        { onConflict: 'journal_id,candidate_id,lesson_id' }
      )

      if (e1) {
        setErr(e1.message)
        return
      }

      // 2) candidate_lessons
      if (next) {
        const { data: exists, error: eCheck } = await sb
          .from('candidate_lessons')
          .select('candidate_id, lesson_id')
          .eq('candidate_id', candidateId)
          .eq('lesson_id', lessonId)
          .maybeSingle()

        if (eCheck) {
          setErr(eCheck.message)
          return
        }

        if (exists && !addedHere.has(k)) {
          alert('Kandidat je već odslušao neki od ovih časova.')
          // Rollback
          setAtt((prev) =>
            prev.map((a) =>
              lessonIds.includes(a.lesson_id) && a.candidate_id === candidateId
                ? { ...a, present: false }
                : a
            )
          )
          return
        }

        const { error: e2 } = await sb.from('candidate_lessons').upsert(
          {
            candidate_id: candidateId,
            lesson_id: lessonId,
            source: 'journal',
          },
          { onConflict: 'candidate_id,lesson_id' }
        )

        if (e2) {
          setErr(e2.message)
          return
        }

        setListenedSet((prev) => new Set(prev).add(k))
        setAddedHere((prev) => new Set(prev).add(k))
      } else {
        if (addedHere.has(k)) {
          const { error: e3 } = await sb
            .from('candidate_lessons')
            .delete()
            .eq('candidate_id', candidateId)
            .eq('lesson_id', lessonId)

          if (e3) setErr(e3.message)

          setListenedSet((prev) => {
            const s = new Set(prev)
            s.delete(k)
            return s
          })
          setAddedHere((prev) => {
            const s = new Set(prev)
            s.delete(k)
            return s
          })
        }
      }
    }
  }

  // pretraga kandidata (automatska pri kucanju)
  async function searchCandidates() {
    const t = q.trim()
    if (!t) {
      setHits([])
      return
    }

    // Izvuci school_id iz dnevnika
    const schoolId = j?.schedules?.schools
      ? (j.schedules as any).school_id
      : null
    if (!schoolId) {
      setHits([])
      return
    }

    setSearching(true)
    try {
      const orExpr = `first_name.ilike.%${t}%,last_name.ilike.%${t}%,id_number.ilike.%${t}%`
      const { data } = await sb
        .from('candidates')
        .select('id,first_name,last_name,id_number')
        .eq('school_id', schoolId)
        .or(orExpr)
        .order('created_at', { ascending: true })
        .limit(50)

      // Filtriraj kandidate koji su već dodati u dnevnik
      const alreadyAddedIds = new Set([
        ...cands.map((c) => c.id),
        ...pendingCands.map((c) => c.id),
      ])

      const filtered = (data ?? []).filter((c) => !alreadyAddedIds.has(c.id))
      setHits(filtered as Candidate[])
    } finally {
      setSearching(false)
    }
  }

  // dodaj kandidata (lokalno); prvi check kreira DB zapis
  async function addCandidateLocal(c: Candidate) {
    const already =
      cands.some((x) => x.id === c.id) ||
      pendingCands.some((x) => x.id === c.id)
    if (already) {
      setOpenAdd(false)
      setQ('')
      setHits([])
      return
    }

    setPendingCands((prev) => [...prev, c])

    // povuci koje časove već ima (da odmah blokira čekiranje)
    const lessonIds = (j?.schedules?.schedule_lessons ?? []).map((sl) =>
      Number(sl.lesson_id)
    )
    if (lessonIds.length > 0) {
      const { data, error } = await sb
        .from('candidate_lessons')
        .select('candidate_id, lesson_id')
        .eq('candidate_id', c.id)
        .in('lesson_id', lessonIds)

      if (!error && data) {
        setListenedSet((prev) => {
          const s = new Set(prev)
          data.forEach((r) => s.add(keyOf(r.candidate_id, r.lesson_id)))
          return s
        })
      }
    }

    setOpenAdd(false)
    setQ('')
    setHits([])
  }

  if (loading)
    return (
      <AdminGuard>
        <div className="p-4">Učitavanje…</div>
      </AdminGuard>
    )
  if (err)
    return (
      <AdminGuard>
        <div className="p-4 text-red-600">{err}</div>
      </AdminGuard>
    )
  if (!j)
    return (
      <AdminGuard>
        <div className="p-4 text-red-600">
          Dnevnik sa datim ID-jem ne postoji.
        </div>
      </AdminGuard>
    )

  // prikaz info
  const dateStr = new Date(j.journal_date).toLocaleDateString('sr-RS', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
  const schedInfo = (() => {
    const st = j.schedules?.starts_at ? new Date(j.schedules.starts_at) : null
    const school = j.schedules?.schools?.name ?? ''
    if (!st) return school ? `• ${school}` : ''
    return `${st.toLocaleDateString('sr-RS', { day: 'numeric', month: 'numeric', year: 'numeric' })}. ${hhmm(st)} • ${school}`
  })()

  // spoj kandidata iz attendance + pending (redom: attendance pa pending)
  // Bez useMemo – obična izvedena vrednost
  const allCands: Candidate[] = (() => {
    const map = new Map<number, Candidate>()
    for (const c of cands) map.set(c.id, c)
    for (const p of pendingCands) if (!map.has(p.id)) map.set(p.id, p)
    return Array.from(map.values())
  })()

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-semibold">Dnevnik #{j.id}</h1>

        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm space-y-1">
            <div>
              <span className="text-gray-500">Datum: </span>
              <b>{dateStr}.</b>
            </div>
            <div>
              <span className="text-gray-500">Raspored: </span>
              {schedInfo}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Kandidati</h2>
          <button
            className="border rounded px-3 py-1"
            onClick={() => setOpenAdd(true)}
          >
            Dodaj novog kandidata
          </button>
        </div>

        <div className="overflow-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-3 py-2 text-left">Redni broj</th>
                <th className="border px-3 py-2 text-left">Kandidat</th>
                <th className="border px-3 py-2 text-left">ID broj</th>
                {uiLessons.map((ls, idx) => (
                  <th key={idx} className="border px-3 py-2 text-center">
                    {ls.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allCands.map((c, index) => (
                <tr key={c.id} className="odd:bg-white even:bg-gray-50">
                  <td className="border px-3 py-2 text-center">{index + 1}</td>
                  <td className="border px-3 py-2">
                    {c.first_name} {c.last_name}
                  </td>
                  <td className="border px-3 py-2">{c.id_number}</td>
                  {uiLessons.map((ls, idx) => {
                    const allDisabled = ls.lessonIds.every((lid) => {
                      const k = keyOf(c.id, lid)
                      return listenedSet.has(k) && !addedHere.has(k)
                    })

                    return (
                      <td key={idx} className="border px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={presentOf(c.id, ls.lessonIds)}
                          disabled={allDisabled}
                          title={
                            allDisabled
                              ? 'Kandidat je već odslušao ovaj čas.'
                              : ''
                          }
                          onChange={() => togglePresence(c.id, ls.lessonIds)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
              {allCands.length === 0 && (
                <tr>
                  <td
                    className="border px-3 py-4 text-gray-600"
                    colSpan={3 + uiLessons.length}
                  >
                    Nema kandidata u ovom dnevniku.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="border rounded px-4 py-2"
            onClick={() => router.push('/admin/dnevnik')}
          >
            Nazad
          </button>
        </div>
      </div>

      {/* Modal: dodavanje kandidata (lokalno) */}
      {openAdd && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpenAdd(false)}
        >
          <div
            className="bg-white rounded-xl shadow p-4 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Dodaj kandidata</h3>
              <button className="text-sm" onClick={() => setOpenAdd(false)}>
                Zatvori
              </button>
            </div>

            <div className="flex gap-2">
              <input
                className="border rounded p-2 flex-1"
                placeholder="Pretraga po imenu, prezimenu ili ID broju…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchCandidates()
                }}
              />
            </div>

            <div className="mt-3 max-h-[50vh] overflow-auto space-y-2">
              {hits.map((h) => (
                <div
                  key={h.id}
                  className="border rounded p-2 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {h.first_name} {h.last_name}
                    </div>
                    <div className="text-xs text-gray-600">{h.id_number}</div>
                  </div>
                  <button
                    className="border rounded px-3 py-1"
                    onClick={() => addCandidateLocal(h)}
                  >
                    Dodaj
                  </button>
                </div>
              ))}
              {!searching && hits.length === 0 && (
                <div className="text-sm text-gray-600">
                  Unesite termin i kliknite „Pretraži”.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminGuard>
  )
}
