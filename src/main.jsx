import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { installHaptics } from './lib/haptics.js';
import { unlockAudio } from './lib/sounds.js';

installHaptics();
// Phones only allow sound after a touch: wake the audio engine on every tap.
document.addEventListener('pointerdown', unlockAudio, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
