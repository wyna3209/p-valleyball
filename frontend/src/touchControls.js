// HTML-based touch controls — live outside Phaser canvas so they scale with the viewport,
// not with the game's internal coordinate system.

export const touch = { left: false, right: false, jump: false };

let container = null;

export function initTouchControls() {
  container = document.createElement('div');
  container.id = 'touch-controls';

  container.innerHTML = `
    <div class="tc-group tc-left">
      <button class="tc-btn" id="tc-left">&#8592;</button>
      <button class="tc-btn" id="tc-right">&#8594;</button>
    </div>
    <div class="tc-group tc-right">
      <button class="tc-btn tc-jump" id="tc-jump">&#8593;</button>
    </div>
  `;

  document.body.appendChild(container);

  bind('tc-left',  'left');
  bind('tc-right', 'right');
  bind('tc-jump',  'jump');
}

export function showTouchControls() {
  if (container) container.style.display = 'flex';
}

export function hideTouchControls() {
  if (container) container.style.display = 'none';
  // Also release all held inputs so nothing gets stuck
  touch.left = touch.right = touch.jump = false;
}

function bind(id, key) {
  const el = document.getElementById(id);
  if (!el) return;

  const press   = (e) => { e.preventDefault(); touch[key] = true;  el.classList.add('tc-active'); };
  const release = (e) => { e.preventDefault(); touch[key] = false; el.classList.remove('tc-active'); };

  el.addEventListener('touchstart',  press,   { passive: false });
  el.addEventListener('touchend',    release, { passive: false });
  el.addEventListener('touchcancel', release, { passive: false });

  // Mouse fallback for desktop testing
  el.addEventListener('mousedown',  () => { touch[key] = true;  el.classList.add('tc-active'); });
  el.addEventListener('mouseup',    () => { touch[key] = false; el.classList.remove('tc-active'); });
  el.addEventListener('mouseleave', () => { touch[key] = false; el.classList.remove('tc-active'); });
}
