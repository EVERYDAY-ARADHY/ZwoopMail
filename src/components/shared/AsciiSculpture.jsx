import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js'
import './AsciiSculpture.css'

export default function AsciiSculpture({
  modelPath = '/models/angel_sculpture.glb',
  width = '100%',
  height = '100%',
  autoRotateSpeed = 0.18, // Calm, serene museum speed
  scaleMultiplier = 3.4,  // Enormous statue size safely framed inside full screen
}) {
  const canvasHolderRef = useRef(null)
  const [loading, setLoading] = useState(true)

  const sceneRef = useRef(null)
  const pivotRef = useRef(null)

  useEffect(() => {
    if (!canvasHolderRef.current) return

    const widthPx = canvasHolderRef.current.clientWidth || window.innerWidth || 1200
    const heightPx = canvasHolderRef.current.clientHeight || window.innerHeight || 900

    // 1. Scene setup with solid RGB(0,0,0) so void space registers as 0 brightness
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    // Central pivot group for seamless self-revolution on the horizontal plane
    const pivot = new THREE.Group()
    
    // RAGE-PROOF PILLAR PLACEMENT:
    // By placing the pivot at (-1.35, -0.65, 0) inside a full-screen canvas, the sculpture 
    // lives cleanly in the bottom-left corner! The lower body sinks below the physical monitor floor,
    // while the majestic crown and wide rotating wings have 1000px+ of open transparent room above 
    // and around them—ZERO CUTOFFS POSSIBLE!
    pivot.position.set(-1.35, -0.65, 0)
    scene.add(pivot)
    pivotRef.current = pivot

    // 2. Camera setup pulled back cleanly to Z: 5.6
    const camera = new THREE.PerspectiveCamera(44, widthPx / heightPx, 0.1, 1000)
    camera.position.set(0, 0, 5.6)
    camera.lookAt(0, 0, 0)

    // 3. Crisp sculptural stage lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.8)
    directionalLight.position.set(5, 12, 8)
    scene.add(directionalLight)

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.6)
    rimLight.position.set(-5, 5, -5)
    scene.add(rimLight)

    // 4. Renderer setup with opaque black clear color (Alpha = 1)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(widthPx, heightPx)
    renderer.setClearColor(0x000000, 1)

    // 5. AsciiEffect setup
    const effect = new AsciiEffect(renderer, '   .:-=+*#@', {
      invert: true,
      resolution: 0.22,
      color: false,
    })
    effect.setSize(widthPx, heightPx)
    effect.domElement.style.color = '#fc5000'
    effect.domElement.style.backgroundColor = 'transparent'
    effect.domElement.style.fontFamily = "var(--font-mono), 'JetBrains Mono', 'Courier New', monospace"
    effect.domElement.style.lineHeight = '0.92'
    effect.domElement.style.fontWeight = '700'
    effect.domElement.style.pointerEvents = 'none'

    while (canvasHolderRef.current.firstChild) {
      canvasHolderRef.current.removeChild(canvasHolderRef.current.firstChild)
    }
    canvasHolderRef.current.appendChild(effect.domElement)

    // 6. Load GLB Model and attach to pivot
    const loader = new GLTFLoader()
    loader.load(
      modelPath,
      (gltf) => {
        const root = gltf.scene

        const box = new THREE.Box3().setFromObject(root)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        
        const normalizedScale = (1.5 / maxDim) * scaleMultiplier
        root.scale.set(normalizedScale, normalizedScale, normalizedScale)
        
        root.position.x = -center.x * normalizedScale
        root.position.y = -center.y * normalizedScale
        root.position.z = -center.z * normalizedScale

        root.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.roughness = 0.2
            child.material.metalness = 0.3
          }
        })

        pivot.add(root)
        setLoading(false)
      },
      undefined,
      (err) => {
        console.error('Failed to load GLB model:', err)
        setLoading(false)
      }
    )

    // 7. Endless ambient horizontal plane revolution loop (pure 60fps spin)
    let animationFrameId
    let lastTime = performance.now()

    const animate = (currentTime) => {
      animationFrameId = requestAnimationFrame(animate)
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1)
      lastTime = currentTime

      if (pivotRef.current) {
        pivotRef.current.rotation.y += autoRotateSpeed * (delta || 0.016)
      }

      effect.render(scene, camera)
    }
    requestAnimationFrame(animate)

    const handleResize = () => {
      if (!canvasHolderRef.current) return
      const newWidth = canvasHolderRef.current.clientWidth || window.innerWidth
      const newHeight = canvasHolderRef.current.clientHeight || window.innerHeight
      if (newWidth === 0 || newHeight === 0) return
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
      effect.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      renderer.dispose()
      if (canvasHolderRef.current && effect.domElement.parentNode === canvasHolderRef.current) {
        canvasHolderRef.current.removeChild(effect.domElement)
      }
    }
  }, [modelPath, autoRotateSpeed, scaleMultiplier])

  return (
    <div className="ascii-sculpture-screensaver">
      <div className="three-canvas-root" ref={canvasHolderRef} style={{ width: '100%', height: '100%' }} />

      {loading && (
        <div className="ascii-sculpture-loading font-mono">
          <span>⠋ materializing 3D ASCII geometry...</span>
        </div>
      )}
    </div>
  )
}
