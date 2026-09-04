import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { navigateTo } from '../router.js';
import { filterComplaints } from '../utils/complaintsFilter.js';
import { animateStaggerCards } from '../utils/motionTransitions.js';
import { createIcon } from '../utils/icons.js';

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

  const occRate = stats.occupancy_percentage ?? stats.occupancy_rate ?? 0;
  const cardData = [
    { label: 'Total Hostels', value: stats.total_hostels ?? 0, iconName: 'hostel' },
    { label: 'Total Rooms', value: stats.total_rooms ?? 0, iconName: 'room' },
    { label: 'Occupancy %', value: `${occRate}%`, iconName: 'percent' },
    { label: 'Pending Complaints', value: stats.pending_complaints ?? 0, iconName: 'complaint' }
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

  overviewSection.appendChild(statsGrid);
  container.appendChild(overviewSection);

  // 2. Management Shortcuts
  const shortcutsSection = document.createElement('div');
  shortcutsSection.className = 'dashboard-section';
  shortcutsSection.innerHTML = `<div class="section-title">Management Shortcuts</div>`;

  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions';

  const actions = [
    { label: 'Hostels', iconName: 'hostel', path: '#/admin/hostels' },
    { label: 'Wardens', iconName: 'warden', path: '#/admin/wardens' },
    { label: 'Students', iconName: 'student', path: '#/admin/students' },
    { label: 'Complaints', iconName: 'complaint', path: '#/admin/complaints' },
    { label: 'Fee Reports', iconName: 'fee', path: '#/admin/fees' },
    { label: 'Announcements', iconName: 'announcement', path: '#/admin/announcements' },
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

    card.append(iconDiv, lblDiv);
    card.onclick = () => navigateTo(a.path);
    quickActions.appendChild(card);
  });

  shortcutsSection.appendChild(quickActions);
  container.appendChild(shortcutsSection);

  animateStaggerCards(statsGrid, '.stat-card');
  animateStaggerCards(quickActions, '.action-card');

  // 3. Operational Overview (Recent Complaints)
  const operationalSection = document.createElement('div');
  operationalSection.className = 'dashboard-section';
  operationalSection.innerHTML = `<div class="section-title">🚩 Operational Overview: Recent Complaints</div>`;

  const tableContainer = document.createElement('div');
  operationalSection.appendChild(tableContainer);
  container.appendChild(operationalSection);

  const { data: complaints, error: compError } = await supabase
    .from('complaints')
    .select('*, student:student_id(full_name), room:room_id(room_number, hostel:hostel_id(name))')
    .order('created_at', { ascending: false })
    .limit(10);

  if (compError) {
    showToast(compError.message, 'error');
    return;
  }

  const activeComplaints = filterComplaints(complaints || [], 'active');

  renderTable(tableContainer, {
    columns: [
      { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'N/A' },
      { key: 'room', label: 'Location', render: (val, row) => `${row.room?.hostel?.name || 'Block'} — Room ${row.room?.room_number || '-'}` },
      { key: 'category', label: 'Category', render: (val) => val.toUpperCase() },
      { key: 'status', label: 'Status', render: (val) => {
          const span = document.createElement('span');
          span.className = `status-badge status-${val}`;
          span.textContent = val.toUpperCase().replace('_', ' ');
          return span;
      }},
      { key: 'created_at', label: 'Reported', render: (val) => new Date(val).toLocaleDateString() }
    ],
    rows: activeComplaints,
    emptyMessage: 'No active complaints logged'
  });
}
