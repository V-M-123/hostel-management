import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderEmptyState } from '../components/emptyState.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Manage Hostels';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Hostel';
  newBtn.onclick = () => openHostelModal(null);
  actions.appendChild(newBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('hostels')
      .select('*, warden:warden_id(full_name), rooms(id, capacity, occupied_count)');

    if (error) { showToast(error.message, 'error'); return; }

    const rows = data.map(hostel => {
      let totalCapacity = 0;
      let totalOccupied = 0;
      if (hostel.rooms) {
        hostel.rooms.forEach(room => {
          totalCapacity += room.capacity || 0;
          totalOccupied += room.occupied_count || 0;
        });
      }
      return {
        ...hostel,
        totalRooms: hostel.rooms ? hostel.rooms.length : 0,
        totalCapacity,
        totalOccupied
      };
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Name', render: (val, row) => row.name },
        { key: 'address', label: 'Address', render: (val, row) => row.address },
        { key: 'warden', label: 'Warden', render: (val, row) => row.warden?.full_name || 'Unassigned' },
        { key: 'totalRooms', label: 'Total Rooms', render: (val, row) => row.totalRooms.toString() },
        { key: 'totalCapacity', label: 'Capacity', render: (val, row) => row.totalCapacity.toString() },
        { key: 'totalOccupied', label: 'Occupied', render: (val, row) => row.totalOccupied.toString() }
      ],
      rows: rows,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => openHostelModal(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
            if (confirm(`Are you sure you want to delete ${row.name}?`)) {
              const { error } = await supabase.from('hostels').delete().eq('id', row.id);
              if (error) { showToast(error.message, 'error'); }
              else { showToast('Hostel deleted successfully'); loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No hostels found.'
    });
  };

  const openHostelModal = (hostel) => {
    const isEdit = !!hostel;
    // Escaping the values appropriately if possible, but innerHTML is fine for developer written layout. We should just append inputs if possible but string template is required by spec.
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" name="name" class="form-input" id="hostelName" required />
      </div>
      <div class="form-group">
        <label class="form-label">Address</label>
        <textarea name="address" class="form-textarea" id="hostelAddress" required></textarea>
      </div>
    `;

    openModal(isEdit ? 'Edit Hostel' : 'New Hostel', bodyHTML, async (formData) => {
      const name = formData.get('name');
      const address = formData.get('address');
      
      if (isEdit) {
        const { error } = await supabase.from('hostels').update({ name, address }).eq('id', hostel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hostels').insert({ name, address });
        if (error) throw error;
      }
      showToast(`Hostel ${isEdit ? 'updated' : 'created'} successfully`);
      closeModal();
      loadData();
    });
    
    if (isEdit) {
       document.getElementById('hostelName').value = hostel.name;
       document.getElementById('hostelAddress').value = hostel.address;
    }
  };

  loadData();
}
