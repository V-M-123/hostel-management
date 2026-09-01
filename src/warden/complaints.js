import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';

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
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="in_progress">In Progress</option>
      <option value="resolved">Resolved</option>
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
      .from('complaints')
      .select('*, student:student_id(full_name), room:room_id(room_number)');
      
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'room', label: 'Room', render: (val, row) => row.room?.room_number || 'Unknown' },
        { key: 'category', label: 'Category', render: (val, row) => row.category },
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
                const { error } = await supabase.from('complaints').update({ status: newStatus }).eq('id', row.id);
                if (error) {
                    showToast(error.message, 'error');
                    e.target.value = row.status; // revert
                } else {
                    showToast('Status updated');
                }
            };
            
            return select;
        }},
        { key: 'date', label: 'Date', render: (val, row) => new Date(row.created_at).toLocaleDateString() }
      ],
      rows: data,
      emptyMessage: 'No complaints found.'
    });
  };

  document.getElementById('statusFilter').addEventListener('change', loadData);
  loadData();
}
