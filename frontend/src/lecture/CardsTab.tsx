import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FlashcardStudy } from '../components/FlashcardStudy'
import { usePlayer } from '../components/Player'
import { TimeLink } from '../components/TimeLink'
import { EmptyState, ErrorNote, Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { Flashcard } from '../lib/types'

export function CardsTab({ lectureId }: { lectureId: string }) {
  const qc = useQueryClient()
  const player = usePlayer()
  const [round, setRound] = useState(0)
  const cards = useQuery({ queryKey: ['flashcards', 'lecture', lectureId, round], queryFn: () => api.flashcards({ lecture_id: lectureId }), staleTime: Infinity, gcTime: 0 })
  const stats = useQuery({ queryKey: ['flashcardStats', '', lectureId], queryFn: () => api.flashcardStats({ lecture_id: lectureId }) })

  const review = useMutation({
    mutationFn: ({ card, result }: { card: Flashcard; result: 'known' | 'difficult' }) => api.reviewCard(card.id, result),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['flashcardStats'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (cards.isLoading) return <Spinner />
  if (cards.error) return <ErrorNote error={cards.error} />
  if (!cards.data?.length) return <EmptyState title="No flashcards yet">They are generated from the questions, concepts and formulas found in this lecture.</EmptyState>
  const s = stats.data

  return (
    <div className="space-y-4">
      {s && <p className="text-sm text-cream-300">{s.total} cards · {s.known} known · {s.difficult} difficult · {s.due} due for review</p>}
      <ErrorNote error={review.error} />
      <FlashcardStudy
        cards={cards.data} resetKey={`${lectureId}-${round}`}
        onReview={(card, result) => review.mutate({ card, result })}
        onRestart={() => setRound((r) => r + 1)}
        renderSource={(c) => <TimeLink seconds={c.start} onSeek={(t) => player.seek(t)} />}
      />
    </div>
  )
}
