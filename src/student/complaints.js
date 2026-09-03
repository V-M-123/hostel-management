import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { filterComplaints } from '../utils/complaintsFilter.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'My Complaints';
  
  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ New Complaint';
  actions.appendChild(addBtn);

  header.append(title, actions);
  container.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.style.marginBottom = '20px';
  filterBar.innerHTML = `
    <select id="studentStatusFilter" class="form-select" style="width: auto; display: inline-block;">
      <option value="active" selected>Active Issues (Unresolved)</option>
      <option value="resolved">Resolved (< 10 days)</option>
      <option value="all">All</option>
    </select>
  `;
  container.appendChild(filterBar);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  const { data: allocation } = await supabase
    .from('room_allocations')
    .select('room_id')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!allocation) {
    addBtn.disabled = true;
    addBtn.title = 'You must be allocated to a room first';
    addBtn.style.opacity = '0.5';
    addBtn.style.cursor = 'not-allowed';
  }

  addBtn.addEventListener('click', () => {
    if (!allocation) return;
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Category</label>
        <select name="category" class="form-select" required>
          <option value="maintenance">Maintenance</option>
          <option value="cleanliness">Cleanliness</option>
          <option value="noise">Noise</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-textarea" required rows="4" placeholder="Describe the issue..."></textarea>
      </div>
    `;

    openModal('New Complaint', bodyHTML, async (formData) => {
      const category = formData.get('category');
      const description = formData.get('description');
      const { error } = await supabase.from('complaints').insert({
        student_id: user.id,
        room_id: allocation.room_id,
        category,
        description
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Complaint filed successfully', 'success');
        closeModal();
        await render(container);
      }
    });
  });

  let allComplaints = [];
  try {
    const res = await supabase
      .from('complaints')
      .select('*, room:room_id(room_number)')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });
    allComplaints = res.data || [];
  } catch (e) {
    console.warn('Complaints query error:', e);
  }

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const renderTableData = () => {
    tableContainer.innerHTML = '';
    const statusVal = document.getElementById('studentStatusFilter').value;
    const filtered = filterComplaints(allComplaints, statusVal, 'all');

    renderTable(tableContainer, {
      columns: [
        { key: 'category', label: 'Category', render: (val) => val.charAt(0).toUpperCase() + val.slice(1) },
        { key: 'description', label: 'Description', render: (val) => val.length > 80 ? val.substring(0, 80) + '...' : val },
        { key: 'room', label: 'Room', render: (val) => val?.room_number || 'N/A' },
        { key: 'status', label: 'Status', render: (val) => {
            const span = document.createElement('span');
            span.className = `status-badge status-${val}`;
            span.textContent = val.replace('_', ' ').toUpperCase();
            return span;
        }},
        { key: 'created_at', label: 'Filed On', render: (val) => new Date(val).toLocaleDateString() },
        { key: 'resolved_at', label: 'Resolved On', render: (val) => val ? new Date(val).toLocaleDateString() : '-' },
      ],
      rows: filtered || [],
      emptyMessage: 'No active complaints filed'
    });
  };

  document.getElementById('studentStatusFilter').addEventListener('change', renderTableData);
  renderTableData();
}
