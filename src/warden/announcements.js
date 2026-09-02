import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: hostel, error: hError } = await supabase.from('hostels').select('id, name').eq('warden_id', user.id).single();

  if (hError || !hostel) {
    const msg = document.createElement('p');
    msg.textContent = 'You are not assigned to any hostel block yet.';
    container.appendChild(msg);
    return;
  }

  const hostelId = hostel.id;

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
      .select('*, author:posted_by(full_name)')
      .or(`hostel_id.eq.${hostelId},hostel_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'title', label: 'Title', render: (val, row) => row.title },
        { key: 'message', label: 'Message', render: (val, row) => row.message.length > 50 ? row.message.substring(0, 50) + '...' : row.message },
        { key: 'scope', label: 'Scope', render: (val, row) => row.hostel_id === hostelId ? hostel.name : 'Global' },
        { key: 'author', label: 'Posted By', render: (val, row) => row.author?.full_name || 'System' },
        { key: 'date', label: 'Date', render: (val, row) => new Date(row.created_at).toLocaleDateString() }
      ],
      rows: data,
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
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" name="title" class="form-input" id="annTitle" required />
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea name="message" class="form-textarea" id="annMessage" rows="5" required></textarea>
      </div>
    `;

    openModal(isEdit ? 'Edit Announcement' : 'New Announcement', bodyHTML, async (formData) => {
      const title = formData.get('title');
      const message = formData.get('message');
      
      if (isEdit) {
        const { error } = await supabase.from('announcements').update({ title, message }).eq('id', announcement.id);
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
    }
  };

  loadData();
}
