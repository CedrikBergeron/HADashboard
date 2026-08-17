import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { HomeDashboardComponent } from './app/app.component';

bootstrapApplication(HomeDashboardComponent, appConfig)
  .catch((err) => console.error(err));
