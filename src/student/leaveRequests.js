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
  title.textContent = 'Leave Requests';
  
  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ New Request';
  actions.appendChild(addBtn);

  header.append(title, actions);
  container.appendChild(header);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  addBtn.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">From Date</label>
        <input type="date" name="from_date" class="form-input" required min="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">To Date</label>
        <input type="date" name="to_date" class="form-input" required min="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <textarea name="reason" class="form-textarea" required rows="3"></textarea>
      </div>
    `;

    openModal('New Leave Request', bodyHTML, async (formData) => {
      const from_date = formData.get('from_date');
      const to_date = formData.get('to_date');
      const reason = formData.get('reason');

      if (new Date(to_date) < new Date(from_date)) {
        showToast('To Date cannot be before From Date', 'error');
        return;
      }

      const { error } = await supabase.from('leave_requests').insert({
        student_id: user.id,
        from_date,
        to_date,
        reason
      });

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Leave request submitted', 'success');
        closeModal();
        render(container);
      }
    });
  });

  let requests = [];
  try {
    const res = await supabase
      .from('leave_requests')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });
    requests = res.data || [];
  } catch (e) {
    console.warn('Leave requests query error:', e);
  }

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  renderTable(tableContainer, {
    columns: [
      { key: 'from_date', label: 'From Date', render: (val) => new Date(val).toLocaleDateString() },
      { key: 'to_date', label: 'To Date', render: (val) => new Date(val).toLocaleDateString() },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status', render: (val) => {
          const span = document.createElement('span');
          span.className = `status-badge status-${val}`;
          span.textContent = val.toUpperCase();
          return span;
      }},
      { key: 'created_at', label: 'Submitted On', render: (val) => new Date(val).toLocaleDateString() }
    ],
    rows: requests || [],
    emptyMessage: 'No leave requests found'
  });
}
