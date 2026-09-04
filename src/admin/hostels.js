import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderEmptyState } from '../components/emptyState.js';
import { createIcon } from '../utils/icons.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">Manage Hostels</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Campus residential blocks and multi-warden assignments (1:M)</p>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  const plusIcon = createIcon('plus', { size: 16, strokeWidth: 2, color: '#000000' });
  const btnText = document.createElement('span');
  btnText.textContent = '+ New Hostel';
  newBtn.append(plusIcon, btnText);
  newBtn.onclick = () => openHostelModal(null);
  actions.appendChild(newBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    
    // Fetch hostels with rooms and wardens
    const { data: hostels, error: hError } = await supabase
      .from('hostels')
      .select('*, warden:warden_id(id, full_name), rooms(id, capacity, occupied_count)')
      .order('name');

    const { data: hwLinks } = await supabase
      .from('hostel_wardens')
      .select('hostel_id, warden_id, warden:warden_id(id, full_name)');

    if (hError) { showToast(hError.message, 'error'); return; }

    const rows = (hostels || []).map(hostel => {
      let totalCapacity = 0;
      let totalOccupied = 0;
      if (hostel.rooms) {
        hostel.rooms.forEach(room => {
          totalCapacity += room.capacity || 0;
          totalOccupied += room.occupied_count || 0;
        });
      }

      // Collect all wardens assigned to this hostel (1:M)
      const wardenList = [];
      const wardenIds = new Set();

      // From hostel_wardens (1:M)
      hwLinks?.forEach(link => {
        if (link.hostel_id === hostel.id && link.warden) {
          if (!wardenIds.has(link.warden.id)) {
            wardenIds.add(link.warden.id);
            wardenList.push(link.warden.full_name);
          }
        }
      });

      // From hostels.warden_id (lead warden)
      if (hostel.warden && !wardenIds.has(hostel.warden.id)) {
        wardenIds.add(hostel.warden.id);
        wardenList.unshift(hostel.warden.full_name);
      }

      return {
        ...hostel,
        totalRooms: hostel.rooms ? hostel.rooms.length : 0,
        totalCapacity,
        totalOccupied,
        wardenList,
        wardenCount: wardenList.length
      };
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Hostel Block', render: (val) => val },
        { key: 'address', label: 'Address / Location', render: (val) => val },
        { key: 'wardenList', label: 'Assigned Wardens (1:M)', render: (val, row) => {
            if (!row.wardenList || row.wardenList.length === 0) {
              const span = document.createElement('span');
              span.style.color = 'var(--text-muted)';
              span.textContent = 'None assigned';
              return span;
            }
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexWrap = 'wrap';
            container.style.gap = '6px';
            row.wardenList.forEach(wName => {
              const badge = document.createElement('span');
              badge.className = 'role-badge';
              badge.style.background = 'rgba(209, 254, 23, 0.08)';
              badge.style.borderColor = 'rgba(209, 254, 23, 0.25)';
              badge.style.color = 'var(--color-acid-yellow)';
              badge.textContent = wName;
              container.appendChild(badge);
            });
            return container;
        }},
        { key: 'totalRooms', label: 'Rooms', render: (val) => val.toString() },
        { key: 'occupancy', label: 'Beds (Occ / Cap)', render: (val, row) => `${row.totalOccupied} / ${row.totalCapacity}` }
      ],
      rows: rows,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => openHostelModal(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
            if (confirm(`Are you sure you want to delete ${row.name}?`)) {
              const { error } = await supabase.from('hostels').delete().eq('id', row.id);
              if (error) { showToast(error.message, 'error'); }
              else { showToast('Hostel deleted successfully', 'success'); loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No hostels found.'
    });
  };

  const openHostelModal = (hostel) => {
    const isEdit = !!hostel;
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Hostel Name</label>
        <input type="text" name="name" class="form-input" value="${hostel ? hostel.name : ''}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Address / Location</label>
        <textarea name="address" class="form-textarea" required rows="3">${hostel ? hostel.address || '' : ''}</textarea>
      </div>
    `;

    openModal(isEdit ? 'Edit Hostel' : 'New Hostel', bodyHTML, async (formData) => {
      const name = formData.get('name');
      const address = formData.get('address');
      
      let res;
      if (isEdit) {
        res = await supabase.from('hostels').update({ name, address }).eq('id', hostel.id);
      } else {
        res = await supabase.from('hostels').insert({ name, address });
      }

      if (res.error) {
        showToast(res.error.message, 'error');
      } else {
        showToast(`Hostel ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        closeModal();
        await loadData();
      }
    });
  };

  await loadData();
}
