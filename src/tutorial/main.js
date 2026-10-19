import '../styles/app.css';
import '../styles/tutorial.css';
import { App } from '../app/App.js';
import { Tutorial } from './Tutorial.js';
import { CoachUI } from './CoachUI.js';
import { lessonById } from './lessons.js';

const app = new App(document.getElementById('tut-app'), { mode: 'tutorial' });
window.__app = app; // accesso per il debug e i collaudi automatici

app
  .start()
  .then(() => {
    const tutorial = new Tutorial(app);
    const ui = new CoachUI(app, tutorial);
    const id = new URLSearchParams(location.search).get('lezione');
    if (id && lessonById(id)) ui.startLesson(id);
  })
  .catch((err) => {
    console.error(err);
    const l = document.querySelector('#loader .loader-sub');
    if (l) l.textContent = 'Errore di avvio: ' + err.message;
  });
