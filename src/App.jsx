import { useState } from 'react'
import UploadPage from './components/UploadPage'
import AvatarControl from './components/AvatarControl'

export default function App() {
  // phase: 'upload' | 'control'
  const [phase, setPhase] = useState('upload')
  const [userPhoto, setUserPhoto] = useState(null)   // data URL of selfie
  const [vrmFile, setVrmFile] = useState(null)        // File object for VRM/GLB
  const [fileType, setFileType] = useState('vrm')     // 'vrm' | 'glb' | 'gltf'

  function handleStart({ photo, vrm, fileType: ft }) {
    setUserPhoto(photo)
    setVrmFile(vrm)
    setFileType(ft)
    setPhase('control')
  }

  function handleReset() {
    setPhase('upload')
    setUserPhoto(null)
    setVrmFile(null)
    setFileType('vrm')
  }

  return (
    <div className="app">
      {phase === 'upload' && <UploadPage onStart={handleStart} />}
      {phase === 'control' && (
        <AvatarControl
          userPhoto={userPhoto}
          vrmFile={vrmFile}
          fileType={fileType}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
