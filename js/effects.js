// Efectos de texto de la versión anterior del portfolio, reutilizables.

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Decodificado ---------- */
// El texto aparece como letras al azar que se van resolviendo de izquierda a
// derecha. onFrame(resuelto, ruido) se llama en cada paso; sirve tanto para
// texto HTML como para dibujar en un canvas. Devuelve una función para cortarlo.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
const DECODE_DURATION = 1100;
const NOISE_INTERVAL = 55;

const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

export function scramble(text, onFrame, onDone = () => {}) {
  const chars = [...text];
  const total = chars.length;

  if (prefersReducedMotion) {
    onFrame(text, '');
    onDone();
    return () => {};
  }

  let cancelled = false;
  let start = null;
  let lastNoise = -Infinity;
  let lastRevealed = -1;

  const step = (t) => {
    if (cancelled) return;
    if (start === null) start = t;
    const revealed = Math.min(total, Math.floor(((t - start) / DECODE_DURATION) * total));

    if (revealed !== lastRevealed || t - lastNoise > NOISE_INTERVAL) {
      const noise = chars.slice(revealed).map((c) => (c === ' ' ? ' ' : randomGlyph())).join('');
      onFrame(chars.slice(0, revealed).join(''), noise);
      lastNoise = t;
      lastRevealed = revealed;
    }

    if (revealed < total) requestAnimationFrame(step);
    else onDone();
  };
  requestAnimationFrame(step);

  return () => { cancelled = true; };
}

// Versión para un elemento HTML: lo que falta resolver va en gris.
export function scrambleElement(el, text) {
  const resolved = document.createTextNode('');
  const noise = document.createElement('span');
  noise.className = 'scramble-noise';
  el.replaceChildren(resolved, noise);

  return scramble(
    text,
    (done, rest) => {
      resolved.data = done;
      noise.textContent = rest;
    },
    () => { el.textContent = text; },
  );
}

/* ---------- Máquina de escribir en loop ---------- */
// Escribe cada palabra de data-words, la deja un rato, la borra y sigue.
export function typewriterLoop(container) {
  if (!container || container.dataset.typewriterStarted) return;
  container.dataset.typewriterStarted = 'true';

  const wordEl = container.querySelector('[data-typewriter-loop-word]');
  const words = (container.dataset.words || '')
    .split(',').map((w) => w.trim()).filter(Boolean);
  if (!wordEl || !words.length) return;

  if (prefersReducedMotion) {
    wordEl.textContent = words[0];
    return;
  }

  const caret = document.createElement('span');
  caret.className = 'typewriter-caret';
  caret.setAttribute('aria-hidden', 'true');

  const CHAR_DELAY = 65;
  const ERASE_DELAY = 35;
  const HOLD = 1700;
  const PAUSE_BETWEEN = 400;
  let wordIndex = 0;

  const typeWord = () => {
    const word = words[wordIndex];
    let i = 0;
    const step = () => {
      i++;
      wordEl.textContent = word.slice(0, i);
      wordEl.appendChild(caret);
      if (i < word.length) setTimeout(step, CHAR_DELAY);
      else setTimeout(eraseWord, HOLD);
    };
    step();
  };

  const eraseWord = () => {
    const word = words[wordIndex];
    let i = word.length;
    const step = () => {
      i--;
      wordEl.textContent = word.slice(0, Math.max(i, 0));
      wordEl.appendChild(caret);
      if (i > 0) setTimeout(step, ERASE_DELAY);
      else {
        wordIndex = (wordIndex + 1) % words.length;
        setTimeout(typeWord, PAUSE_BETWEEN);
      }
    };
    step();
  };

  typeWord();
}
