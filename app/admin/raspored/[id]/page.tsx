// file: app/admin/raspored/[id]/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'

type Schedule = {
  id: number
  starts_at: string
  description: string | null
  school_id: number
  schools: { name: string } | null
  lessons: { lesson_id: number; theory_lessons: { code: string } | null }[]
}

type Candidate = {
  id: number
  first_name: string
  last_name: string
  id_number: string
}

type CandidateLesson = {
  candidate_id: number
  lesson_id: number
}

type TheoryLesson = {
  id: number
  code: string
  theme_id: number
  seq: number
}

const LESSON_PAIRS: Array<[string, string]> = [
  ['T6-1', 'T8-1'],
  ['T10-1', 'T11-1'],
  ['P-T2-1', 'P-T9-1'],
]

// Uslovni časovi po temama (hijerarhija)
const THEME_HIERARCHY: Record<number, number[]> = {
  1: [1, 2], // T1-1 → T1-2
  2: [1, 2], // T2-1 → T2-2
  4: [1, 2], // T4-1 → T4-2
  5: [1, 2, 3, 4, 5, 6], // T5-1 → T5-2 → ... → T5-6
  7: [1, 2, 3, 4], // T7-1 → T7-2 → T7-3 → T7-4
  12: [1, 2, 3, 4], // T12-1 → T12-2 → T12-3 → T12-4
  // T14 nema hijerarhiju - mogu se slušati u bilo kom redosledu
}

// Funkcija koja proverava da li su dva koda par
function arePaired(code1: string, code2: string): boolean {
  return LESSON_PAIRS.some(
    ([a, b]) => (a === code1 && b === code2) || (a === code2 && b === code1)
  )
}

export default function ScheduleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const scheduleId = Number(params.id)

  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidateLessons, setCandidateLessons] = useState<CandidateLesson[]>(
    []
  )
  const [allLessons, setAllLessons] = useState<TheoryLesson[]>([])
  const [lessonCounts, setLessonCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const sb = supabaseBrowser()
    ;(async () => {
      setLoading(true)
      setErr(null)

      try {
        // 1. Učitaj raspored
        const { data: schedData, error: schedErr } = await sb
          .from('schedules')
          .select(
            `
            id, starts_at, description, school_id, schools(name),
            lessons:schedule_lessons(
              lesson_id,
              theory_lessons(code)
            )
          `
          )
          .eq('id', scheduleId)
          .single()

        if (schedErr) throw schedErr
        if (!schedData) throw new Error('Raspored nije pronađen')

        setSchedule(schedData as any)
        const schoolId = (schedData as any).school_id

        // 2. Učitaj sve theory_lessons sa theme_id i seq
        const { data: lessonsData, error: lessonsErr } = await sb
          .from('theory_lessons')
          .select('id, code, theme_id, seq')

        if (lessonsErr) throw lessonsErr
        setAllLessons(lessonsData as any)

        // 3. Učitaj kandidate za tu autoškolu
        const { data: candsData, error: candsErr } = await sb
          .from('candidates')
          .select('id, first_name, last_name, id_number')
          .eq('school_id', schoolId)

        if (candsErr) throw candsErr
        setCandidates(candsData as any)

        // 4. Učitaj candidate_lessons za sve kandidate
        // 4. Učitaj candidate_lessons za sve kandidate - SA BATCH UČITAVANJEM
        const allCandidateLessons: CandidateLesson[] = []
        let clFrom = 0
        const clBatchSize = 1000

        while (true) {
          const { data: clBatch, error: clErr } = await sb
            .from('candidate_lessons')
            .select('candidate_id, lesson_id')
            .range(clFrom, clFrom + clBatchSize - 1)

          if (clErr) throw clErr
          if (!clBatch || clBatch.length === 0) break

          allCandidateLessons.push(...(clBatch as any))

          if (clBatch.length < clBatchSize) break
          clFrom += clBatchSize
        }

        console.log(
          `📚 Total candidate_lessons loaded: ${allCandidateLessons.length}`
        )
        setCandidateLessons(allCandidateLessons)

        // 5. Učitaj lesson counts iz view-a
        const { data: countsData, error: countsErr } = await sb
          .from('candidate_lesson_counts')
          .select('candidate_id, lesson_count')

        if (countsErr) throw countsErr

        const counts: Record<number, number> = {}
        ;(countsData ?? []).forEach((row: any) => {
          counts[row.candidate_id] = row.lesson_count
        })
        setLessonCounts(counts)
      } catch (e: any) {
        setErr(e?.message || 'Greška pri učitavanju podataka')
      } finally {
        setLoading(false)
      }
    })()
  }, [scheduleId])

  // Mapa lesson_id → TheoryLesson
  const lessonById = useMemo(() => {
    const map = new Map<number, TheoryLesson>()
    allLessons.forEach((l) => map.set(l.id, l))
    return map
  }, [allLessons])

  // Mapa candidate_id → Set<lesson_id> (šta je kandidat odslušao)
  const listenedByCandidate = useMemo(() => {
    const map = new Map<number, Set<number>>()
    candidateLessons.forEach((cl) => {
      if (!map.has(cl.candidate_id)) {
        map.set(cl.candidate_id, new Set())
      }
      map.get(cl.candidate_id)!.add(cl.lesson_id)
    })
    return map
  }, [candidateLessons])

  // Funkcija koja proverava da li kandidat može da sluša određeni čas
  // Funkcija koja proverava da li kandidat može da sluša određeni čas
  // Funkcija koja proverava da li kandidat može da sluša određeni čas
  // scheduleLessonIds - svi lesson_id iz rasporeda (za međusobno otključavanje)
  function canListenToLesson(
    candidateId: number,
    lessonId: number,
    scheduleLessonIds: number[]
  ): boolean {
    const listened = listenedByCandidate.get(candidateId) || new Set()
    const lesson = lessonById.get(lessonId)

    if (!lesson) return false
    if (listened.has(lessonId)) return false

    const themeId = lesson.theme_id
    const seq = lesson.seq
    const hierarchy = THEME_HIERARCHY[themeId]

    if (!hierarchy) return true
    if (!hierarchy.includes(seq)) return true

    const requiredSeqs = hierarchy.filter((s) => s < seq)

    // Za svaki uslovni seq, proveri samo REGULARNE časove (bez P- prefiksa)
    return requiredSeqs.every((reqSeq) => {
      const matchingIds = allLessons
        .filter(
          (l) =>
            l.theme_id === themeId &&
            l.seq === reqSeq &&
            !l.code.startsWith('P-') // ← IGNORIŠI poseban fond
        )
        .map((l) => l.id)

      return matchingIds.some(
        (lid) => listened.has(lid) || scheduleLessonIds.includes(lid)
      )
    })
  }

  // Kategorisanje kandidata
  const categorizedCandidates = useMemo(() => {
    if (!schedule)
      return { canListenAll: [], canListenSome: [], cannotListen: [] }

    const schedLessonIds = schedule.lessons.map((l) => l.lesson_id)

    const canListenAll: Candidate[] = []
    const canListenSome: Array<{
      candidate: Candidate
      canListen: number[]
      cannotListen: number[]
    }> = []
    const cannotListen: Candidate[] = []

    candidates.forEach((c) => {
      const count = lessonCounts[c.id] ?? 0

      // Preskoči kandidate koji su završili TO (43 časa)
      if (count >= 43) return

      const listenableIds: number[] = []
      const notListenableIds: number[] = []

      schedLessonIds.forEach((lessonId) => {
        // Prosleđujemo schedLessonIds da se uzmu u obzir međusobni uslovi
        if (canListenToLesson(c.id, lessonId, schedLessonIds)) {
          listenableIds.push(lessonId)
        } else {
          notListenableIds.push(lessonId)
        }
      })

      if (listenableIds.length === schedLessonIds.length) {
        canListenAll.push(c)
      } else if (listenableIds.length > 0) {
        canListenSome.push({
          candidate: c,
          canListen: listenableIds,
          cannotListen: notListenableIds,
        })
      } else {
        cannotListen.push(c)
      }
    })

    return { canListenAll, canListenSome, cannotListen }
  }, [
    schedule,
    candidates,
    lessonCounts,
    listenedByCandidate,
    lessonById,
    allLessons,
  ])

  if (loading)
    return (
      <AdminGuard>
        <div className="p-8">Učitavanje…</div>
      </AdminGuard>
    )
  if (err)
    return (
      <AdminGuard>
        <div className="p-8 text-red-600">{err}</div>
      </AdminGuard>
    )
  if (!schedule)
    return (
      <AdminGuard>
        <div className="p-8">Raspored nije pronađen.</div>
      </AdminGuard>
    )

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Zaglavlje */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin/raspored')}
            className="border rounded px-3 py-2 hover:bg-gray-50"
          >
            ← Nazad
          </button>
          <h1 className="text-xl font-semibold">Detalji rasporeda</h1>
        </div>

        {/* Podaci o rasporedu */}
        <div className="border rounded-2xl p-4 bg-white shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Datum i vreme</div>
              <div className="font-medium">
                {new Date(schedule.starts_at).toLocaleString('sr-RS', {
                  hour12: false,
                })}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Autoškola</div>
              <div className="font-medium">{schedule.schools?.name ?? '—'}</div>
            </div>
          </div>

          {schedule.description && (
            <div>
              <div className="text-sm text-gray-600">Opis</div>
              <div className="font-medium">{schedule.description}</div>
            </div>
          )}

          <div>
            <div className="text-sm text-gray-600 mb-2">Časovi</div>
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-3 py-2 text-left w-16">
                    Redni broj
                  </th>
                  <th className="border px-3 py-2 text-left">Oznaka časa</th>
                  <th className="border px-3 py-2 text-left w-32">Početak</th>
                  <th className="border px-3 py-2 text-left w-32">Kraj</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const base = new Date(schedule.starts_at)
                  const lessons = schedule.lessons
                  const rows: Array<{
                    label: string
                    start: string
                    end: string
                  }> = []
                  let slotIndex = 0

                  for (let i = 0; i < lessons.length; i++) {
                    const curr = lessons[i]
                    const currCode =
                      curr.theory_lessons?.code ?? String(curr.lesson_id)

                    // Proveri da li je sledeći čas par sa trenutnim
                    const next = lessons[i + 1]
                    const nextCode = next?.theory_lessons?.code ?? ''

                    if (next && arePaired(currCode, nextCode)) {
                      // Par časova - prikaži kao jedan
                      const start = new Date(
                        base.getTime() + slotIndex * 55 * 60_000
                      )
                      const end = new Date(start.getTime() + 45 * 60_000)
                      const fmt = (d: Date) =>
                        d.toLocaleTimeString('sr-RS', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })

                      rows.push({
                        label: `${currCode} + ${nextCode}`,
                        start: fmt(start),
                        end: fmt(end),
                      })

                      i++ // Preskoči sledeći jer smo ga već obradili
                      slotIndex++
                    } else {
                      // Obični čas
                      const start = new Date(
                        base.getTime() + slotIndex * 55 * 60_000
                      )
                      const end = new Date(start.getTime() + 45 * 60_000)
                      const fmt = (d: Date) =>
                        d.toLocaleTimeString('sr-RS', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })

                      rows.push({
                        label: currCode,
                        start: fmt(start),
                        end: fmt(end),
                      })

                      slotIndex++
                    }
                  }

                  return rows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="border px-3 py-2">{idx + 1}</td>
                      <td className="border px-3 py-2">{row.label}</td>
                      <td className="border px-3 py-2">{row.start}</td>
                      <td className="border px-3 py-2">{row.end}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kandidati koji mogu da slušaju SVE časove */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-green-700">
            Kandidati koji mogu da slušaju ovaj raspored (
            {categorizedCandidates.canListenAll.length})
          </h2>
          <div className="space-y-2">
            {categorizedCandidates.canListenAll.map((c) => (
              <div
                key={c.id}
                className="border-l-4 border-green-500 bg-green-50 rounded p-3"
              >
                <div className="font-medium">
                  {c.first_name} {c.last_name}
                </div>
                <div className="text-sm text-gray-600">ID: {c.id_number}</div>
              </div>
            ))}
            {categorizedCandidates.canListenAll.length === 0 && (
              <div className="text-gray-500 text-sm">
                Nema kandidata koji mogu da slušaju sve časove.
              </div>
            )}
          </div>
        </div>

        {/* Kandidati koji mogu da slušaju NEKE časove */}
        {categorizedCandidates.canListenSome.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-yellow-700">
              Kandidati koji mogu da slušaju neke časove (
              {categorizedCandidates.canListenSome.length})
            </h2>
            <div className="space-y-2">
              {categorizedCandidates.canListenSome.map(
                ({ candidate: c, canListen, cannotListen }) => (
                  <div
                    key={c.id}
                    className="border-l-4 border-yellow-500 bg-yellow-50 rounded p-3"
                  >
                    <div className="font-medium">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      ID: {c.id_number}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {schedule.lessons.map((l) => {
                        const canListen_this = canListen.includes(l.lesson_id)
                        return (
                          <span
                            key={l.lesson_id}
                            className={`px-2 py-1 rounded text-xs ${
                              canListen_this
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : 'bg-red-100 text-red-800 border border-red-300'
                            }`}
                          >
                            {l.theory_lessons?.code ?? l.lesson_id}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Kandidati koji NE mogu da slušaju */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-red-700">
            Kandidati koji ne mogu da slušaju ovaj raspored (
            {categorizedCandidates.cannotListen.length})
          </h2>
          <div className="space-y-2">
            {categorizedCandidates.cannotListen.map((c) => (
              <div
                key={c.id}
                className="border-l-4 border-red-500 bg-red-50 rounded p-3"
              >
                <div className="font-medium">
                  {c.first_name} {c.last_name}
                </div>
                <div className="text-sm text-gray-600">ID: {c.id_number}</div>
              </div>
            ))}
            {categorizedCandidates.cannotListen.length === 0 && (
              <div className="text-gray-500 text-sm">
                Nema kandidata koji ne mogu da slušaju nijedan čas.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
