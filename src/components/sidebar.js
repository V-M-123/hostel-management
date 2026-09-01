import { navigateTo } from '../router.js';

export function renderSidebar(container, role, currentPath) {
  container.innerHTML = '';
  container.className = 'sidebar';

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  brand.textContent = 'HostelHub';
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
    
    const icon = document.createElement('span');
    icon.textContent = l.icon;
    const text = document.createElement('span');
    text.textContent = l.label;
    
    link.appendChild(icon);
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
      { label: 'Dashboard', icon: '📊', path: '#/admin/dashboard' },
      { label: 'Hostels', icon: '🏢', path: '#/admin/hostels' },
      { label: 'Wardens', icon: '👤', path: '#/admin/wardens' },
      { label: 'Fee Reports', icon: '💰', path: '#/admin/fees' },
      { label: 'Announcements', icon: '📢', path: '#/admin/announcements' }
    ];
  } else if (role === 'warden') {
    return [
      { label: 'Dashboard', icon: '📊', path: '#/warden/dashboard' },
      { label: 'Rooms', icon: '🚪', path: '#/warden/rooms' },
      { label: 'Allocations', icon: '🛏️', path: '#/warden/allocations' },
      { label: 'Complaints', icon: '📝', path: '#/warden/complaints' },
      { label: 'Leave Requests', icon: '📅', path: '#/warden/leave-requests' },
      { label: 'Announcements', icon: '📢', path: '#/warden/announcements' }
    ];
  } else {
    return [
      { label: 'Dashboard', icon: '📊', path: '#/student/dashboard' },
      { label: 'My Room', icon: '🚪', path: '#/student/room' },
      { label: 'Complaints', icon: '📝', path: '#/student/complaints' },
      { label: 'Fees', icon: '💰', path: '#/student/fees' },
      { label: 'Leave Requests', icon: '📅', path: '#/student/leave-requests' },
      { label: 'Announcements', icon: '📢', path: '#/student/announcements' }
    ];
  }
}
