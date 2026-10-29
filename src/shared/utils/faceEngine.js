// Face detection + recognition, run on the phone itself: the camera frames
// never leave the device for matching — only a list of 128 numbers does.
//
// The library and its models (~7 MB, served from /models/face and cached by
// the service worker) are loaded on first use, so the rest of the app doesn't
// pay for them.

const MODEL_URL = '/models/face'

let enginePromise = null

export function loadFaceEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const faceapi = await import('@vladmandic/face-api')
      // WebGL is fast; fall back to the CPU on phones whose GPU refuses it.
      const gpu = await faceapi.tf.setBackend('webgl').catch(() => false)
      if (!gpu) await faceapi.tf.setBackend('cpu')
      await faceapi.tf.ready()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
      await warmUp(faceapi)
      return faceapi
    })().catch(err => {
      enginePromise = null   // let the next attempt try again
      throw err
    })
  }
  return enginePromise
}

// The first pass through each network compiles its GPU shaders, which takes
// several seconds on a phone. Doing it here, on blank frames, keeps that wait
// inside the "getting ready" step instead of freezing the live camera view.
async function warmUp(faceapi) {
  const blank = size => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    return canvas
  }
  await faceapi.detectSingleFace(blank(224), detectorOptions(faceapi)).withFaceLandmarks(true)
  await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blank(150))
  // Landmarks only run once a face is found, so warm those separately.
  await faceapi.nets.faceLandmark68TinyNet.detectLandmarks(blank(112))
}

// Fetch the models quietly in the background so the first clock-in doesn't
// wait on them. Skipped when the phone is on Data Saver.
export function preloadFaceEngine() {
  if (enginePromise || navigator.connection?.saveData) return
  const start = () => { loadFaceEngine().catch(() => {}) }
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 8000 })
  else setTimeout(start, 4000)
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Eye aspect ratio: how open an eye is, from its six landmark points. Drops
// sharply while the eye is shut.
function eyeOpenness(eye) {
  return (distance(eye[1], eye[5]) + distance(eye[2], eye[4])) / (2 * distance(eye[0], eye[3]))
}

function detectorOptions(faceapi) {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
}

// One look at the camera: is there a face, where, and how open are the eyes.
export async function detectFace(video) {
  const faceapi = await loadFaceEngine()
  const found = await faceapi.detectSingleFace(video, detectorOptions(faceapi)).withFaceLandmarks(true)
  if (!found) return null
  const { box, score } = found.detection
  const eyes = (eyeOpenness(found.landmarks.getLeftEye()) + eyeOpenness(found.landmarks.getRightEye())) / 2
  return {
    score,
    eyes,
    // Share of the frame's width the face fills — too small means "come closer".
    size: box.width / video.videoWidth,
    // Centre of the face as a fraction of the frame, for the on-screen hint.
    cx: (box.x + box.width / 2) / video.videoWidth,
    cy: (box.y + box.height / 2) / video.videoHeight,
  }
}

// The 128 numbers that identify this face (or null if it can't be read).
export async function describeFace(video) {
  const faceapi = await loadFaceEngine()
  const found = await faceapi
    .detectSingleFace(video, detectorOptions(faceapi))
    .withFaceLandmarks(true)
    .withFaceDescriptor()
  if (!found) return null
  return Array.from(found.descriptor, n => Math.round(n * 1e6) / 1e6)
}

// Watches the eye-openness readings and says when a whole blink (shut, then
// open again) has happened. The "open" level is learned from the person, since
// glasses and squinting in sunlight change it.
export function createBlinkDetector({ closedBelow = 0.75, openAbove = 0.88, warmupFrames = 3 } = {}) {
  let baseline = 0
  let frames = 0
  let shut = false
  return function sawBlink(eyes) {
    frames++
    if (!shut) {
      baseline = baseline ? baseline * 0.85 + eyes * 0.15 : eyes
      if (frames > warmupFrames && eyes < baseline * closedBelow) shut = true
      return false
    }
    if (eyes >= baseline * openAbove) {
      shut = false
      return true
    }
    return false
  }
}

// A small JPEG of whatever the camera sees right now (not mirrored).
export function snapshotJpeg(video, maxWidth = 480) {
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7))
}
