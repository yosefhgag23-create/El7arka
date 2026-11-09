import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// A file dropped outside an upload box would otherwise replace the whole app with that file.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
