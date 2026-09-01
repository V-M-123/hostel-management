import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { navigateTo } from '../router.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">Admin Dashboard</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Welcome back, ${user?.full_name || 'Administrator'}</p>
    </div>
  `;
  container.appendChild(header);

  // 1. System Overview Section
  const overviewSection = document.createElement('div');
  overviewSection.className = 'dashboard-section';
  overviewSection.innerHTML = `<div class="section-title">📊 System Overview</div>`;

  const { data: stats, error: statsError } = await supabase.rpc('get_dashboard_stats');
  if (statsError) {
    showToast(statsError.message, 'error');
    container.appendChild(overviewSection);
    return;
  }

  const statsGrid = document.createElement('div');
  statsGrid.className = 'cards-grid';

  const cardData = [
    { label: 'Total Hostels', value: stats.total_hostels, icon: '🏢' },
    { label: 'Total Rooms', value: stats.total_rooms, icon: '🚪' },
    { label: 'Occupancy %', value: stats.occupancy_rate + '%', icon: '📊' },
    { label: 'Pending Complaints', value: stats.pending_complaints, icon: '📝' }
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

  overviewSection.appendChild(statsGrid);
  container.appendChild(overviewSection);

  // 2. Management Shortcuts
  const shortcutsSection = document.createElement('div');
  shortcutsSection.className = 'dashboard-section';
  shortcutsSection.innerHTML = `<div class="section-title">⚡ Management Shortcuts</div>`;

  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions';

  const actions = [
    { label: 'Hostels', icon: '🏢', path: '#/admin/hostels' },
    { label: 'Wardens', icon: '👤', path: '#/admin/wardens' },
    { label: 'Fee Reports', icon: '💰', path: '#/admin/fees' },
    { label: 'Announcements', icon: '📢', path: '#/admin/announcements' },
  ];

  actions.forEach(a => {
    const card = document.createElement('div');
    card.className = 'action-card glass-panel';
    card.innerHTML = `
      <div class="action-icon">${a.icon}</div>
      <div class="action-label">${a.label}</div>
    `;
    card.onclick = () => navigateTo(a.path);
    quickActions.appendChild(card);
  });

  shortcutsSection.appendChild(quickActions);
  container.appendChild(shortcutsSection);

  // 3. Operational Overview (Recent Complaints)
  const operationalSection = document.createElement('div');
  operationalSection.className = 'dashboard-section';
  operationalSection.innerHTML = `<div class="section-title">🚩 Operational Overview: Recent Complaints</div>`;

  const tableContainer = document.createElement('div');
  operationalSection.appendChild(tableContainer);
  container.appendChild(operationalSection);

  const { data: complaints, error: compError } = await supabase
    .from('complaints')
    .select('*, profiles:student_id(full_name), rooms:room_id(room_number, hostels:hostel_id(name))')
    .order('created_at', { ascending: false })
    .limit(10);

  if (compError) {
    showToast(compError.message, 'error');
    return;
  }

  renderTable(tableContainer, {
    columns: [
      { key: 'student', label: 'Student', render: (val, row) => row.profiles?.full_name || 'N/A' },
      { key: 'hostel', label: 'Hostel', render: (val, row) => row.rooms?.hostels?.name || 'N/A' },
      { key: 'room', label: 'Room', render: (val, row) => row.rooms?.room_number || 'N/A' },
      { key: 'category', label: 'Category', render: (val) => val.charAt(0).toUpperCase() + val.slice(1) },
      { key: 'status', label: 'Status', render: (val, row) => {
          const badge = document.createElement('span');
          badge.className = `status-badge status-${row.status}`;
          badge.textContent = row.status.replace('_', ' ').toUpperCase();
          return badge;
      }},
      { key: 'date', label: 'Date', render: (val, row) => new Date(row.created_at).toLocaleDateString() }
    ],
    rows: complaints || [],
    emptyMessage: 'No recent complaints found.'
  });
}
