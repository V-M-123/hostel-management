const THEME_KEY = 'hostelhub_theme';

export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme() {
  const theme = getPreferredTheme();
  applyTheme(theme);
}

export function createThemeToggle(options = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `theme-toggle-btn ${options.className || ''}`.trim();
  btn.setAttribute('aria-label', 'Toggle light/dark theme');
  
  function updateState() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const isDark = current === 'dark';
    btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    btn.innerHTML = `
      <span class="theme-toggle-track">
        <span class="theme-toggle-icon">${isDark ? '🌙' : '☀️'}</span>
      </span>
      <span class="theme-toggle-label">${isDark ? 'Dark' : 'Light'}</span>
    `;
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
  });

  window.addEventListener('themechange', updateState);
  updateState();

  return btn;
}
