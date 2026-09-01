import { signOut } from '../auth.js';

export function renderTopbar(container, user) {
  container.innerHTML = '';
  container.className = 'topbar';

  const brand = document.createElement('div');
  brand.className = 'topbar-brand';
  brand.textContent = 'HostelHub';
  
  const hamburger = document.createElement('button');
  hamburger.className = 'hamburger';
  hamburger.innerHTML = '☰';
  hamburger.onclick = () => {
    document.body.classList.toggle('sidebar-open');
  };

  const userSec = document.createElement('div');
  userSec.className = 'topbar-user';
  
  const name = document.createElement('span');
  name.textContent = user.full_name || user.email || 'User';
  
  const role = user.role || 'student';
  const badge = document.createElement('span');
  badge.className = `badge badge-${role}`;
  badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
  
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-secondary btn-sm';
  logoutBtn.textContent = 'Logout';
  logoutBtn.onclick = async () => {
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
