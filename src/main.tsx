import React from 'react';
import { createRoot } from 'react-dom/client';
import * as DS from '@aurorasolar/ds';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DS.StyleProvider theme={DS.BorealisTheme}>
      <App />
    </DS.StyleProvider>
  </React.StrictMode>,
);
