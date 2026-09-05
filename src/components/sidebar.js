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

  const indicator = document.createElement('div');
  indicator.className = 'sidebar-indicator';
  nav.appendChild(indicator);

  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.style.padding = '0 12px 10px 12px';
  eyebrow.style.color = 'var(--color-muted)';
  eyebrow.textContent = `01 · ${role.toUpperCase()} CONSOLE`;
  nav.appendChild(eyebrow);

  const links = getLinks(role);
  const linkElements = [];
  
  links.forEach(l => {
    const link = document.createElement('a');
    link.className = 'sidebar-link';
    link.dataset.path = l.path;
    const isActive = currentPath === l.path || (currentPath === '' && l.path === `#/${role}/dashboard`);
    if (isActive) {
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
    linkElements.push(link);
  });
  
  const updateIndicatorPosition = () => {
    const activeLink = nav.querySelector('.sidebar-link.active');
    if (activeLink && activeLink.offsetHeight > 0) {
      indicator.style.opacity = '1';
      indicator.style.transform = `translate3d(${activeLink.offsetLeft}px, ${activeLink.offsetTop}px, 0)`;
      indicator.style.width = `${activeLink.offsetWidth}px`;
      indicator.style.height = `${activeLink.offsetHeight}px`;
    } else {
      indicator.style.opacity = '0';
    }
  };

  requestAnimationFrame(() => {
    updateIndicatorPosition();
    setTimeout(updateIndicatorPosition, 50);
  });

  window.addEventListener('resize', updateIndicatorPosition, { passive: true });

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
