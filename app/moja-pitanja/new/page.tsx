// file: app/moja-pitanja/new/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'
import { Search, X } from 'lucide-react'

type Area = { id: number; name: string }
type Subarea = { id: number; name: string; area_id: number }
type Question = {
  id: number
  text: string
  image_url: string | null
  mup_id: string | null
  area_id: number | null
  subarea_id: number | null
  answers: { id: number; text: string; is_correct: boolean }[]
}

export default function NewQuestionGroupPage() {
  const router = useRouter()
  const sb = supabaseBrowser()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([])

  // Pretraga
  const [areas, setAreas] = useState<Area[]>([])
  const [subareas, setSubareas] = useState<Subarea[]>([])
  const [areaFilter, setAreaFilter] = useState<number | 'all'>('all')
  const [subareaFilter, setSubareaFilter] = useState<number | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [mupSearch, setMupSearch] = useState('')

  const [searchResults, setSearchResults] = useState<Question[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [{ data: ars }, { data: sbs }] = await Promise.all([
        sb
          .from('areas')
          .select('id,name')
          .order('created_at', { ascending: true }),
        sb
          .from('subareas')
          .select('id,name,area_id')
          .order('created_at', { ascending: true }),
      ])
      setAreas(ars ?? [])
      setSubareas(sbs ?? [])
    })()
  }, [])

  async function searchQuestions() {
    setSearching(true)
    setErr(null)

    try {
      let query = sb
        .from('questions')
        .select(
          'id,text,image_url,mup_id,area_id,subarea_id,answers(id,text,is_correct)'
        )
        .limit(50)

      if (areaFilter !== 'all') query = query.eq('area_id', areaFilter)
      if (subareaFilter !== 'all') query = query.eq('subarea_id', subareaFilter)
      if (searchTerm.trim())
        query = query.ilike('text', `%${searchTerm.trim()}%`)
      if (mupSearch.trim())
        query = query.ilike('mup_id', `%${mupSearch.trim()}%`)

      const { data, error } = await query
      if (error) throw error

      // Filter out already selected questions
      const selectedIds = new Set(selectedQuestions.map((q) => q.id))
      const filtered = (data ?? []).filter((q) => !selectedIds.has(q.id))

      setSearchResults(filtered as Question[])
    } catch (e: any) {
      setErr(e?.message || 'Greška pri pretrazi.')
    } finally {
      setSearching(false)
    }
  }

  function addQuestion(q: Question) {
    setSelectedQuestions((prev) => [...prev, q])
    setSearchResults((prev) => prev.filter((sq) => sq.id !== q.id))
  }

  function removeQuestion(id: number) {
    setSelectedQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  async function saveGroup() {
    if (!title.trim()) {
      alert('Unesite naziv grupe.')
      return
    }

    if (selectedQuestions.length === 0) {
      alert('Dodajte bar jedno pitanje u grupu.')
      return
    }

    setSaving(true)
    setErr(null)

    try {
      // 1. Kreiraj grupu
      const { data: group, error: groupErr } = await sb
        .from('question_groups')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
        })
        .select('id')
        .single()

      if (groupErr) throw groupErr

      // 2. Dodaj pitanja u grupu
      const items = selectedQuestions.map((q) => ({
        group_id: group.id,
        question_id: q.id,
      }))

      const { error: itemsErr } = await sb
        .from('question_group_items')
        .insert(items)

      if (itemsErr) throw itemsErr

      router.push('/moja-pitanja')
    } catch (e: any) {
      setErr(e?.message || 'Greška pri čuvanju grupe.')
      setSaving(false)
    }
  }

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-semibold">Kreiraj novu grupu pitanja</h1>

        {/* Forma za grupu */}
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Naziv grupe *
            </label>
            <input
              type="text"
              className="w-full border rounded-lg p-2"
              placeholder="npr. Teška pitanja za kandidate"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Opis (opciono)
            </label>
            <textarea
              className="w-full border rounded-lg p-2 h-20 resize-y"
              placeholder="Dodatne napomene o grupi..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Odabrana pitanja */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Odabrana pitanja ({selectedQuestions.length})
          </h2>

          {selectedQuestions.length === 0 && (
            <div className="text-gray-500 text-sm">
              Još niste dodali pitanja u grupu.
            </div>
          )}

          <div className="space-y-3">
            {selectedQuestions.map((q) => (
              <div key={q.id} className="border rounded-lg p-3 relative">
                <div className="pr-8">
                  <div className="text-sm font-medium mb-1">{q.text}</div>
                  {q.mup_id && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      MUP: {q.mup_id}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeQuestion(q.id)}
                  className="absolute top-3 right-3 text-red-600 hover:bg-red-50 p-1 rounded"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Pretraga pitanja */}
        <div className="bg-white rounded-xl shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Pretraži i dodaj pitanja</h2>

          {/* Filteri */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm mb-1">Oblast</label>
              <select
                className="w-full border rounded-lg p-2"
                value={areaFilter === 'all' ? '' : areaFilter}
                onChange={(e) => {
                  setAreaFilter(e.target.value ? Number(e.target.value) : 'all')
                  setSubareaFilter('all')
                }}
              >
                <option value="">Sve oblasti</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Podoblast</label>
              <select
                className="w-full border rounded-lg p-2"
                value={subareaFilter === 'all' ? '' : subareaFilter}
                onChange={(e) =>
                  setSubareaFilter(
                    e.target.value ? Number(e.target.value) : 'all'
                  )
                }
              >
                <option value="">Sve podoblasti</option>
                {subareas
                  .filter(
                    (s) => areaFilter === 'all' || s.area_id === areaFilter
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Ključna reč</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2"
                placeholder="Pretraži tekst..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">MUP ID</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2"
                placeholder="npr. 123"
                value={mupSearch}
                onChange={(e) => setMupSearch(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={searchQuestions}
            disabled={searching}
            className="flex items-center gap-2 bg-slate-800 text-white rounded-lg px-4 py-2 hover:bg-slate-700"
          >
            <Search size={18} />
            {searching ? 'Pretražujem...' : 'Pretraži'}
          </button>

          {/* Rezultati pretrage */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {searchResults.map((q) => (
              <div key={q.id} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex gap-3">
                  {/* Leva strana - text + odgovori */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium mb-2">{q.text}</div>

                    {q.mup_id && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mb-2 inline-block">
                        MUP: {q.mup_id}
                      </span>
                    )}

                    <div className="space-y-1 mt-2">
                      {q.answers.map((a) => (
                        <div
                          key={a.id}
                          className={`text-xs p-2 rounded border ${
                            a.is_correct
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          {a.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Desna strana - slika ako postoji */}
                  {q.image_url && (
                    <div className="w-32 h-32 flex-shrink-0">
                      <img
                        src={q.image_url}
                        alt="slika"
                        className="w-full h-full object-contain border rounded"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => addQuestion(q)}
                  className="mt-3 w-full border rounded-lg py-2 text-sm hover:bg-white"
                >
                  Dodaj u grupu
                </button>
              </div>
            ))}

            {searchResults.length === 0 && !searching && (
              <div className="text-gray-500 text-sm text-center py-4">
                Kliknite "Pretraži" da pronađete pitanja.
              </div>
            )}
          </div>
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}

        {/* Dugmad */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => router.push('/moja-pitanja')}
            className="border rounded-lg px-6 py-2 hover:bg-gray-50"
          >
            Otkaži
          </button>
          <button
            onClick={saveGroup}
            disabled={saving}
            className="bg-black text-white rounded-lg px-6 py-2 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Čuvam...' : 'Sačuvaj grupu'}
          </button>
        </div>
      </div>
    </AdminGuard>
  )
}
