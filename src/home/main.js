import '../styles/home.css';
import { iconSVG } from '../ui/icons.js';
import { LESSONS } from '../tutorial/lessons.js';

// Icone a tratto al posto dei segnaposto data-i
for (const el of document.querySelectorAll('[data-i]')) {
  el.outerHTML = iconSVG(el.dataset.i, { size: el.closest('.choice-ic, .feat, .tool, .where-card') ? 26 : 18 });
}

// Schede delle lezioni del tutorial
let done = [];
try {
  done = JSON.parse(localStorage.getItem('configuratore-elettrotecnico:tutorial') || '{}').completed || [];
} catch {
  done = [];
}
const box = document.getElementById('lessons');
box.innerHTML = LESSONS.map((l) => `
  <a class="lesson" href="./tutorial.html?lezione=${l.id}">
    <span class="lesson-cover" style="background: linear-gradient(135deg, ${l.color}, #14191f)">
      <img src="${l.cover}" alt="" loading="lazy" onerror="this.remove()" />
      <span class="lesson-n">${l.n}</span>
      ${done.includes(l.id) ? `<span class="lesson-done">${iconSVG('check', { size: 14 })} Completata</span>` : ''}
    </span>
    <span class="lesson-meta">
      <b>${l.title}</b>
      <span class="lesson-sub">${l.subtitle}</span>
      <span class="lesson-tags"><span>${iconSVG('timer', { size: 14 })} ${l.duration}</span><span>${iconSVG('school', { size: 14 })} ${l.level}</span></span>
    </span>
  </a>`).join('');

// Hero: scene selezionabili (foto della classe, banco, quadro) con rotazione automatica
{
  const scenes = [...document.querySelectorAll('.cinema .scene')];
  const buttons = [...document.querySelectorAll('.scene-selector button')];
  let current = 0;
  let timer = null;
  const show = (i) => {
    current = (i + scenes.length) % scenes.length;
    scenes.forEach((s, k) => {
      s.classList.toggle('active', k === current);
      if (s.dataset.pos) s.style.objectPosition = s.dataset.pos;
    });
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === current)));
  };
  const auto = () => {
    clearInterval(timer);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => show(current + 1), 9000);
  };
  buttons.forEach((b, k) => b.addEventListener('click', () => { show(k); auto(); }));
  show(0);
  auto();

  // Barra di navigazione: trasparente sopra la foto, scura quando si scorre
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
