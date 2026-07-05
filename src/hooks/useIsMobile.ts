'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)' // below Tailwind's md breakpoint

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

/** True below the md breakpoint. Matches the `md:` classes used for mobile layouts. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // SSR: assume desktop; classes handle the first paint
  )
}
