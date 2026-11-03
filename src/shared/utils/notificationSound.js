// The chime that plays when a notification arrives. Generated with the Web Audio
// API so there is no sound file to ship or cache.

const SOUND_KEY = 'savvy-notification-sound'

let ctx = null

export function isSoundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
}

export function setSoundOn(on) {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

// Browsers keep a page silent until the person has touched it once, so the
// audio context is only created (and resumed) from inside a tap or key press.
export function unlockSound() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
}

export function installSoundUnlock() {
  const events = ['pointerdown', 'keydown', 'touchstart']
  const options = { capture: true, passive: true }
  function unlock() {
    unlockSound()
    events.forEach(e => window.removeEventListener(e, unlock, options))
  }
  events.forEach(e => window.addEventListener(e, unlock, options))
  return () => events.forEach(e => window.removeEventListener(e, unlock, options))
}

function tone(frequency, startAt, length) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + length + 0.05)
}

// A rising two-note "ding-dong", then again a beat later so it is hard to miss
// from across a workshop.
function chime() {
  const now = ctx.currentTime
  tone(880, now, 0.25)
  tone(1318.5, now + 0.18, 0.45)
  tone(880, now + 0.9, 0.25)
  tone(1318.5, now + 1.08, 0.45)
}

// `force` plays even when the person has switched the sound off — used by the
// toggle itself so they hear what they are turning on.
export function playNotificationSound({ force = false } = {}) {
  if (!force && !isSoundOn()) return
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
  if (!ctx) return
  if (ctx.state === 'running') { chime(); return }
  ctx.resume().then(chime).catch(() => {})
}
