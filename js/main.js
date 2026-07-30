(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Page reveal curtain + tipeo en loop (reutilizable) ---------- */
  const curtain = document.querySelector('[data-reveal-curtain]');
  const heroTypewriter = document.querySelector('.hero [data-typewriter-loop]');

  const startTypewriterLoop = (container) => {
    if (!container || container.dataset.typewriterStarted) return;
    container.dataset.typewriterStarted = 'true';

    const wordEl = container.querySelector('[data-typewriter-loop-word]');
    const words = (container.dataset.words || '')
      .split(',').map(w => w.trim()).filter(Boolean);
    if (!wordEl || !words.length) return;

    if (prefersReducedMotion) {
      wordEl.textContent = words[0];
      return;
    }

    const caret = document.createElement('span');
    caret.className = 'hero-caret';
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
  };

  if (curtain) {
    window.addEventListener('load', () => {
      const hideDelay = prefersReducedMotion ? 0 : 150;
      setTimeout(() => curtain.classList.add('is-hidden'), hideDelay);
      setTimeout(() => startTypewriterLoop(heroTypewriter), prefersReducedMotion ? 0 : hideDelay + 550);
    });
  } else {
    startTypewriterLoop(heroTypewriter);
  }

  /* ---------- Mobile menu ---------- */
  const menuBtn = document.getElementById('menuBtn');
  const menuMobile = document.getElementById('menuMobile');

  if (menuBtn && menuMobile) {
    const closeMenu = () => {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuMobile.classList.remove('is-open');
    };
    const toggleMenu = () => {
      const isOpen = menuMobile.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(isOpen));
    };

    menuBtn.addEventListener('click', toggleMenu);
    menuMobile.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---------- Scroll reveal ---------- */
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if (revealTargets.length) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          const nestedTypewriter = entry.target.querySelector('[data-typewriter-loop]');
          if (nestedTypewriter) startTypewriterLoop(nestedTypewriter);
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealTargets.forEach(el => revealObserver.observe(el));
  }

  /* ---------- Proyectos destacados ---------- */
  // rol, tecnologias y github: completar con datos reales. Si quedan vacíos, esos
  // bloques no se muestran (ver setProject) — no se inventa contenido.
  const PROJECTS = [
    {
      nombre: 'Golden Detailing',
      tipo: 'Landing Page simple',
      descripcion: 'Muestra un servicio, producto o emprendimiento de forma clara y directa, con botón directo a WhatsApp.',
      rol: '',
      tecnologias: [],
      imagen: 'img/golden-detailing.png',
      link: 'https://golden-detailing.vercel.app/',
      github: '',
    },
    {
      nombre: 'Barra de Access',
      tipo: 'Landing Page con formulario',
      descripcion: 'Suma un formulario propio: la consulta del cliente se envía directo por WhatsApp.',
      rol: '',
      tecnologias: [],
      imagen: 'img/barra-de-access.png',
      link: 'https://web-barradeaccess.vercel.app/',
      github: '',
    },
    {
      nombre: 'Mala Male',
      tipo: 'Página con varias secciones',
      descripcion: 'Una página más completa, con varias secciones para mostrar más información del negocio.',
      rol: '',
      tecnologias: [],
      imagen: 'img/mala-male.png',
      link: 'https://proyecto-mala-male.vercel.app/',
      github: '',
    },
    {
      nombre: 'DELoi3D',
      tipo: 'Catálogo con carrito a WhatsApp',
      descripcion: 'Catálogo de productos con carrito: el pedido se arma y se envía por WhatsApp.',
      rol: '',
      tecnologias: [],
      imagen: 'img/deloi3d.png',
      link: 'https://de-loi3-d.vercel.app/',
      github: '',
    },
  ];

  /* ---------- Hero: estrellas brillando sobre la foto ---------- */
  const heroStars = document.querySelector('[data-hero-stars]');
  if (heroStars) {
    const STAR_COUNT = 48;
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = document.createElement('span');
      star.className = 'hero-star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.setProperty('--size', `${2.5 + Math.random() * 3.5}px`);
      star.style.setProperty('--dur', `${1.8 + Math.random() * 2.4}s`);
      star.style.setProperty('--delay', `${Math.random() * 5}s`);
      heroStars.appendChild(star);
    }
  }

  /* ---------- Hero: galería oscura, las fotos se descubren al acercar el cursor ---------- */
  const heroSection = document.querySelector('.hero');
  const heroCursor = document.querySelector('[data-hero-cursor]');
  const heroGallery = document.querySelector('[data-hero-gallery]');
  const supportsHoverHero = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (heroSection && heroCursor && heroGallery) {
    // En mouse el radio es más ajustado (apunta con precisión); en touch se
    // agranda porque el dedo tapa el punto exacto y es menos preciso.
    const REVEAL_RADIUS = supportsHoverHero ? 130 : 170;
    const FADE_RADIUS = supportsHoverHero ? 320 : 380;
    const GOLDEN_ANGLE = 137.5;

    const items = PROJECTS.map((project, i) => {
      const angle = (GOLDEN_ANGLE * i + 25) * (Math.PI / 180);
      const rx = 40;  // % de radio horizontal alrededor del centro
      const ry = 32;  // % de radio vertical alrededor del centro
      const xPct = 50 + rx * Math.cos(angle);
      const yPct = 50 + ry * Math.sin(angle);

      const el = document.createElement('div');
      el.className = 'hero-gallery-item';
      el.style.left = `${xPct}%`;
      el.style.top = `${yPct}%`;

      const img = document.createElement('img');
      img.src = project.imagen;
      img.alt = '';
      el.appendChild(img);
      heroGallery.appendChild(el);

      return el;
    });

    const updateReveal = (x, y) => {
      const rect = heroSection.getBoundingClientRect();
      items.forEach((el) => {
        const ix = (parseFloat(el.style.left) / 100) * rect.width;
        const iy = (parseFloat(el.style.top) / 100) * rect.height;
        const dist = Math.hypot(x - ix, y - iy);
        const t = 1 - (dist - REVEAL_RADIUS) / (FADE_RADIUS - REVEAL_RADIUS);
        const opacity = Math.max(0, Math.min(1, t));
        el.style.opacity = opacity;
        el.classList.toggle('is-near', opacity > 0.6);
      });
    };

    const hideAll = () => {
      items.forEach((el) => {
        el.style.opacity = 0;
        el.classList.remove('is-near');
      });
    };

    if (supportsHoverHero) {
      heroSection.addEventListener('mousemove', (e) => {
        const rect = heroSection.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        heroCursor.style.left = `${x}px`;
        heroCursor.style.top = `${y}px`;
        updateReveal(x, y);
      });

      heroSection.addEventListener('mouseenter', () => {
        heroCursor.classList.add('is-active');
      });

      heroSection.addEventListener('mouseleave', () => {
        heroCursor.classList.remove('is-active');
        hideAll();
      });
    } else {
      // Táctil: se revela con el dedo, sin tocar preventDefault para no
      // interferir con el scroll normal de la página.
      const moveCursorTo = (x, y) => {
        heroCursor.style.left = `${x}px`;
        heroCursor.style.top = `${y}px`;
      };

      heroSection.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = heroSection.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        moveCursorTo(x, y);
        heroCursor.classList.add('is-active');
        updateReveal(x, y);
      }, { passive: true });

      heroSection.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = heroSection.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        moveCursorTo(x, y);
        updateReveal(x, y);
      }, { passive: true });

      heroSection.addEventListener('touchend', () => {
        heroCursor.classList.remove('is-active');
        hideAll();
      }, { passive: true });
    }
  }

  const workSection = document.getElementById('proyectos');

  if (workSection) {
    const els = {
      img: workSection.querySelector('[data-work-img]'),
      links: workSection.querySelectorAll('[data-work-link]'),
      num: workSection.querySelector('[data-work-num]'),
      name: workSection.querySelector('[data-work-name]'),
      type: workSection.querySelector('[data-work-type]'),
      desc: workSection.querySelector('[data-work-desc]'),
      role: workSection.querySelector('[data-work-role]'),
      stack: workSection.querySelector('[data-work-stack]'),
      github: workSection.querySelector('[data-work-github]'),
      info: workSection.querySelector('[data-work-info]'),
      visual: workSection.querySelector('[data-work-visual]'),
      countCurrent: workSection.querySelector('[data-count-current]'),
      names: workSection.querySelector('[data-work-names]'),
      prev: workSection.querySelector('[data-work-prev]'),
      next: workSection.querySelector('[data-work-next]'),
      progress: workSection.querySelector('[data-work-progress]'),
      cursorLabel: workSection.querySelector('[data-cursor-label]'),
    };

    let current = 0;

    PROJECTS.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.nombre;
      if (i === 0) btn.classList.add('is-active');
      btn.addEventListener('click', () => setProject(i));
      els.names.appendChild(btn);
    });

    function setProject(index) {
      current = (index + PROJECTS.length) % PROJECTS.length;
      const p = PROJECTS[current];

      els.info.classList.remove('is-active');
      els.img.classList.remove('is-loaded');

      const apply = () => {
        els.img.src = p.imagen;
        els.img.alt = `Captura del proyecto ${p.nombre}`;
        els.links.forEach(link => { link.href = p.link; });
        els.num.textContent = String(current + 1).padStart(2, '0');
        els.name.textContent = p.nombre;
        els.type.textContent = p.tipo;
        els.desc.textContent = p.descripcion;

        if (p.rol) {
          els.role.textContent = `Rol: ${p.rol}`;
          els.role.hidden = false;
        } else {
          els.role.hidden = true;
        }

        els.stack.innerHTML = '';
        if (p.tecnologias && p.tecnologias.length) {
          p.tecnologias.forEach(tech => {
            const li = document.createElement('li');
            li.textContent = tech;
            els.stack.appendChild(li);
          });
          els.stack.hidden = false;
        } else {
          els.stack.hidden = true;
        }

        if (p.github) {
          els.github.href = p.github;
          els.github.hidden = false;
        } else {
          els.github.hidden = true;
        }

        els.countCurrent.textContent = String(current + 1).padStart(2, '0');
        els.progress.style.width = `${((current + 1) / PROJECTS.length) * 100}%`;

        els.names.querySelectorAll('button').forEach((btn, i) => {
          btn.classList.toggle('is-active', i === current);
        });

        requestAnimationFrame(() => els.info.classList.add('is-active'));
      };

      if (prefersReducedMotion) {
        apply();
      } else {
        setTimeout(apply, 120);
      }
    }

    els.img.addEventListener('load', () => els.img.classList.add('is-loaded'));
    els.prev.addEventListener('click', () => setProject(current - 1));
    els.next.addEventListener('click', () => setProject(current + 1));

    setProject(0);

    /* Cursor label sigue al mouse (se desactiva en touch) */
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (supportsHover && els.visual && els.cursorLabel) {
      els.visual.addEventListener('mousemove', (e) => {
        const rect = els.visual.getBoundingClientRect();
        els.cursorLabel.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px) translate(-50%, -50%) scale(1)`;
      });
    }
  }

  /* ---------- Stack / herramientas ---------- */
  // Completar con las tecnologías y herramientas reales que uses. Si queda
  // vacío, la sección permanece oculta (no se inventa contenido).
  const TOOLS = [];

  const stackSection = document.querySelector('[data-stack]');
  const stackList = document.querySelector('[data-stack-list]');
  if (stackSection && stackList && TOOLS.length) {
    TOOLS.forEach(tool => {
      const li = document.createElement('li');
      li.textContent = tool;
      stackList.appendChild(li);
    });
    stackSection.hidden = false;
  }

  /* ---------- Footer: contacto ---------- */
  // Completar con los datos reales. Cada enlace solo aparece si su valor
  // no está vacío (no se inventa contenido de contacto).
  const CONTACT = {
    email: '',      // ej: 'natasha@ejemplo.com'
    linkedin: '',   // ej: 'https://www.linkedin.com/in/...'
    github: '',     // ej: 'https://github.com/...'
    cv: '',         // ej: 'files/CV-Natasha-Paczko.pdf'
  };

  const footerLinks = document.querySelector('[data-footer-links]');
  if (footerLinks) {
    if (CONTACT.email) {
      const a = document.createElement('a');
      a.href = `mailto:${CONTACT.email}`;
      a.textContent = 'Email';
      footerLinks.appendChild(a);
    }
    if (CONTACT.linkedin) {
      const a = document.createElement('a');
      a.href = CONTACT.linkedin;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'LinkedIn';
      footerLinks.appendChild(a);
    }
    if (CONTACT.github) {
      const a = document.createElement('a');
      a.href = CONTACT.github;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'GitHub';
      footerLinks.appendChild(a);
    }
    if (CONTACT.cv) {
      const a = document.createElement('a');
      a.href = CONTACT.cv;
      a.download = '';
      a.textContent = 'CV';
      footerLinks.appendChild(a);
    }
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();
