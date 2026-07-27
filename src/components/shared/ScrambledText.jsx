import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './ScrambledText.css';

/**
 * ScrambledText component from React Bits (inspired by Tom Miller from GSAP community)
 * Implements mouse-proximity character scrambling with standalone open-source GSAP animations.
 */
const ScrambledText = ({
  radius = 100,
  duration = 1.2,
  speed = 0.5,
  scrambleChars = ' .:-=+*#@%&8MW$',
  className = '',
  style = {},
  children
}) => {
  const rootRef = useRef(null);
  const charsRef = useRef([]);

  useEffect(() => {
    if (!rootRef.current) return;

    const pEl = rootRef.current.querySelector('p') || rootRef.current;
    const textContent = typeof children === 'string' ? children : pEl.textContent;
    
    // Custom robust word/char splitting without requiring Club GSAP SplitText paid license!
    pEl.innerHTML = '';
    const charArray = [];
    const words = textContent.split(' ');
    
    words.forEach((word, wordIdx) => {
      const wordSpan = document.createElement('span');
      wordSpan.style.display = 'inline-block';
      wordSpan.style.whiteSpace = 'nowrap';
      
      Array.from(word).forEach((char) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'char';
        charSpan.style.display = 'inline-block';
        charSpan.textContent = char;
        charSpan.dataset.content = char;
        wordSpan.appendChild(charSpan);
        charArray.push(charSpan);
      });
      
      pEl.appendChild(wordSpan);
      if (wordIdx < words.length - 1) {
        const spaceSpan = document.createElement('span');
        spaceSpan.className = 'char';
        spaceSpan.style.display = 'inline-block';
        spaceSpan.innerHTML = '&nbsp;';
        spaceSpan.dataset.content = ' ';
        pEl.appendChild(spaceSpan);
        charArray.push(spaceSpan);
      }
    });

    charsRef.current = charArray;

    // High-performance GSAP scramble interval logic
    const activeTweens = new Map();

    const triggerScramble = (el, animDuration) => {
      const targetChar = el.dataset.content || '';
      if (targetChar === ' ' || activeTweens.has(el)) return;

      const totalSteps = Math.max(5, Math.floor((animDuration / (1 - Math.min(0.95, speed))) * 20));
      let currentStep = 0;
      const startTime = performance.now();

      const intervalId = setInterval(() => {
        currentStep++;
        if (currentStep >= totalSteps || (performance.now() - startTime) >= animDuration * 1000) {
          clearInterval(intervalId);
          el.textContent = targetChar;
          activeTweens.delete(el);
        } else {
          const randomIdx = Math.floor(Math.random() * scrambleChars.length);
          el.textContent = scrambleChars[randomIdx] || '*';
          gsap.fromTo(el, { scale: 1.15, color: '#fc5000' }, { scale: 1, color: 'inherit', duration: 0.15, overwrite: 'auto' });
        }
      }, 35);

      activeTweens.set(el, intervalId);
    };

    const handleMove = (e) => {
      charsRef.current.forEach((c) => {
        const rect = c.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);

        if (dist < radius) {
          triggerScramble(c, duration * (1 - dist / radius));
        }
      });
    };

    window.addEventListener('pointermove', handleMove);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      activeTweens.forEach((intervalId) => clearInterval(intervalId));
      activeTweens.clear();
    };
  }, [radius, duration, speed, scrambleChars, children]);

  return (
    <div ref={rootRef} className={`text-block ${className}`} style={style}>
      <p>{children}</p>
    </div>
  );
};

export default ScrambledText;
