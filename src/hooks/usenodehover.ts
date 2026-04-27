import { useRef, useState, useCallback } from 'react'


export function useNodeHover(leaveDelay = 400) {
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const onMouseEnter = useCallback(() => {
    clearTimer()
    setHovered(true)
  }, [])

  const onMouseLeave = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      setHovered(false)
    }, leaveDelay)
  }, [leaveDelay])

  return { hovered, onMouseEnter, onMouseLeave }
}