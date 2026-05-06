/**
 * gestureDetect.js
 *
 * Recognises hand gestures from MediaPipe Holistic hand landmarks (21 points).
 *
 * Landmark indices:
 *   0 = Wrist
 *   1-4   = Thumb  (CMC → TIP)
 *   5-8   = Index  (MCP → TIP)
 *   9-12  = Middle (MCP → TIP)
 *   13-16 = Ring   (MCP → TIP)
 *   17-20 = Pinky  (MCP → TIP)
 *
 * Gestures (left hand):
 *   'fist'  ✊  → Walk
 *   'open'  🖐  → Jump
 *   'peace' ✌️  → Dance
 *   'point' ☝️  → Wave
 *   'none'      → Idle
 *
 * Right hand:
 *   Wrist X position (0–1) → rotation speed for avatar Y-spin
 */

const WRIST      = 0
const INDEX_MCP  = 5,  INDEX_PIP  = 6,  INDEX_TIP  = 8
const MIDDLE_MCP = 9,  MIDDLE_PIP = 10, MIDDLE_TIP = 12
const RING_MCP   = 13, RING_PIP   = 14, RING_TIP   = 16
const PINKY_MCP  = 17, PINKY_PIP  = 18, PINKY_TIP  = 20
const THUMB_MCP  = 2,  THUMB_TIP  = 4

function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * A finger is "extended" if its TIP is farther from the wrist than its MCP.
 */
function extended(lm, mcp, tip) {
  return dist2(lm[WRIST], lm[tip]) > dist2(lm[WRIST], lm[mcp]) * 1.15
}

/**
 * Detect gesture from a set of hand landmarks.
 * @param {Array} lm  - 21 MediaPipe hand landmarks {x,y,z}
 * @returns {'fist'|'open'|'peace'|'point'|'none'}
 */
export function detectGesture(lm) {
  if (!lm || lm.length < 21) return 'none'

  const idx    = extended(lm, INDEX_MCP,  INDEX_TIP)
  const mid    = extended(lm, MIDDLE_MCP, MIDDLE_TIP)
  const ring   = extended(lm, RING_MCP,   RING_TIP)
  const pinky  = extended(lm, PINKY_MCP,  PINKY_TIP)
  // Thumb: compare tip distance to wrist vs mcp distance — use X axis diff too
  const thumb  = dist2(lm[WRIST], lm[THUMB_TIP]) > dist2(lm[WRIST], lm[THUMB_MCP]) * 1.1

  if (!idx && !mid && !ring && !pinky)           return 'fist'   // ✊ Walk
  if (idx && mid && ring && pinky)               return 'open'   // 🖐 Jump
  if (idx && mid && !ring && !pinky)             return 'peace'  // ✌️ Dance
  if (idx && !mid && !ring && !pinky)            return 'point'  // ☝️ Wave

  return 'none'
}

/**
 * Map right-hand wrist X position to a Y-rotation speed for the avatar.
 * Wrist X in normalised image space (0 = left edge, 1 = right edge).
 * Since the webcam is mirrored the user's actual right hand appears on the LEFT.
 *
 * Move wrist to the LEFT side  (x < 0.35) → rotate avatar LEFT  (negative)
 * Move wrist to the RIGHT side (x > 0.65) → rotate avatar RIGHT (positive)
 *
 * @param {Array} lm  - right-hand landmarks
 * @returns {number}  radians/sec multiplier (-1 … +1)
 */
export function getRotationSpeed(lm) {
  if (!lm || lm.length < 1) return 0
  // x=0 = image-left (person's right side in mirrored view)
  // x=1 = image-right (person's left side in mirrored view)
  // Dead zone 0.38–0.62 = hand held steady in front → no rotation
  const x = lm[WRIST].x
  if (x < 0.38) return -(0.38 - x) / 0.38   // move right hand RIGHT → rotate avatar left
  if (x > 0.62) return  (x - 0.62) / 0.38   // move right hand LEFT  → rotate avatar right
  return 0
}

/**
 * Display metadata for each gesture — shown in the UI badge.
 */
export const GESTURE_INFO = {
  none:  { icon: '🖐', action: 'Stand' },
  fist:  { icon: '✊', action: 'Dance' },
  open:  { icon: '🖐', action: 'Stand' },
  peace: { icon: '✌️', action: 'Jump'  },
  point: { icon: '☝️', action: 'Run'   },
}
