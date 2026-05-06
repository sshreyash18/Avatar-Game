/**
 * avatarAnimations.js
 *
 * Procedural animations for Mixamo-rigged GLB models (Avaturn, Ready Player Me).
 * All functions accept the bone map built by buildBoneMap() and elapsed time t.
 *
 * Bone name convention (Mixamo / Avaturn):
 *   Hips, Spine, Spine1, Spine2, Neck, Head
 *   LeftShoulder, LeftArm, LeftForeArm, LeftHand
 *   RightShoulder, RightArm, RightForeArm, RightHand
 *   LeftUpLeg, LeftLeg, LeftFoot
 *   RightUpLeg, RightLeg, RightFoot
 *
 * Rotation note: In Mixamo T-pose the arms point outward along world X.
 *   To lower LeftArm to the side  → rotate local Z by -1.3 rad
 *   To lower RightArm to the side → rotate local Z by +1.3 rad
 */

import * as THREE from 'three'

const LERP = 0.35   // fast enough to leave T-pose within ~10 frames

function bone(map, name) {
  return map?.get(name) ?? null
}

/**
 * Smoothly set a bone's local rotation via slerp.
 * @param {THREE.Object3D|null} b
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} [order]
 */
function rot(b, x, y, z, order = 'XYZ') {
  if (!b) return
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order))
  b.quaternion.slerp(q, LERP)
}

// ─── Shared helper: bring arms from T-pose to a neutral down position ────────

function armsDown(map, lArmZ = -1.3, rArmZ = 1.3) {
  rot(bone(map, 'LeftArm'),   0, 0, lArmZ)
  rot(bone(map, 'RightArm'),  0, 0, rArmZ)
  rot(bone(map, 'LeftForeArm'),  0, 0,  0.1)
  rot(bone(map, 'RightForeArm'), 0, 0, -0.1)
  rot(bone(map, 'LeftHand'),  0, 0, 0)
  rot(bone(map, 'RightHand'), 0, 0, 0)
}

function legsNeutral(map) {
  rot(bone(map, 'LeftUpLeg'),  0, 0, 0)
  rot(bone(map, 'RightUpLeg'), 0, 0, 0)
  rot(bone(map, 'LeftLeg'),    0, 0, 0)
  rot(bone(map, 'RightLeg'),   0, 0, 0)
  rot(bone(map, 'LeftFoot'),   0, 0, 0)
  rot(bone(map, 'RightFoot'),  0, 0, 0)
}

// ─── IDLE ────────────────────────────────────────────────────────────────────

export function applyIdle(map, t) {
  const breathe = Math.sin(t * 0.9) * 0.008
  rot(bone(map, 'Hips'),   0,    0, 0)
  rot(bone(map, 'Spine'),  0.02, 0, 0)
  rot(bone(map, 'Spine1'), 0.01 + breathe, 0, 0)
  rot(bone(map, 'Spine2'), 0,    0, 0)
  rot(bone(map, 'Head'),   0,    0, 0)
  rot(bone(map, 'Neck'),   0,    0, 0)
  // Arms hang naturally at sides
  rot(bone(map, 'LeftArm'),  0, 0, -1.25)
  rot(bone(map, 'RightArm'), 0, 0,  1.25)
  rot(bone(map, 'LeftForeArm'),  0.08, 0, 0)
  rot(bone(map, 'RightForeArm'), 0.08, 0, 0)
  rot(bone(map, 'LeftHand'),  0, 0, 0)
  rot(bone(map, 'RightHand'), 0, 0, 0)
  legsNeutral(map)
}

// ─── WALK ────────────────────────────────────────────────────────────────────

export function applyWalk(map, t) {
  const speed    = 6.5    // fast — looks like jogging/running
  const swing    = 0.70   // big leg swing
  const armSwing = 0.60   // arms pump hard

  const lLeg = Math.sin(t * speed)
  const rLeg = -lLeg
  const kneeL = Math.max(0,  Math.sin(t * speed)) * 0.7
  const kneeR = Math.max(0, -Math.sin(t * speed)) * 0.7

  // Hips rotate slightly with stride
  rot(bone(map, 'Hips'),   0, Math.sin(t * speed) * 0.06, 0)
  rot(bone(map, 'Spine'),  0.04, 0, 0)
  rot(bone(map, 'Spine1'), 0, 0, 0)

  // Legs
  rot(bone(map, 'LeftUpLeg'),  lLeg * swing, 0, 0)
  rot(bone(map, 'RightUpLeg'), rLeg * swing, 0, 0)
  rot(bone(map, 'LeftLeg'),    kneeL, 0, 0)
  rot(bone(map, 'RightLeg'),   kneeR, 0, 0)
  rot(bone(map, 'LeftFoot'),  -lLeg * 0.2, 0, 0)
  rot(bone(map, 'RightFoot'), -rLeg * 0.2, 0, 0)

  // Arms swing opposite legs
  rot(bone(map, 'LeftArm'),  rLeg * armSwing, 0, -1.3)
  rot(bone(map, 'RightArm'), lLeg * armSwing, 0,  1.3)
  rot(bone(map, 'LeftForeArm'),  0, 0,  0.15)
  rot(bone(map, 'RightForeArm'), 0, 0, -0.15)
}

// ─── JUMP ────────────────────────────────────────────────────────────────────

export function applyJump(map, t) {
  const phase = (Math.sin(t * 4) + 1) / 2  // 0–1 oscillating

  // Arms raise overhead during jump
  rot(bone(map, 'LeftArm'),  -Math.PI * 0.55 * phase, 0, -1.3 + phase * 0.6)
  rot(bone(map, 'RightArm'), -Math.PI * 0.55 * phase, 0,  1.3 - phase * 0.6)
  rot(bone(map, 'LeftForeArm'),  phase * 0.3, 0, 0)
  rot(bone(map, 'RightForeArm'), phase * 0.3, 0, 0)

  // Legs tuck slightly
  rot(bone(map, 'LeftUpLeg'),  phase * 0.3, 0, 0)
  rot(bone(map, 'RightUpLeg'), phase * 0.3, 0, 0)
  rot(bone(map, 'LeftLeg'),    phase * 0.5, 0, 0)
  rot(bone(map, 'RightLeg'),   phase * 0.5, 0, 0)
  rot(bone(map, 'LeftFoot'),  -phase * 0.3, 0, 0)
  rot(bone(map, 'RightFoot'), -phase * 0.3, 0, 0)

  rot(bone(map, 'Spine'),  -phase * 0.1, 0, 0)
  rot(bone(map, 'Hips'),    0, 0, 0)
}

// ─── DANCE ───────────────────────────────────────────────────────────────────

export function applyDance(map, t) {
  const s = 4.5   // dance speed

  // Hip shake
  rot(bone(map, 'Hips'),   0, Math.sin(t * s) * 0.25, Math.sin(t * s * 2) * 0.06)
  rot(bone(map, 'Spine'),  0, Math.sin(t * s) * -0.12, 0)
  rot(bone(map, 'Spine1'), 0, Math.sin(t * s) *  0.15, 0)
  rot(bone(map, 'Spine2'), 0, Math.sin(t * s) * -0.10, 0)

  // Arms do a fun alternating raise
  rot(bone(map, 'LeftArm'),  Math.sin(t * s) * 0.5, 0, -1.0 + Math.cos(t * s) * 0.4)
  rot(bone(map, 'RightArm'), Math.sin(t * s + Math.PI) * 0.5, 0, 1.0 - Math.cos(t * s) * 0.4)
  rot(bone(map, 'LeftForeArm'),  0, Math.sin(t * s * 2) * 0.4, 0)
  rot(bone(map, 'RightForeArm'), 0, Math.sin(t * s * 2 + Math.PI) * 0.4, 0)

  // Feet step
  const lFoot = Math.sin(t * s)
  rot(bone(map, 'LeftUpLeg'),  lFoot * 0.15, 0, 0)
  rot(bone(map, 'RightUpLeg'), -lFoot * 0.15, 0, 0)
  rot(bone(map, 'LeftLeg'),    Math.max(0,  lFoot) * 0.2, 0, 0)
  rot(bone(map, 'RightLeg'),   Math.max(0, -lFoot) * 0.2, 0, 0)
}

// ─── WAVE ────────────────────────────────────────────────────────────────────

export function applyWave(map, t) {
  // Right arm waves, left arm stays down
  const waveAngle = Math.sin(t * 6) * 0.4

  rot(bone(map, 'RightArm'),     -0.9, 0,  0.5)
  rot(bone(map, 'RightForeArm'), waveAngle, 0, 0)
  rot(bone(map, 'RightHand'),    0, waveAngle * 0.5, 0)

  // Left arm stays down
  rot(bone(map, 'LeftArm'),     0, 0, -1.3)
  rot(bone(map, 'LeftForeArm'), 0, 0,  0.1)
  rot(bone(map, 'LeftHand'),    0, 0,  0)

  legsNeutral(map)
  rot(bone(map, 'Spine'),  0.02, 0, 0)
  rot(bone(map, 'Hips'),   0, 0, 0)
}
