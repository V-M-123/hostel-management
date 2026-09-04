import { animateToastIn, animateToastOut } from '../utils/motionTransitions.js';

export function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = document.createElement('span');
  icon.style.fontWeight = 'bold';
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  
  const msg = document.createElement('span');
  msg.textContent = message;
  
  toast.appendChild(icon);
  toast.appendChild(msg);
  
  const dismissToast = async () => {
    try {
      await animateToastOut(toast);
    } catch (e) {}
    toast.remove();
  };

  toast.onclick = dismissToast;
  
  container.appendChild(toast);
  animateToastIn(toast);
  
  setTimeout(() => {
    dismissToast();
  }, 3500);
}
