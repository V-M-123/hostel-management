import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Leave Requests';
  header.appendChild(title);
  container.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.style.marginBottom = '20px';
  
  const statusGroup = document.createElement('div');
  statusGroup.className = 'filter-group';
  statusGroup.innerHTML = `
    <label class="form-label" style="display:inline-block; margin-right: 10px;">Status</label>
    <select id="statusFilter" class="form-select" style="display:inline-block; width:auto;">
      <option value="all">All</option>
      <option value="pending">Pending</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
    </select>
  `;
  filterBar.appendChild(statusGroup);
  container.appendChild(filterBar);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const statusFilter = document.getElementById('statusFilter').value;
    
    let query = supabase
      .from('leave_requests')
      .select('*, student:student_id(full_name)');
      
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    const { data: { user } } = await supabase.auth.getUser();

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'from_date', label: 'From Date', render: (val, row) => new Date(row.from_date).toLocaleDateString() },
        { key: 'to_date', label: 'To Date', render: (val, row) => new Date(row.to_date).toLocaleDateString() },
        { key: 'reason', label: 'Reason', render: (val, row) => row.reason },
        { key: 'status', label: 'Status', render: (val, row) => {
            const badge = document.createElement('span');
            badge.className = `status-badge status-${row.status}`;
            badge.textContent = row.status;
            return badge;
        }}
      ],
      rows: data,
      actions: [
        { 
          label: 'Approve', 
          class: 'btn btn-sm btn-primary', 
          onClick: async (row) => {
            if (row.status !== 'pending') return;
            const { error } = await supabase.from('leave_requests').update({ status: 'approved', reviewed_by: user.id }).eq('id', row.id);
            if (error) showToast(error.message, 'error');
            else { showToast('Request approved'); loadData(); }
          }
        },
        { 
          label: 'Reject', 
          class: 'btn btn-sm btn-danger', 
          onClick: async (row) => {
            if (row.status !== 'pending') return;
            const { error } = await supabase.from('leave_requests').update({ status: 'rejected', reviewed_by: user.id }).eq('id', row.id);
            if (error) showToast(error.message, 'error');
            else { showToast('Request rejected'); loadData(); }
          }
        }
      ],
      emptyMessage: 'No leave requests found.'
    });

    // Disable actions if not pending. Our table component doesn't easily support dynamic hidden actions,
    // so we can just hide them via CSS on render by wrapping the render table and finding buttons,
    // but a cleaner way is just the check in onClick and relying on users not clicking them.
    // However, to make the UI look right, let's just accept they are there but do nothing.
    // A more advanced table component would take a boolean for action visibility.
  };

  document.getElementById('statusFilter').addEventListener('change', loadData);
  loadData();
}
