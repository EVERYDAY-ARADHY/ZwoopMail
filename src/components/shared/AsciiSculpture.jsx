import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js'
import './AsciiSculpture.css'

/**
 * Sweeping wall-to-wall ASCII Matrix Wave that fills the entire left 50% of the screen
 * and crossfades buttery-smoothly into the 3D sculpture without any choppiness.
 */
function AsciiRainLoader({ isFading }) {
  const [gridText, setGridText] = useState('')

  useEffect(() => {
    const chars = "      .:-=+*#@"
    const rows = 120
    const cols = 110
    let frameId
    let startTime = performance.now()

    const update = (now) => {
      frameId = requestAnimationFrame(update)
      const t = (now - startTime) * 0.0022
      let result = ''

      for (let r = 0; r < rows; r++) {
        let rowStr = ''
        for (let c = 0; c < cols; c++) {
          const wave1 = Math.sin(c * 0.12 + t * 2.8 + r * 0.08)
          const wave2 = Math.cos(r * 0.14 - t * 2.0 + c * 0.1)
          const rain = Math.sin((r * 0.35) - (t * 3.5) + Math.sin(c * 0.25) * 2.5)
          
          const combined = (wave1 + wave2 + rain) / 3
          let normalized = Math.max(0, Math.min(1, (combined + 1) / 2))
          
          const rightEdgeFade = c > cols * 0.85 ? Math.max(0, (cols - c) / (cols * 0.15)) : 1
          normalized = Math.min(1, Math.max(0, normalized * rightEdgeFade))

          const charIdx = Math.floor(normalized * (chars.length - 1))
          rowStr += chars[charIdx]
        }
        result += rowStr + '\n'
      }
      setGridText(result)
    }

    frameId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div className={`ascii-sculpture-loading font-mono ${isFading ? 'fade-out-wave' : ''}`}>
      <pre className="ascii-rain-canvas" aria-hidden="true">{gridText}</pre>
    </div>
  )
}

export default function AsciiSculpture({
  modelPath = '/models/angel_sculpture.glb',
  width = '100%',
  height = '100%',
  autoRotateSpeed = 0.18, // Calm, serene museum speed
  scaleMultiplier = 3.4,  // Enormous statue size safely framed inside full screen
}) {
  const canvasHolderRef = useRef(null)
  
  // Two-stage transition state for ultra-smooth cinematic metamorphosis
  const [modelReady, setModelReady] = useState(false)
  const [unmountLoader, setUnmountLoader] = useState(false)

  const sceneRef = useRef(null)
  const pivotRef = useRef(null)

  useEffect(() => {
    if (!canvasHolderRef.current) return

    const widthPx = canvasHolderRef.current.clientWidth || window.innerWidth || 1200
    const heightPx = canvasHolderRef.current.clientHeight || window.innerHeight || 900

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    sceneRef.current = scene

    const pivot = new THREE.Group()
    pivot.position.set(-1.35, -0.65, 0)
    scene.add(pivot)
    pivotRef.current = pivot

    const camera = new THREE.PerspectiveCamera(44, widthPx / heightPx, 0.1, 1000)
    camera.position.set(0, 0, 5.6)
    camera.lookAt(0, 0, 0)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3.8)
    directionalLight.position.set(5, 12, 8)
    scene.add(directionalLight)

    const rimLight = new THREE.DirectionalLight(0xffffff, 1.6)
    rimLight.position.set(-5, 5, -5)
    scene.add(rimLight)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(widthPx, heightPx)
    renderer.setClearColor(0x000000, 1)

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
        
        // GPU Warm-up buffer: Give WebGL and AsciiEffect 300ms to compile shaders and paint initial frames
        // cleanly before starting the seamless CSS opacity crossfade!
        setTimeout(() => {
          setModelReady(true)
          // After 1.4s crossfade concludes, gracefully unmount the wave from memory
          setTimeout(() => {
            setUnmountLoader(true)
          }, 1450)
        }, 300)
      },
      undefined,
      (err) => {
        console.error('Failed to load GLB model:', err)
        setModelReady(true)
        setUnmountLoader(true)
      }
    )

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
      <div 
        className={`three-canvas-root ${modelReady ? 'model-visible' : ''}`} 
        ref={canvasHolderRef} 
        style={{ width: '100%', height: '100%' }} 
      />

      {!unmountLoader && <AsciiRainLoader isFading={modelReady} />}
    </div>
  )
}
