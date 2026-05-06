/**
 * glbRig.js
 *
 * Drives a standard GLB/GLTF humanoid skeleton (e.g. Avaturn, Ready Player Me)
 * using KalidoKit solved rotations.
 *
 * These rigs use standard bone NAME strings inside the skeleton, not the VRM
 * humanoid abstraction. We walk the scene graph once to build a bone name → Object3D map.
 */

import * as THREE from 'three'
import { Face, Pose, Hand, Utils } from 'kalidokit'

const { clamp } = Utils

// ─── Build bone map from a loaded GLTF scene ────────────────────────────────

/**
 * Walk every SkinnedMesh in the scene and collect bone name → Object3D.
 * @param {THREE.Object3D} scene
 * @returns {Map<string, THREE.Object3D>}
 */
export function buildBoneMap(scene) {
  const map = new Map()
  scene.traverse((obj) => {
    if (obj.isBone || obj.type === 'Bone') {
      map.set(obj.name, obj)
    }
    // also index SkinnedMesh skeleton bones
    if (obj.isSkinnedMesh && obj.skeleton) {
      for (const bone of obj.skeleton.bones) {
        map.set(bone.name, bone)
      }
    }
  })
  return map
}

// ─── Bone name tables ────────────────────────────────────────────────────────
// Avaturn and Ready Player Me use mixamo-compatible names.
// We map KalidoKit output keys → possible bone name variants (first match wins).

const BONE_ALIASES = {
  hips:           ['Hips', 'mixamorigHips'],
  spine:          ['Spine', 'mixamorigSpine'],
  spine1:         ['Spine1', 'mixamorigSpine1'],
  spine2:         ['Spine2', 'mixamorigSpine2'],
  neck:           ['Neck', 'mixamorigNeck'],
  head:           ['Head', 'mixamorigHead'],

  rightUpperArm:  ['RightArm',    'mixamorigRightArm'],
  rightLowerArm:  ['RightForeArm','mixamorigRightForeArm'],
  rightHand:      ['RightHand',   'mixamorigRightHand'],

  leftUpperArm:   ['LeftArm',     'mixamorigLeftArm'],
  leftLowerArm:   ['LeftForeArm', 'mixamorigLeftForeArm'],
  leftHand:       ['LeftHand',    'mixamorigLeftHand'],

  rightUpperLeg:  ['RightUpLeg',  'mixamorigRightUpLeg'],
  rightLowerLeg:  ['RightLeg',    'mixamorigRightLeg'],
  leftUpperLeg:   ['LeftUpLeg',   'mixamorigLeftUpLeg'],
  leftLowerLeg:   ['LeftLeg',     'mixamorigLeftLeg'],

  // Fingers — Right
  rightThumbProximal:      ['RightHandThumb1', 'mixamorigRightHandThumb1'],
  rightThumbIntermediate:  ['RightHandThumb2', 'mixamorigRightHandThumb2'],
  rightThumbDistal:        ['RightHandThumb3', 'mixamorigRightHandThumb3'],
  rightIndexProximal:      ['RightHandIndex1', 'mixamorigRightHandIndex1'],
  rightIndexIntermediate:  ['RightHandIndex2', 'mixamorigRightHandIndex2'],
  rightIndexDistal:        ['RightHandIndex3', 'mixamorigRightHandIndex3'],
  rightMiddleProximal:     ['RightHandMiddle1','mixamorigRightHandMiddle1'],
  rightMiddleIntermediate: ['RightHandMiddle2','mixamorigRightHandMiddle2'],
  rightMiddleDistal:       ['RightHandMiddle3','mixamorigRightHandMiddle3'],
  rightRingProximal:       ['RightHandRing1',  'mixamorigRightHandRing1'],
  rightRingIntermediate:   ['RightHandRing2',  'mixamorigRightHandRing2'],
  rightRingDistal:         ['RightHandRing3',  'mixamorigRightHandRing3'],
  rightLittleProximal:     ['RightHandPinky1', 'mixamorigRightHandPinky1'],
  rightLittleIntermediate: ['RightHandPinky2', 'mixamorigRightHandPinky2'],
  rightLittleDistal:       ['RightHandPinky3', 'mixamorigRightHandPinky3'],

  // Fingers — Left
  leftThumbProximal:       ['LeftHandThumb1',  'mixamorigLeftHandThumb1'],
  leftThumbIntermediate:   ['LeftHandThumb2',  'mixamorigLeftHandThumb2'],
  leftThumbDistal:         ['LeftHandThumb3',  'mixamorigLeftHandThumb3'],
  leftIndexProximal:       ['LeftHandIndex1',  'mixamorigLeftHandIndex1'],
  leftIndexIntermediate:   ['LeftHandIndex2',  'mixamorigLeftHandIndex2'],
  leftIndexDistal:         ['LeftHandIndex3',  'mixamorigLeftHandIndex3'],
  leftMiddleProximal:      ['LeftHandMiddle1', 'mixamorigLeftHandMiddle1'],
  leftMiddleIntermediate:  ['LeftHandMiddle2', 'mixamorigLeftHandMiddle2'],
  leftMiddleDistal:        ['LeftHandMiddle3', 'mixamorigLeftHandMiddle3'],
  leftRingProximal:        ['LeftHandRing1',   'mixamorigLeftHandRing1'],
  leftRingIntermediate:    ['LeftHandRing2',   'mixamorigLeftHandRing2'],
  leftRingDistal:          ['LeftHandRing3',   'mixamorigLeftHandRing3'],
  leftLittleProximal:      ['LeftHandPinky1',  'mixamorigLeftHandPinky1'],
  leftLittleIntermediate:  ['LeftHandPinky2',  'mixamorigLeftHandPinky2'],
  leftLittleDistal:        ['LeftHandPinky3',  'mixamorigLeftHandPinky3'],
}

/**
 * Resolve a logical bone key to an actual Object3D using the alias table.
 * @param {Map<string,THREE.Object3D>} boneMap
 * @param {string} key - logical key from BONE_ALIASES
 * @returns {THREE.Object3D|null}
 */
function getBone(boneMap, key) {
  for (const alias of BONE_ALIASES[key] ?? []) {
    const bone = boneMap.get(alias)
    if (bone) return bone
  }
  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rigRotation(bone, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) {
  if (!bone) return
  const euler = new THREE.Euler(
    rotation.x * dampener,
    rotation.y * dampener,
    rotation.z * dampener,
    rotation.rotationOrder ?? 'XYZ',
  )
  bone.quaternion.slerp(new THREE.Quaternion().setFromEuler(euler), lerpAmount)
}

// ─── Public rigging functions ─────────────────────────────────────────────────

/**
 * Rig GLB head/neck from face landmarks.
 */
export function rigGlbFace(boneMap, faceLandmarks, videoEl) {
  if (!faceLandmarks) return

  const faceRig = Face.solve(faceLandmarks, {
    runtime: 'mediapipe',
    video: videoEl,
    imageSize: { width: videoEl?.videoWidth ?? 640, height: videoEl?.videoHeight ?? 480 },
    smoothBlink: true,
    blinkSettings: [0.25, 0.75],
  })
  if (!faceRig?.head) return

  rigRotation(getBone(boneMap, 'neck'), {
    x: faceRig.head.x * 0.3,
    y: faceRig.head.y * 0.3,
    z: faceRig.head.z * 0.3,
  }, 0.7, 0.7)

  rigRotation(getBone(boneMap, 'head'), {
    x: faceRig.head.x * 0.7,
    y: faceRig.head.y * 0.7,
    z: faceRig.head.z * 0.7,
  }, 0.7, 0.7)
}

/**
 * Rig GLB body pose from pose landmarks.
 */
export function rigGlbPose(boneMap, poseLandmarks, poseWorldLandmarks, videoEl) {
  if (!poseLandmarks) return

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

  if (poseRig.Hips?.rotation) {
    rigRotation(getBone(boneMap, 'hips'), poseRig.Hips.rotation, 0.7, 0.7)
  }

  const map = {
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

  for (const [rigKey, boneKey] of Object.entries(map)) {
    const rot = poseRig[rigKey]
    if (rot) rigRotation(getBone(boneMap, boneKey), rot, 0.7, 0.7)
  }
}

/**
 * Rig GLB fingers from hand landmarks.
 * @param {'Left'|'Right'} side
 */
export function rigGlbHand(boneMap, handLandmarks, side) {
  if (!handLandmarks) return

  const handRig = Hand.solve(handLandmarks, side)
  if (!handRig) return

  const p = side === 'Left' ? 'left' : 'right'
  const s = side

  rigRotation(getBone(boneMap, `${p}Hand`), handRig[`${s}Wrist`], 0.7, 0.7)

  const fingers = [
    { k: 'Thumb',  v: 'Thumb' },
    { k: 'Index',  v: 'Index' },
    { k: 'Middle', v: 'Middle' },
    { k: 'Ring',   v: 'Ring' },
    { k: 'Little', v: 'Little' },
  ]
  const joints = ['Proximal', 'Intermediate', 'Distal']

  for (const { k, v } of fingers) {
    for (const joint of joints) {
      const rot = handRig[`${s}${k}${joint}`]
      if (rot) rigRotation(getBone(boneMap, `${p}${v}${joint}`), rot, 0.7, 0.7)
    }
  }
}
