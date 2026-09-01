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
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  
  const msg = document.createElement('span');
  msg.textContent = message;
  
  toast.appendChild(icon);
  toast.appendChild(msg);
  
  toast.onclick = () => {
    toast.remove();
  };
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
