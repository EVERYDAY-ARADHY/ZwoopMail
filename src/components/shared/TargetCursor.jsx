import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import './TargetCursor.css';

export default function TargetCursor({
  targetSelector = '.cursor-target, button, a, select, [role="button"], .email-item, .attention-item, .sidebar-stream, .sidebar-link, .ai-action-btn, .btn, .email-view-reader-toggle, .sidebar-logo, .login-card Button',
  cursorColor = '#fc5000'
}) {
  const cornersRef = useRef([]);
  const activeTargetRef = useRef(null);
  const mousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const lastMousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const activeMotionRef = useRef(0);
  const isLockedRef = useRef(false);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) || window.innerWidth <= 768;
  }, []);

  useEffect(() => {
    if (isMobile) return;

    // 100% Native hardware pointer restored everywhere for zero latency!
    document.body.style.cursor = 'auto';

    const corners = Array.from(document.querySelectorAll('.hud-target-corner'));
    cornersRef.current = corners;

    gsap.set(corners, { opacity: 0, scale: 0.85 }); // Reticle invisible by default when roaming

    const moveHandler = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      const elUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
      const isInput = elUnderMouse && elUnderMouse.closest('input, textarea, [contenteditable="true"]');

      if (isInput) {
        if (isLockedRef.current || activeTargetRef.current) {
          isLockedRef.current = false;
          activeTargetRef.current = null;
          gsap.to(corners, { opacity: 0, scale: 0.85, duration: 0.12, overwrite: 'auto' });
        }
        return;
      }

      // Check for interactive target underneath the native pointer
      const targetedEl = elUnderMouse ? elUnderMouse.closest(targetSelector) : null;

      if (targetedEl) {
        if (activeTargetRef.current !== targetedEl || !isLockedRef.current) {
          activeTargetRef.current = targetedEl;
          isLockedRef.current = true;
          gsap.to(corners, { opacity: 1, scale: 1, duration: 0.15, ease: 'power2.out', overwrite: 'auto' });
        }
      } else {
        if (isLockedRef.current || activeTargetRef.current) {
          activeTargetRef.current = null;
          isLockedRef.current = false;
          gsap.to(corners, { opacity: 0, scale: 0.85, duration: 0.15, ease: 'power2.out', overwrite: 'auto' });
        }
      }
    };

    window.addEventListener('mousemove', moveHandler, { passive: true });

    // Zero-latency HUD reticle calculation loop
    const tickerFn = () => {
      const mouseX = mousePosRef.current.x;
      const mouseY = mousePosRef.current.y;
      const target = activeTargetRef.current;

      if (isLockedRef.current && target && target.isConnected) {
        const rect = target.getBoundingClientRect();
        
        // Enforce 38x38px minimum reticle geometry so tiny icon buttons (like ✕) never squish
        const width = Math.max(rect.width, 38);
        const height = Math.max(rect.height, 38);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const borderWidth = 3;
        const cornerSize = 14;

        // Exact screen coordinates for each corner bracket
        const positions = [
          { x: centerX - width / 2 - borderWidth, y: centerY - height / 2 - borderWidth }, // TL
          { x: centerX + width / 2 + borderWidth - cornerSize, y: centerY - height / 2 - borderWidth }, // TR
          { x: centerX + width / 2 + borderWidth - cornerSize, y: centerY + height / 2 + borderWidth - cornerSize }, // BR
          { x: centerX - width / 2 - borderWidth, y: centerY + height / 2 + borderWidth - cornerSize }  // BL
        ];

        // Teeny tiny micro-vibrations ONLY active when pointer is moving; dead silent when stagnant!
        const now = performance.now() * 0.02;
        const dx = mouseX - lastMousePosRef.current.x;
        const dy = mouseY - lastMousePosRef.current.y;
        const speed = Math.sqrt(dx * dx + dy * dy);
        lastMousePosRef.current = { x: mouseX, y: mouseY };

        activeMotionRef.current = gsap.utils.interpolate(activeMotionRef.current, Math.min(1, speed * 0.35), 0.25);
        if (activeMotionRef.current < 0.02) activeMotionRef.current = 0;

        const vibeAmplitude = 0.75 * activeMotionRef.current;

        cornersRef.current.forEach((corner, i) => {
          const vibeX = Math.sin(now + i * 1.5) * vibeAmplitude;
          const vibeY = Math.cos(now + i * 2.0) * vibeAmplitude;

          gsap.set(corner, {
            x: positions[i].x + vibeX,
            y: positions[i].y + vibeY
          });
        });
      } else if (isLockedRef.current) {
        // Immediate clean up if DOM target detached
        isLockedRef.current = false;
        activeTargetRef.current = null;
        gsap.to(cornersRef.current, { opacity: 0, scale: 0.85, duration: 0.12 });
      }
    };

    gsap.ticker.add(tickerFn);

    const scrollHandler = () => {
      if (isLockedRef.current && activeTargetRef.current) {
        const rect = activeTargetRef.current.getBoundingClientRect();
        const mouseX = mousePosRef.current.x;
        const mouseY = mousePosRef.current.y;
        if (mouseX < rect.left || mouseX > rect.right || mouseY < rect.top || mouseY > rect.bottom) {
          isLockedRef.current = false;
          activeTargetRef.current = null;
          gsap.to(cornersRef.current, { opacity: 0, scale: 0.85, duration: 0.12 });
        }
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    return () => {
      gsap.ticker.remove(tickerFn);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('scroll', scrollHandler);
    };
  }, [isMobile, targetSelector, cursorColor]);

  if (isMobile) return null;

  return (
    <div className="hud-target-overlay">
      <div className="hud-target-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="hud-target-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="hud-target-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="hud-target-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>
  );
}
