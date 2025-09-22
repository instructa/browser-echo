import * as React from 'react'

type AnimationHandle = {
  rafId: number | null
}

export function MatrixBackground(): JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const handleRef = React.useRef<AnimationHandle>({ rafId: null })

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    let width = 0
    let height = 0
    let columns = 0
    let drops: Array<number> = []

    const glyphs = ['0', '1']
    const baseFont = 14 // logical pixels
    const speed = 0.2 // fall speed factor

    function resize() {
      const { innerWidth, innerHeight } = window
      width = innerWidth
      height = innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const fontSize = baseFont
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
      columns = Math.max(1, Math.floor(width / fontSize))
      drops = new Array(columns).fill(0).map(() => Math.floor(Math.random() * 20))
    }

    function step() {
      if (document.hidden) {
        handleRef.current.rafId = requestAnimationFrame(step)
        return
      }

      // Trail fade
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fillRect(0, 0, width, height)

      // Draw glyphs
      ctx.fillStyle = 'rgba(234,179,8,0.85)' // yellow-500 with alpha
      ctx.shadowColor = 'rgba(234,179,8,0.25)'
      ctx.shadowBlur = 0

      const fontSize = baseFont
      for (let i = 0; i < columns; i++) {
        const text = glyphs[(Math.random() * glyphs.length) | 0]
        const x = i * fontSize
        const y = drops[i] * fontSize
        ctx.fillText(text, x, y)

        // Reset drop randomly after it exits the screen to vary stream lengths
        if (y > height && Math.random() > 0.975) {
          drops[i] = 0
        }

        drops[i] += speed + Math.random() * 0.5
      }

      handleRef.current.rafId = requestAnimationFrame(step)
    }

    const onResize = () => resize()
    resize()
    handleRef.current.rafId = requestAnimationFrame(step)
    window.addEventListener('resize', onResize, { passive: true })

    return () => {
      window.removeEventListener('resize', onResize)
      if (handleRef.current.rafId != null) cancelAnimationFrame(handleRef.current.rafId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 opacity-20 pointer-events-none bg-transparent"
      aria-hidden="true"
    />
  )
}


