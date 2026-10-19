import './styles/app.css';
import { App } from './app/App.js';

const app = new App(document.getElementById('app'));
window.__app = app; // accesso per il debug e i collaudi automatici
app.start().catch((err) => {
  console.error(err);
  const l = document.querySelector('#loader .loader-sub');
  if (l) l.textContent = 'Errore di avvio: ' + err.message;
});
