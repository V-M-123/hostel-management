import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();
  const { data: hostel, error: hError } = await supabase.from('hostels').select('*').eq('warden_id', user.id).single();

  if (hError || !hostel) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `
      <div class="empty-state-icon">🏢</div>
      <div class="empty-state-text">You are not assigned to any hostel block yet.</div>
    `;
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
  statsSection.innerHTML = `<div class="section-title">🏘️ Block Stats</div>`;

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
    { label: 'Total Rooms', value: totalRooms, icon: '🚪' },
    { label: 'Occupied Rooms', value: occupiedRooms, icon: '🛏️' },
    { label: 'Occupancy %', value: `${wardenOccPct}%`, icon: '📊' },
    { label: 'Open Complaints', value: stats.open_complaints ?? 0, icon: '📝' }
  ];

  cardData.forEach(c => {
    const card = document.createElement('div');
    card.className = 'stat-card glass-panel';
    card.innerHTML = `
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value">${c.value || 0}</div>
      <div class="stat-label">${c.label}</div>
    `;
    statsGrid.appendChild(card);
  });

  statsSection.appendChild(statsGrid);
  container.appendChild(statsSection);

  // 2. Action Center
  const actionsSection = document.createElement('div');
  actionsSection.className = 'dashboard-section';
  actionsSection.innerHTML = `<div class="section-title">⚡ Action Center</div>`;

  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions';

  const actions = [
    { label: 'Manage Rooms', icon: '🚪', path: '#/warden/rooms' },
    { label: 'Allocations', icon: '🛏️', path: '#/warden/allocations' },
    { label: 'Review Complaints', icon: '📝', path: '#/warden/complaints', count: stats.open_complaints },
    { label: 'Leave Requests', icon: '📅', path: '#/warden/leave-requests', count: stats.pending_leaves },
    { label: 'Post Announcement', icon: '📢', path: '#/warden/announcements' },
  ];

  actions.forEach(a => {
    const card = document.createElement('div');
    card.className = 'action-card glass-panel';
    card.innerHTML = `
      <div class="action-icon">${a.icon}</div>
      <div class="action-label">${a.label} ${a.count !== undefined ? `<span class="badge badge-warden">${a.count || 0}</span>` : ''}</div>
    `;
    card.onclick = () => navigateTo(a.path);
    quickActions.appendChild(card);
  });

  actionsSection.appendChild(quickActions);
  container.appendChild(actionsSection);
}
