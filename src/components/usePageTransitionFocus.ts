import { usePage } from '@inertiajs/react'
import { useEffect, useRef, useState } from 'react'

let previousPath: string | undefined

/** Moves focus and announces the destination after client-side page navigation. */
export default function usePageTransitionFocus() {
  const { url } = usePage()
  const mainRef = useRef<HTMLElement>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const currentPath = url.split(/[?#]/)[0] || '/'
    const pathChanged = previousPath !== undefined && previousPath !== currentPath
    previousPath = currentPath

    if (!pathChanged) return

    const frame = requestAnimationFrame(() => {
      const main = mainRef.current
      if (!main) return

      main.focus({ preventScroll: true })
      const heading = main.querySelector<HTMLHeadingElement>('h1')
      const destination = heading?.textContent?.trim() || 'Page'
      setAnnouncement(`${destination} loaded`)
    })

    return () => cancelAnimationFrame(frame)
  }, [url])

  return { mainRef, announcement } as const
}
