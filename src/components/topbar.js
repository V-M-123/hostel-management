import { signOut } from '../auth.js';
import { createIcon } from '../utils/icons.js';

export function renderTopbar(container, user) {
  container.innerHTML = '';
  container.className = 'topbar';

  const brand = document.createElement('div');
  brand.className = 'topbar-brand';
  brand.textContent = 'hostelhub';
  
  const hamburger = document.createElement('button');
  hamburger.className = 'hamburger';
  hamburger.setAttribute('aria-label', 'Toggle Navigation');
  hamburger.appendChild(createIcon('menu', { size: 18, strokeWidth: 1.8 }));
  hamburger.onclick = () => {
    document.body.classList.toggle('sidebar-open');
  };

  const userSec = document.createElement('div');
  userSec.className = 'topbar-user';

  const name = document.createElement('span');
  name.className = 'topbar-user-name';
  name.style.fontSize = 'var(--text-sm)';
  name.style.color = 'var(--color-ink)';
  name.textContent = user.full_name || user.email || 'user';
  
  const role = user.role || 'student';
  const badge = document.createElement('span');
  badge.className = 'status-badge status-in_progress';
  badge.style.fontSize = '10px';
  badge.textContent = role.toUpperCase();
  
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-secondary btn-sm';
  logoutBtn.style.fontSize = '12px';
  const logoutIcon = createIcon('logout', { size: 13, strokeWidth: 1.8 });
  const logoutText = document.createElement('span');
  logoutText.textContent = 'logout';
  logoutBtn.append(logoutIcon, logoutText);

  logoutBtn.onclick = async () => {
    window.location.hash = '';
    await signOut();
    window.location.reload();
  };

  userSec.appendChild(name);
  userSec.appendChild(badge);
  userSec.appendChild(logoutBtn);
  
  container.appendChild(hamburger);
  container.appendChild(brand);
  container.appendChild(userSec);
}
