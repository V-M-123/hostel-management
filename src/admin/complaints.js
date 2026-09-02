import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">Complaint Logs</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Campus-wide grievance tracking and maintenance oversight</p>
    </div>
  `;

  const filterContainer = document.createElement('div');
  filterContainer.style.display = 'flex';
  filterContainer.style.gap = '12px';
  filterContainer.style.alignItems = 'center';

  const categoryFilter = document.createElement('select');
  categoryFilter.className = 'form-select';
  categoryFilter.style.width = '160px';
  categoryFilter.innerHTML = `
    <option value="all">All Categories</option>
    <option value="maintenance">Maintenance</option>
    <option value="cleanliness">Cleanliness</option>
    <option value="noise">Noise</option>
    <option value="other">Other</option>
  `;

  const statusFilter = document.createElement('select');
  statusFilter.className = 'form-select';
  statusFilter.style.width = '160px';
  statusFilter.innerHTML = `
    <option value="all">All Statuses</option>
    <option value="open">Open</option>
    <option value="in_progress">In Progress</option>
    <option value="resolved">Resolved</option>
  `;

  filterContainer.append(categoryFilter, statusFilter);
  header.appendChild(filterContainer);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  let allComplaints = [];

  const loadData = async () => {
    tableContainer.innerHTML = '';

    const { data, error } = await supabase
      .from('complaints')
      .select(`
        *,
        student:student_id(full_name, phone),
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

    const filtered = allComplaints.filter(c => {
      const matchCat = cat === 'all' || c.category === cat;
      const matchStat = stat === 'all' || c.status === stat;
      return matchCat && matchStat;
    });

    tableContainer.innerHTML = '';

    if (filtered.length === 0) {
      renderEmptyState(tableContainer, 'No complaints match the selected filter criteria.', '📋');
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
        { key: 'student', label: 'Student', render: (val, row) => `${row.student?.full_name || 'Anonymous'} (${row.student?.phone || 'No phone'})` },
        { key: 'location', label: 'Location', render: (val, row) => `${row.room?.hostel?.name || 'Block'} — Room ${row.room?.room_number || '-'}` },
        { key: 'status', label: 'Status', render: (val) => {
            const span = document.createElement('span');
            span.className = `status-badge status-${val}`;
            span.textContent = val.toUpperCase().replace('_', ' ');
            return span;
        }},
        { key: 'created_at', label: 'Logged At', render: (val) => new Date(val).toLocaleDateString() }
      ],
      rows: filtered,
      actions: [
        {
          label: 'Update Status',
          class: 'btn btn-sm btn-secondary',
          onClick: (row) => openUpdateModal(row)
        }
      ],
      emptyMessage: 'No complaints logged'
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
      const { error } = await supabase
        .from('complaints')
        .update({ status: newStatus })
        .eq('id', complaint.id);

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Complaint status updated successfully!', 'success');
        closeModal();
        await loadData();
      }
    });
  };

  categoryFilter.addEventListener('change', renderFilteredTable);
  statusFilter.addEventListener('change', renderFilteredTable);

  await loadData();
}
