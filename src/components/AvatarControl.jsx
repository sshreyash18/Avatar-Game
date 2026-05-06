/**
 * AvatarControl.jsx
 *
 * RIGHT hand (green) → action gestures:
 *   ✊ Fist     → Idle
 *   ☝️ 1 finger → Walk (avatar moves forward)
 *   ✌️ 2 fingers → Run (avatar moves forward faster)
 *   👌 OK       → Jump
 *   🖐 Open     → Dance
 *   👍 Thumb    → Victory
 *
 * LEFT hand (blue) → steering while pointing (☝️):
 *   Wrist left of center  → rotate avatar left
 *   Wrist right of center → rotate avatar right
 *   Speed ∝ distance from center
 *
 * Avatar moves forward in its facing direction during walk/run.
 * Camera follows (chase cam). Grid scrolls under feet.
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

// ── Gesture constants ──────────────────────────────────────────────────────
const G = {
  FIST: 'fist', ONE: 'one', TWO: 'two',
  OK: 'ok', OPEN: 'open', THUMB: 'thumb', NONE: 'none',
}

const GESTURE_META = {
  [G.FIST]:  { label: '✊  Idle',    action: 'idle'    },
  [G.ONE]:   { label: '☝️  Walk',    action: 'walk'    },
  [G.TWO]:   { label: '✌️  Run',     action: 'run'     },
  [G.OK]:    { label: '👌  Jump',    action: 'jump'    },
  [G.OPEN]:  { label: '🖐  Dance',   action: 'dance'   },
  [G.THUMB]: { label: '👍  Victory', action: 'victory' },
  [G.NONE]:  { label: '— —',         action: 'idle'    },
}

// ── Gesture detection ──────────────────────────────────────────────────────
function fingerUp(tip, pip) { return pip.y - tip.y > 0.04 }

function detectGesture(lm) {
  if (!lm || lm.length < 21) return G.NONE
  const pinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.07
  const i = fingerUp(lm[8],  lm[6])
  const m = fingerUp(lm[12], lm[10])
  const r = fingerUp(lm[16], lm[14])
  const p = fingerUp(lm[20], lm[18])
  // Thumb pointing up: tip is well above wrist in Y (lower y = higher on screen)
  const thumbUp = (lm[0].y - lm[4].y) > 0.1

  if (thumbUp && !i && !m && !r && !p) return G.THUMB  // check BEFORE fist
  if (!i && !m && !r && !p)            return G.FIST
  if (pinch && m && r && p)            return G.OK
  if (i && !m && !r && !p)             return G.ONE
  if (i && m && !r && !p)              return G.TWO
  if (i && m && r && p)                return G.OPEN
  return G.NONE
}

// Left hand: finger count = direction command
// 1 → face back (back to screen), 2 → turn left, 3 → face front, 4 → turn right
function detectLeftCmd(lm) {
  if (!lm || lm.length < 21) return null
  const i = fingerUp(lm[8],  lm[6])
  const m = fingerUp(lm[12], lm[10])
  const r = fingerUp(lm[16], lm[14])
  const p = fingerUp(lm[20], lm[18])
  const n = (i?1:0) + (m?1:0) + (r?1:0) + (p?1:0)
  if (n === 1 && i)           return 'face-back'    // ☝️  back to screen
  if (n === 2 && i && m)      return 'turn-left'    // ✌️  turn left
  if (n === 3 && i && m && r) return 'face-front'   // 🤟  face camera
  if (n === 4)                return 'turn-right'   // 🖖  turn right
  return null
}

const LEFT_CMD_LABELS = {
  'face-back':  '☝️  Back to screen',
  'turn-left':  '✌️  Turn left',
  'face-front': '🤟  Face camera',
  'turn-right': '🖖  Turn right',
}

function drawLeftCmdHint(ctx, w, h, cmd) {
  if (!cmd) return
  ctx.save()
  ctx.fillStyle = 'rgba(20,40,100,0.65)'
  ctx.fillRect(4, h - 34, 200, 28)
  ctx.fillStyle = '#88aaff'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(LEFT_CMD_LABELS[cmd] ?? cmd, 10, h - 14)
  ctx.restore()
}

// ── Hand skeleton drawing ──────────────────────────────────────────────────
const HAND_CONN = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]

function drawHand(ctx, lm, w, h, color) {
  if (!lm) return
  ctx.strokeStyle = color
  ctx.lineWidth   = 2.5
  for (const [a, b] of HAND_CONN) {
    ctx.beginPath()
    ctx.moveTo((1 - lm[a].x) * w, lm[a].y * h)
    ctx.lineTo((1 - lm[b].x) * w, lm[b].y * h)
    ctx.stroke()
  }
  for (const pt of lm) {
    ctx.beginPath()
    ctx.arc((1 - pt.x) * w, pt.y * h, 5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
}

// ── VRM bone helpers ───────────────────────────────────────────────────────
function bone(vrm, name) {
  return vrm?.humanoid?.getNormalizedBoneNode(name) ?? null
}

function slerp(b, x, y, z, alpha = 0.15) {
  if (!b) return
  b.quaternion.slerp(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)),
    alpha,
  )
}

// ── Speeds (units/sec) ────────────────────────────────────────────────────
const SPEED = { idle: 0, walk: 1.2, run: 3.0, jump: 1.5, dance: 0, victory: 0 }
const TURN_SPEED = 2.2   // rad/sec max

// ── Procedural animations ──────────────────────────────────────────────────
function animateAvatar(vrm, action, t, jumpPhase) {
  const AL  = 0.15
  const LAZ = +1.4   // VRM normalized: left  arm down = +Z
  const RAZ = -1.4   // VRM normalized: right arm down = -Z

  if (action === 'idle') {
    const br = Math.sin(t * 0.9) * 0.015
    slerp(bone(vrm, 'spine'),         br, 0, 0,   0.08)
    slerp(bone(vrm, 'leftUpperArm'),  0,  0, LAZ, AL)
    slerp(bone(vrm, 'rightUpperArm'), 0,  0, RAZ, AL)
    slerp(bone(vrm, 'leftLowerArm'),  0,  0, 0,   AL)
    slerp(bone(vrm, 'rightLowerArm'), 0,  0, 0,   AL)
    slerp(bone(vrm, 'leftUpperLeg'),  0,  0, 0,   AL)
    slerp(bone(vrm, 'rightUpperLeg'), 0,  0, 0,   AL)
    slerp(bone(vrm, 'leftLowerLeg'),  0,  0, 0,   AL)
    slerp(bone(vrm, 'rightLowerLeg'), 0,  0, 0,   AL)
    slerp(bone(vrm, 'leftFoot'),      0,  0, 0,   AL)
    slerp(bone(vrm, 'rightFoot'),     0,  0, 0,   AL)
  }

  if (action === 'walk' || action === 'run') {
    const spd = action === 'run' ? 4.5 : 2.5
    const amp = action === 'run' ? 0.6 : 0.38
    const c   = Math.sin(t * spd)
    slerp(bone(vrm, 'hips'),          0, c * 0.05, 0,                    AL)
    slerp(bone(vrm, 'leftUpperLeg'), -amp * c, 0, 0,                     AL)
    slerp(bone(vrm, 'rightUpperLeg'), amp * c, 0, 0,                     AL)
    slerp(bone(vrm, 'leftLowerLeg'),  Math.max(0,  amp * c) * 0.8, 0, 0, AL)
    slerp(bone(vrm, 'rightLowerLeg'), Math.max(0, -amp * c) * 0.8, 0, 0, AL)
    slerp(bone(vrm, 'leftFoot'),      Math.max(0, -amp * c) * 0.3, 0, 0, AL)
    slerp(bone(vrm, 'rightFoot'),     Math.max(0,  amp * c) * 0.3, 0, 0, AL)
    slerp(bone(vrm, 'leftUpperArm'),   amp * 0.4 * c, 0, LAZ * 0.5,     AL)
    slerp(bone(vrm, 'rightUpperArm'), -amp * 0.4 * c, 0, RAZ * 0.5,     AL)
    slerp(bone(vrm, 'leftLowerArm'),  0, 0, 0,                           AL)
    slerp(bone(vrm, 'rightLowerArm'), 0, 0, 0,                           AL)
  }

  if (action === 'jump') {
    // jumpPhase: 0..1 over the full jump arc
    const phase = jumpPhase ?? 0
    const legTuck = Math.sin(phase * Math.PI) * 0.9   // tuck legs mid-air
    const armRaise = Math.sin(phase * Math.PI) * 0.7  // raise arms mid-air
    slerp(bone(vrm, 'leftUpperArm'),  -armRaise, 0, LAZ * 0.3, AL)
    slerp(bone(vrm, 'rightUpperArm'), -armRaise, 0, RAZ * 0.3, AL)
    slerp(bone(vrm, 'leftLowerArm'),  0, 0, 0,                  AL)
    slerp(bone(vrm, 'rightLowerArm'), 0, 0, 0,                  AL)
    slerp(bone(vrm, 'leftUpperLeg'),  -legTuck * 0.7, 0, 0,     AL)
    slerp(bone(vrm, 'rightUpperLeg'), -legTuck * 0.7, 0, 0,     AL)
    slerp(bone(vrm, 'leftLowerLeg'),   legTuck,        0, 0,     AL)
    slerp(bone(vrm, 'rightLowerLeg'),  legTuck,        0, 0,     AL)
  }

  if (action === 'dance') {
    const beat = t * 4           // 4 BPS for energy
    const slow = t * 2           // 2 BPS for body sway
    const b    = Math.sin(beat)
    const s2   = Math.sin(slow)
    const bAbs = Math.abs(b)

    // Hip: big bounce + wide sway
    slerp(bone(vrm, 'hips'),  bAbs * 0.18 - 0.06, s2 * 0.28, 0, 0.25)
    slerp(bone(vrm, 'spine'),    -bAbs * 0.1,       0, -s2 * 0.2, 0.2)
    slerp(bone(vrm, 'chest'),     b * 0.1,           0,  s2 * 0.1, 0.2)

    // Arms: opposite phase, large swings
    const la = Math.sin(beat + Math.PI)  // left offset half beat
    const ra = Math.sin(beat)
    slerp(bone(vrm, 'leftUpperArm'),  -0.75 + la * 0.7,  0.3, LAZ * 0.45, 0.25)
    slerp(bone(vrm, 'rightUpperArm'), -0.75 + ra * 0.7, -0.3, RAZ * 0.45, 0.25)
    slerp(bone(vrm, 'leftLowerArm'),   0.6 + la * 0.45,  0,  0.2, 0.25)
    slerp(bone(vrm, 'rightLowerArm'),  0.6 + ra * 0.45,  0, -0.2, 0.25)

    // Legs: alternating knee lifts
    const ll = Math.max(0,  b)   // left leg on + beat
    const rl = Math.max(0, -b)   // right leg on − beat
    slerp(bone(vrm, 'leftUpperLeg'),  -ll * 0.55, 0,  0.05, 0.25)
    slerp(bone(vrm, 'rightUpperLeg'), -rl * 0.55, 0, -0.05, 0.25)
    slerp(bone(vrm, 'leftLowerLeg'),   ll * 0.6,  0, 0,     0.25)
    slerp(bone(vrm, 'rightLowerLeg'),  rl * 0.6,  0, 0,     0.25)
    slerp(bone(vrm, 'leftFoot'),       ll * 0.2,  0, 0,     0.25)
    slerp(bone(vrm, 'rightFoot'),      rl * 0.2,  0, 0,     0.25)
  }

  if (action === 'victory') {
    const wave = Math.sin(t * 3) * 0.12
    slerp(bone(vrm, 'spine'),         -0.08, 0, 0,            AL)
    slerp(bone(vrm, 'leftUpperArm'),  -1.1 + wave, 0,  LAZ * 0.2, AL)
    slerp(bone(vrm, 'rightUpperArm'), -1.1 - wave, 0,  RAZ * 0.2, AL)
    slerp(bone(vrm, 'leftLowerArm'),   0.3, 0,  0.2,            AL)
    slerp(bone(vrm, 'rightLowerArm'),  0.3, 0, -0.2,            AL)
    slerp(bone(vrm, 'leftUpperLeg'),   0, 0, 0,                 AL)
    slerp(bone(vrm, 'rightUpperLeg'),  0, 0, 0,                 AL)
    slerp(bone(vrm, 'leftLowerLeg'),   0, 0, 0,                 AL)
    slerp(bone(vrm, 'rightLowerLeg'),  0, 0, 0,                 AL)
  }
}

// ── Component ──────────────────────────────────────────────────────────────
const STATUS = {
  LOADING:     'loading',
  WAITING_CAM: 'waiting_cam',
  ACTIVE:      'active',
  ERROR:       'error',
}

const JUMP_DURATION = 0.7   // seconds

export default function AvatarControl({ userPhoto, vrmFile, onReset }) {
  const avatarCanvasRef = useRef(null)
  const camCanvasRef    = useRef(null)
  const videoRef        = useRef(null)
  const streamRef       = useRef(null)
  const sceneRef        = useRef({ renderer: null, animId: null, vrm: null, model: null, camOffset: null, modelH: 1 })
  const inputRef        = useRef({ action: 'idle', leftCmd: null })  // written by MediaPipe, read by tick
  const jumpRef         = useRef({ active: false, elapsed: 0 })
  const animTimeRef     = useRef(0)

  const [status,    setStatus]    = useState(STATUS.LOADING)
  const [statusMsg, setStatusMsg] = useState('Loading model…')
  const [loadPct,   setLoadPct]   = useState(0)
  const [camReady,  setCamReady]  = useState(false)
  const [gesture,   setGesture]    = useState(G.NONE)
  const [leftCmdUI, setLeftCmdUI]  = useState(null)

  // ── Effect 1: Three.js scene + VRM + game loop ────────────────────────────
  useEffect(() => {
    const canvas = avatarCanvasRef.current
    if (!canvas || !vrmFile) return
    const s = sceneRef.current

    s.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    s.renderer.setPixelRatio(window.devicePixelRatio)
    s.renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    // Gradient sky background
    const bgCv = document.createElement('canvas')
    bgCv.width = 2; bgCv.height = 256
    const bgCtx = bgCv.getContext('2d')
    const grad = bgCtx.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0,   '#060618')
    grad.addColorStop(0.6, '#0e0a30')
    grad.addColorStop(1,   '#1a0840')
    bgCtx.fillStyle = grad
    bgCtx.fillRect(0, 0, 2, 256)
    scene.background = new THREE.CanvasTexture(bgCv)
    scene.fog = new THREE.FogExp2(0x0e0a30, 0.016)

    // Floor plane
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x08081e, roughness: 0.95, metalness: 0.05 })
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const key = new THREE.DirectionalLight(0xffffff, 3)
    key.position.set(2, 4, 3); scene.add(key)
    const fill = new THREE.DirectionalLight(0x8888ff, 1.2)
    fill.position.set(-2, 2, -1); scene.add(fill)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500)

    const url    = URL.createObjectURL(vrmFile)
    const loader = new GLTFLoader()
    loader.register((p) => new VRMLoaderPlugin(p))

    loader.load(
      url,
      (gltf) => {
        URL.revokeObjectURL(url)
        const vrm = gltf.userData.vrm
        if (!vrm) {
          setStatus(STATUS.ERROR); setStatusMsg('Not a valid VRM file.'); return
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        VRMUtils.removeUnnecessaryJoints(gltf.scene)
        s.vrm   = vrm
        s.model = vrm.scene
        s.model.rotation.set(0, Math.PI, 0)
        scene.add(s.model)
        s.model.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(s.model)
        s.model.position.y -= box.min.y
        const h = box.max.y - box.min.y
        // Fixed camera offset — stays in world space, always sees the front
        s.camOffset = new THREE.Vector3(0, h * 0.75, h * 2.2)
        s.modelH    = h
        camera.position.copy(s.model.position).add(s.camOffset)
        camera.lookAt(0, h * 0.5, 0)
        setStatus(STATUS.WAITING_CAM)
        setStatusMsg('Starting webcam…')
        setCamReady(true)
      },
      (p) => { if (p.total > 0) setLoadPct(Math.round(p.loaded / p.total * 100)) },
      (err) => {
        console.error(err); URL.revokeObjectURL(url)
        setStatus(STATUS.ERROR); setStatusMsg('Failed to load model.')
      },
    )

    const clock = new THREE.Clock()

    const tick = () => {
      s.animId = requestAnimationFrame(tick)
      const dt     = Math.min(clock.getDelta(), 0.05)  // cap at 50ms
      const { action, leftCmd } = inputRef.current
      const model  = s.model
      const vrm    = s.vrm
      if (!model || !vrm) { s.renderer.render(scene, camera); return }

      animTimeRef.current += dt

      // ── Left-hand steering commands ─────────────────────────────────────────
      if (leftCmd === 'turn-left')  model.rotation.y -= TURN_SPEED * dt
      if (leftCmd === 'turn-right') model.rotation.y += TURN_SPEED * dt
      if (leftCmd === 'face-front') model.rotation.y = Math.PI  // front faces +Z (toward camera)
      if (leftCmd === 'face-back')  model.rotation.y = 0

      // ── Jump state machine ────────────────────────────────────────────
      const jmp = jumpRef.current
      if (action === 'jump' && !jmp.active) {
        jmp.active  = true
        jmp.elapsed = 0
      }
      if (jmp.active) {
        jmp.elapsed += dt
        const phase     = jmp.elapsed / JUMP_DURATION
        const jumpHeight = Math.sin(phase * Math.PI) * 1.2
        const groundY   = -(new THREE.Box3().setFromObject(model)).min.y + model.position.y
        model.position.y = Math.max(0, jumpHeight)
        // Forward movement during jump
        const fwd = new THREE.Vector3(
          -Math.sin(model.rotation.y), 0, -Math.cos(model.rotation.y)
        )
        model.position.addScaledVector(fwd, SPEED.jump * dt)

        animateAvatar(vrm, 'jump', animTimeRef.current, phase)

        if (jmp.elapsed >= JUMP_DURATION) {
          jmp.active      = false
          model.position.y = 0
        }
      } else {
        // ── Forward movement ────────────────────────────────────────────
        const spd = SPEED[action] ?? 0
        if (spd > 0) {
          const fwd = new THREE.Vector3(
            -Math.sin(model.rotation.y), 0, -Math.cos(model.rotation.y)
          )
          model.position.addScaledVector(fwd, spd * dt)
        }
        animateAvatar(vrm, action, animTimeRef.current, 0)
      }

      // ── Fixed-angle follow camera ──────────────────────────────────────────
      // Camera keeps fixed world offset from model — always sees the front
      if (s.camOffset) {
        const targetPos = model.position.clone().add(s.camOffset)
        camera.position.lerp(targetPos, 0.06)
        camera.lookAt(model.position.x, model.position.y + s.modelH * 0.5, model.position.z)
      }

      vrm.update(dt)
      s.renderer.render(scene, camera)
    }
    tick()

    const onResize = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      if (!w || !h) return
      s.renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(canvas); onResize()

    return () => {
      ro.disconnect()
      cancelAnimationFrame(s.animId)
      s.renderer.dispose()
      s.renderer = null; s.vrm = null; s.model = null
    }
  }, [vrmFile])

  // ── Effect 2: webcam + MediaPipe ─────────────────────────────────────────
  useEffect(() => {
    if (!camReady) return
    const video     = videoRef.current
    const camCanvas = camCanvasRef.current
    if (!video || !camCanvas) return

    let stopped     = false
    let holistic    = null
    let lastGesture = G.NONE
    let holdStart   = 0
    const HOLD_MS   = 300

    function onResults(results) {
      if (stopped) return
      const ctx = camCanvas.getContext('2d')
      const w = camCanvas.width, h = camCanvas.height

      // Draw mirrored webcam frame
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -w, 0, w, h)
      ctx.restore()

      // Draw right hand (green) and left hand (blue)
      drawHand(ctx, results.rightHandLandmarks, w, h, '#00ff88')
      drawHand(ctx, results.leftHandLandmarks,  w, h, '#4488ff')

      // ── Right hand: action gesture ──────────────────────────────────
      const rlm     = results.rightHandLandmarks
      const detected = detectGesture(rlm)
      const now      = performance.now()
      if (detected !== lastGesture) {
        lastGesture = detected; holdStart = now
      } else if (detected !== G.NONE && now - holdStart >= HOLD_MS) {
        const action = GESTURE_META[detected]?.action ?? 'idle'
        if (inputRef.current.action !== action) {
          inputRef.current = { ...inputRef.current, action }
          setGesture(detected)
        }
      }

      // ── Left hand: directional command ───────────────────────────────────
      const leftCmd = detectLeftCmd(results.leftHandLandmarks)
      inputRef.current = { ...inputRef.current, leftCmd }
      setLeftCmdUI(leftCmd)
      drawLeftCmdHint(ctx, w, h, leftCmd)
    }

    async function start() {
      if (!window.Holistic) {
        setStatus(STATUS.ERROR); setStatusMsg('MediaPipe not loaded.'); return
      }

      holistic = new window.Holistic({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${f}`,
      })
      holistic.setOptions({
        modelComplexity:        1,
        smoothLandmarks:        true,
        enableSegmentation:     false,
        refineFaceLandmarks:    false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence:  0.6,
      })
      holistic.onResults(onResults)

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        video.srcObject   = stream
        await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }))
        if (stopped) return
        await video.play()
        camCanvas.width  = video.videoWidth  || 640
        camCanvas.height = video.videoHeight || 480
        setStatus(STATUS.ACTIVE)
        setStatusMsg('Right ✉️≡action · Left ☝️≡back ✌️≡left 🤟≡front 🖖≡right')
        const sendFrame = async () => {
          if (stopped) return
          await holistic.send({ image: video })
          requestAnimationFrame(sendFrame)
        }
        requestAnimationFrame(sendFrame)
      } catch (err) {
        if (stopped) return
        setStatus(STATUS.ERROR); setStatusMsg('Webcam error: ' + err.message)
      }
    }

    start()

    return () => {
      stopped = true
      if (holistic) holistic.close()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null
      }
      if (video) video.srcObject = null
    }
  }, [camReady])

  const meta = GESTURE_META[gesture] ?? GESTURE_META[G.NONE]

  return (
    <div className="ac-root">
      <video ref={videoRef} playsInline muted style={{ display: 'none' }} />

      <header className="ac-bar">
        <button className="btn-back" onClick={onReset}>← Back</button>
        <div className="ac-status">
          <span className={`status-dot ${
            status === STATUS.ERROR  ? 'dot-error'  :
            status === STATUS.ACTIVE ? 'dot-active' : 'dot-loading'
          }`} />
          <span className="status-text">{statusMsg}</span>
          {status === STATUS.LOADING && loadPct > 0 && <span className="load-pct">{loadPct}%</span>}
        </div>
        {/* Left command indicator in header */}
        {status === STATUS.ACTIVE && leftCmdUI && (
          <div className="steer-indicator">
            <span className="steer-label" style={{ color: '#88aaff' }}>
              {LEFT_CMD_LABELS[leftCmdUI]}
            </span>
          </div>
        )}
        {userPhoto && <img src={userPhoto} alt="You" className="selfie-thumb" />}
      </header>

      <div className="ac-panels">

        {/* LEFT — webcam */}
        <div className="panel panel-cam">
          <span className="panel-label">CAM</span>
          <canvas
            ref={camCanvasRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
          />

          {status === STATUS.ACTIVE && (
            <div className="gesture-hud">
              <div className="gesture-hud-current">{meta.label}</div>
              <div className="gesture-hud-list">
                {Object.entries(GESTURE_META)
                  .filter(([k]) => k !== G.NONE)
                  .map(([k, v]) => (
                    <div key={k} className={`gesture-hud-item${gesture === k ? ' g-active' : ''}`}>
                      {v.label}
                    </div>
                  ))}
              </div>
              <div className="gesture-hud-divider" />
              <div className="gesture-hud-hint">
                <span style={{ color: '#4488ff' }}>L:</span> ☝️back ✌️left 🤟front 🖖right
              </div>
            </div>
          )}

          {(status === STATUS.LOADING || status === STATUS.WAITING_CAM) && (
            <div className="model-overlay">
              <div className="spinner" />
              <p>{statusMsg}</p>
              {loadPct > 0 && <p className="load-pct-lg">{loadPct}%</p>}
            </div>
          )}
        </div>

        {/* RIGHT — 3-D avatar */}
        <div className="panel panel-avatar">
          <span className="panel-label">AVATAR</span>
          <canvas ref={avatarCanvasRef} className="avatar-canvas" />
        </div>

      </div>
    </div>
  )
}
