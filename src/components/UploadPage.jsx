import { useState, useRef } from 'react'

export default function UploadPage({ onStart }) {
  const [photo, setPhoto] = useState(null)
  const [vrm, setVrm] = useState(null)
  const photoInputRef = useRef(null)
  const vrmInputRef = useRef(null)

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhoto(ev.target.result)
    reader.readAsDataURL(file)
  }

  function handleVrmChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const name = file.name.toLowerCase()
    if (name.endsWith('.vrm') || name.endsWith('.glb') || name.endsWith('.gltf')) {
      setVrm(file)
    }
  }

  function fileExt(file) {
    return file?.name.split('.').pop().toLowerCase() ?? ''
  }

  function handleStart() {
    if (!vrm) return
    onStart({ photo, vrm, fileType: fileExt(vrm) })
  }

  return (
    <div className="upload-page">
      {/* Hero */}
      <div className="hero">
        <div className="hero-glow" />
        <h1 className="hero-title">
          <span className="gradient-text">Avatar</span>CV
        </h1>
        <p className="hero-sub">
          Upload your 3D avatar. Control it live with your webcam.
        </p>
      </div>

      {/* Steps */}
      <div className="steps">

        {/* Step 1 — VRM */}
        <div className={`step-card ${vrm ? 'step-done' : ''}`}>
          <div className="step-number">01</div>
          <div className="step-body">
            <h2>Get your 3D avatar <span className="badge badge-required">Required</span></h2>
            <p>
              Supports <strong>.vrm</strong> (VRoid Hub / VRoid Studio),{' '}
              <strong>.glb</strong> and <strong>.gltf</strong> (Avaturn, Ready Player Me).
              Get a free avatar from{' '}
              <a href="https://avaturn.me" target="_blank" rel="noreferrer">Avaturn</a>,{' '}
              <a href="https://hub.vroid.com/" target="_blank" rel="noreferrer">VRoid Hub</a>,{' '}
              or <a href="https://readyplayer.me" target="_blank" rel="noreferrer">Ready Player Me</a>.
            </p>

            <div
              className="drop-zone"
              onClick={() => vrmInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (!file) return
                const n = file.name.toLowerCase()
                if (n.endsWith('.vrm') || n.endsWith('.glb') || n.endsWith('.gltf')) setVrm(file)
              }}
            >
              {vrm ? (
                <div className="drop-zone-done">
                  <span className="icon-check">✓</span>
                  <strong>{vrm.name}</strong>
                </div>
              ) : (
                <div className="drop-zone-empty">
                  <span className="drop-icon">🗂</span>
                  <span>Click or drag &amp; drop your <code>.vrm</code> / <code>.glb</code> file here</span>
                </div>
              )}
            </div>
            <input
              ref={vrmInputRef}
              type="file"
              accept=".vrm,.glb,.gltf"
              style={{ display: 'none' }}
              onChange={handleVrmChange}
            />
          </div>
        </div>

        {/* Step 2 — Selfie */}
        <div className={`step-card ${photo ? 'step-done' : ''}`}>
          <div className="step-number">02</div>
          <div className="step-body">
            <h2>Upload your selfie <span className="badge badge-optional">Optional</span></h2>
            <p>
              Your photo is shown alongside your avatar for a personal touch.
              Face-texture mapping coming soon.
            </p>

            <div className="photo-upload-row">
              {photo && (
                <img src={photo} alt="Your selfie" className="photo-preview" />
              )}
              <button
                className="btn-secondary"
                onClick={() => photoInputRef.current?.click()}
              >
                {photo ? 'Change photo' : 'Choose photo'}
              </button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-row">
        <button
          className={`btn-start ${!vrm ? 'btn-start-disabled' : ''}`}
          disabled={!vrm}
          onClick={handleStart}
        >
          {vrm ? '▶  Start Controlling Your Avatar' : 'Upload a .vrm file to continue'}
        </button>
        {!vrm && (
          <p className="cta-hint">
            👆 A VRM file is required. Get one free from VRoid Hub.
          </p>
        )}
      </div>

      {/* Info strip */}
      <footer className="upload-footer">
        <span>🔒 Everything runs locally in your browser. No data is uploaded.</span>
        <span>🎥 Webcam access required for real-time control</span>
        <span>⚡ Powered by MediaPipe · Three.js · KalidoKit</span>
      </footer>
    </div>
  )
}
