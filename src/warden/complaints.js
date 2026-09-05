import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { filterComplaints } from '../utils/complaintsFilter.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Complaints';
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
      <option value="active" selected>Active Issues (Unresolved)</option>
      <option value="open">Open</option>
      <option value="in_progress">In Progress</option>
      <option value="resolved">Resolved (< 10 days)</option>
      <option value="all">All</option>
    </select>
  `;
  filterBar.appendChild(statusGroup);
  container.appendChild(filterBar);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  let allComplaints = [];

  const loadData = async () => {
    tableContainer.innerHTML = '';
    
    const { data, error } = await supabase
      .from('complaints')
      .select('*, student:student_id(full_name), room:room_id(room_number)')
      .order('created_at', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    allComplaints = data || [];
    renderFiltered();
  };

  const renderFiltered = () => {
    tableContainer.innerHTML = '';
    const statusVal = document.getElementById('statusFilter').value;
    const filtered = filterComplaints(allComplaints, statusVal, 'all');

    if (filtered.length === 0) {
      renderEmptyState(tableContainer, 'No active complaints found.');
      return;
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'room', label: 'Room', render: (val, row) => row.room?.room_number || 'Unknown' },
        { key: 'category', label: 'Category', render: (val, row) => row.category.toUpperCase() },
        { key: 'description', label: 'Description', render: (val, row) => {
            return row.description.length > 50 ? row.description.substring(0, 50) + '...' : row.description;
        }},
        { key: 'status', label: 'Status', render: (val, row) => {
            const select = document.createElement('select');
            select.className = 'form-select';
            select.style.padding = '4px 8px';
            select.style.fontSize = '0.85rem';
            select.style.height = 'auto';
            
            const options = [
                { val: 'open', label: 'Open' },
                { val: 'in_progress', label: 'In Progress' },
                { val: 'resolved', label: 'Resolved' }
            ];
            
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.val;
                option.textContent = opt.label;
                if (row.status === opt.val) option.selected = true;
                select.appendChild(option);
            });
            
            select.onchange = async (e) => {
                const newStatus = e.target.value;
                
                // Timer resets if moved from resolved to open or in_progress (resolved_at = null)
                const updatePayload = {
                  status: newStatus,
                  resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
                };

                let { error } = await supabase.from('complaints').update(updatePayload).eq('id', row.id);
                if (error && error.message && (error.message.includes('resolved_at') || error.message.includes('column'))) {
                  const fallback = await supabase.from('complaints').update({ status: newStatus }).eq('id', row.id);
                  error = fallback.error;
                }

                if (error) {
                    showToast(error.message, 'error');
                    e.target.value = row.status; // revert
                } else {
                    const msg = newStatus === 'resolved' ? 'Status marked resolved (will auto-expire in 10 days)' : 'Status updated (timer reset)';
                    showToast(msg, 'success');
                    await loadData();
                }
            };
            return select;
        }}
      ],
      rows: filtered,
      emptyMessage: 'No complaints found.'
    });
  };

  document.getElementById('statusFilter').addEventListener('change', renderFiltered);

  await loadData();
}
