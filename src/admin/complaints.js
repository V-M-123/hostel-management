import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { openModal, closeModal } from '../components/modal.js';
import { filterComplaints } from '../utils/complaintsFilter.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

  const filterContainer = document.createElement('div');
  filterContainer.className = 'page-actions-container';

  const categoryFilter = document.createElement('select');
  categoryFilter.className = 'form-select';
  categoryFilter.style.width = '145px';
  categoryFilter.innerHTML = `
    <option value="all">All Categories</option>
    <option value="maintenance">Maintenance</option>
    <option value="cleanliness">Cleanliness</option>
    <option value="noise">Noise</option>
    <option value="other">Other</option>
  `;

  const statusFilter = document.createElement('select');
  statusFilter.className = 'form-select';
  statusFilter.style.width = '220px';
  statusFilter.innerHTML = `
    <option value="active" selected>Active Issues (Unresolved)</option>
    <option value="open">Open</option>
    <option value="in_progress">In Progress</option>
    <option value="resolved">Resolved (< 10 days)</option>
    <option value="all">All History</option>
  `;

  filterContainer.append(categoryFilter, statusFilter);

  createPageLayout(container, {
    title: 'Complaint Logs',
    description: 'Active campus issues (resolved issues auto-expire after 10 days)',
    actions: [filterContainer]
  });

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  let allComplaints = [];

  const loadData = async () => {
    tableContainer.innerHTML = '';

    const { data, error } = await supabase
      .from('complaints')
      .select(`
        *,
        student:student_id(full_name),
        room:room_id(
          room_number,
          floor,
          hostel:hostel_id(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, 'error');
      renderEmptyState(tableContainer, 'Could not load complaint records.', '⚠️');
      return;
    }

    allComplaints = data || [];
    renderFilteredTable();
  };

  const renderFilteredTable = () => {
    const cat = categoryFilter.value;
    const stat = statusFilter.value;

    const filtered = filterComplaints(allComplaints, stat, cat);

    tableContainer.innerHTML = '';

    if (filtered.length === 0) {
      renderEmptyState(tableContainer, 'No active complaints matching criteria.', '📋');
      return;
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'category', label: 'Category', render: (val) => {
            const span = document.createElement('span');
            span.className = 'role-badge';
            span.textContent = val.toUpperCase();
            return span;
        }},
        { key: 'description', label: 'Description', render: (val) => val },
        { key: 'student', label: 'Student', render: (val, row) => `${row.student?.full_name || 'Anonymous'}`},
        { key: 'location', label: 'Location', render: (val, row) => `${row.room?.hostel?.name || 'Block'} — Room ${row.room?.room_number || '-'}` },
        { key: 'status', label: 'Status', render: (val) => createStatusBadge(val) },
        { key: 'created_at', label: 'Logged At', render: (val) => formatDateForUI(val) }
      ],
      rows: filtered,
      actions: [
        {
          label: 'Update Status',
          class: 'btn btn-sm btn-secondary',
          onClick: (row) => openUpdateModal(row)
        }
      ],
      emptyMessage: 'No active complaints logged'
    });
  };

  const openUpdateModal = (complaint) => {
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Update Status</label>
        <select name="status" class="form-select">
          <option value="open" ${complaint.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${complaint.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="resolved" ${complaint.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </div>
      <div style="font-size: 13px; color: var(--color-fog); margin-top: 12px;">
        <strong>Details:</strong> ${complaint.description}
      </div>
    `;

    openModal('Update Complaint Status', bodyHTML, async (formData) => {
      const newStatus = formData.get('status');

      const updateData = {
        status: newStatus,
        resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
      };

      let { error } = await supabase
        .from('complaints')
        .update(updateData)
        .eq('id', complaint.id);

      if (error && error.message && (error.message.includes('resolved_at') || error.message.includes('column'))) {
        const fallback = await supabase
          .from('complaints')
          .update({ status: newStatus })
          .eq('id', complaint.id);
        error = fallback.error;
      }

      if (error) {
        showToast(error.message, 'error');
      } else {
        const resetMsg = newStatus === 'resolved' ? 'Marked resolved (will auto-expire in 10 days)' : 'Status updated (timer reset)';
        showToast(resetMsg, 'success');
        closeModal();
        await loadData();
      }
    });
  };

  categoryFilter.addEventListener('change', renderFilteredTable);
  statusFilter.addEventListener('change', renderFilteredTable);

  await loadData();
}
