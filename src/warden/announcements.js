import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { getAssignedHostelsForWarden } from '../utils/wardenHelpers.js';
import { createPageLayout } from '../components/layout.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();
  const assignedHostels = await getAssignedHostelsForWarden(user.id);

  if (!assignedHostels || assignedHostels.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `
      <div class="empty-state-icon">🏢</div>
      <div class="empty-state-text">You are not assigned to any hostel block yet.</div>
    `;
    container.appendChild(msg);
    return;
  }

  const primaryHostel = assignedHostels[0];
  const hostelIds = assignedHostels.map(h => h.id);
  const hostelMap = Object.fromEntries(assignedHostels.map(h => [h.id, h.name]));

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'page-actions-container';

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Announcement';
  newBtn.onclick = () => openAnnouncementModal();
  actionsContainer.appendChild(newBtn);

  createPageLayout(container, {
    title: 'Announcements',
    actions: [actionsContainer]
  });

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';

    let announcements = [];
    const filterCond = hostelIds.map(id => `hostel_id.eq.${id}`).join(',') + ',hostel_id.is.null';

    let { data, error } = await supabase
      .from('announcements')
      .select('*, author:posted_by(full_name)')
      .or(filterCond)
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase
        .from('announcements')
        .select('*')
        .or(filterCond)
        .order('created_at', { ascending: false });

      if (fallback.error) {
        showToast(fallback.error.message, 'error');
        return;
      }
      announcements = fallback.data || [];

      const userIds = [...new Set(announcements.map(a => a.posted_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const pMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        announcements.forEach(a => {
          if (!a.author) a.author = pMap[a.posted_by] || { full_name: 'Staff' };
        });
      }
    } else {
      announcements = data || [];
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'title', label: 'Title', render: (val, row) => row.title },
        { key: 'message', label: 'Message', render: (val, row) => row.message.length > 50 ? row.message.substring(0, 50) + '...' : row.message },
        { key: 'scope', label: 'Scope', render: (val, row) => row.hostel_id ? (hostelMap[row.hostel_id] || 'Hostel') : 'Global' },
        { key: 'author', label: 'Posted By', render: (val, row) => row.author?.full_name || 'Staff' },
        { key: 'date', label: 'Date', render: (val, row) => formatDateForUI(row.created_at) }
      ],
      rows: announcements,
      actions: [
        {
          label: 'Edit',
          class: 'btn btn-sm btn-secondary',
          onClick: (row) => {
            if (row.posted_by === user.id) openAnnouncementModal(row);
            else showToast('You can only edit your own announcements', 'error');
          }
        },
        {
          label: 'Delete',
          class: 'btn btn-sm btn-danger',
          onClick: async (row) => {
            if (row.posted_by !== user.id) {
              showToast('You can only delete your own announcements', 'error');
              return;
            }
            if (confirm('Delete this announcement?')) {
              const { error } = await supabase.from('announcements').delete().eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Deleted successfully'); loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No announcements found.'
    });
  };

  const openAnnouncementModal = async (announcement = null) => {
    const isEdit = !!announcement;
    const hostelOptions = assignedHostels.map(h => {
      const selected = (announcement?.hostel_id === h.id || (!announcement && h.id === primaryHostel.id)) ? 'selected' : '';
      return `<option value="${h.id}" ${selected}>${h.name}</option>`;
    }).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" id="annTitle" required />
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea name="message" class="form-textarea" id="annMessage" rows="5" required></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Target Hostel Block</label>
        <select name="hostel_id" class="form-select" required>
          ${hostelOptions}
        </select>
      </div>
    `;

    openModal(isEdit ? 'Edit Announcement' : 'New Announcement', bodyHTML, async (formData) => {
      const title = formData.get('title');
      const message = formData.get('message');
      const targetHostelId = formData.get('hostel_id') || primaryHostel.id;

      if (isEdit) {
        const { error } = await supabase.from('announcements').update({ title, message, hostel_id: targetHostelId }).eq('id', announcement.id);
        if (error) {
          showToast(error.message, 'error');
          return;
        }
      } else {
        const { error } = await supabase.from('announcements').insert({ title, message, hostel_id: targetHostelId, posted_by: user.id });
        if (error) {
          showToast(error.message, 'error');
          return;
        }
      }

      showToast(`Announcement ${isEdit ? 'updated' : 'created'} successfully`, 'success');
      closeModal();
      await loadData();
    });

    if (isEdit) {
        document.getElementById('annTitle').value = announcement.title;
        document.getElementById('annMessage').value = announcement.message;
    }
  };

  await loadData();
}
