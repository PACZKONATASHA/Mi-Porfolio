import { PROJECTS } from './data.js';
import { initInterface } from './interface.js';
import { initScene } from './scene.js';

const sceneEl = document.querySelector('[data-scene]');
const loaderEl = document.querySelector('[data-loader]');
const loaderBar = loaderEl.querySelector('[data-loader-bar]');
const loaderCells = [...loaderEl.querySelectorAll('[data-loader-cell]')];
const loaderPct = loaderEl.querySelector('[data-loader-pct]');
const loaderMessage = loaderEl.querySelector('[data-loader-message]');
const loaderContinue = loaderEl.querySelector('[data-loader-continue]');

const ERROR_MESSAGES = {
  webgl: 'Tu navegador no puede mostrar gráficos 3D. Probá con otro navegador o activá la aceleración por hardware.',
  model: 'No se pudo cargar el modelo 3D. Recargá la página para intentar de nuevo.',
};

/* ---------- Pantalla de carga ---------- */
function setProgress(fraction) {
  if (loaderEl.dataset.state) return;
  const value = Math.round(Math.min(Math.max(fraction, 0), 1) * 100);
  const filled = Math.round((value / 100) * loaderCells.length);
  loaderBar.setAttribute('aria-valuenow', value);
  loaderPct.textContent = `${value}%`;
  loaderCells.forEach((cell, i) => cell.classList.toggle('is-filled', i < filled));
}

function hideLoader() {
  loaderEl.dataset.state = 'done';
  sceneEl.classList.add('is-ready');
}

/* ---------- Qué muestra la pantalla de la laptop ---------- */
// En Proyectos, la fila de capturas que pasa por la pantalla; en el inicio,
// la foto que se tocó en la galería; en el resto, el nombre.
const state = { section: 'inicio', spotlight: null, strip: 0 };
let scene3d = null;

function syncScreen() {
  if (!scene3d) return;
  const { screen } = scene3d;
  if (state.section === 'proyectos') {
    screen.showStrip(PROJECTS.map((p) => p.imagen));
    screen.setStripPosition(state.strip);
  } else if (state.section === 'inicio' && state.spotlight !== null) {
    screen.showImage(PROJECTS[state.spotlight].imagen);
  } else {
    screen.showName();
  }
}

const ui = initInterface({
  onSpotlight: (index) => {
    state.spotlight = index;
    syncScreen();
  },
  // La fila de proyectos se movió: la pantalla de la laptop la acompaña.
  onStripMove: (position) => {
    state.strip = position;
    scene3d?.screen.setStripPosition(position);
  },
  hitTestScreen: (x, y) => scene3d?.hitTestScreen(x, y) ?? false,
});

initScene({
  canvas: document.querySelector('[data-scene-canvas]'),
  sections: [...document.querySelectorAll('[data-section]')],
  onProgress: setProgress,
  onSectionChange: (id) => {
    state.section = id;
    if (id !== 'inicio' && state.spotlight !== null) {
      state.spotlight = null;
      ui.clearSpotlight();
    }
    syncScreen();
  },
}).then(
  (api) => {
    scene3d = api;
    api.screen.preload(PROJECTS.map((p) => p.imagen));
    syncScreen();
    setProgress(1);
    hideLoader();
    // Las animaciones de entrada arrancan con la pantalla de carga ya yéndose.
    setTimeout(ui.start, 350);
    setTimeout(api.screen.decodeName, 750);
  },
  (error) => {
    console.error(error);
    // Sin 3D, el resto del sitio funciona igual: se puede seguir sin la laptop.
    loaderEl.dataset.state = 'error';
    loaderMessage.textContent = ERROR_MESSAGES[error.message] ?? ERROR_MESSAGES.model;
    loaderContinue.hidden = false;
    loaderContinue.addEventListener('click', () => {
      loaderEl.dataset.state = 'done';
      ui.start();
    }, { once: true });
  },
);
