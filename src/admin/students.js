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
      <h1 class="page-title">Student Directory</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Campus-wide student registrations, data management, and room allocation oversight</p>
    </div>
  `;

  const searchControls = document.createElement('div');
  searchControls.style.display = 'flex';
  searchControls.style.gap = '12px';
  searchControls.style.alignItems = 'center';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search by name, phone, or room...';
  searchInput.className = 'form-input';
  searchInput.style.width = '260px';

  searchControls.appendChild(searchInput);
  header.appendChild(searchControls);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  let allStudents = [];

  const loadData = async () => {
    tableContainer.innerHTML = '';
    
    // Fetch all profiles with student role and their active allocations
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        phone,
        created_at,
        allocations:room_allocations(
          id,
          room_id,
          status,
          allocated_date,
          room:room_id(
            id,
            room_number,
            floor,
            hostel_id,
            hostel:hostel_id(id, name)
          )
        )
      `)
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (error) {
      showToast(error.message, 'error');
      renderEmptyState(tableContainer, 'Could not load student records.', '⚠️');
      return;
    }

    allStudents = data.map(s => {
      const activeAlloc = s.allocations?.find(a => a.status === 'active');
      return {
        id: s.id,
        full_name: s.full_name || 'Unnamed',
        phone: s.phone || 'N/A',
        hostel: activeAlloc?.room?.hostel?.name || 'Unallocated',
        hostel_id: activeAlloc?.room?.hostel?.id || null,
        room: activeAlloc?.room?.room_number ? `Room ${activeAlloc.room.room_number}` : 'No Room',
        room_id: activeAlloc?.room?.id || null,
        floor: activeAlloc?.room?.floor ? `Floor ${activeAlloc.room.floor}` : '-',
        allocation_id: activeAlloc?.id || null,
        allocated_date: activeAlloc?.allocated_date || 'N/A',
        status: activeAlloc ? 'Allocated' : 'Pending'
      };
    });

    renderFilteredTable();
  };

  const renderFilteredTable = () => {
    const term = searchInput.value.toLowerCase().trim();
    const filtered = allStudents.filter(s => 
      s.full_name.toLowerCase().includes(term) ||
      s.phone.toLowerCase().includes(term) ||
      s.room.toLowerCase().includes(term) ||
      s.hostel.toLowerCase().includes(term)
    );

    tableContainer.innerHTML = '';

    if (filtered.length === 0) {
      renderEmptyState(tableContainer, 'No students match your search criteria.', '🔍');
      return;
    }

    renderTable(tableContainer, {
      columns: [
        { key: 'full_name', label: 'Student Name', render: (val) => val },
        { key: 'phone', label: 'Phone', render: (val) => val },
        { key: 'hostel', label: 'Hostel Block', render: (val) => val },
        { key: 'room', label: 'Room', render: (val, row) => `${val} (${row.floor})` },
        { key: 'status', label: 'Status', render: (val) => {
            const span = document.createElement('span');
            span.className = `status-badge ${val === 'Allocated' ? 'status-active' : 'status-pending'}`;
            span.textContent = val.toUpperCase();
            return span;
        }},
        { key: 'allocated_date', label: 'Allocated Date', render: (val) => val }
      ],
      rows: filtered,
      actions: [
        {
          label: 'Edit Student',
          class: 'btn btn-sm btn-primary',
          onClick: (row) => openEditStudentModal(row)
        }
      ],
      emptyMessage: 'No students found'
    });
  };

  const openEditStudentModal = async (student) => {
    // 1. Fetch available rooms across all hostels
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, room_number, floor, capacity, occupied_count, hostel:hostel_id(name)')
      .order('hostel_id');

    let roomOptions = `<option value="">-- No Room (Unallocated) --</option>`;
    rooms?.forEach(r => {
      const isSelected = r.id === student.room_id ? 'selected' : '';
      const availableCount = r.capacity - (r.occupied_count || 0);
      const isCurrent = r.id === student.room_id;
      if (isCurrent || availableCount > 0) {
        roomOptions += `<option value="${r.id}" ${isSelected}>${r.hostel?.name || 'Block'} - Room ${r.room_number} (Floor ${r.floor})</option>`;
      }
    });

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input type="text" name="full_name" class="form-input" value="${student.full_name}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input type="text" name="phone" class="form-input" value="${student.phone === 'N/A' ? '' : student.phone}" placeholder="+91 9800000000" />
      </div>
      <div class="form-group">
        <label class="form-label">Assigned Room</label>
        <select name="room_id" class="form-select">
          ${roomOptions}
        </select>
      </div>
    `;

    openModal('Edit Student Details', bodyHTML, async (formData) => {
      const full_name = formData.get('full_name');
      const phone = formData.get('phone');
      const new_room_id = formData.get('room_id') || null;

      // 1. Update Profile Information
      const { error: pError } = await supabase
        .from('profiles')
        .update({ full_name, phone })
        .eq('id', student.id);

      if (pError) {
        showToast(pError.message, 'error');
        return;
      }

      // 2. Handle Room Allocation Changes
      if (new_room_id !== student.room_id) {
        if (student.allocation_id) {
          // Vacate current allocation
          await supabase
            .from('room_allocations')
            .update({ status: 'vacated', vacated_date: new Date().toISOString().split('T')[0] })
            .eq('id', student.allocation_id);
        }

        if (new_room_id) {
          // Create new allocation
          const { error: aError } = await supabase
            .from('room_allocations')
            .insert({
              student_id: student.id,
              room_id: new_room_id,
              status: 'active',
              allocated_date: new Date().toISOString().split('T')[0]
            });

          if (aError) {
            showToast('Profile updated, but room allocation failed: ' + aError.message, 'error');
            closeModal();
            await loadData();
            return;
          }
        }
      }

      showToast('Student information updated successfully!', 'success');
      closeModal();
      await loadData();
    });
  };

  searchInput.addEventListener('input', renderFilteredTable);

  await loadData();
}
