import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

  const filterContainer = document.createElement('div');
  filterContainer.className = 'page-actions-container';

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
  filterContainer.appendChild(statusGroup);

  createPageLayout(container, {
    title: 'Leave Requests',
    actions: [filterContainer]
  });

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
        { key: 'from_date', label: 'From Date', render: (val) => formatDateForUI(val) },
        { key: 'to_date', label: 'To Date', render: (val) => formatDateForUI(val) },
        { key: 'reason', label: 'Reason', render: (val, row) => row.reason },
        { key: 'status', label: 'Status', render: (val) => createStatusBadge(val) }
      ],
      rows: data,
      actions: [
        {
          label: 'Approve',
          class: 'btn btn-sm btn-primary',
          show: (row) => row.status === 'pending',
          onClick: async (row) => {
            if (row.status !== 'pending') return;
            const { error } = await supabase.from('leave_requests').update({ status: 'approved', reviewed_by: user.id }).eq('id', row.id);
            if (error) showToast(error.message, 'error');
            else { showToast('Request approved', 'success'); await loadData(); }
          }
        },
        {
          label: 'Reject',
          class: 'btn btn-sm btn-danger',
          show: (row) => row.status === 'pending',
          onClick: async (row) => {
            if (row.status !== 'pending') return;
            const { error } = await supabase.from('leave_requests').update({ status: 'rejected', reviewed_by: user.id }).eq('id', row.id);
            if (error) showToast(error.message, 'error');
            else { showToast('Request rejected', 'success'); await loadData(); }
          }
        }
      ],
      emptyMessage: 'No leave requests found.'
    });
  };

  document.getElementById('statusFilter').addEventListener('change', loadData);
  loadData();
}
