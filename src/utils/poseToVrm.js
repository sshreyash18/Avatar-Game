/**
 * poseToVrm.js
 *
 * Converts MediaPipe Holistic landmark results → KalidoKit → VRM bone rotations.
 * Supports face expressions, full body pose, and finger rigging.
 */

import * as THREE from 'three'
import { Face, Pose, Hand, Utils } from 'kalidokit'

const { clamp } = Utils

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Apply a {x,y,z} euler rotation to a VRM bone node with smooth lerp.
 * @param {THREE.Object3D|null} boneNode
 * @param {{ x: number, y: number, z: number }} rotation  - radians
 * @param {number} dampener - scale factor (0-1)
 * @param {number} lerpAmount - slerp speed per frame (0-1)
 */
function rigRotation(boneNode, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
  if (!boneNode) return
  const euler = new THREE.Euler(
    rotation.x * dampener,
    rotation.y * dampener,
    rotation.z * dampener,
  )
  const target = new THREE.Quaternion().setFromEuler(euler)
  boneNode.quaternion.slerp(target, lerpAmount)
}

// ─── Face Rigging ────────────────────────────────────────────────────────────

/**
 * Apply face landmark data to VRM head/neck and expression manager.
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {import('@mediapipe/holistic').NormalizedLandmarkList} faceLandmarks
 * @param {HTMLVideoElement} videoEl
 */
export function rigFace(vrm, faceLandmarks, videoEl) {
  if (!faceLandmarks || !vrm.humanoid) return

  const faceRig = Face.solve(faceLandmarks, {
    runtime: 'mediapipe',
    video: videoEl,
    imageSize: { width: videoEl?.videoWidth ?? 640, height: videoEl?.videoHeight ?? 480 },
    smoothBlink: true,
    blinkSettings: [0.25, 0.75],
  })

  if (!faceRig) return

  const head = vrm.humanoid.getNormalizedBoneNode('head')
  const neck = vrm.humanoid.getNormalizedBoneNode('neck')

  // Split rotation between neck (30%) and head (70%)
  if (faceRig.head) {
    rigRotation(neck, {
      x: faceRig.head.x * 0.3,
      y: faceRig.head.y * 0.3,
      z: faceRig.head.z * 0.3,
    }, 0.7, 0.7)

    rigRotation(head, {
      x: faceRig.head.x * 0.7,
      y: faceRig.head.y * 0.7,
      z: faceRig.head.z * 0.7,
    }, 0.7, 0.7)
  }

  // Expressions
  const em = vrm.expressionManager
  if (em) {
    // Blink — eye openness 0 (closed) → 1 (open), VRM expects 0=open 1=closed
    const eyeL = faceRig.eye?.l ?? 1
    const eyeR = faceRig.eye?.r ?? 1
    em.setValue('blinkLeft',  clamp(1 - eyeL, 0, 1))
    em.setValue('blinkRight', clamp(1 - eyeR, 0, 1))

    // Mouth shapes
    const mouth = faceRig.mouth?.shape ?? {}
    em.setValue('aa', clamp(mouth.A ?? 0, 0, 1))
    em.setValue('ih', clamp(mouth.I ?? 0, 0, 1))
    em.setValue('ou', clamp(mouth.U ?? 0, 0, 1))
    em.setValue('ee', clamp(mouth.E ?? 0, 0, 1))
    em.setValue('oh', clamp(mouth.O ?? 0, 0, 1))
  }
}

// ─── Body Pose Rigging ───────────────────────────────────────────────────────

/**
 * Apply pose landmark data to VRM body bones.
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {Array} poseLandmarks       - 2-D normalised landmarks
 * @param {Array|null} poseWorldLandmarks - 3-D world landmarks
 * @param {HTMLVideoElement} videoEl
 */
export function rigPose(vrm, poseLandmarks, poseWorldLandmarks, videoEl) {
  if (!poseLandmarks || !vrm.humanoid) return

  const poseRig = Pose.solve(
    poseWorldLandmarks ?? poseLandmarks,
    poseLandmarks,
    {
      runtime: 'mediapipe',
      video: videoEl,
      imageSize: { width: videoEl?.videoWidth ?? 640, height: videoEl?.videoHeight ?? 480 },
      enableLegs: true,
    },
  )

  if (!poseRig) return

  // Hips — has { position, rotation? }
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')
  if (hips && poseRig.Hips?.rotation) {
    rigRotation(hips, poseRig.Hips.rotation, 0.7, 0.7)
  }

  // Simple rotation bones — KalidoKit key → VRM bone name
  const boneMap = {
    Spine:         'spine',
    RightUpperArm: 'rightUpperArm',
    RightLowerArm: 'rightLowerArm',
    LeftUpperArm:  'leftUpperArm',
    LeftLowerArm:  'leftLowerArm',
    RightHand:     'rightHand',
    LeftHand:      'leftHand',
    RightUpperLeg: 'rightUpperLeg',
    RightLowerLeg: 'rightLowerLeg',
    LeftUpperLeg:  'leftUpperLeg',
    LeftLowerLeg:  'leftLowerLeg',
  }

  for (const [rigKey, vrmKey] of Object.entries(boneMap)) {
    const boneNode = vrm.humanoid.getNormalizedBoneNode(vrmKey)
    const rot = poseRig[rigKey]
    if (boneNode && rot) {
      rigRotation(boneNode, rot, 0.7, 0.7)
    }
  }
}

// ─── Hand / Finger Rigging ───────────────────────────────────────────────────

/**
 * Apply hand landmark data to VRM finger bones.
 * kalidokit v1 Hand.solve output keys (for side "Left"):
 *   LeftWrist, LeftIndexProximal/Intermediate/Distal,
 *   LeftMiddleProximal/Intermediate/Distal,
 *   LeftRingProximal/Intermediate/Distal,
 *   LeftLittleProximal/Intermediate/Distal,
 *   LeftThumbProximal/Intermediate/Distal
 *
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @param {Array} handLandmarks
 * @param {'Left'|'Right'} side
 */
export function rigHand(vrm, handLandmarks, side) {
  if (!handLandmarks || !vrm.humanoid) return

  const handRig = Hand.solve(handLandmarks, side)
  if (!handRig) return

  const p = side === 'Left' ? 'left' : 'right'  // VRM prefix (lowercase)
  const s = side                                  // KalidoKit prefix (capitalised)

  // Wrist
  rigRotation(vrm.humanoid.getNormalizedBoneNode(`${p}Hand`), handRig[`${s}Wrist`], 0.7, 0.7)

  // Finger map: kalidokit suffix → VRM bone suffix
  // Thumb: KalidoKit Proximal/Intermediate/Distal → VRM Metacarpal/Proximal/Distal
  const fingers = [
    { k: 'Thumb',  v: 'Thumb',  kJoints: ['Proximal', 'Intermediate', 'Distal'], vJoints: ['Metacarpal', 'Proximal', 'Distal'] },
    { k: 'Index',  v: 'Index',  kJoints: ['Proximal', 'Intermediate', 'Distal'], vJoints: ['Proximal', 'Intermediate', 'Distal'] },
    { k: 'Middle', v: 'Middle', kJoints: ['Proximal', 'Intermediate', 'Distal'], vJoints: ['Proximal', 'Intermediate', 'Distal'] },
    { k: 'Ring',   v: 'Ring',   kJoints: ['Proximal', 'Intermediate', 'Distal'], vJoints: ['Proximal', 'Intermediate', 'Distal'] },
    { k: 'Little', v: 'Little', kJoints: ['Proximal', 'Intermediate', 'Distal'], vJoints: ['Proximal', 'Intermediate', 'Distal'] },
  ]

  for (const { k, v, kJoints, vJoints } of fingers) {
    for (let i = 0; i < kJoints.length; i++) {
      const kalidoKey = `${s}${k}${kJoints[i]}`
      const vrmKey    = `${p}${v}${vJoints[i]}`
      const boneNode  = vrm.humanoid.getNormalizedBoneNode(vrmKey)
      const rot       = handRig[kalidoKey]
      if (boneNode && rot) {
        rigRotation(boneNode, rot, 0.7, 0.7)
      }
    }
  }
}
