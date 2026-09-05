import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { createPageLayout } from '../components/layout.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

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
    let { data, error } = await supabase
      .from('announcements')
      .select('*, hostel:hostel_id(name), author:posted_by(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase
        .from('announcements')
        .select('*, hostel:hostel_id(name)')
        .order('created_at', { ascending: false });

      if (fallback.error) {
        const simple = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if (simple.error) {
          showToast(simple.error.message, 'error');
          return;
        }
        announcements = simple.data || [];
      } else {
        announcements = fallback.data || [];
      }

      const userIds = [...new Set(announcements.map(a => a.posted_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const pMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        announcements.forEach(a => {
          if (!a.author) a.author = pMap[a.posted_by] || { full_name: 'Admin' };
        });
      }
    } else {
      announcements = data || [];
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'title', label: 'Title', render: (val, row) => row.title },
        { key: 'hostel', label: 'Scope', render: (val, row) => row.hostel ? row.hostel.name : 'Global' },
        { key: 'author', label: 'Posted By', render: (val, row) => row.author?.full_name || 'Admin' },
        { key: 'created_at', label: 'Date', render: (val) => formatDateForUI(val) }
      ],
      rows: announcements,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => openAnnouncementModal(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
            if (confirm(`Delete announcement "${row.title}"?`)) {
              const { error } = await supabase.from('announcements').delete().eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Deleted successfully', 'success'); await loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No announcements found.'
    });
  };

  const openAnnouncementModal = async (announcement = null) => {
    const isEdit = !!announcement;
    const { data: hostels, error: hError } = await supabase.from('hostels').select('id, name');
    if (hError) { showToast(hError.message, 'error'); return; }

    let hostelOptions = `<option value="">Global (All Hostels)</option>`;
    hostels?.forEach(h => {
      const selected = announcement?.hostel_id === h.id ? 'selected' : '';
      hostelOptions += `<option value="${h.id}" ${selected}>${h.name}</option>`;
    });

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" value="${announcement ? announcement.title : ''}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea name="message" class="form-textarea" rows="5" required>${announcement ? announcement.message : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Scope (Hostel)</label>
        <select name="hostel_id" class="form-select">
          ${hostelOptions}
        </select>
      </div>
    `;

    openModal(isEdit ? 'Edit Announcement' : 'New Announcement', bodyHTML, async (formData) => {
      const title = formData.get('title');
      const message = formData.get('message');
      const hostelId = formData.get('hostel_id') || null;

      const { data: { user } } = await supabase.auth.getUser();

      let res;
      if (isEdit) {
        res = await supabase.from('announcements').update({ title, message, hostel_id: hostelId }).eq('id', announcement.id);
      } else {
        res = await supabase.from('announcements').insert({ title, message, hostel_id: hostelId, posted_by: user.id });
      }

      if (res.error) {
        showToast(res.error.message, 'error');
      } else {
        showToast(`Announcement ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        closeModal();
        await loadData();
      }
    });
  };

  await loadData();
}
