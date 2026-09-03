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
  title.textContent = 'Manage Wardens';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const assignBtn = document.createElement('button');
  assignBtn.className = 'btn btn-primary';
  assignBtn.textContent = '+ Assign Warden';
  assignBtn.onclick = () => openAssignModal();
  actions.appendChild(assignBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data: wardens, error: wError } = await supabase.from('profiles').select('*').eq('role', 'warden');
    const { data: hostels, error: hError } = await supabase.from('hostels').select('id, name, warden_id');
    const { data: hwLinks } = await supabase.from('hostel_wardens').select('hostel_id, warden_id');

    if (wError) { showToast(wError.message, 'error'); return; }
    if (hError) { showToast(hError.message, 'error'); return; }

    const rows = (wardens || []).map(w => {
      let assignedHostel = (hostels || []).find(h => h.warden_id === w.id);
      if (!assignedHostel && hwLinks) {
        const link = hwLinks.find(l => l.warden_id === w.id);
        if (link) {
          assignedHostel = (hostels || []).find(h => h.id === link.hostel_id);
        }
      }
      return {
        ...w,
        assignedHostelName: assignedHostel ? assignedHostel.name : 'None',
        assignedHostelId: assignedHostel ? assignedHostel.id : null
      };
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'full_name', label: 'Name', render: (val, row) => row.full_name },
        { key: 'phone', label: 'Phone', render: (val, row) => row.phone || 'N/A' },
        { key: 'assignedHostelName', label: 'Assigned Hostel', render: (val, row) => row.assignedHostelName }
      ],
      rows: rows,
      actions: [
        { 
          label: 'Unassign', 
          class: 'btn btn-sm btn-secondary', 
          onClick: async (row) => {
            if (!row.assignedHostelId) {
                showToast('Warden is not assigned to any hostel.', 'info');
                return;
            }
            if (confirm(`Unassign ${row.full_name} from hostel?`)) {
              const { error } = await supabase.from('hostels').update({ warden_id: null }).eq('id', row.assignedHostelId);
              if (error) showToast(error.message, 'error');
              else { showToast('Warden unassigned'); loadData(); }
            }
          } 
        }
      ],
      emptyMessage: 'No wardens found.'
    });
  };

  const openAssignModal = async () => {
    const { data: users, error: uError } = await supabase.from('profiles').select('*').neq('role', 'admin');
    const { data: hostels, error: hError } = await supabase.from('hostels').select('id, name, warden_id');

    if (uError || hError) {
      showToast('Error loading data for modal', 'error');
      return;
    }

    let userOptions = users.map(u => `<option value="${u.id}">${u.full_name} (${u.role})</option>`).join('');
    let hostelOptions = hostels.map(h => `<option value="${h.id}">${h.name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">User</label>
        <select name="user_id" class="form-select" required>
          ${userOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Hostel</label>
        <select name="hostel_id" class="form-select" required>
          ${hostelOptions}
        </select>
      </div>
    `;

    openModal('Assign Warden', bodyHTML, async (formData) => {
      const userId = formData.get('user_id');
      const hostelId = formData.get('hostel_id');
      
      const { error } = await supabase.rpc('assign_warden_to_hostel', { p_warden_id: userId, p_hostel_id: hostelId });
      if (error) {
        showToast(error.message, 'error');
        return;
      }

      const { error: roleError } = await supabase.from('profiles').update({ role: 'warden' }).eq('id', userId);
      if (roleError) {
        showToast(roleError.message, 'error');
        return;
      }

      showToast('Warden assigned successfully');
      closeModal();
      loadData();
    });
  };

  loadData();
}
