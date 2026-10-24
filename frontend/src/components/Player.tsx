import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { formatTime } from '../lib/format'

interface PlayerState {
  time: number
  duration: number
  playing: boolean
  seek: (seconds: number, autoplay?: boolean) => void
  toggle: () => void
}

const PlayerContext = createContext<PlayerState>({ time: 0, duration: 0, playing: false, seek: () => {}, toggle: () => {} })
export const usePlayer = () => useContext(PlayerContext)

const SPEEDS = [1, 1.25, 1.5, 2, 0.75]

/** Owns the <audio> element for a lecture page so transcript, notes and flashcards can all seek it. */
export function PlayerProvider({ lectureId, initialTime, children }: { lectureId: string; initialTime?: number; children: ReactNode }) {
  const ref = useRef<HTMLAudioElement>(null)
  const pending = useRef<number | null>(initialTime ?? null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [failed, setFailed] = useState(false)

  const seek = useCallback((seconds: number, autoplay = true) => {
    const el = ref.current
    if (!el) return
    if (el.readyState < 1) {
      pending.current = seconds // applied once metadata is loaded
      return
    }
    el.currentTime = Math.max(0, seconds)
    setTime(el.currentTime)
    if (autoplay) void el.play().catch(() => {})
  }, [])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }, [])

  useEffect(() => {
    if (initialTime !== undefined) seek(initialTime, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTime])

  const value = useMemo(() => ({ time, duration, playing, seek, toggle }), [time, duration, playing, seek, toggle])

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (ref.current) ref.current.playbackRate = next
  }

  return (
    <PlayerContext.Provider value={value}>
      <audio
        ref={ref} preload="metadata" src={api.audioUrl(lectureId)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration)
          if (pending.current !== null) {
            e.currentTarget.currentTime = pending.current
            setTime(pending.current)
            pending.current = null
          }
        }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      {children}
      <div className="sticky bottom-0 z-30 -mx-5 mt-6 border-t border-ink-700 bg-ink-900/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8" role="group" aria-label="Audio player">
        {failed ? (
          <p className="text-sm text-amber-200">The original audio could not be loaded.</p>
        ) : (
          <div className="mx-auto flex max-w-[1400px] items-center gap-3">
            <button onClick={() => seek(time - 10, false)} aria-label="Back 10 seconds" className="rounded-lg p-1.5 text-cream-300 hover:bg-ink-700"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500 text-ink-950 hover:bg-accent-400">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <button onClick={() => seek(time + 10, false)} aria-label="Forward 10 seconds" className="rounded-lg p-1.5 text-cream-300 hover:bg-ink-700"><RotateCw className="h-4 w-4" /></button>
            <input
              type="range" min={0} max={duration || 0} step={1} value={Math.min(time, duration || 0)}
              onChange={(e) => seek(Number(e.target.value), false)} aria-label="Seek"
              className="h-1.5 flex-1 cursor-pointer accent-accent-500"
            />
            <span className="w-28 text-right font-mono text-xs tabular-nums text-cream-300">{formatTime(time)} / {formatTime(duration)}</span>
            <button onClick={cycleSpeed} aria-label="Playback speed" className="w-12 rounded-lg bg-ink-700 px-2 py-1 text-xs font-medium text-cream-200 hover:bg-ink-600">{speed}×</button>
          </div>
        )}
      </div>
    </PlayerContext.Provider>
  )
}
