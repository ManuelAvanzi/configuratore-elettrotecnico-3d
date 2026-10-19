import '../styles/home.css';

// Hero: scene selezionabili (foto della classe, banco, quadro) con rotazione automatica
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

document.getElementById('year').textContent = String(new Date().getFullYear());
