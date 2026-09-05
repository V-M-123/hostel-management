import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';
import { animateStaggerCards } from '../utils/motionTransitions.js';
import { createIcon } from '../utils/icons.js';
import { getAssignedHostelsForWarden } from '../utils/wardenHelpers.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();
  const assignedHostels = await getAssignedHostelsForWarden(user.id);

  if (!assignedHostels || assignedHostels.length === 0) {
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

  const primaryHostel = assignedHostels[0];
  const hostelIds = assignedHostels.map(h => h.id);
  const hostelNames = assignedHostels.map(h => h.name).join(', ');

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">${hostelNames} Management</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Warden Dashboard for ${assignedHostels.map(h => h.address || h.name).join(' | ')}</p>
    </div>
  `;
  container.appendChild(header);

  // 1. Block Stats Section
  const statsSection = document.createElement('div');
  statsSection.className = 'dashboard-section';
  statsSection.innerHTML = `<div class="section-title">Block Statistics</div>`;

  let stats = null;
  const { data: rpcStats, error: statsError } = await supabase.rpc('get_warden_dashboard_stats');
  if (!statsError && rpcStats) {
    stats = rpcStats;
  } else {
    // Client-side fallback stats calculation across assigned hostels
    try {
      const [{ data: rooms }, { data: complaints }, { data: leaves }] = await Promise.all([
        supabase.from('rooms').select('id, capacity, occupied_count').in('hostel_id', hostelIds),
        supabase.from('complaints').select('id, status'),
        supabase.from('leave_requests').select('id, status').eq('status', 'pending')
      ]);

      let totalCap = 0;
      let totalOcc = 0;
      (rooms || []).forEach(r => {
        totalCap += r.capacity || 0;
        totalOcc += r.occupied_count || 0;
      });

      const openComps = (complaints || []).filter(c => c.status === 'open' || c.status === 'in_progress').length;

      stats = {
        total_rooms: (rooms || []).length,
        occupied_rooms: totalOcc,
        vacant_rooms: Math.max(0, totalCap - totalOcc),
        open_complaints: openComps,
        pending_leaves: (leaves || []).length
      };
    } catch (e) {
      console.warn('Fallback stats error:', e);
      stats = { total_rooms: 0, occupied_rooms: 0, vacant_rooms: 0, open_complaints: 0, pending_leaves: 0 };
    }
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
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'action-icon';
    iconSpan.appendChild(createIcon(a.iconName, { size: 15, strokeWidth: 2 }));

    const lblSpan = document.createElement('span');
    lblSpan.className = 'action-label';
    lblSpan.textContent = a.label;

    btn.append(iconSpan, lblSpan);

    if (a.count !== undefined && a.count > 0) {
      const badge = document.createElement('span');
      badge.className = 'action-badge';
      badge.textContent = a.count;
      btn.appendChild(badge);
    }

    btn.onclick = () => navigateTo(a.path);
    quickActions.appendChild(btn);
  });

  actionsSection.appendChild(quickActions);
  container.appendChild(actionsSection);

  animateStaggerCards(statsGrid, '.stat-card');
}
