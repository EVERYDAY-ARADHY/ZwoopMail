import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './AsciiSculpture.css'

export default function AsciiSculpture({
  modelPath = '/models/angel_sculpture.glb',
  width = 340,
  height = 340,
  interactive = true,
  showControls = false,
  autoRotateSpeed = 0.005, // Slow, hypnotic rotation
}) {
  // Dedicated DOM container for Three.js so React Virtual DOM never interferes
  const canvasHolderRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Controls state mimicking screenshot settings
  const [autoRotate, setAutoRotate] = useState(true)
  const [scale, setScale] = useState(2.0) // 200% scale from screenshot
  const [contrast, setContrast] = useState(2.5) // 2.5 contrast/brightness

  const sceneRef = useRef(null)
  const modelRef = useRef(null)
  const lightRef = useRef(null)
  const effectRef = useRef(null)

  useEffect(() => {
    if (!canvasHolderRef.current) return

    const widthPx = canvasHolderRef.current.clientWidth || width
    const heightPx = canvasHolderRef.current.clientHeight || height

    // 1. Scene setup
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, widthPx / heightPx, 0.1, 1000)
    camera.position.set(0, 1.2, 4.5)

    // 3. Lighting setup (Directional light with 2.5 intensity from screenshot)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, contrast)
    directionalLight.position.set(5, 10, 7.5)
    scene.add(directionalLight)
    lightRef.current = directionalLight

    // 4. Renderer setup with alpha transparency
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(widthPx, heightPx)
    renderer.setClearColor(0x000000, 0) // clear alpha

    // 5. AsciiEffect setup with characters from screenshot: ' .:-=+*#@'
    // resolution: 0.25 (character resolution scale)
    const effect = new AsciiEffect(renderer, ' .:-=+*#@', {
      invert: true,
      resolution: 0.25,
      color: false, // Ensure monochrome so our #fc5000 ember CSS overrides purely!
    })
    effect.setSize(widthPx, heightPx)
    effect.domElement.style.color = '#fc5000' // Caldera molten ember orange
    effect.domElement.style.backgroundColor = 'transparent'
    effect.domElement.style.fontFamily = "var(--font-mono), 'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace"
    effect.domElement.style.lineHeight = '1'
    effect.domElement.style.fontWeight = 'bold'
    effect.domElement.style.cursor = interactive ? 'grab' : 'default'
    effectRef.current = effect

    // Safely attach to isolated DOM node without disturbing React state overlays
    while (canvasHolderRef.current.firstChild) {
      canvasHolderRef.current.removeChild(canvasHolderRef.current.firstChild)
    }
    canvasHolderRef.current.appendChild(effect.domElement)

    // 6. OrbitControls for mouse interactions
    let controls = null
    if (interactive) {
      controls = new OrbitControls(camera, effect.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.enableZoom = false
      controls.target.set(0, 0.3, 0)
      controls.update()
    }

    // 7. Load GLB Model
    const loader = new GLTFLoader()
    loader.load(
      modelPath,
      (gltf) => {
        const root = gltf.scene

        // Center and normalize model bounds
        const box = new THREE.Box3().setFromObject(root)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        
        // Normalize size to ~1.4 units then multiply by scale (2.0)
        const normalizeScale = (1.4 / maxDim) * scale
        root.scale.set(normalizeScale, normalizeScale, normalizeScale)
        
        // Center model at origin
        root.position.x = -center.x * normalizeScale
        root.position.y = -center.y * normalizeScale
        root.position.z = -center.z * normalizeScale

        // Enhance material reflections for vibrant ASCII character density
        root.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.roughness = 0.3
            child.material.metalness = 0.2
          }
        })

        scene.add(root)
        modelRef.current = root
        setLoading(false)
      },
      undefined,
      (err) => {
        console.error('Failed to load GLB model:', err)
        setError('Model load failure')
        setLoading(false)
      }
    )

    // 8. Animation Loop
    let animationFrameId
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)

      // Slow, hypnotic rotation
      if (modelRef.current && autoRotate) {
        modelRef.current.rotation.y += autoRotateSpeed
      }

      if (controls) controls.update()
      effect.render(scene, camera)
    }
    animate()

    // Handle Resize
    const handleResize = () => {
      if (!canvasHolderRef.current) return
      const newWidth = canvasHolderRef.current.clientWidth || width
      const newHeight = canvasHolderRef.current.clientHeight || height
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
      effect.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      if (controls) controls.dispose()
      renderer.dispose()
      if (canvasHolderRef.current && effect.domElement.parentNode === canvasHolderRef.current) {
        canvasHolderRef.current.removeChild(effect.domElement)
      }
    }
  }, [modelPath, width, height, interactive, autoRotate, autoRotateSpeed, contrast, scale])

  return (
    <div className={`ascii-sculpture-wrapper ${!showControls ? 'clean-corner' : ''}`} style={{ width: `${width}px`, height: `${height}px` }}>
      {showControls && (
        <div className="ascii-sculpture-header font-mono">
          <span className="sculpture-dot">◈</span> 3D ASCII RENDER ENGINE 
          <span className="sculpture-tag">angel_sculpture.glb | res: 0.25</span>
        </div>
      )}

      <div className="ascii-sculpture-container" style={{ width: `${width}px`, height: `${height}px` }}>
        {/* Dedicated DOM node for Three.js AsciiEffect */}
        <div className="three-canvas-root" ref={canvasHolderRef} style={{ width: '100%', height: '100%' }} />

        {loading && (
          <div className="ascii-sculpture-loading font-mono">
            <span>⠋ rendering 3D ASCII...</span>
          </div>
        )}
        {error && (
          <div className="ascii-sculpture-error font-mono">
            <span>✕ {error}</span>
          </div>
        )}
      </div>

      {showControls && (
        <div className="ascii-controls-deck font-mono">
          <label className="control-item">
            <span>Spin:</span>
            <button
              type="button"
              className={`control-toggle ${autoRotate ? 'active' : ''}`}
              onClick={() => setAutoRotate(!autoRotate)}
            >
              {autoRotate ? '◉ ON' : '○ OFF'}
            </button>
          </label>
          <label className="control-item">
            <span>Scale: {Math.round(scale * 100)}%</span>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.2"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  )
}
