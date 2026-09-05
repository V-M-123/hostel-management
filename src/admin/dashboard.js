import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { navigateTo } from '../router.js';
import { filterComplaints } from '../utils/complaintsFilter.js';
import { animateStaggerCards } from '../utils/motionTransitions.js';
import { createIcon } from '../utils/icons.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();

  createPageLayout(container, {
    title: 'Welcome',
    description: ''//`Welcome back, ${user?.full_name || 'Administrator'}`
  });

  // 1. System Overview Section
  const overviewSection = document.createElement('div');
  overviewSection.className = 'dashboard-section';
  overviewSection.innerHTML = `<div class="section-title">  System Overview</div>`;

  let stats = null;
  const { data: rpcStats, error: statsError } = await supabase.rpc('get_dashboard_stats');
  if (!statsError && rpcStats) {
    stats = rpcStats;
  } else {
    try {
      const [{ data: hostels }, { data: rooms }, { data: complaints }] = await Promise.all([
        supabase.from('hostels').select('id'),
        supabase.from('rooms').select('id, capacity, occupied_count'),
        supabase.from('complaints').select('id, status')
      ]);

      let totalCap = 0;
      let totalOcc = 0;
      (rooms || []).forEach(r => {
        totalCap += r.capacity || 0;
        totalOcc += r.occupied_count || 0;
      });

      const occPercent = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0;
      const pendingComps = (complaints || []).filter(c => c.status === 'open' || c.status === 'in_progress').length;

      stats = {
        total_hostels: (hostels || []).length,
        total_rooms: (rooms || []).length,
        occupancy_percentage: occPercent,
        pending_complaints: pendingComps
      };
    } catch (e) {
      console.warn('Fallback admin stats error:', e);
      stats = { total_hostels: 0, total_rooms: 0, occupancy_percentage: 0, pending_complaints: 0 };
    }
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
  shortcutsSection.innerHTML = `<div class="section-title">  Management Shortcuts</div>`;

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
    btn.onclick = () => navigateTo(a.path);
    quickActions.appendChild(btn);
  });

  shortcutsSection.appendChild(quickActions);
  container.appendChild(shortcutsSection);

  animateStaggerCards(statsGrid, '.stat-card');

  // 3. Operational Overview (Recent Complaints)
  const operationalSection = document.createElement('div');
  operationalSection.className = 'dashboard-section';
  operationalSection.innerHTML = `<div class="section-title"> Operational Overview: Recent Complaints</div>`;

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
      { key: 'status', label: 'Status', render: (val) => createStatusBadge(val) },
      { key: 'created_at', label: 'Reported', render: (val) => formatDateForUI(val) }
    ],
    rows: activeComplaints,
    emptyMessage: 'No active complaints logged'
  });
}
