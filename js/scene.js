import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import { scramble, prefersReducedMotion } from './effects.js';

gsap.registerPlugin(ScrollTrigger);

const MODEL_URL = 'models/laptop.glb';
// Textos de la pantalla de la laptop: se turnan, decodificándose uno tras otro.
const SCREEN_TEXTS = ['Natasha Paczko', 'Portfolio'];
const SCREEN_TEXT_HOLD = 3200; // milisegundos que queda cada texto
const SCREEN_BACKGROUND = '#0D0C11';

// Celulares y tablets: render más liviano para que el scroll no se trabe.
const isLowPower = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// La escena se renderiza a la resolución real de la pantalla, con un tope.
const MAX_PIXEL_RATIO = isLowPower ? 1.5 : 2;

const FOV = 30;
// Con distance: 1, cuánto de la pantalla ocupa la laptop (1 = justo al borde).
const FILL = 0.78;
// Cuánto tarda la cámara en alcanzar al scroll, en segundos: suaviza los tirones.
const CAMERA_LAG = isLowPower ? 0.18 : 0.28;

// Encuadres de cámara, uno por sección. El scroll pasa suavemente de uno al otro.
//   azimuth:   giro alrededor de la laptop, en grados (0 = de frente, negativo = desde la izquierda)
//   elevation: altura de la cámara, en grados por encima del teclado
//   distance:  1 = la laptop entera en pantalla; menos = más cerca
//   focus:     a dónde mira (0 = centro de la laptop, 1 = centro de su pantalla)
//   shiftX/Y:  corre la laptop en pantalla (fracción del ancho/alto) para dejar lugar al texto
//   spin:      giro de la laptop sobre sí misma, en grados (negativo = la pantalla
//              mira a la izquierda, positivo = a la derecha)
// En cada sección la pantalla de la laptop mira hacia el contenido: a la
// foto (izquierda) en "sobre-mi", a la lista (derecha) en "servicios", y de
// frente cuando el texto está arriba o abajo. En "proyectos" la fila de
// proyectos pasa por detrás y se ve en su pantalla.
const SHOTS_WIDE = {
  'inicio':    { azimuth: 0,   elevation: 20, distance: 1.12, focus: 1, shiftX: 0,     shiftY: 0.03,  spin: 0 },
  'sobre-mi':  { azimuth: 10,  elevation: 14, distance: 1.05, focus: 0, shiftX: 0.22,  shiftY: 0,     spin: -58 },
  'servicios': { azimuth: -10, elevation: 14, distance: 1.05, focus: 0, shiftX: -0.24, shiftY: 0,     spin: 58 },
  'proyectos': { azimuth: 0,   elevation: 8,  distance: 0.98, focus: 1, shiftX: 0,     shiftY: 0.1,   spin: 0 },
  'contacto':  { azimuth: 0,   elevation: 12, distance: 1.45, focus: 1, shiftX: 0,     shiftY: -0.1,  spin: 0 },
};

// Celular: menos giro, y la laptop siempre centrada a lo ancho y arriba,
// porque el texto va abajo.
const SHOTS_COMPACT = {
  'inicio':    { azimuth: 0,   elevation: 22, distance: 1.05, focus: 1, shiftX: 0, shiftY: 0.06, spin: 0 },
  'sobre-mi':  { azimuth: 0,   elevation: 18, distance: 1.15, focus: 0, shiftX: 0, shiftY: 0.24, spin: -34 },
  'servicios': { azimuth: 0,   elevation: 16, distance: 1.2,  focus: 0, shiftX: 0, shiftY: 0.26, spin: 0 },
  'proyectos': { azimuth: 0,   elevation: 8,  distance: 1,    focus: 1, shiftX: 0, shiftY: 0.07, spin: 0 },
  'contacto':  { azimuth: 0,   elevation: 14, distance: 1.3,  focus: 1, shiftX: 0, shiftY: 0.14, spin: 0 },
};

// Colores del fondo, uno por sección: negro profundo (background) y un
// resplandor apagado detrás de la laptop (glow). El negro manda y el color
// queda como un aura: así se ve sobrio y elegante. En Proyectos el
// resplandor es el más neutro, para que se luzcan las capturas. Al
// scrollear, la cámara va mezclando los colores de una sección con la otra.
const COLORS = {
  'inicio':    { background: '#080607', glow: '#4A2636' }, // rosa empolvado
  'sobre-mi':  { background: '#070609', glow: '#3A3048' }, // lila grisáceo
  'servicios': { background: '#080607', glow: '#44293A' }, // malva
  'proyectos': { background: '#070608', glow: '#2E2838' }, // lila muy oscuro
  'contacto':  { background: '#080607', glow: '#55293C' }, // rosa profundo
};

// Los colores se guardan como números sueltos (r, g, b) para poder mezclarlos
// igual que el resto del encuadre.
const COLOR_CHANNELS = Object.fromEntries(Object.entries(COLORS).map(([id, { background, glow }]) => {
  const bg = new THREE.Color(background);
  const light = new THREE.Color(glow);
  return [id, { bgR: bg.r, bgG: bg.g, bgB: bg.b, glowR: light.r, glowG: light.g, glowB: light.b }];
}));

// Panel de la pantalla (la parte negra, sin el marco), en coordenadas de la
// malla de la tapa. Está medido sobre la textura del modelo.
const DISPLAY = {
  left: -0.245,
  right: 0.245,
  bottom: { y: 0.0029, z: 0.0396 }, // borde del lado de la bisagra
  top: { y: 0.0789, z: 0.3236 },
  normal: new THREE.Vector3(0, -0.966, 0.259),
};
const DISPLAY_ASPECT = (DISPLAY.right - DISPLAY.left)
  / Math.hypot(DISPLAY.top.y - DISPLAY.bottom.y, DISPLAY.top.z - DISPLAY.bottom.z);

/* ---------- Modelo ---------- */
function toLitMaterial(original, maxAnisotropy) {
  const { map } = original;
  if (map) {
    // Filtrado suave: el modelo trae las texturas en modo pixelado, lo pisamos.
    // La anisotropía mantiene nítido el teclado cuando se ve en ángulo.
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = maxAnisotropy;
    map.needsUpdate = true;
  }
  // El modelo viene "unlit" (ignora las luces). Lambert le da sombreado difuso
  // por cara y sin brillos, fiel al estilo de la época.
  const material = new THREE.MeshLambertMaterial({ map, side: original.side });
  original.dispose();
  return material;
}

function prepareModel(model, maxAnisotropy) {
  const materials = new Map();
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (!materials.has(child.material)) {
      materials.set(child.material, toLitMaterial(child.material, maxAnisotropy));
    }
    child.material = materials.get(child.material);
  });

  // Centrada en el origen: la cámara gira alrededor de este punto.
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.sub(center);
  // Actualiza las posiciones de las piezas internas (pantalla, teclado), que
  // se miden después para apuntar la cámara y ubicar la sombra.
  model.updateMatrixWorld(true);
  return model;
}

// Mancha radial pintada en un canvas: blanca, con transparencia de centro a borde.
function createRadialTexture(stops) {
  const resolution = 128;
  const paint = document.createElement('canvas');
  paint.width = paint.height = resolution;
  const ctx = paint.getContext('2d');
  const half = resolution / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  stops.forEach(([offset, alpha]) => gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, resolution, resolution);
  return new THREE.CanvasTexture(paint);
}

// Sombra de contacto: una mancha suave bajo la base.
function createContactShadow(base) {
  const footprint = new THREE.Box3().setFromObject(base);
  const size = footprint.getSize(new THREE.Vector3());
  const center = footprint.getCenter(new THREE.Vector3());

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.5, size.z * 1.7),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: createRadialTexture([[0, 0.7], [0.6, 0.35], [1, 0]]),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(center.x, footprint.min.y - 0.002, center.z);
  shadow.renderOrder = -1;
  return shadow;
}

// Luz de color detrás de la laptop, que despega su silueta oscura del fondo.
// Es un sprite (siempre mira a la cámara), así acompaña a la laptop cuando
// la cámara la corre a un costado. Su color cambia con cada sección.
function createHalo() {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createRadialTexture([[0, 0.95], [0.35, 0.42], [1, 0]]),
    // Three.js dibuja los objetos transparentes después de los opacos, y el
    // halo quedaría encima de la laptop. Como "opaco" respeta el renderOrder y
    // se dibuja primero; la mezcla con el fondo se configura a mano.
    transparent: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: false,
    depthWrite: false,
  }));
  halo.scale.set(1.5, 1.5, 1);
  halo.renderOrder = -2;
  return halo;
}

/* ---------- Luces ---------- */
function addLights(scene) {
  // Ambiente: cielo frío arriba, rebote oscuro abajo.
  scene.add(new THREE.HemisphereLight(0xdde3ee, 0x161618, 1.6));

  // Principal: arriba, adelante y a la derecha, levemente cálida.
  const key = new THREE.DirectionalLight(0xfff2e2, 3.4);
  key.position.set(1, 1.8, 1.4);
  scene.add(key);

  // Relleno suave desde la izquierda para no perder el lado en sombra.
  const fill = new THREE.DirectionalLight(0xc8d0de, 1.1);
  fill.position.set(-1.6, 0.6, 0.8);
  scene.add(fill);

  // Contraluz: marca el borde de la tapa contra el fondo.
  const rim = new THREE.DirectionalLight(0xffffff, 4.5);
  rim.position.set(-0.8, 1.2, -1.8);
  scene.add(rim);
}

/* ---------- Pantalla de la laptop ---------- */
// Un rectángulo apoyado sobre el panel, apenas despegado (lift) para que no
// parpadee contra la tapa.
function createDisplayGeometry(lift) {
  const offset = DISPLAY.normal.clone().multiplyScalar(lift);
  const corner = (x, edge) => new THREE.Vector3(x, edge.y, edge.z).add(offset);
  const geometry = new THREE.BufferGeometry().setFromPoints([
    corner(DISPLAY.left, DISPLAY.bottom),
    corner(DISPLAY.right, DISPLAY.bottom),
    corner(DISPLAY.right, DISPLAY.top),
    corner(DISPLAY.left, DISPLAY.top),
  ]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

// Capa de abajo: el nombre y "Portfolio", turnándose, dibujados en un canvas.
function createNameLayer(requestRender) {
  const canvas = document.createElement('canvas');
  canvas.width = isLowPower ? 1024 : 1600;
  canvas.height = Math.round(canvas.width / DISPLAY_ASPECT);
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(createDisplayGeometry(0.0006), new THREE.MeshBasicMaterial({ map: texture }));

  const font = (size) => `600 ${size}px "Clash Display", system-ui, sans-serif`;
  ctx.font = font(100);
  // El texto más largo ocupa tres cuartos del ancho de la pantalla; todos
  // usan el mismo tamaño.
  const widest = Math.max(...SCREEN_TEXTS.map((text) => ctx.measureText(text).width));
  const fontSize = 100 * (canvas.width * 0.74) / widest;

  const draw = (text, resolved, noise) => {
    const { width, height } = canvas;
    ctx.fillStyle = SCREEN_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    // Resplandor rosa empolvado, el acento de la paleta.
    const glow = ctx.createRadialGradient(width / 2, height * 0.6, 0, width / 2, height * 0.6, width * 0.65);
    glow.addColorStop(0, 'rgba(216, 167, 184, 0.14)');
    glow.addColorStop(1, 'rgba(216, 167, 184, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.font = font(fontSize);
    ctx.textBaseline = 'middle';
    const x = (width - ctx.measureText(text).width) / 2;
    // Texto en rosa empolvado con un brillo suave, como un letrero de neón;
    // las letras que todavía no se resolvieron van en marfil.
    ctx.shadowColor = 'rgba(216, 167, 184, 0.6)';
    ctx.shadowBlur = fontSize * 0.3;
    ctx.fillStyle = '#D8A7B8';
    ctx.fillText(resolved, x, height / 2);
    ctx.fillStyle = 'rgba(244, 238, 235, 0.75)';
    ctx.fillText(noise, x + ctx.measureText(resolved).width, height / 2);
    ctx.shadowBlur = 0;

    texture.needsUpdate = true;
    requestRender();
  };

  // Pantalla encendida pero vacía hasta que arranca el decodificado.
  draw(SCREEN_TEXTS[0], '', '');

  let stop = () => {};
  let next = null;
  let current = 0;

  const pause = () => {
    stop();
    clearTimeout(next);
  };

  // Decodifica el texto actual, lo deja un rato y pasa al siguiente.
  const decode = () => {
    pause();
    const text = SCREEN_TEXTS[current];
    stop = scramble(text, (resolved, noise) => draw(text, resolved, noise), () => {
      next = setTimeout(() => {
        current = (current + 1) % SCREEN_TEXTS.length;
        decode();
      }, SCREEN_TEXT_HOLD);
    });
  };

  return { mesh, decode, pause };
}

// Capa de arriba: las capturas de los proyectos. Puede mostrar dos (A y B)
// una al lado de la otra y correrlas en horizontal: así la fila de proyectos
// de la sección Proyectos "pasa" por la pantalla. El panel hace de máscara:
// además, todo el conjunto entra desde abajo y sale hacia arriba.
function createImageLayer() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      mapA: { value: null },
      mapB: { value: null },
      fitA: { value: new THREE.Vector4(1, 1, 0, 0) }, // xy = repetición, zw = desplazamiento
      fitB: { value: new THREE.Vector4(1, 1, 0, 0) },
      uShift: { value: 0 }, // 0 = A centrada, 1 = B centrada
      uSlide: { value: 1 }, // 1 = abajo, fuera del panel; -1 = arriba
      uGapColor: { value: new THREE.Color(SCREEN_BACKGROUND) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D mapA;
      uniform sampler2D mapB;
      uniform vec4 fitA;
      uniform vec4 fitB;
      uniform float uShift;
      uniform float uSlide;
      uniform vec3 uGapColor;
      varying vec2 vUv;
      const float GAP = 0.08; // separación entre una captura y la siguiente
      void main() {
        vec2 local = vec2(vUv.x, vUv.y + uSlide);
        if (local.y < 0.0 || local.y > 1.0) discard;
        float x = local.x + uShift * (1.0 + GAP);
        if (x <= 1.0) {
          gl_FragColor = texture2D(mapA, vec2(x, local.y) * fitA.xy + fitA.zw);
        } else if (x >= 1.0 + GAP) {
          gl_FragColor = texture2D(mapB, vec2(x - 1.0 - GAP, local.y) * fitB.xy + fitB.zw);
        } else {
          gl_FragColor = vec4(uGapColor, 1.0);
        }
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(createDisplayGeometry(0.0012), material);
  mesh.visible = false;

  // Recorta la imagen para cubrir el panel, mostrando la parte de arriba
  // (como object-fit: cover + object-position: top).
  const setSlot = (slot, texture) => {
    const imageAspect = texture.image.width / texture.image.height;
    const fit = material.uniforms[`fit${slot}`].value;
    if (imageAspect > DISPLAY_ASPECT) {
      const repeat = DISPLAY_ASPECT / imageAspect;
      fit.set(repeat, 1, (1 - repeat) / 2, 0);
    } else {
      const repeat = imageAspect / DISPLAY_ASPECT;
      fit.set(1, repeat, 0, 1 - repeat);
    }
    material.uniforms[`map${slot}`].value = texture;
  };

  return { mesh, setSlot, shift: material.uniforms.uShift, slide: material.uniforms.uSlide };
}

function createLaptopScreen({ lid, renderer, requestRender }) {
  const nameLayer = createNameLayer(requestRender);
  const imageLayer = createImageLayer();
  lid.add(nameLayer.mesh, imageLayer.mesh);

  const loader = new THREE.TextureLoader();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const pending = new Map(); // src -> promesa de la textura
  const loaded = new Map();  // src -> textura lista

  const loadTexture = (src) => {
    if (!pending.has(src)) {
      pending.set(src, loader.loadAsync(src).then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAnisotropy;
        // Se sube a la placa de video antes de mostrarla: sin tirones al cambiar.
        renderer.initTexture(texture);
        loaded.set(src, texture);
        return texture;
      }));
    }
    return pending.get(src);
  };

  const { slide, shift } = imageLayer;
  const strip = { sources: [], position: 0 };
  let shown = 'name'; // qué hay en pantalla: 'name', 'image:<src>' o 'strip'
  let token = 0;

  // Fila de proyectos: en la posición 1.5, por ejemplo, se ve la mitad de la
  // segunda captura saliendo y la mitad de la tercera entrando.
  // La fila es infinita: después de la última captura vuelve la primera.
  const applyStrip = () => {
    if (shown !== 'strip' || !strip.sources.length) return;
    const total = strip.sources.length;
    const at = (i) => loaded.get(strip.sources[((i % total) + total) % total]);
    const index = Math.floor(strip.position);
    const a = at(index);
    const b = at(index + 1);
    if (!a || !b) return;
    imageLayer.setSlot('A', a);
    imageLayer.setSlot('B', b);
    shift.value = strip.position - index;
    requestRender();
  };

  // Cambia lo que muestra la pantalla: lo anterior sale hacia arriba y lo
  // nuevo entra desde abajo. prepare() deja listas las texturas.
  async function transitionTo(next, prepare) {
    if (next === shown) return;
    shown = next;
    if (next !== 'name') nameLayer.pause();
    const current = ++token;
    gsap.killTweensOf(slide);

    if (imageLayer.mesh.visible) {
      if (!prefersReducedMotion) {
        await gsap.to(slide, { value: -1, duration: 0.45, ease: 'power3.in', onUpdate: requestRender });
        if (current !== token) return;
      }
      imageLayer.mesh.visible = false;
      requestRender();
    }

    if (next === 'name') {
      nameLayer.decode();
      return;
    }

    try {
      await prepare();
    } catch (error) {
      console.error(error);
      return;
    }
    if (current !== token) return;

    imageLayer.mesh.visible = true;
    if (prefersReducedMotion) {
      slide.value = 0;
      requestRender();
      return;
    }
    slide.value = 1;
    gsap.to(slide, { value: 0, duration: 0.95, ease: 'expo.out', onUpdate: requestRender });
  }

  return {
    mesh: nameLayer.mesh,
    decodeName: nameLayer.decode,
    showName: () => transitionTo('name'),
    // Una sola captura (la que se toca en la galería del inicio).
    showImage: (src) => transitionTo(`image:${src}`, async () => {
      const texture = await loadTexture(src);
      imageLayer.setSlot('A', texture);
      imageLayer.setSlot('B', texture);
      shift.value = 0;
    }),
    // La fila de proyectos; después se mueve con setStripPosition.
    showStrip: (sources) => transitionTo('strip', async () => {
      strip.sources = sources;
      await Promise.all(sources.map(loadTexture));
      applyStrip();
    }),
    setStripPosition: (position) => {
      strip.position = position;
      applyStrip();
    },
    preload: (sources) => sources.forEach((src) => loadTexture(src).catch(() => {})),
  };
}

/* ---------- Recorrido con scroll ---------- */
// La cámara se ubica según la posición real de cada sección: llega al
// encuadre de una sección cuando esa sección toca el borde de arriba, y lo
// mantiene mientras se scrollea una sección más alta que la pantalla.
function followScroll({ sections, rig, applyRig, onSectionChange, onLayout }) {
  const compactQuery = window.matchMedia('(max-width: 767px)');
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ease = gsap.parseEase('power1.inOut');

  let stops = [];
  let shots = [];
  let viewportHeight = 0;
  let measuredWidth = 0;
  let active = -1;
  let target = window.scrollY;
  let current = target;

  const blend = (from, to, p) => {
    for (const key in to) rig[key] = from[key] + (to[key] - from[key]) * p;
  };

  const place = (y) => {
    // Sección activa: la que ocupa el centro de la pantalla.
    const center = y + viewportHeight / 2;
    let index = 0;
    stops.forEach((top, i) => { if (center >= top) index = i; });
    if (index !== active) {
      active = index;
      onSectionChange(sections[index].dataset.section);
    }

    if (reduceQuery.matches) {
      // Sin recorrido: la cámara cambia de encuadre de golpe.
      blend(shots[index], shots[index], 1);
    } else {
      let from = shots[0];
      let to = shots[0];
      let p = 1;
      for (let i = 1; i < shots.length; i++) {
        const end = stops[i];
        const start = Math.max(end - viewportHeight, stops[i - 1]);
        if (y >= end) {
          from = to = shots[i];
          continue;
        }
        if (y > start) {
          from = shots[i - 1];
          to = shots[i];
          p = ease((y - start) / (end - start));
        }
        break;
      }
      blend(from, to, p);
    }
    applyRig();
  };

  const measure = () => {
    viewportHeight = document.documentElement.clientHeight;
    measuredWidth = window.innerWidth;
    stops = sections.map((section) => section.getBoundingClientRect().top + window.scrollY);
    const table = compactQuery.matches ? SHOTS_COMPACT : SHOTS_WIDE;
    shots = sections.map(({ dataset: { section } }) => ({ ...table[section], ...COLOR_CHANNELS[section] }));
    onLayout(table);
    place(current);
  };

  measure();
  // Se vuelve a medir si cambia el alto del contenido (fuentes, imágenes).
  new ResizeObserver(measure).observe(sections[0].parentElement);
  window.addEventListener('resize', () => {
    // En celular, la barra del navegador cambia el alto al scrollear: no
    // hace falta recalcular el recorrido por eso (daría saltos).
    if (isTouch && window.innerWidth === measuredWidth) return;
    measure();
  });

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => { target = self.scroll(); },
  });

  // En cada cuadro, la cámara se acerca un poco más a la posición del scroll.
  gsap.ticker.add((time, deltaTime) => {
    if (Math.abs(target - current) < 0.5) {
      if (current === target) return;
      current = target;
    } else {
      const catchUp = reduceQuery.matches ? 1 : 1 - Math.exp(-deltaTime / (CAMERA_LAG * 1000));
      current += (target - current) * catchUp;
    }
    place(current);
  });
}

/* ---------- Escena ---------- */
// Carga la laptop y arma el recorrido. Devuelve la pantalla de la laptop y
// una función para saber si un punto de la página cae sobre ella.
export async function initScene({ canvas, sections, onProgress, onSectionChange }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: isLowPower ? 'low-power' : 'high-performance',
    });
  } catch (error) {
    console.error(error);
    throw new Error('webgl');
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
  addLights(scene);

  // Three.js ya llegó: falta el modelo.
  onProgress(0.35);

  let gltf;
  try {
    [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL, (event) => {
        if (event.lengthComputable) onProgress(0.35 + 0.55 * (event.loaded / event.total));
      }),
      // La pantalla de la laptop dibuja el nombre con esta fuente.
      document.fonts.load('600 100px "Clash Display"').catch(() => {}),
    ]);
  } catch (error) {
    console.error(error);
    throw new Error('model');
  }

  const laptop = prepareModel(gltf.scene, renderer.capabilities.getMaxAnisotropy());
  const radius = new THREE.Box3().setFromObject(laptop).getBoundingSphere(new THREE.Sphere()).radius;

  // La laptop y su sombra giran juntas (el "spin" de la sección Contacto).
  const pivot = new THREE.Group();
  pivot.add(laptop, createContactShadow(laptop.getObjectByName('LaptopKeyboard') ?? laptop));
  const halo = createHalo();
  scene.add(halo, pivot);

  // Pedidos de render: se juntan y se dibuja una sola vez por cuadro.
  let needsRender = false;
  const requestRender = () => { needsRender = true; };

  const lid = laptop.getObjectByName('LaptopScreen') ?? laptop;
  const screen = createLaptopScreen({ lid, renderer, requestRender });
  laptop.updateMatrixWorld(true);
  const screenCenter = new THREE.Box3().setFromObject(screen.mesh).getCenter(new THREE.Vector3());

  const viewport = { width: 1, height: 1 };
  const modelCenter = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const background = new THREE.Color();
  let fitDistance = 1;

  // Estado actual de la cámara y los colores: el recorrido mueve estos
  // números y applyRig los traduce a la escena.
  const rig = { ...SHOTS_WIDE.inicio, ...COLOR_CHANNELS.inicio };

  const applyRig = () => {
    lookAt.lerpVectors(modelCenter, screenCenter, rig.focus);
    camera.position.setFromSphericalCoords(
      fitDistance * rig.distance,
      THREE.MathUtils.degToRad(90 - rig.elevation),
      THREE.MathUtils.degToRad(rig.azimuth),
    ).add(lookAt);
    camera.lookAt(lookAt);
    // Corre la imagen como un lente descentrado: la laptop se mueve en
    // pantalla sin que cambie la perspectiva.
    const { width, height } = viewport;
    camera.setViewOffset(width, height, -rig.shiftX * width, rig.shiftY * height, width, height);
    pivot.rotation.y = THREE.MathUtils.degToRad(rig.spin);

    halo.material.color.setRGB(rig.glowR, rig.glowG, rig.glowB);
    renderer.setClearColor(background.setRGB(rig.bgR, rig.bgG, rig.bgB), 1);
    requestRender();
  };

  const resize = () => {
    // Ancho sin la barra de scroll, igual que el canvas y las secciones.
    viewport.width = document.documentElement.clientWidth;
    viewport.height = window.innerHeight;
    // Se lee en cada cambio de tamaño: varía al mover la ventana a otro monitor.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(viewport.width, viewport.height, false);
    camera.aspect = viewport.width / viewport.height;

    // Distancia a la que la laptop entra completa, en pantallas anchas y en
    // celulares en vertical.
    const verticalHalf = THREE.MathUtils.degToRad(FOV / 2);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * camera.aspect);
    fitDistance = radius / Math.sin(Math.min(verticalHalf, horizontalHalf)) / FILL;
    applyRig();
  };

  // Puntos de la laptop (sin girar), para saber dónde queda en pantalla.
  const laptopPoints = [];
  laptop.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      laptopPoints.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
    }
  });

  // El texto se acomoda alrededor de la laptop: se calcula dónde queda en el
  // encuadre de una sección y se pasa al CSS como variables, por ejemplo
  // --hero-laptop-left, -right, -top, -bottom y --hero-screen-y (la altura
  // del centro de su pantalla). Sirve para encuadres sin giro (spin 0).
  const publishFrame = (name, shot) => {
    const current = { ...rig };
    Object.assign(rig, shot);
    applyRig();
    camera.updateMatrixWorld();

    const point = new THREE.Vector3();
    const toPixels = (v) => [
      ((v.x + 1) / 2) * viewport.width,
      ((1 - v.y) / 2) * viewport.height,
    ];
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    laptopPoints.forEach((p) => {
      const [x, y] = toPixels(point.copy(p).project(camera));
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    });
    const [, screenY] = toPixels(point.copy(screenCenter).project(camera));

    Object.assign(rig, current);
    applyRig();

    const style = document.documentElement.style;
    style.setProperty(`--${name}-laptop-left`, `${Math.round(left)}px`);
    style.setProperty(`--${name}-laptop-right`, `${Math.round(right)}px`);
    style.setProperty(`--${name}-laptop-top`, `${Math.round(top)}px`);
    style.setProperty(`--${name}-laptop-bottom`, `${Math.round(bottom)}px`);
    style.setProperty(`--${name}-screen-y`, `${Math.round(screenY)}px`);
  };

  window.addEventListener('resize', resize);
  resize();
  followScroll({
    sections,
    rig,
    applyRig,
    onSectionChange,
    // "Diseño" / "web" del inicio, y la fila de proyectos.
    onLayout: (table) => {
      publishFrame('hero', table.inicio);
      publishFrame('work', table.proyectos);
    },
  });

  gsap.ticker.add(() => {
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  });
  // El primer render compila los shaders con la carga todavía tapando la
  // escena, así la aparición no da un tirón.
  renderer.render(scene, camera);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    screen,
    // ¿El punto (en pixeles de la ventana) cae sobre la pantalla de la laptop?
    hitTestScreen(clientX, clientY) {
      pointer.set((clientX / viewport.width) * 2 - 1, -(clientY / viewport.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(screen.mesh, false).length > 0;
    },
  };
}
