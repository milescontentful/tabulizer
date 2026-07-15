import React from 'react';
import ReactDOM from 'react-dom/client';
import { GlobalStyles } from '@contentful/f36-components';
import { SDKProvider } from '@contentful/react-apps-toolkit';
import App from './App';
import './index.css';

// Field editor styles
import 'codemirror/lib/codemirror.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <SDKProvider>
      <GlobalStyles />
      <App />
    </SDKProvider>
  </React.StrictMode>
);
