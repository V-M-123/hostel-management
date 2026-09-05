import { navigateTo } from '../router.js';
import { createIcon } from '../utils/icons.js';

export function renderSidebar(container, role, currentPath) {
  container.innerHTML = '';
  container.className = 'sidebar';

  const brand = document.createElement('div');
  brand.className = 'sidebar-brand';
  
  const brandIcon = document.createElement('div');
  brandIcon.className = 'sidebar-brand-icon';
  const hfIcon = createIcon('building', { size: 15, strokeWidth: 2.2, color: 'var(--color-accent-text)' });
  brandIcon.appendChild(hfIcon);

  const brandText = document.createElement('span');
  brandText.className = 'sidebar-brand-text';
  brandText.textContent = 'HostelHub';

  brand.appendChild(brandIcon);
  brand.appendChild(brandText);
  container.appendChild(brand);

  const nav = document.createElement('div');
  nav.className = 'sidebar-nav';

  const indicator = document.createElement('div');
  indicator.className = 'sidebar-indicator';
  nav.appendChild(indicator);

  const eyebrow = document.createElement('div');
  eyebrow.className = 'sidebar-eyebrow';
  eyebrow.textContent = `01 · ${role.toUpperCase()} CONSOLE`;
  nav.appendChild(eyebrow);

  const links = getLinks(role);
  const linkElements = [];
  
  links.forEach(l => {
    const link = document.createElement('a');
    link.className = 'sidebar-link';
    link.dataset.path = l.path;
    link.title = l.label;
    const isActive = currentPath === l.path || (currentPath === '' && l.path === `#/${role}/dashboard`);
    if (isActive) {
      link.classList.add('active');
    }
    
    const iconEl = document.createElement('span');
    iconEl.className = 'sidebar-icon';
    iconEl.appendChild(createIcon(l.iconName, { size: 16, strokeWidth: 1.8 }));

    const text = document.createElement('span');
    text.className = 'sidebar-label';
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

  container.addEventListener('mouseenter', () => {
    container.classList.add('is-hovered');
    document.body.classList.add('sidebar-hovered');
    setTimeout(updateIndicatorPosition, 80);
    setTimeout(updateIndicatorPosition, 320);
  });

  container.addEventListener('mouseleave', () => {
    container.classList.remove('is-hovered');
    document.body.classList.remove('sidebar-hovered');
    setTimeout(updateIndicatorPosition, 80);
    setTimeout(updateIndicatorPosition, 320);
  });

  container.addEventListener('transitionend', updateIndicatorPosition);
  window.addEventListener('resize', updateIndicatorPosition, { passive: true });

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
