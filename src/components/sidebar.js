import { navigateTo } from '../router.js';
import { createIcon } from '../utils/icons.js';

export function renderSidebar(container, role, currentPath) {
  container.innerHTML = '';
  container.className = 'sidebar';

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  
  const brandIcon = document.createElement('div');
  brandIcon.className = 'sidebar-brand-icon';
  const hfIcon = createIcon('building', { size: 14, strokeWidth: 2.2, color: 'var(--color-accent-text)' });
  brandIcon.appendChild(hfIcon);

  const brandText = document.createElement('span');
  brandText.textContent = 'hostelhub';

  brand.appendChild(brandIcon);
  brand.appendChild(brandText);
  container.appendChild(brand);

  const nav = document.createElement('div');
  nav.className = 'sidebar-nav';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.style.padding = '0 12px 10px 12px';
  eyebrow.style.color = 'var(--color-muted)';
  eyebrow.textContent = `01 · ${role.toUpperCase()} CONSOLE`;
  nav.appendChild(eyebrow);

  const links = getLinks(role);
  
  links.forEach(l => {
    const link = document.createElement('a');
    link.className = 'sidebar-link';
    if (currentPath === l.path || (currentPath === '' && l.path === `#/${role}/dashboard`)) {
      link.classList.add('active');
    }
    
    const iconEl = document.createElement('span');
    iconEl.className = 'sidebar-icon';
    iconEl.appendChild(createIcon(l.iconName, { size: 15, strokeWidth: 1.8 }));

    const text = document.createElement('span');
    text.textContent = l.label;
    
    link.appendChild(iconEl);
    link.appendChild(text);
    
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(l.path);
      document.body.classList.remove('sidebar-open');
    });
    
    nav.appendChild(link);
  });
  
  container.appendChild(nav);
}

function getLinks(role) {
  if (role === 'admin') {
    return [
      { label: 'dashboard', iconName: 'dashboard', path: '#/admin/dashboard' },
      { label: 'hostels', iconName: 'hostel', path: '#/admin/hostels' },
      { label: 'wardens', iconName: 'warden', path: '#/admin/wardens' },
      { label: 'students', iconName: 'student', path: '#/admin/students' },
      { label: 'complaints', iconName: 'complaint', path: '#/admin/complaints' },
      { label: 'fee reports', iconName: 'fee', path: '#/admin/fees' },
      { label: 'announcements', iconName: 'announcement', path: '#/admin/announcements' }
    ];
  } else if (role === 'warden') {
    return [
      { label: 'dashboard', iconName: 'dashboard', path: '#/warden/dashboard' },
      { label: 'rooms', iconName: 'room', path: '#/warden/rooms' },
      { label: 'allocations', iconName: 'allocation', path: '#/warden/allocations' },
      { label: 'complaints', iconName: 'complaint', path: '#/warden/complaints' },
      { label: 'leave requests', iconName: 'leave', path: '#/warden/leave-requests' },
      { label: 'announcements', iconName: 'announcement', path: '#/warden/announcements' }
    ];
  } else {
    return [
      { label: 'dashboard', iconName: 'dashboard', path: '#/student/dashboard' },
      { label: 'my room', iconName: 'room', path: '#/student/room' },
      { label: 'complaints', iconName: 'complaint', path: '#/student/complaints' },
      { label: 'fees', iconName: 'fee', path: '#/student/fees' },
      { label: 'leave requests', iconName: 'leave', path: '#/student/leave-requests' },
      { label: 'announcements', iconName: 'announcement', path: '#/student/announcements' }
    ];
  }
}
