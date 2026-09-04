import { navigateTo } from '../router.js';
import { createIcon } from '../utils/icons.js';

export function renderSidebar(container, role, currentPath) {
  container.innerHTML = '';
  container.className = 'sidebar';

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  
  const brandIcon = document.createElement('div');
  brandIcon.className = 'sidebar-brand-icon';
  const hfIcon = createIcon('building', { size: 14, strokeWidth: 2.5, color: '#000000' });
  brandIcon.appendChild(hfIcon);

  const brandText = document.createElement('span');
  brandText.textContent = 'HostelHub';

  brand.appendChild(brandIcon);
  brand.appendChild(brandText);
  container.appendChild(brand);

  const nav = document.createElement('div');
  nav.className = 'sidebar-nav';

  const links = getLinks(role);
  
  links.forEach(l => {
    const link = document.createElement('a');
    link.className = 'sidebar-link';
    if (currentPath === l.path || (currentPath === '' && l.path === `#/${role}/dashboard`)) {
      link.classList.add('active');
    }
    
    const iconEl = document.createElement('span');
    iconEl.className = 'sidebar-icon';
    iconEl.style.display = 'inline-flex';
    iconEl.style.alignItems = 'center';
    iconEl.style.justifyContent = 'center';
    iconEl.appendChild(createIcon(l.iconName, { size: 16, strokeWidth: 1.9 }));

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
      { label: 'Dashboard', iconName: 'dashboard', path: '#/admin/dashboard' },
      { label: 'Hostels', iconName: 'hostel', path: '#/admin/hostels' },
      { label: 'Wardens', iconName: 'warden', path: '#/admin/wardens' },
      { label: 'Students', iconName: 'student', path: '#/admin/students' },
      { label: 'Complaints', iconName: 'complaint', path: '#/admin/complaints' },
      { label: 'Fee Reports', iconName: 'fee', path: '#/admin/fees' },
      { label: 'Announcements', iconName: 'announcement', path: '#/admin/announcements' }
    ];
  } else if (role === 'warden') {
    return [
      { label: 'Dashboard', iconName: 'dashboard', path: '#/warden/dashboard' },
      { label: 'Rooms', iconName: 'room', path: '#/warden/rooms' },
      { label: 'Allocations', iconName: 'allocation', path: '#/warden/allocations' },
      { label: 'Complaints', iconName: 'complaint', path: '#/warden/complaints' },
      { label: 'Leave Requests', iconName: 'leave', path: '#/warden/leave-requests' },
      { label: 'Announcements', iconName: 'announcement', path: '#/warden/announcements' }
    ];
  } else {
    return [
      { label: 'Dashboard', iconName: 'dashboard', path: '#/student/dashboard' },
      { label: 'My Room', iconName: 'room', path: '#/student/room' },
      { label: 'Complaints', iconName: 'complaint', path: '#/student/complaints' },
      { label: 'Fees', iconName: 'fee', path: '#/student/fees' },
      { label: 'Leave Requests', iconName: 'leave', path: '#/student/leave-requests' },
      { label: 'Announcements', iconName: 'announcement', path: '#/student/announcements' }
    ];
  }
}
