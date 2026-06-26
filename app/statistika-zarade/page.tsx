// file: app/statistika-zarade/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { DollarSign, Calendar, TrendingUp } from 'lucide-react'

const LESSON_PAIRS: Array<[string, string]> = [
  ['T6-1', 'T8-1'],
  ['T10-1', 'T11-1'],
  ['P-T2-1', 'P-T9-1'],
]

type HardcodedData = {
  school: string
  month: string // format: "2025-09"
  hours: number
  rate: number
}

type DnevnikData = {
  school: string
  month: string
  hours: number
}

type MonthlyData = {
  school: string
  month: string
  hours: number
  rate: number
  total: number
}

// Hardkodovani podaci
const HARDCODED: HardcodedData[] = [
  // Filic
  { school: 'Autoškola Filic', month: '2025-09', hours: 68, rate: 600 },
  { school: 'Autoškola Filic', month: '2025-10', hours: 58, rate: 600 },
  { school: 'Autoškola Filic', month: '2025-11', hours: 59, rate: 700 },
  { school: 'Autoškola Filic', month: '2025-12', hours: 44, rate: 700 },

  // Akademija
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2025-09',
    hours: 45,
    rate: 600,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2025-10',
    hours: 42,
    rate: 600,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2025-11',
    hours: 45,
    rate: 700,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2025-12',
    hours: 56,
    rate: 700,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2026-01',
    hours: 30,
    rate: 700,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2026-02',
    hours: 21,
    rate: 700,
  },
  {
    school: 'Autoškola Akademija N&A DOO',
    month: '2026-03',
    hours: 8,
    rate: 700,
  }, // prvih 8

  // Zeleni Talas
  {
    school: 'Autoškola Zeleni Talas DOO',
    month: '2026-02',
    hours: 28,
    rate: 800,
  },
]

export default function StatistikaZaradePage() {
  const sb = supabaseBrowser()

  const [dnevnikData, setDnevnikData] = useState<DnevnikData[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [schoolFilter, setSchoolFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr(null)

      try {
        async function fetchAllRows<T>(
          queryBuilderFactory: () => any,
          pageSize = 1000
        ): Promise<T[]> {
          let from = 0
          let allRows: T[] = []

          while (true) {
            const to = from + pageSize - 1
            const { data, error } = await queryBuilderFactory().range(from, to)

            if (error) throw error
            if (!data || data.length === 0) break

            allRows = allRows.concat(data)

            if (data.length < pageSize) break
            from += pageSize
          }

          return allRows
        }

        async function fetchAttendanceByJournalIds(
          journalIds: number[],
          chunkSize = 200
        ) {
          const allAttendance: Array<{
            journal_id: number
            lesson_id: number
            present: boolean
          }> = []

          for (let i = 0; i < journalIds.length; i += chunkSize) {
            const chunk = journalIds.slice(i, i + chunkSize)

            const rows = await fetchAllRows<{
              journal_id: number
              lesson_id: number
              present: boolean
            }>(() =>
              sb
                .from('journal_attendance')
                .select('journal_id, lesson_id, present')
                .in('journal_id', chunk)
            )

            allAttendance.push(...rows)
          }

          return allAttendance
        }

        // 1. Učitaj theory lessons
        const { data: allLessons, error: lessonsErr } = await sb
          .from('theory_lessons')
          .select('id, code')

        if (lessonsErr) throw lessonsErr

        const lessonCodeMap = new Map<number, string>()
        ;(allLessons ?? []).forEach((l: { id: number; code: string }) => {
          lessonCodeMap.set(l.id, l.code)
        })

        function arePaired(code1: string, code2: string): boolean {
          return LESSON_PAIRS.some(
            ([a, b]) =>
              (a === code1 && b === code2) || (a === code2 && b === code1)
          )
        }

        function countLessons(lessonIds: Set<number>): number {
          const codes = Array.from(lessonIds)
            .map((id) => lessonCodeMap.get(id) ?? '')
            .filter(Boolean)

          const counted = new Set<string>()
          let total = 0

          for (let i = 0; i < codes.length; i++) {
            const code = codes[i]
            if (counted.has(code)) continue

            const pairCode = codes.find(
              (c) => c !== code && arePaired(code, c) && !counted.has(c)
            )

            if (pairCode) {
              counted.add(code)
              counted.add(pairCode)
              total += 1
            } else {
              counted.add(code)
              total += 1
            }
          }

          return total
        }

        // 2. Učitaj sve dnevnike
        const journals = await fetchAllRows<{
          id: number
          journal_date: string
          schedules?: {
            school_id?: number
            schools?: { name?: string }
            schedule_lessons?: { lesson_id: number }[]
          }
        }>(() =>
          sb
            .from('journals')
            .select(
              `
            id,
            journal_date,
            schedules:schedule_id (
              school_id,
              schools (name),
              schedule_lessons (lesson_id)
            )
          `
            )
            .order('journal_date', { ascending: true })
        )

        // 3. Izvuci journal ids
        const journalIds = journals.map((j) => j.id)

        // 4. Učitaj attendance samo za te journals
        const attendance =
          journalIds.length > 0
            ? await fetchAttendanceByJournalIds(journalIds, 200)
            : []

        // 5. Grupisanje attendance po journal_id
        const attendanceByJournal = new Map<number, Set<number>>()

        attendance.forEach((a) => {
          if (!a.present) return

          if (!attendanceByJournal.has(a.journal_id)) {
            attendanceByJournal.set(a.journal_id, new Set<number>())
          }

          attendanceByJournal.get(a.journal_id)!.add(a.lesson_id)
        })

        // 6. Izračunaj časove po školi i mesecu
        const dataMap = new Map<string, number>()

        journals.forEach((j) => {
          const date = new Date(j.journal_date)
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          const schoolName = j.schedules?.schools?.name ?? 'Nepoznata škola'

          const lessonIds = attendanceByJournal.get(j.id) ?? new Set<number>()
          const hours = countLessons(lessonIds)

          const key = `${schoolName}|${month}`
          dataMap.set(key, (dataMap.get(key) ?? 0) + hours)
        })

        // 7. Pretvori u niz
        const result: DnevnikData[] = []
        dataMap.forEach((hours, key) => {
          const [school, month] = key.split('|')
          result.push({ school, month, hours })
        })

        setDnevnikData(result)
      } catch (e: any) {
        setErr(e?.message || 'Greška pri učitavanju podataka.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Kombinovani podaci (hardcoded + dnevnik)
  const allData = useMemo(() => {
    const combined: MonthlyData[] = []

    // 1. Dodaj hardcoded podatke
    HARDCODED.forEach((h) => {
      combined.push({
        school: h.school,
        month: h.month,
        hours: h.hours,
        rate: h.rate,
        total: h.hours * h.rate,
      })
    })

    // 2. Dodaj podatke iz dnevnika (mart 2026+)
    dnevnikData.forEach((d) => {
      // Proveri da li je mart 2026 ili kasnije
      const [year, month] = d.month.split('-').map(Number)
      const isMarch2026OrLater = year > 2026 || (year === 2026 && month >= 3)

      if (!isMarch2026OrLater) return

      // SPECIJALAN SLUČAJ: Akademija mart 2026 - oduzmi prvih 8 časova
      let adjustedHours = d.hours
      if (d.school === 'Autoškola Akademija N&A DOO' && d.month === '2026-03') {
        adjustedHours = Math.max(0, d.hours - 8) // oduzmi 8, ali ne idi u minus

        // Ako nema dodatnih časova (samo tih 8), preskoči
        if (adjustedHours === 0) return
      }

      // Proveri da li već postoji hardcoded zapis za ovaj mesec/školu
      const existing = combined.find(
        (c) => c.school === d.school && c.month === d.month
      )

      if (existing) {
        // Dodaj dodatne časove iz dnevnika (već smo oduzeli prvih 8 za Akademiju mart)
        existing.hours += adjustedHours
        existing.total += adjustedHours * 800 // svi novi časovi su 800 din
      } else {
        // Novi zapis - svi časovi su 800 din
        combined.push({
          school: d.school,
          month: d.month,
          hours: adjustedHours,
          rate: 800,
          total: adjustedHours * 800,
        })
      }
    })

    // Sortiraj po mesecu (najstariji prvo)
    return combined.sort((a, b) => a.month.localeCompare(b.month))
  }, [dnevnikData])

  // Statistike
  const stats = useMemo(() => {
    const totalHours = allData.reduce((sum, d) => sum + d.hours, 0)
    const totalEarnings = allData.reduce((sum, d) => sum + d.total, 0)

    // Zarada po školi
    const bySchool = new Map<string, { hours: number; total: number }>()
    allData.forEach((d) => {
      const existing = bySchool.get(d.school) ?? { hours: 0, total: 0 }
      bySchool.set(d.school, {
        hours: existing.hours + d.hours,
        total: existing.total + d.total,
      })
    })

    // Zarada po godini
    const byYear = new Map<number, { hours: number; total: number }>()
    allData.forEach((d) => {
      const year = Number(d.month.split('-')[0])
      const existing = byYear.get(year) ?? { hours: 0, total: 0 }
      byYear.set(year, {
        hours: existing.hours + d.hours,
        total: existing.total + d.total,
      })
    })

    return { totalHours, totalEarnings, bySchool, byYear }
  }, [allData])

  const filteredData = useMemo(() => {
    return allData.filter((d) => {
      if (schoolFilter !== 'all' && d.school !== schoolFilter) return false

      const [year, month] = d.month.split('-')
      if (yearFilter !== 'all' && year !== yearFilter) return false
      if (monthFilter !== 'all' && month !== monthFilter) return false

      return true
    })
  }, [allData, schoolFilter, yearFilter, monthFilter])

  const filterOptions = useMemo(() => {
    const schools = new Set<string>()
    const years = new Set<string>()
    const months = new Set<string>()

    allData.forEach((d) => {
      schools.add(d.school)
      const [year, month] = d.month.split('-')
      years.add(year)
      months.add(month)
    })

    return {
      schools: Array.from(schools).sort(),
      years: Array.from(years).sort(),
      months: Array.from(months).sort(),
    }
  }, [allData])

  // Funkcija za formatiranje meseca u dropdown-u
  const getMonthName = (monthNum: string) => {
    const months = [
      'Januar',
      'Februar',
      'Mart',
      'April',
      'Maj',
      'Jun',
      'Jul',
      'Avgust',
      'Septembar',
      'Oktobar',
      'Novembar',
      'Decembar',
    ]
    return months[Number(monthNum) - 1]
  }

  // Izračunaj totale za filtrirane podatke:
  const filteredStats = useMemo(() => {
    const totalHours = filteredData.reduce((sum, d) => sum + d.hours, 0)
    const totalEarnings = filteredData.reduce((sum, d) => sum + d.total, 0)
    return { totalHours, totalEarnings }
  }, [filteredData])

  // Format dinara
  const formatDin = (amount: number) =>
    new Intl.NumberFormat('sr-RS').format(amount) + ' RSD'

  // Format meseca
  const formatMonth = (month: string) => {
    const [year, m] = month.split('-')
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Maj',
      'Jun',
      'Jul',
      'Avg',
      'Sep',
      'Okt',
      'Nov',
      'Dec',
    ]
    return `${months[Number(m) - 1]} ${year}`
  }

  return (
    <AdminGuard>
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Statistika zarade od časova</h1>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-red-600">{err}</div>}

        {/* Kartice - Ukupno */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="text-green-600" size={24} />
              </div>
              <div>
                <div className="text-sm text-gray-600">Ukupna zarada</div>
                <div className="text-2xl font-bold">
                  {formatDin(stats.totalEarnings)}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="text-blue-600" size={24} />
              </div>
              <div>
                <div className="text-sm text-gray-600">Ukupno časova</div>
                <div className="text-2xl font-bold">{stats.totalHours}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="text-purple-600" size={24} />
              </div>
              <div>
                <div className="text-sm text-gray-600">Prosečna satnica</div>
                <div className="text-2xl font-bold">
                  {stats.totalHours > 0
                    ? Math.round(stats.totalEarnings / stats.totalHours)
                    : 0}{' '}
                  RSD
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Kartice - Po autoškoli */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Zarada po autoškoli</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from(stats.bySchool.entries()).map(([school, data]) => (
              <div key={school} className="bg-white rounded-xl shadow p-4">
                <div className="font-semibold text-sm mb-2">{school}</div>
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {formatDin(data.total)}
                </div>
                <div className="text-sm text-gray-600">{data.hours} časova</div>
              </div>
            ))}
          </div>
        </div>

        {/* Kartice - Po godini */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Zarada po godini</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(stats.byYear.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([year, data]) => (
                <div key={year} className="bg-white rounded-xl shadow p-4">
                  <div className="font-semibold text-sm mb-2">
                    {year}. godina
                  </div>
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {formatDin(data.total)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {data.hours} časova
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Tabela - Detaljan pregled po mesecima */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold mb-4">
              Detaljan pregled po mesecima
            </h2>

            {/* Filteri */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1 text-gray-600">
                  Autoškola
                </label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                >
                  <option value="all">Sve autoškole</option>
                  {filterOptions.schools.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-600">
                  Godina
                </label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={yearFilter}
                  onChange={(e) => {
                    setYearFilter(e.target.value)
                    setMonthFilter('all') // Reset mesec kad se menja godina
                  }}
                >
                  <option value="all">Sve godine</option>
                  {filterOptions.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-600">
                  Mesec
                </label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                >
                  <option value="all">Svi meseci</option>
                  {filterOptions.months.map((month) => (
                    <option key={month} value={month}>
                      {getMonthName(month)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reset button */}
            {(schoolFilter !== 'all' ||
              yearFilter !== 'all' ||
              monthFilter !== 'all') && (
              <button
                onClick={() => {
                  setSchoolFilter('all')
                  setYearFilter('all')
                  setMonthFilter('all')
                }}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800"
              >
                Resetuj filtere
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Mesec
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    Autoškola
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">
                    Časova
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">
                    Satnica
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">
                    Ukupno
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.map((d, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {formatMonth(d.month)}
                    </td>
                    <td className="px-4 py-3 text-sm">{d.school}</td>
                    <td className="px-4 py-3 text-sm text-right">{d.hours}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {d.rate} RSD
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      {formatDin(d.total)}
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Nema podataka za odabrane filtere.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-sm" colSpan={2}>
                    {schoolFilter !== 'all' ||
                    yearFilter !== 'all' ||
                    monthFilter !== 'all'
                      ? 'UKUPNO (filtrirano)'
                      : 'UKUPNO'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {filteredStats.totalHours}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">-</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {formatDin(filteredStats.totalEarnings)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
