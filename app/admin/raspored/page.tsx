// file: app/admin/raspored/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

type Row = {
  id: number
  starts_at: string
  description: string | null
  school_id: number
  schools: { name: string } | null
  lessons: { lesson_id: number; theory_lessons: { code: string } | null }[]
}
type School = { id: number; name: string }

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

// Funkcija za grupiranje časova
function groupLessons(
  lessons: { lesson_id: number; theory_lessons: { code: string } | null }[]
): string[] {
  const result: string[] = []

  for (let i = 0; i < lessons.length; i++) {
    const curr = lessons[i]
    const currCode = curr.theory_lessons?.code ?? String(curr.lesson_id)

    const next = lessons[i + 1]
    const nextCode = next?.theory_lessons?.code ?? ''

    if (next && arePaired(currCode, nextCode)) {
      // Par časova
      result.push(`${currCode} + ${nextCode}`)
      i++ // Preskoči sledeći
    } else {
      // Obični čas
      result.push(currCode)
    }
  }

  return result
}

export default function SchedulesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [schoolFilter, setSchoolFilter] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    const sb = supabaseBrowser()

    const { data: sch } = await sb
      .from('schools')
      .select('id, name')
      .order('created_at', { ascending: true })

    let q = sb
      .from('schedules')
      .select(
        `id, starts_at, description, school_id, schools(name),
      lessons:schedule_lessons(
        lesson_id,
        theory_lessons(code)
      )`
      )
      .order('starts_at', { ascending: false })

    if (schoolFilter !== 'all') q = q.eq('school_id', Number(schoolFilter))

    const { data, error } = await q

    if (error) setErr(error.message)

    setSchools((sch ?? []) as School[])
    setRows((data as Row[] | null) ?? [])
    setLoading(false)
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation() // Spreči klik na karticu

    if (!confirm('Da li stvarno želite da obrišete ovaj raspored?')) return

    const sb = supabaseBrowser()
    const { error } = await sb.from('schedules').delete().eq('id', id)

    if (error) {
      alert('Greška pri brisanju: ' + error.message)
      return
    }

    // Reload liste
    await load()
  }

  useEffect(() => {
    void load()
  }, [schoolFilter])

  return (
    <AdminGuard>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-semibold">Rasporedi</h1>
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={schoolFilter}
              onChange={(e) =>
                setSchoolFilter(
                  e.target.value === 'all' ? 'all' : Number(e.target.value)
                )
              }
            >
              <option value="all">Sve autoškole</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Link
              href="/admin/raspored/new"
              className="border rounded px-3 py-2"
            >
              Novi raspored
            </Link>
          </div>
        </div>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}

        <div className="space-y-3">
          {rows.map((r) => {
            const groupedLessons = groupLessons(r.lessons ?? [])

            return (
              <div
                key={r.id}
                className="border rounded-2xl p-3 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow relative"
                onClick={() => router.push(`/admin/raspored/${r.id}`)}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-gray-600">
                    {new Date(r.starts_at).toLocaleString('sr-RS', {
                      hour12: false,
                    })}
                  </div>
                  <span className="px-2 py-1 rounded text-xs bg-gray-100 border">
                    {r.schools?.name ?? 'Autoškola'}
                  </span>
                </div>

                {r.description && (
                  <div className="mt-1 font-medium break-words">
                    {r.description}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {groupedLessons.map((label, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-full text-xs bg-gray-100 border"
                    >
                      {label}
                    </span>
                  ))}
                  {groupedLessons.length === 0 && (
                    <span className="text-xs text-gray-500">
                      Nema dodeljenih časova.
                    </span>
                  )}
                </div>

                {/* Ikonica za brisanje - donji desni ugao */}
                <button
                  onClick={(e) => handleDelete(r.id, e)}
                  className="absolute bottom-3 right-3 p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                  title="Obriši raspored"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )
          })}
          {!loading && rows.length === 0 && (
            <div className="text-gray-600">
              Nema rasporeda za odabrani filter.
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
