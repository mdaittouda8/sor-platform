import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Import CSS in dependency order: tokens first, then layout, then pages
import './styles/base.css';
import './styles/login.css';
import './styles/layout.css';
import './styles/dashboard.css';
import './styles/analyze.css';
import './styles/modal.css';
import './styles/ertms.css';
import './styles/documents.css';
import './styles/responsive.css';
import './styles/dark.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
