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

const ALARM_SECONDS = 8
let alarm = null

// The siren for an urgent alert ("You have been clocked out"): a harsh two-tone
// wail at near full volume for a few seconds, plus a long buzz on phones. It
// deliberately ignores the chime's on/off switch — the point is that nobody
// misses it — and keeps going until stopAlarmSound() or the time runs out.
export function playAlarmSound() {
  try { navigator.vibrate?.([800, 200, 800, 200, 800, 200, 800, 200, 800]) } catch { /* not supported */ }
  if (!ctx) return
  const start = () => {
    stopAlarmSound()
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.linearRampToValueAtTime(0.85, now + 0.05)
    master.gain.setValueAtTime(0.85, now + ALARM_SECONDS - 0.3)
    master.gain.linearRampToValueAtTime(0.0001, now + ALARM_SECONDS)
    master.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'square'
    for (let t = 0; t < ALARM_SECONDS; t += 0.4) {
      osc.frequency.setValueAtTime(Math.round(t / 0.4) % 2 === 0 ? 988 : 740, now + t)
    }
    osc.connect(master)
    osc.start(now)
    osc.stop(now + ALARM_SECONDS + 0.05)
    alarm = { osc, master }
  }
  if (ctx.state === 'running') start()
  else ctx.resume().then(start).catch(() => {})
}

export function stopAlarmSound() {
  if (!alarm) return
  const { osc, master } = alarm
  alarm = null
  try {
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
    osc.stop(ctx.currentTime + 0.08)
  } catch { /* already finished */ }
  try { navigator.vibrate?.(0) } catch { /* not supported */ }
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
