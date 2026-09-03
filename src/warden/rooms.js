import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: hostel, error: hError } = await supabase.from('hostels').select('id').eq('warden_id', user.id).single();

  if (hError || !hostel) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `
      <div class="empty-state-icon">🏢</div>
      <div class="empty-state-text">You are not assigned to any hostel block yet.</div>
    `;
    container.appendChild(msg);
    return;
  }

  const hostelId = hostel.id;

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Manage Rooms';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Room';
  newBtn.onclick = () => openRoomModal();
  actions.appendChild(newBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('hostel_id', hostelId)
      .order('floor')
      .order('room_number');

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'room_number', label: 'Room Number', render: (val, row) => row.room_number },
        { key: 'floor', label: 'Floor', render: (val, row) => row.floor.toString() },
        { key: 'capacity', label: 'Capacity', render: (val, row) => row.capacity.toString() },
        { key: 'occupied', label: 'Occupied', render: (val, row) => (row.occupied_count || 0).toString() },
        { key: 'status', label: 'Status', render: (val, row) => {
            const occ = row.occupied_count || 0;
            let status = 'Vacant';
            let statusClass = 'status-approved';
            
            if (occ >= row.capacity) {
              status = 'Full';
              statusClass = 'status-vacated';
            } else if (occ > 0) {
              status = 'Partial';
              statusClass = 'status-pending';
            }

            const badge = document.createElement('span');
            badge.className = `status-badge ${statusClass}`;
            badge.textContent = status;
            return badge;
        }}
      ],
      rows: data,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => openRoomModal(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
            if ((row.occupied_count || 0) > 0) {
              showToast('Cannot delete room with active allocations', 'error');
              return;
            }
            if (confirm(`Delete room ${row.room_number}?`)) {
              const { error } = await supabase.from('rooms').delete().eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Room deleted successfully', 'success'); await loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No rooms found.'
    });
  };

  const openRoomModal = (room = null) => {
    const isEdit = !!room;
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Room Number</label>
        <input type="text" name="room_number" class="form-input" value="${room ? room.room_number : ''}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Floor</label>
        <input type="number" name="floor" class="form-input" value="${room ? room.floor : '1'}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Capacity</label>
        <input type="number" name="capacity" class="form-input" value="${room ? room.capacity : '2'}" min="1" required />
      </div>
    `;

    openModal(isEdit ? 'Edit Room' : 'New Room', bodyHTML, async (formData) => {
      const room_number = formData.get('room_number');
      const floor = parseInt(formData.get('floor'));
      const capacity = parseInt(formData.get('capacity'));
      
      let res;
      if (isEdit) {
        if ((room.occupied_count || 0) > capacity) {
          showToast('Capacity cannot be less than current occupied count', 'error');
          return;
        }
        res = await supabase.from('rooms').update({ room_number, floor, capacity }).eq('id', room.id);
      } else {
        res = await supabase.from('rooms').insert({ hostel_id: hostelId, room_number, floor, capacity });
      }

      if (res.error) {
        showToast(res.error.message, 'error');
      } else {
        showToast(`Room ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        closeModal();
        await loadData();
      }
    });
  };

  await loadData();
}
