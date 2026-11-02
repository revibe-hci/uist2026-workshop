import React from 'react';
import { createRoot } from 'react-dom/client';
import '@tailwindcss/browser';
import '@xyflow/react/dist/style.css';
import './styles.css';
import App from './App.jsx';
import DuoSimulator from './components/DuoSimulator.jsx';

// ?sim opens the iPhone Duo simulator, which runs Misty inside it (see DuoSimulator.jsx).
const SIMULATOR = new URLSearchParams(window.location.search).has('sim');

createRoot(document.getElementById('root')).render(SIMULATOR ? <DuoSimulator /> : <App />);
