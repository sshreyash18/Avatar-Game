# AvatarCV

> **Early-stage project — built slowly, on free time. Contributions very welcome.**

AvatarCV lets you upload a 3D avatar and **control it live using your webcam** — just move your hands and body in front of the camera and watch your avatar react in real time.

---

## What it does (so far)

- Upload a `.vrm`, `.glb`, or `.gltf` 3D avatar (from VRoid Studio, Avaturn, Ready Player Me, etc.)
- Use your **webcam** to drive the avatar's pose and expressions via [MediaPipe Holistic](https://github.com/google/mediapipe) + [Kalidokit](https://github.com/yeemachine/kalidokit)
- **Left hand gestures** trigger avatar animations (walk, jump, dance, wave)
- **Right hand** controls avatar rotation speed
- Supports both VRM rigs and generic GLB/GLTF rigs

---

## Tech stack

| Library | Purpose |
|---|---|
| React 18 + Vite | UI & dev tooling |
| Three.js | 3D rendering |
| @pixiv/three-vrm | VRM avatar loading & rigging |
| MediaPipe Holistic | Real-time body/hand/face tracking |
| Kalidokit | Pose → bone rotation solver |

---

## Getting started

```bash
npm install
npm run dev
