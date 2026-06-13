// ============ ALTARA · SHARED JS ============

// ---- Custom cursor ----
(function() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.appendChild(dot);
  document.body.appendChild(ring);

  let mx = window.innerWidth/2, my = window.innerHeight/2;
  let rx = mx, ry = my;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
  });
  function tick() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(tick);
  }
  tick();

  const hoverables = 'a, button, .btn, .feature-card, .swatch, .theme-toggle, [data-cursor="hover"]';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(hoverables)) ring.classList.add('hover');
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(hoverables)) ring.classList.remove('hover');
  });
})();

// ---- Reveal on scroll ----
(function() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

// ---- Theme toggle ----
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('altara-theme', t); } catch(e){}
  const icon = document.querySelector('.theme-toggle .icon');
  if (icon) icon.innerHTML = t === 'light'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
}
(function() {
  let t = 'dark';
  try { t = localStorage.getItem('altara-theme') || 'dark'; } catch(e){}
  applyTheme(t);
  document.addEventListener('click', e => {
    if (e.target.closest('.theme-toggle')) {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    }
  });
})();

// ---- Accent swatch ----
const ACCENTS = {
  violet: ['#a78bfa', '#f472b6', '#fb923c'],
  blue:   ['#60a5fa', '#22d3ee', '#a78bfa'],
  green:  ['#34d399', '#a3e635', '#22d3ee'],
  red:    ['#fb7185', '#fb923c', '#fbbf24'],
};
function applyAccent(name) {
  const c = ACCENTS[name] || ACCENTS.violet;
  document.documentElement.style.setProperty('--accent-1', c[0]);
  document.documentElement.style.setProperty('--accent-2', c[1]);
  document.documentElement.style.setProperty('--accent-3', c[2]);
  try { localStorage.setItem('altara-accent', name); } catch(e){}
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === name);
  });
}
(function() {
  let a = 'red';
  try { a = localStorage.getItem('altara-accent') || 'red'; } catch(e){}
  applyAccent(a);
})();

// ---- Tweaks panel (host protocol) ----
(function() {
  function buildPanel() {
    if (document.querySelector('.tweaks-panel')) return;
    const p = document.createElement('div');
    p.className = 'tweaks-panel';
    p.innerHTML = `
      <h4>Tweaks <button aria-label="close" data-close>×</button></h4>
      <div class="tweaks-label">Accent</div>
      <div class="tweaks-row">
        <button class="swatch" data-accent="violet" style="background:linear-gradient(135deg,#a78bfa,#f472b6,#fb923c)"></button>
        <button class="swatch" data-accent="blue" style="background:linear-gradient(135deg,#60a5fa,#22d3ee,#a78bfa)"></button>
        <button class="swatch" data-accent="green" style="background:linear-gradient(135deg,#34d399,#a3e635,#22d3ee)"></button>
        <button class="swatch" data-accent="red" style="background:linear-gradient(135deg,#fb7185,#fb923c,#fbbf24)"></button>
      </div>
      <div class="tweaks-label">Theme</div>
      <div class="tweaks-row">
        <button class="btn btn-secondary" data-theme-set="dark" style="flex:1;padding:8px 12px;font-size:13px;justify-content:center">Dark</button>
        <button class="btn btn-secondary" data-theme-set="light" style="flex:1;padding:8px 12px;font-size:13px;justify-content:center">Light</button>
      </div>
    `;
    document.body.appendChild(p);

    p.querySelectorAll('.swatch').forEach(s => {
      s.addEventListener('click', () => applyAccent(s.dataset.accent));
    });
    p.querySelectorAll('[data-theme-set]').forEach(b => {
      b.addEventListener('click', () => applyTheme(b.dataset.themeSet));
    });
    p.querySelector('[data-close]').addEventListener('click', () => {
      p.remove();
      try { window.parent.postMessage({type:'__edit_mode_dismissed'}, '*'); } catch(e){}
    });

    // sync active swatch
    const a = (function(){ try { return localStorage.getItem('altara-accent') || 'violet'; } catch(e){ return 'violet'; }})();
    p.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === a));
  }

  window.addEventListener('message', e => {
    if (!e.data || !e.data.type) return;
    if (e.data.type === '__activate_edit_mode') buildPanel();
    if (e.data.type === '__deactivate_edit_mode') {
      const p = document.querySelector('.tweaks-panel');
      if (p) p.remove();
    }
  });

  try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch(e){}
})();
