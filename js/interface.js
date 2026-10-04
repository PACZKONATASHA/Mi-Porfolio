import { gsap } from 'gsap';
import { PROJECTS, CONTACT, TOOLS } from './data.js';
import { prefersReducedMotion, scrambleElement, typewriterLoop } from './effects.js';

const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Menú en celular ---------- */
function setupMenu() {
  const menuBtn = document.querySelector('[data-menu-btn]');
  const menu = document.querySelector('[data-menu]');
  if (!menuBtn || !menu) return;

  const close = () => {
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú');
    menu.classList.remove('is-open');
  };
  menuBtn.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    menuBtn.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---------- Aparición al scrollear ---------- */
function setupReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      typewriterLoop(entry.target.querySelector('[data-typewriter-loop]'));
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

/* ---------- Inicio: anillo de proyectos alrededor de la laptop ---------- */
// Las capturas giran solas en círculo alrededor de la laptop, y se pueden
// arrastrar para girarlas. La parte de abajo del anillo se desvanece: se ve
// como un arco. Al tocar una captura, ese proyecto se muestra en la pantalla
// de la laptop.
function setupHeroRing(onSpotlight) {
  const hero = document.querySelector('[data-hero]');
  const ring = document.querySelector('[data-hero-ring]');
  if (!hero || !ring) return { start() {}, clear() {} };

  const COPIES = 3;              // cada proyecto aparece tres veces en el anillo
  const AUTO_SPEED = 360 / 80;   // grados por segundo cuando gira solo
  const RELEASE = 0.8;           // segundos que tarda en volver al giro suave al soltar
  const MAX_SPEED = 540;         // tope del envión al soltar, en grados por segundo
  const DRAG_THRESHOLD = 6;      // pixeles antes de que el gesto cuente como arrastre
  const FADE_FROM = 62;          // ángulo (desde arriba) en el que empieza a desvanecerse
  const FADE_TO = 104;           // ángulo en el que ya no se ve
  const LEAN = 22;               // inclinación 3D de cada tarjeta, en grados
  const CARD_RATIO = 0.6;        // alto de la tarjeta / ancho
  const MIN_CARD = 72;           // ancho mínimo de una tarjeta, en pixeles
  const CLEARANCE = 10;          // espacio libre entre las tarjetas y la laptop
  const HOVER_GROW = 1.07;       // lo que crece una tarjeta con el mouse encima (ver CSS)

  const toRad = (deg) => deg * (Math.PI / 180);
  const toDeg = (rad) => rad * (180 / Math.PI);
  // Lleva cualquier ángulo al rango -180..180 (0 = arriba).
  const wrapAngle = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const smoothstep = (from, to, x) => {
    const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
    return t * t * (3 - 2 * t);
  };

  const total = PROJECTS.length * COPIES;
  const cards = [];
  for (let i = 0; i < total; i++) {
    const index = i % PROJECTS.length;
    const project = PROJECTS[index];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ring-card';
    card.dataset.project = index;
    // Sólo la primera vuelta se recorre con el teclado; las copias no se anuncian.
    if (i < PROJECTS.length) {
      card.setAttribute('aria-label', `Ver ${project.nombre} en la pantalla de la laptop`);
      card.setAttribute('aria-pressed', 'false');
    } else {
      card.tabIndex = -1;
      card.setAttribute('aria-hidden', 'true');
    }
    const face = document.createElement('span');
    face.className = 'ring-card-face';
    const img = document.createElement('img');
    img.src = project.imagen;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    face.appendChild(img);
    card.appendChild(face);
    ring.appendChild(card);
    cards.push({ el: card, base: (360 / total) * i });
  }

  // angle: cuánto giró el anillo, en grados. spread: 0 = las tarjetas juntas
  // sobre la laptop, 1 = en su lugar (la entrada las abre). appear: opacidad general.
  const state = { angle: 0, spread: 0.6, appear: 0 };
  let velocity = 0;
  let direction = 1;
  let dirty = true;

  // Forma del anillo: una elipse centrada en la laptop (centerX/Y, radiusX/Y)
  // y el tamaño de las tarjetas. La calcula layout().
  const geo = { centerX: 0, centerY: 0, radiusX: 0, radiusY: 0, cardW: 0, cardH: 0 };

  // Dónde va una tarjeta que está a theta grados de la parte de arriba.
  const poseAt = (theta, { radiusX, radiusY }, spread = 1) => {
    const t = toRad(theta);
    const away = Math.abs(theta);
    return {
      x: radiusX * Math.sin(t) * spread,
      y: -radiusY * Math.cos(t) * spread,
      // Cada tarjeta sigue la curva del anillo, con el borde de afuera hacia afuera.
      tilt: Math.atan2(radiusY * Math.sin(t), radiusX * Math.cos(t)),
      scale: 1 - 0.16 * Math.min(away / 100, 1) ** 2,
      opacity: 1 - smoothstep(FADE_FROM, FADE_TO, away),
    };
  };

  const render = () => {
    dirty = false;
    cards.forEach(({ el, base }) => {
      const pose = poseAt(wrapAngle(base + state.angle), geo, state.spread);
      const opacity = pose.opacity * state.appear;
      const x = geo.centerX + pose.x;
      const y = geo.centerY + pose.y;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${toDeg(pose.tilt).toFixed(2)}deg) perspective(800px) rotateX(${LEAN}deg) scale(${pose.scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      // Las que casi no se ven no se pueden tocar.
      el.classList.toggle('is-faded', opacity < 0.35);
    });
  };

  // ¿Alguna tarjeta visible pisaría la laptop? Se prueba todo el recorrido,
  // cada 2 grados, con la tarjeta girada y agrandada como con el mouse encima.
  const hitsLaptop = (shape, laptop) => {
    const halfW = (laptop.right - laptop.left) / 2 + CLEARANCE;
    const halfH = (laptop.bottom - laptop.top) / 2 + CLEARANCE;
    for (let theta = -FADE_TO; theta <= FADE_TO; theta += 2) {
      const pose = poseAt(theta, shape);
      if (pose.opacity < 0.05) continue;
      const half = (pose.scale * HOVER_GROW) / 2;
      const cos = Math.abs(Math.cos(pose.tilt));
      const sin = Math.abs(Math.sin(pose.tilt));
      const extentX = (shape.cardW * cos + shape.cardH * sin) * half;
      const extentY = (shape.cardW * sin + shape.cardH * cos) * half;
      if (Math.abs(pose.x) < halfW + extentX && Math.abs(pose.y) < halfH + extentY) return true;
    }
    return false;
  };

  // Arma la elipse alrededor de la laptop. js/scene.js pasa dónde queda la
  // laptop en el inicio (--hero-laptop-left/right/top/bottom). La tarjeta de
  // arriba va justo debajo del header; si así pisaría la laptop, primero se
  // achican las tarjetas y, si no alcanza, se agranda el anillo.
  const layoutSource = document.documentElement.style;
  let layoutKey = '';

  const layout = () => {
    const width = hero.clientWidth;
    const height = hero.clientHeight;
    const read = (side, fallback) => parseFloat(layoutSource.getPropertyValue(`--hero-laptop-${side}`)) || fallback;
    const laptop = {
      left: read('left', width * 0.36),
      right: read('right', width * 0.64),
      top: read('top', height * 0.32),
      bottom: read('bottom', height * 0.7),
    };
    // Un poco debajo del header (en celular el header es más bajo: no subir de 66px).
    const ceiling = Math.max(parseFloat(getComputedStyle(hero).paddingTop) - 14, 66);
    const laptopW = laptop.right - laptop.left;

    geo.centerX = (laptop.left + laptop.right) / 2;
    geo.centerY = (laptop.top + laptop.bottom) / 2;

    // Para cada tamaño de tarjeta (de más grande a más chica) se prueba abrir
    // el anillo hacia los costados hasta que no toque la laptop.
    const maxRadiusX = width * 0.47;
    const shape = { cardW: Math.min(Math.max(width * 0.145, 130), 240, height * 0.34) };
    let grow = 0;
    fit: for (let tries = 0; tries < 80; tries++) {
      shape.cardH = shape.cardW * CARD_RATIO;
      shape.radiusY = Math.max(geo.centerY - ceiling - shape.cardH / 2, 1) + grow;
      const narrowest = Math.min(laptopW / 2 + shape.cardW * 1.7, maxRadiusX);
      for (shape.radiusX = narrowest; shape.radiusX <= maxRadiusX + grow; shape.radiusX += 10) {
        if (!hitsLaptop(shape, laptop)) break fit;
      }
      if (shape.cardW > MIN_CARD) shape.cardW = Math.max(shape.cardW * 0.95, MIN_CARD);
      else grow += 6;
    }
    Object.assign(geo, shape);
    ring.style.setProperty('--ring-card-w', `${geo.cardW.toFixed(1)}px`);
    dirty = true;
  };

  // Se rearma si cambia el tamaño del inicio o si la laptop se movió.
  const relayoutIfNeeded = () => {
    const key = `${hero.clientWidth}x${hero.clientHeight}|${layoutSource.cssText}`;
    if (key === layoutKey) return;
    layoutKey = key;
    layout();
  };

  /* --- Giro: solo, con envión al soltar, o quieto --- */
  let visible = true;
  let hovering = false;
  let focused = false;
  let drag = null;

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(hero);

  gsap.ticker.add((time, deltaTime) => {
    if (!visible || document.hidden) return;
    relayoutIfNeeded();
    if (!drag?.moved) {
      const dt = Math.min(deltaTime, 100) / 1000;
      // Mientras el mouse está sobre una tarjeta o hay una elegida con el
      // teclado, se queda quieto para poder hacer clic tranquila.
      const still = prefersReducedMotion || hovering || focused;
      const cruise = still ? 0 : direction * AUTO_SPEED;
      velocity += (cruise - velocity) * (1 - Math.exp(-dt / RELEASE));
      if (Math.abs(velocity) > 0.01) {
        state.angle += velocity * dt;
        dirty = true;
      }
    }
    if (dirty) render();
  });

  /* --- Arrastrar para girar --- */
  // El ángulo del puntero se mide sobre la elipse del anillo: la tarjeta que
  // se agarra acompaña al dedo o al mouse.
  const pointerAngle = (x, y) => toDeg(Math.atan2((x - drag.cx) / geo.radiusX, (drag.cy - y) / geo.radiusY));
  let suppressClick = false;

  hero.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !geo.radiusX || !geo.radiusY) return;
    const rect = hero.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cx: rect.left + geo.centerX,
      cy: rect.top + geo.centerY,
      moved: false,
    };
  });

  hero.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.last = pointerAngle(drag.x, drag.y);
      drag.time = e.timeStamp;
      velocity = 0;
      gsap.killTweensOf(state, 'angle');
      hero.setPointerCapture(e.pointerId);
      hero.classList.add('is-dragging');
    }
    const current = pointerAngle(e.clientX, e.clientY);
    // Cerca del centro el ángulo cambia muy rápido: ahí el giro se suaviza.
    const reach = Math.hypot((e.clientX - drag.cx) / geo.radiusX, (e.clientY - drag.cy) / geo.radiusY);
    const delta = wrapAngle(current - drag.last) * Math.min(reach / 0.5, 1);
    drag.last = current;
    state.angle += delta;
    dirty = true;
    const elapsed = Math.max(e.timeStamp - drag.time, 1) / 1000;
    velocity = velocity * 0.5 + (delta / elapsed) * 0.5;
    drag.time = e.timeStamp;
  });

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      // El clic que llega al soltar no cuenta como elegir una tarjeta.
      suppressClick = true;
      setTimeout(() => { suppressClick = false; });
      hero.classList.remove('is-dragging');
      // Si se soltó quieto, no hay envión.
      if (e.timeStamp - drag.time > 80 || prefersReducedMotion) velocity = 0;
      velocity = Math.min(Math.max(velocity, -MAX_SPEED), MAX_SPEED);
      // Sigue girando para el lado en que se lo empujó.
      if (Math.abs(velocity) > AUTO_SPEED) direction = Math.sign(velocity);
    }
    drag = null;
  };
  hero.addEventListener('pointerup', endDrag);
  hero.addEventListener('pointercancel', endDrag);

  /* --- Elegir un proyecto --- */
  // Gira el anillo hasta dejar esa tarjeta arriba, sobre la laptop.
  const bringToTop = (card) => {
    velocity = 0;
    gsap.to(state, {
      angle: state.angle - wrapAngle(card.base + state.angle),
      duration: prefersReducedMotion ? 0 : 0.9,
      ease: 'power3.inOut',
      overwrite: 'auto',
      onUpdate: () => { dirty = true; },
    });
  };

  const mark = (index) => {
    cards.forEach(({ el }) => {
      const isSelected = Number(el.dataset.project) === index;
      el.classList.toggle('is-selected', isSelected);
      if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(isSelected));
    });
  };

  // Tocar una tarjeta la muestra en la laptop; tocar fuera vuelve al nombre.
  hero.addEventListener('click', (e) => {
    if (suppressClick) return;
    const card = cards.find(({ el }) => el === e.target.closest('.ring-card'));
    if (card) bringToTop(card);
    const index = card ? Number(card.el.dataset.project) : null;
    mark(index);
    onSpotlight(index);
  });

  if (supportsHover) {
    cards.forEach(({ el }) => {
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
      el.addEventListener('pointerleave', () => { hovering = false; });
    });
  }

  // Con el teclado, la tarjeta enfocada gira hasta quedar arriba y el anillo
  // espera quieto.
  ring.addEventListener('focusin', (e) => {
    const card = cards.find(({ el }) => el === e.target);
    if (!card || !e.target.matches(':focus-visible')) return;
    focused = true;
    bringToTop(card);
  });
  ring.addEventListener('focusout', (e) => {
    if (!ring.contains(e.relatedTarget)) focused = false;
  });

  relayoutIfNeeded();
  render();

  return {
    // Entrada: las tarjetas se abren desde la laptop mientras giran.
    start() {
      if (prefersReducedMotion) {
        Object.assign(state, { spread: 1, appear: 1 });
        dirty = true;
        return;
      }
      state.angle -= 70;
      gsap.to(state, {
        angle: state.angle + 70,
        spread: 1,
        appear: 1,
        duration: 1.8,
        ease: 'expo.out',
        onUpdate: () => { dirty = true; },
      });
    },
    clear() { mark(null); },
  };
}

/* ---------- Proyectos ---------- */
// Las capturas pasan solas, en fila, por detrás de la laptop. La que llega al
// centro se ve en la pantalla de la laptop (onStripMove), se queda unos
// segundos con el botón "Ver proyecto" encendido y después pasa la siguiente.
// La fila es infinita: después del último proyecto vuelve el primero.
function setupProjects({ onStripMove, hitTestScreen }) {
  const section = document.querySelector('[data-projects]');
  if (!section) return;

  const els = {
    strip: section.querySelector('.work-strip'),
    track: section.querySelector('[data-work-track]'),
    info: section.querySelector('[data-work-info]'),
    name: section.querySelector('[data-work-name]'),
    type: section.querySelector('[data-work-type]'),
    role: section.querySelector('[data-work-role]'),
    stack: section.querySelector('[data-work-stack]'),
    cta: section.querySelector('[data-work-link]'),
    github: section.querySelector('[data-work-github]'),
    countCurrent: section.querySelector('[data-count-current]'),
    countTotal: section.querySelector('[data-count-total]'),
    controls: section.querySelector('.work-controls'),
    prev: section.querySelector('[data-work-prev]'),
    next: section.querySelector('[data-work-next]'),
    progress: section.querySelector('[data-work-progress]'),
    cursorLabel: document.querySelector('[data-cursor-label]'),
  };

  const count = PROJECTS.length;
  const HOLD = 3.2; // segundos con cada proyecto en el centro
  const MOVE = 1.2; // segundos que tarda en pasar al siguiente
  // Qué tan cerca del centro tiene que estar una captura para encender el botón.
  const CENTER_TOLERANCE = 0.12;
  const pad = (n) => String(n).padStart(2, '0');
  const wrap = (value) => ((value % count) + count) % count;

  els.countTotal.textContent = pad(count);

  // Tres vueltas de tarjetas: a los costados siempre hay capturas. Sólo la
  // vuelta del medio se puede recorrer con el teclado.
  const SETS = 3;
  const cards = [];
  for (let set = 0; set < SETS; set++) {
    PROJECTS.forEach((p, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'work-card';
      card.setAttribute('aria-label', `Mostrar ${p.nombre}`);
      if (set !== 1) {
        card.tabIndex = -1;
        card.setAttribute('aria-hidden', 'true');
      }
      const img = document.createElement('img');
      img.src = p.imagen;
      img.alt = '';
      img.decoding = 'async';
      card.appendChild(img);
      card.addEventListener('click', () => goToProject(i));
      els.track.appendChild(card);
      cards.push(card);
    });
  }

  function fillInfo(p, index) {
    els.name.textContent = p.nombre;
    els.type.textContent = p.tipo;

    els.role.hidden = !p.rol;
    els.role.textContent = p.rol ? `Rol: ${p.rol}` : '';

    els.stack.replaceChildren(...(p.tecnologias || []).map((tech) => {
      const li = document.createElement('li');
      li.textContent = tech;
      return li;
    }));
    els.stack.hidden = !els.stack.children.length;

    els.github.hidden = !p.github;
    if (p.github) els.github.href = p.github;

    els.countCurrent.textContent = pad(index + 1);
  }

  /* --- Qué proyecto está en el centro --- */
  let active = -1;
  let centered = null;
  let swapTimer;

  const setActive = (index) => {
    if (index === active) return;
    active = index;
    const p = PROJECTS[index];
    els.cta.href = p.link;
    els.cta.setAttribute('aria-label', `Ver ${p.nombre} (se abre en otra pestaña)`);
    if (prefersReducedMotion) els.progress.style.transform = `scaleX(${(index + 1) / count})`;
    // El texto cambia con un fundido corto.
    els.info.classList.remove('is-active');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      fillInfo(p, index);
      els.info.classList.add('is-active');
    }, prefersReducedMotion ? 0 : 160);
  };

  const setCentered = (value) => {
    if (value === centered) return;
    centered = value;
    els.cta.setAttribute('aria-disabled', String(!value));
    if (value) els.cta.removeAttribute('tabindex');
    else els.cta.setAttribute('tabindex', '-1');
  };

  /* --- La fila --- */
  // position cuenta proyectos: 0 = el primero en el centro, 1.5 = a mitad de
  // camino entre el segundo y el tercero. Crece sin límite al dar vueltas.
  const strip = { position: 0 };
  let target = 0;
  let step = 0;

  const render = () => {
    const centerCard = count + wrap(strip.position); // en la vuelta del medio
    els.track.style.transform = `translateX(${-centerCard * step}px)`;
    onStripMove(strip.position);

    cards.forEach((card, i) => {
      const away = Math.abs(i - centerCard);
      card.style.setProperty('--away', away.toFixed(3));
      // La que está detrás de la laptop no se puede tocar (no se ve).
      card.classList.toggle('is-behind', away < 0.9);
    });

    const nearest = Math.round(strip.position);
    setActive(wrap(nearest));
    setCentered(Math.abs(strip.position - nearest) < CENTER_TOLERANCE);
  };

  // El tamaño de las tarjetas depende de la laptop: se mide cada vez que cambia.
  new ResizeObserver(() => {
    step = cards[1].offsetLeft - cards[0].offsetLeft;
    render();
  }).observe(els.track);

  /* --- Pasa sola --- */
  // La barra de abajo se llena mientras el proyecto está en el centro; al
  // completarse, pasa el siguiente.
  let hold = null;
  let move = null;
  const pauses = new Set(['fuera de pantalla']);

  const startHold = () => {
    hold?.kill();
    hold = null;
    if (prefersReducedMotion) return;
    hold = gsap.fromTo(els.progress, { scaleX: 0 }, {
      scaleX: 1,
      duration: HOLD,
      ease: 'none',
      paused: pauses.size > 0,
      onComplete: () => goTo(target + 1),
    });
  };

  function goTo(next) {
    target = next;
    hold?.kill();
    hold = null;
    move?.kill();
    if (prefersReducedMotion) {
      strip.position = next;
      render();
      return;
    }
    gsap.set(els.progress, { scaleX: 0 });
    move = gsap.to(strip, {
      position: next,
      duration: MOVE,
      ease: 'power2.inOut',
      onUpdate: render,
      onComplete: startHold,
    });
  }

  // Va al proyecto elegido por el camino más corto.
  function goToProject(index) {
    let delta = index - wrap(target);
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    if (delta) goTo(target + delta);
  }

  const setPaused = (reason, value) => {
    if (value) pauses.add(reason);
    else pauses.delete(reason);
    if (!hold) return;
    if (pauses.size) hold.pause();
    else hold.resume();
  };

  // Se queda quieta mientras no se ve, si la pestaña está oculta, o mientras
  // el mouse o el teclado están sobre la fila, la info o los controles (para
  // poder hacer clic tranquila).
  new IntersectionObserver(([entry]) => {
    setPaused('fuera de pantalla', !entry.isIntersecting);
  }, { threshold: 0.6 }).observe(section);
  document.addEventListener('visibilitychange', () => setPaused('pestaña oculta', document.hidden));
  [els.strip, els.info, els.controls].forEach((el) => {
    el.addEventListener('pointerenter', () => setPaused(el, true));
    el.addEventListener('pointerleave', () => setPaused(el, false));
  });
  section.addEventListener('focusin', () => setPaused('teclado', true));
  section.addEventListener('focusout', () => setPaused('teclado', false));

  els.prev.addEventListener('click', () => goTo(target - 1));
  els.next.addEventListener('click', () => goTo(target + 1));

  render();
  startHold();

  // Con mouse: sobre la pantalla de la laptop aparece "Ver proyecto" y el
  // clic abre el proyecto que está en el centro.
  if (supportsHover && els.cursorLabel) {
    const setOver = (over) => {
      section.classList.toggle('is-over-screen', over);
      els.cursorLabel.classList.toggle('is-active', over);
      setPaused('pantalla', over);
    };
    section.addEventListener('mousemove', (e) => {
      els.cursorLabel.style.setProperty('--x', `${e.clientX}px`);
      els.cursorLabel.style.setProperty('--y', `${e.clientY}px`);
      setOver(centered && hitTestScreen(e.clientX, e.clientY) && !e.target.closest('a, button'));
    });
    section.addEventListener('mouseleave', () => setOver(false));
    // Al scrollear, la laptop se mueve debajo del cursor quieto.
    window.addEventListener('scroll', () => setOver(false), { passive: true });
    section.addEventListener('click', (e) => {
      if (e.target.closest('a, button') || !centered) return;
      if (hitTestScreen(e.clientX, e.clientY)) {
        window.open(PROJECTS[active].link, '_blank', 'noopener');
      }
    });
  }
}

/* ---------- Herramientas ---------- */
function renderTools() {
  const list = document.querySelector('[data-tools]');
  if (!list || !TOOLS.length) return;
  TOOLS.forEach((tool) => {
    const li = document.createElement('li');
    li.textContent = tool;
    list.appendChild(li);
  });
  list.hidden = false;
}

/* ---------- Contacto ---------- */
function renderContact() {
  const nav = document.querySelector('[data-contact-links]');
  if (!nav) return;

  const links = [
    CONTACT.email && { href: `mailto:${CONTACT.email}`, label: 'Email' },
    CONTACT.linkedin && { href: CONTACT.linkedin, label: 'LinkedIn', external: true },
    CONTACT.github && { href: CONTACT.github, label: 'GitHub', external: true },
    CONTACT.cv && { href: CONTACT.cv, label: 'CV', download: true },
  ].filter(Boolean);

  links.forEach(({ href, label, external, download }) => {
    const a = document.createElement('a');
    a.className = 'contact-link';
    a.href = href;
    a.textContent = label;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    if (download) a.download = '';
    nav.appendChild(a);
  });
  nav.hidden = !links.length;
}

/* ---------- Arranque ---------- */
export function initInterface({ onSpotlight, onStripMove, hitTestScreen }) {
  setupMenu();
  setupReveal();
  const heroRing = setupHeroRing(onSpotlight);
  setupProjects({ onStripMove, hitTestScreen });
  renderTools();
  renderContact();

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  const heroWords = document.querySelectorAll('[data-hero-word]');

  return {
    // Animación de entrada del título, cuando se va la pantalla de carga.
    start() {
      heroWords.forEach((word) => scrambleElement(word, word.textContent));
      heroRing.start();
    },
    clearSpotlight: heroRing.clear,
  };
}
