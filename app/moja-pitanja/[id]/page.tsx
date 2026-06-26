// file: app/moja-pitanja/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseClient'
import AdminGuard from '@/components/AdminGuard'

type QuestionGroup = {
  id: number
  title: string
  description: string | null
}

type Question = {
  id: number
  text: string
  image_url: string | null
  points: number
  mup_id: string | null
  answers: { id: number; text: string; is_correct: boolean }[]
}

export default function QuestionGroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sb = supabaseBrowser()
  const groupId = Number(params.id)

  const [group, setGroup] = useState<QuestionGroup | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [reveal, setReveal] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr(null)

      try {
        // 1. Učitaj grupu
        const { data: groupData, error: groupErr } = await sb
          .from('question_groups')
          .select('id, title, description')
          .eq('id', groupId)
          .single()

        if (groupErr) throw groupErr
        if (!groupData) throw new Error('Grupa nije pronađena')

        // 2. Učitaj pitanja iz grupe
        const { data: itemsData, error: itemsErr } = await sb
          .from('question_group_items')
          .select('question_id')
          .eq('group_id', groupId)

        if (itemsErr) throw itemsErr

        const questionIds = (itemsData ?? []).map(
          (item: any) => item.question_id
        )

        if (questionIds.length > 0) {
          const { data: questionsData, error: questionsErr } = await sb
            .from('questions')
            .select(
              'id,text,image_url,points,mup_id,answers(id,text,is_correct)'
            )
            .in('id', questionIds)

          if (questionsErr) throw questionsErr
          setQuestions(questionsData as Question[])
        }

        setGroup(groupData)
      } catch (e: any) {
        setErr(e?.message || 'Greška pri učitavanju grupe.')
      } finally {
        setLoading(false)
      }
    })()
  }, [groupId])

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
  if (!group)
    return (
      <AdminGuard>
        <div className="p-8">Grupa nije pronađena.</div>
      </AdminGuard>
    )

  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/moja-pitanja')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              ← Nazad na grupe
            </button>
            <h1 className="text-2xl font-semibold">{group.title}</h1>
            {group.description && (
              <p className="text-gray-600 mt-1">{group.description}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {questions.length} pitanja
            </p>
          </div>
        </div>

        {/* Lista pitanja */}
        <div className="space-y-4">
          {questions.map((q) => {
            const correctCount = q.answers.reduce(
              (n, a) => n + (a.is_correct ? 1 : 0),
              0
            )
            const shown = !!reveal[q.id]

            return (
              <div
                key={q.id}
                className="border rounded-xl p-4 bg-white shadow-sm"
              >
                <div
                  className={
                    q.image_url ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : ''
                  }
                >
                  {/* Tekst + meta */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium mb-2">{q.text}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-3">
                      <span>Bodovi: {q.points}</span>
                      <span>•</span>
                      <span>
                        {correctCount === 1
                          ? 'Jedan tačan'
                          : `${correctCount} tačna odgovora`}
                      </span>
                      {/*
                      {q.mup_id && (
                        <>
                          <span>•</span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            MUP: {q.mup_id}
                          </span>
                        </>
                      )}
                        */}
                    </div>

                    {/* Odgovori */}
                    <div className="space-y-2">
                      {q.answers.map((a) => (
                        <div
                          key={a.id}
                          className={`border rounded px-3 py-2 text-sm ${
                            shown && a.is_correct
                              ? 'bg-green-100 border-green-300 font-bold'
                              : 'border-gray-200'
                          }`}
                        >
                          {a.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Slika */}
                  {q.image_url && (
                    <div className="w-full border rounded overflow-hidden bg-gray-50">
                      <img
                        src={q.image_url}
                        alt="slika pitanja"
                        className="w-full h-48 object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Dugme */}
                <div className="mt-3">
                  <button
                    className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() =>
                      setReveal((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                    }
                  >
                    {shown ? 'Sakrij tačan odgovor' : 'Prikaži tačan odgovor'}
                  </button>
                </div>
              </div>
            )
          })}

          {questions.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              Ova grupa nema pitanja.
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  )
}
