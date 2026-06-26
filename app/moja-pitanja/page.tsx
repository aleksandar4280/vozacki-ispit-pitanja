// file: app/moja-pitanja/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { Plus, Trash2 } from 'lucide-react'

type QuestionGroup = {
  id: number
  title: string
  description: string | null
  created_at: string
  question_count?: number
}

export default function MyQuestionsPage() {
  const router = useRouter()
  const sb = supabaseBrowser()

  const [groups, setGroups] = useState<QuestionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function loadGroups() {
    setLoading(true)
    setErr(null)

    try {
      // Učitaj grupe
      const { data: groupsData, error: groupsErr } = await sb
        .from('question_groups')
        .select('id, title, description, created_at')
        .order('created_at', { ascending: false })

      if (groupsErr) throw groupsErr

      // Učitaj broj pitanja po grupi
      const { data: countsData, error: countsErr } = await sb
        .from('question_group_items')
        .select('group_id')

      if (countsErr) throw countsErr

      // Izbroji pitanja po grupi
      const countMap = new Map<number, number>()
      ;(countsData ?? []).forEach((item: any) => {
        countMap.set(item.group_id, (countMap.get(item.group_id) ?? 0) + 1)
      })

      // Dodaj count u grupe
      const groupsWithCount = (groupsData ?? []).map((g) => ({
        ...g,
        question_count: countMap.get(g.id) ?? 0,
      }))

      setGroups(groupsWithCount)
    } catch (e: any) {
      setErr(e?.message || 'Greška pri učitavanju grupa.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()

    if (!confirm('Da li stvarno želite da obrišete ovu grupu pitanja?')) return

    const { error } = await sb.from('question_groups').delete().eq('id', id)

    if (error) {
      alert('Greška pri brisanju: ' + error.message)
      return
    }

    await loadGroups()
  }

  useEffect(() => {
    loadGroups()
  }, [])

  return (
    <AdminGuard>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Moje grupe pitanja</h1>
          <button
            onClick={() => router.push('/moja-pitanja/new')}
            className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 hover:opacity-90"
          >
            <Plus size={20} />
            Kreiraj novu grupu
          </button>
        </div>

        {loading && <div>Učitavanje…</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}

        {/* Lista grupa */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => (
            <div
              key={g.id}
              className="border rounded-xl p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow relative"
              onClick={() => router.push(`/moja-pitanja/${g.id}`)}
            >
              <h3 className="text-lg font-semibold mb-2">{g.title}</h3>

              {g.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {g.description}
                </p>
              )}

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{g.question_count} pitanja</span>
                <span>
                  {new Date(g.created_at).toLocaleDateString('sr-RS')}
                </span>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(g.id, e)}
                className="absolute top-3 right-3 p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                title="Obriši grupu"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          {!loading && groups.length === 0 && (
            <div className="col-span-2 text-center text-gray-500 py-12">
              Nemate kreiranih grupa. Kliknite na "Kreiraj novu grupu" da
              počnete.
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
