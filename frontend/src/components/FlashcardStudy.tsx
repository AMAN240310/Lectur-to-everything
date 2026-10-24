import { CheckCircle2, Eye, RotateCcw, ThumbsUp, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Flashcard } from '../lib/types'
import { Badge, Button, ProgressBar } from './ui'

const TYPE_LABEL: Record<Flashcard['type'], string> = { qa: 'Question', definition: 'Definition', formula: 'Formula' }

interface Props {
  cards: Flashcard[]
  /** Changing this key starts a fresh session from `cards` (filters changed, "study again", ...). */
  resetKey: string
  onReview: (card: Flashcard, result: 'known' | 'difficult') => void
  onRestart?: () => void
  /** Optional link back to the exact moment in the recording. */
  renderSource?: (card: Flashcard) => ReactNode
}

/** Interactive deck: reveal the answer, then mark the card as known or difficult. */
export function FlashcardStudy({ cards, resetKey, onReview, onRestart, renderSource }: Props) {
  const [deck, setDeck] = useState<Flashcard[]>(cards)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [session, setSession] = useState({ known: 0, difficult: 0 })

  useEffect(() => {
    setDeck(cards)
    setIndex(0)
    setRevealed(false)
    setSession({ known: 0, difficult: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const card = deck[index]
  const finished = deck.length > 0 && index >= deck.length

  const mark = useCallback(
    (result: 'known' | 'difficult') => {
      if (!card || !revealed) return
      onReview(card, result)
      setSession((s) => ({ ...s, [result]: s[result] + 1 }))
      setRevealed(false)
      setIndex((i) => i + 1)
    },
    [card, revealed, onReview],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) return
      if (e.key === ' ' && card && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (e.key === '1') mark('difficult')
      else if (e.key === '2') mark('known')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, mark])

  if (deck.length === 0) return null

  if (finished) {
    return (
      <div className="panel flex flex-col items-center px-6 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <h3 className="mt-3 text-lg font-semibold text-cream-50">Session complete</h3>
        <p className="mt-1 text-sm text-cream-300">
          You knew {session.known} of {deck.length} cards{session.difficult > 0 && `, and ${session.difficult} need another look`}.
        </p>
        <Button className="mt-5" variant="primary" onClick={() => (onRestart ? onRestart() : (setIndex(0), setSession({ known: 0, difficult: 0 })))}>
          <RotateCcw className="h-4 w-4" /> Study again
        </Button>
      </div>
    )
  }

  return (
    <div className="panel p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-cream-400">
        <span>Card {index + 1} of {deck.length}</span>
        <span className="flex items-center gap-2">
          <Badge tone="blue">{TYPE_LABEL[card.type]}</Badge>
          <Badge>{card.topic}</Badge>
          {card.status === 'difficult' && <Badge tone="red">Difficult</Badge>}
          {card.status === 'known' && <Badge tone="green">Known</Badge>}
        </span>
      </div>
      <ProgressBar value={(index / deck.length) * 100} label="Session progress" />

      <div className="flex min-h-[180px] flex-col justify-center py-8">
        <p className="text-xl font-medium leading-relaxed text-cream-50">{card.question}</p>
        {revealed && (
          <div className="mt-6 rounded-xl border border-accent-500/40 bg-accent-500/5 p-4" aria-live="polite">
            <p className="label !mb-1 text-accent-300">Answer</p>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-cream-100">{card.answer}</p>
            {renderSource && <div className="mt-3 flex items-center gap-2 text-xs text-cream-400">From the lecture {renderSource(card)}</div>}
          </div>
        )}
      </div>

      {revealed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="danger" onClick={() => mark('difficult')} aria-keyshortcuts="1">
            <TriangleAlert className="h-4 w-4" /> Still difficult <kbd className="ml-1 rounded bg-black/30 px-1 text-[10px]">1</kbd>
          </Button>
          <Button variant="primary" onClick={() => mark('known')} aria-keyshortcuts="2">
            <ThumbsUp className="h-4 w-4" /> I know this <kbd className="ml-1 rounded bg-black/20 px-1 text-[10px]">2</kbd>
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={() => setRevealed(true)} aria-keyshortcuts="Space">
          <Eye className="h-4 w-4" /> Reveal answer <kbd className="ml-1 rounded bg-black/20 px-1 text-[10px]">Space</kbd>
        </Button>
      )}
    </div>
  )
}
