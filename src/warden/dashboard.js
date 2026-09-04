import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';
import { animateStaggerCards } from '../utils/motionTransitions.js';
import { createIcon } from '../utils/icons.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();
  const { data: hostel, error: hError } = await supabase.from('hostels').select('*').eq('warden_id', user.id).single();

  if (hError || !hostel) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    const iconDiv = document.createElement('div');
    iconDiv.className = 'empty-state-icon';
    iconDiv.appendChild(createIcon('hostel', { size: 36 }));
    const textDiv = document.createElement('div');
    textDiv.className = 'empty-state-text';
    textDiv.textContent = 'You are not assigned to any hostel block yet.';
    msg.append(iconDiv, textDiv);
    container.appendChild(msg);
    return;
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">${hostel.name} Management</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Warden Dashboard for ${hostel.address || 'Hostel Block'}</p>
    </div>
  `;
  container.appendChild(header);

  // 1. Block Stats Section
  const statsSection = document.createElement('div');
  statsSection.className = 'dashboard-section';
  statsSection.innerHTML = `<div class="section-title">Block Statistics</div>`;

  const { data: stats, error: statsError } = await supabase.rpc('get_warden_dashboard_stats');
  if (statsError) {
    showToast(statsError.message, 'error');
    container.appendChild(statsSection);
    return;
  }

  const statsGrid = document.createElement('div');
  statsGrid.className = 'cards-grid';

  const occupiedRooms = stats.occupied_rooms ?? stats.occupied_beds ?? 0;
  const vacantRooms = stats.vacant_rooms ?? stats.vacant_beds ?? 0;
  const totalRooms = stats.total_rooms ?? (occupiedRooms + vacantRooms);
  const wardenOccPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const cardData = [
    { label: 'Total Rooms', value: totalRooms, iconName: 'room' },
    { label: 'Occupied Rooms', value: occupiedRooms, iconName: 'allocation' },
    { label: 'Occupancy %', value: `${wardenOccPct}%`, iconName: 'percent' },
    { label: 'Open Complaints', value: stats.open_complaints ?? 0, iconName: 'complaint' }
  ];

  cardData.forEach(c => {
    const card = document.createElement('div');
    card.className = 'stat-card glass-panel';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'stat-icon';
    iconDiv.appendChild(createIcon(c.iconName, { size: 18, strokeWidth: 2 }));

    const valDiv = document.createElement('div');
    valDiv.className = 'stat-value';
    valDiv.textContent = c.value || 0;

    const lblDiv = document.createElement('div');
    lblDiv.className = 'stat-label';
    lblDiv.textContent = c.label;

    card.append(iconDiv, valDiv, lblDiv);
    statsGrid.appendChild(card);
  });

  statsSection.appendChild(statsGrid);
  container.appendChild(statsSection);

  // 2. Action Center
  const actionsSection = document.createElement('div');
  actionsSection.className = 'dashboard-section';
  actionsSection.innerHTML = `<div class="section-title">Action Center</div>`;

  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions';

  const actions = [
    { label: 'Manage Rooms', iconName: 'room', path: '#/warden/rooms' },
    { label: 'Allocations', iconName: 'allocation', path: '#/warden/allocations' },
    { label: 'Review Complaints', iconName: 'complaint', path: '#/warden/complaints', count: stats.open_complaints },
    { label: 'Leave Requests', iconName: 'leave', path: '#/warden/leave-requests', count: stats.pending_leaves },
    { label: 'Post Announcement', iconName: 'announcement', path: '#/warden/announcements' },
  ];

  actions.forEach(a => {
    const card = document.createElement('div');
    card.className = 'action-card glass-panel';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'action-icon';
    iconDiv.appendChild(createIcon(a.iconName, { size: 18, strokeWidth: 2 }));

    const lblDiv = document.createElement('div');
    lblDiv.className = 'action-label';
    lblDiv.textContent = a.label;
    if (a.count !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-warden';
      badge.style.marginLeft = '6px';
      badge.textContent = a.count || 0;
      lblDiv.appendChild(badge);
    }

    card.append(iconDiv, lblDiv);
    card.onclick = () => navigateTo(a.path);
    quickActions.appendChild(card);
  });

  actionsSection.appendChild(quickActions);
  container.appendChild(actionsSection);

  animateStaggerCards(statsGrid, '.stat-card');
  animateStaggerCards(quickActions, '.action-card');
}
