import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Announcements';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Announcement';
  newBtn.onclick = () => openAnnouncementModal();
  actions.appendChild(newBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('announcements')
      .select('*, hostel:hostel_id(name), author:posted_by(full_name)')
      .order('created_at', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'title', label: 'Title', render: (val, row) => row.title },
        { key: 'hostel', label: 'Scope', render: (val, row) => row.hostel ? row.hostel.name : 'Global' },
        { key: 'author', label: 'Posted By', render: (val, row) => row.author?.full_name || 'System' },
        { key: 'date', label: 'Date', render: (val, row) => new Date(row.created_at).toLocaleDateString() }
      ],
      rows: data,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => openAnnouncementModal(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
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
    const { data: hostels, error: hError } = await supabase.from('hostels').select('id, name');
    if (hError) { showToast(hError.message, 'error'); return; }

    let hostelOptions = '<option value="">Global (All Hostels)</option>';
    hostels.forEach(h => {
        hostelOptions += `<option value="${h.id}">${h.name}</option>`;
    });

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
        <label class="form-label">Scope (Hostel)</label>
        <select name="hostel_id" class="form-select" id="annHostel">
          ${hostelOptions}
        </select>
      </div>
    `;

    openModal(isEdit ? 'Edit Announcement' : 'New Announcement', bodyHTML, async (formData) => {
      const title = formData.get('title');
      const message = formData.get('message');
      const hostelId = formData.get('hostel_id') || null;
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (isEdit) {
        const { error } = await supabase.from('announcements').update({ title, message, hostel_id: hostelId }).eq('id', announcement.id);
        if (error) {
          showToast(error.message, 'error');
          return;
        }
      } else {
        const { error } = await supabase.from('announcements').insert({ title, message, hostel_id: hostelId, posted_by: user.id });
        if (error) {
          showToast(error.message, 'error');
          return;
        }
      }
      
      showToast(`Announcement ${isEdit ? 'updated' : 'created'}`);
      closeModal();
      loadData();
    });
    
    if (isEdit) {
        document.getElementById('annTitle').value = announcement.title;
        document.getElementById('annMessage').value = announcement.message;
        document.getElementById('annHostel').value = announcement.hostel_id || '';
    }
  };

  loadData();
}
