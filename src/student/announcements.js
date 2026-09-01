import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderEmptyState } from '../components/emptyState.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Announcements';
  header.appendChild(title);
  container.appendChild(header);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  const { data: allocation } = await supabase
    .from('room_allocations')
    .select('room:room_id(hostel_id, hostel:hostel_id(name))')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const hostelId = allocation?.room?.hostel_id;
  const hostelName = allocation?.room?.hostel?.name;

  let query = supabase
    .from('announcements')
    .select('*, author:posted_by(full_name)')
    .order('created_at', { ascending: false });

  if (hostelId) {
    query = query.or(`hostel_id.eq.${hostelId},hostel_id.is.null`);
  } else {
    query = query.is('hostel_id', null);
  }

  let announcements = [];
  try {
    const res = await query;
    announcements = res.data || [];
  } catch (e) {
    console.warn('Announcements query error:', e);
  }

  if (!announcements || announcements.length === 0) {
    renderEmptyState(container, 'No announcements at this time.', '📢');
    return;
  }

  const listContainer = document.createElement('div');
  listContainer.style.display = 'flex';
  listContainer.style.flexDirection = 'column';
  listContainer.style.gap = '15px';

  announcements.forEach(ann => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.padding = '20px';

    const cardHeader = document.createElement('div');
    cardHeader.style.display = 'flex';
    cardHeader.style.justifyContent = 'space-between';
    cardHeader.style.alignItems = 'center';
    cardHeader.style.marginBottom = '10px';

    const annTitle = document.createElement('h3');
    annTitle.style.margin = '0';
    annTitle.style.color = 'var(--text-primary)';
    annTitle.textContent = ann.title;

    const badge = document.createElement('span');
    badge.className = 'badge ' + (ann.hostel_id ? 'badge-info' : 'badge-admin');
    badge.textContent = ann.hostel_id ? (hostelName || 'Hostel') : 'Global';

    cardHeader.append(annTitle, badge);

    const msg = document.createElement('p');
    msg.style.color = 'var(--text-secondary)';
    msg.style.whiteSpace = 'pre-wrap';
    msg.textContent = ann.message;

    const footer = document.createElement('div');
    footer.style.marginTop = '15px';
    footer.style.fontSize = '0.85rem';
    footer.style.color = 'var(--text-muted)';
    const dateStr = new Date(ann.created_at).toLocaleString();
    footer.textContent = `Posted by ${ann.author?.full_name || 'Admin'} on ${dateStr}`;

    card.append(cardHeader, msg, footer);
    listContainer.appendChild(card);
  });

  container.appendChild(listContainer);
}
