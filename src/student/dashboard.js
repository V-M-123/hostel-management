import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';
import { animateStaggerCards } from '../utils/motionTransitions.js';
import { createIcon } from '../utils/icons.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  let profile = null;
  let allocation = null;
  let fees = [];

  try {
    const pRes = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = pRes.data;
  } catch (e) {
    console.warn('Profile fetch error:', e);
  }

  try {
    const aRes = await supabase.from('room_allocations').select('*, room:room_id(hostel_id, room_number, floor, capacity, occupied_count, hostel:hostel_id(name))').eq('student_id', user.id).eq('status', 'active').maybeSingle();
    allocation = aRes.data;
  } catch (e) {
    console.warn('Allocation fetch error:', e);
  }

  try {
    const fRes = await supabase.from('fee_payments').select('*').eq('student_id', user.id);
    fees = fRes.data || [];
  } catch (e) {
    console.warn('Fees fetch error:', e);
  }

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">My Dashboard</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Welcome back, ${profile?.full_name || 'Student'}</p>
    </div>
  `;
  container.appendChild(header);

  // 1. My Status Section
  const statusSection = document.createElement('div');
  statusSection.className = 'dashboard-section';
  statusSection.innerHTML = `<div class="section-title">My Status</div>`;

  const statsGrid = document.createElement('div');
  statsGrid.className = 'cards-grid';

  // Room Card
  const roomCard = document.createElement('div');
  roomCard.className = 'stat-card glass-panel';
  const roomIcon = document.createElement('div');
  roomIcon.className = 'stat-icon';
  roomIcon.appendChild(createIcon('room', { size: 18, strokeWidth: 2 }));
  
  const roomVal = document.createElement('div');
  roomVal.className = 'stat-value';
  roomVal.textContent = allocation?.room ? `Room ${allocation.room.room_number}` : 'No Room';

  const roomLbl = document.createElement('div');
  roomLbl.className = 'stat-label';
  roomLbl.textContent = allocation?.room ? `${allocation.room.hostel?.name || 'Block'}, Floor ${allocation.room.floor}` : 'Not allocated yet';

  roomCard.append(roomIcon, roomVal, roomLbl);
  statsGrid.appendChild(roomCard);

  // Fee Status Card
  let paidCount = 0, dueCount = 0, overdueCount = 0;
  if (fees) {
    paidCount = fees.filter(f => f.status === 'paid').length;
    dueCount = fees.filter(f => f.status === 'due').length;
    overdueCount = fees.filter(f => f.status === 'overdue').length;
  }
  const totalDues = dueCount + overdueCount;

  const feeCard = document.createElement('div');
  feeCard.className = 'stat-card glass-panel';
  const feeIcon = document.createElement('div');
  feeIcon.className = 'stat-icon';
  feeIcon.appendChild(createIcon('fee', { size: 18, strokeWidth: 2 }));

  const feeVal = document.createElement('div');
  feeVal.className = 'stat-value';
  feeVal.textContent = `${totalDues} Dues`;

  const feeLbl = document.createElement('div');
  feeLbl.className = 'stat-label';
  feeLbl.textContent = `${paidCount} Paid, ${overdueCount} Overdue`;

  feeCard.append(feeIcon, feeVal, feeLbl);
  statsGrid.appendChild(feeCard);

  statusSection.appendChild(statsGrid);
  container.appendChild(statusSection);

  // 2. Quick Links
  const linksSection = document.createElement('div');
  linksSection.className = 'dashboard-section';
  linksSection.innerHTML = `<div class="section-title">Quick Links</div>`;

  const quickActions = document.createElement('div');
  quickActions.className = 'quick-actions';

  const actions = [
    { label: 'File Complaint', iconName: 'complaint', path: '#/student/complaints' },
    { label: 'Fee Details', iconName: 'fee', path: '#/student/fees' },
    { label: 'Leave Request', iconName: 'leave', path: '#/student/leave-requests' },
    { label: 'Announcements', iconName: 'announcement', path: '#/student/announcements' },
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

  linksSection.appendChild(quickActions);
  container.appendChild(linksSection);

  animateStaggerCards(statsGrid, '.stat-card');
  animateStaggerCards(quickActions, '.action-card');

  // 3. Notice Board (Latest Announcement)
  const noticeSection = document.createElement('div');
  noticeSection.className = 'dashboard-section';
  noticeSection.innerHTML = `<div class="section-title">Notice Board</div>`;

  const hostelId = allocation?.room?.hostel_id;
  let annQuery = supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(1);
  if (hostelId) {
      annQuery = annQuery.or(`hostel_id.eq.${hostelId},hostel_id.is.null`);
  } else {
      annQuery = annQuery.is('hostel_id', null);
  }
  const { data: annData } = await annQuery.maybeSingle();

  const annCard = document.createElement('div');
  annCard.className = 'glass-panel';
  annCard.style.padding = '20px';
  annCard.style.display = 'flex';
  annCard.style.gap = '16px';
  annCard.style.alignItems = 'center';
  annCard.style.cursor = 'pointer';
  annCard.onclick = () => navigateTo('#/student/announcements');

  const annIconDiv = document.createElement('div');
  annIconDiv.className = 'stat-icon';
  annIconDiv.style.margin = '0';
  annIconDiv.style.width = '42px';
  annIconDiv.style.height = '42px';
  annIconDiv.appendChild(createIcon('announcement', { size: 20, strokeWidth: 2 }));

  const contentDiv = document.createElement('div');
  contentDiv.style.flex = '1';

  if (annData) {
    contentDiv.innerHTML = `
      <div style="font-weight: 700; color: var(--text-primary); font-size: 15px;">${annData.title}</div>
      <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${annData.message.length > 100 ? annData.message.substring(0, 100) + '...' : annData.message}</div>
    `;
  } else {
    contentDiv.innerHTML = `
      <div style="font-weight: 600; color: var(--text-secondary);">No new announcements</div>
      <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Campus bulletin is clear.</div>
    `;
  }

  annCard.append(annIconDiv, contentDiv);
  noticeSection.appendChild(annCard);
  container.appendChild(noticeSection);
}
