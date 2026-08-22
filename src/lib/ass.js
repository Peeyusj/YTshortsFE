// ass.js
// ------
// Tiny helpers for reading the .ass colour format the backend speaks natively.
// Display-only: nothing here is ever sent back — the backend keeps consuming
// &HAABBGGRR strings straight from config.CAPTION_STYLES.

// .ass writes colours as &HAABBGGRR — alpha, then Blue, Green, Red, i.e. the
// byte order is REVERSED from CSS #RRGGBB. Returns null for anything we can't
// parse so callers can fall back to their auto-contrast default.
export function assColorToCss(assHex) {
  if (!assHex) return null
  const hex = String(assHex).replace(/^&H/i, '').replace(/&$/, '')
  if (hex.length < 6) return null
  const bb = hex.slice(-6, -4)
  const gg = hex.slice(-4, -2)
  const rr = hex.slice(-2)
  return `#${rr}${gg}${bb}`
}

// The fill/outline a caption will actually render with, given the chosen style
// preset and the top-region background. A preset with null colours means "keep
// the bg-derived auto-contrast", which is exactly what generate_captions.py's
// CAPTION_COLORS does server-side — mirrored here so the preview matches.
export function captionColors(style, background) {
  const onWhite = background === 'white'
  return {
    fill: (style && assColorToCss(style.primary)) ?? (onWhite ? '#000000' : '#ffffff'),
    outline: (style && assColorToCss(style.outline)) ?? (onWhite ? '#ffffff' : '#000000'),
  }
}
