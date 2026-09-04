import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'flex-start';
  header.style.flexWrap = 'wrap';
  header.style.gap = '16px';

  header.innerHTML = `
    <div>
      <h1 class="page-title">Student Directory</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Campus-wide student registrations, data management, and capacity-aware room allocation</p>
    </div>
  `;

  const actionsContainer = document.createElement('div');
  actionsContainer.style.display = 'flex';
  actionsContainer.style.gap = '10px';
  actionsContainer.style.alignItems = 'center';
  actionsContainer.style.flexWrap = 'wrap';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search by name, phone, or room...';
  searchInput.className = 'form-input';
  searchInput.style.width = '240px';

  const deallocBtn = document.createElement('button');
  deallocBtn.className = 'btn btn-secondary';
  deallocBtn.style.color = '#f87171';
  deallocBtn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  deallocBtn.textContent = 'Deallocate';
  deallocBtn.onclick = () => openBulkDeallocationModal();

  const randomAllocBtn = document.createElement('button');
  randomAllocBtn.className = 'btn btn-primary';
  randomAllocBtn.textContent = 'Random Allocation';
  randomAllocBtn.onclick = () => openRandomAllocationModal();

  actionsContainer.appendChild(searchInput);
  actionsContainer.appendChild(deallocBtn);
  actionsContainer.appendChild(randomAllocBtn);
  header.appendChild(actionsContainer);
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
            capacity,
            occupied_count,
            hostel_id,
            hostel:hostel_id(id, name)
          )
        )
      `)
      .eq('role', 'student')
      .order('full_name', { ascending: true });

    if (error) {
      showToast(error.message, 'error');
      renderEmptyState(tableContainer, 'Could not load student records.', 'alert');
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
        room_capacity: activeAlloc?.room?.capacity || null,
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
      renderEmptyState(tableContainer, 'No students match your search criteria.', 'search');
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
          label: 'Edit',
          class: 'btn btn-sm btn-primary',
          onClick: (row) => openEditStudentModal(row)
        },
        {
          label: 'Deallocate',
          class: 'btn btn-sm btn-danger',
          onClick: async (row) => {
            if (row.status !== 'Allocated' || !row.allocation_id) {
              showToast('Student is not currently allocated to any room.', 'info');
              return;
            }
            if (confirm(`Deallocate ${row.full_name} from ${row.room} (${row.hostel})?`)) {
              const vacatedDate = new Date().toISOString().split('T')[0];
              const { error } = await supabase
                .from('room_allocations')
                .update({ status: 'vacated', vacated_date: vacatedDate })
                .eq('id', row.allocation_id);

              if (error) {
                showToast(error.message, 'error');
              } else {
                showToast(`${row.full_name} has been deallocated.`, 'success');
                await loadData();
              }
            }
          }
        }
      ],
      emptyMessage: 'No students found'
    });
  };

  /**
   * Bulk Deallocation Modal
   */
  const openBulkDeallocationModal = async () => {
    const allocatedStudents = allStudents.filter(s => s.status === 'Allocated' && s.allocation_id);

    if (allocatedStudents.length === 0) {
      showToast('No students are currently allocated to any rooms.', 'info');
      return;
    }

    const { data: hostels } = await supabase.from('hostels').select('id, name').order('name');

    const hostelOptions = `
      <option value="ALL">All Hostels (All ${allocatedStudents.length} Allocated Students)</option>
      ${(hostels || []).map(h => {
        const count = allocatedStudents.filter(s => s.hostel_id === h.id).length;
        return `<option value="${h.id}">${h.name} (${count} allocated)</option>`;
      }).join('')}
    `;

    const bodyHTML = `
      <div style="margin-bottom: 20px; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-sm); padding: 14px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 2px;">Total Allocated Students</div>
            <div style="font-size: 22px; font-weight: 700; color: #f87171;">${allocatedStudents.length}</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: var(--text-secondary);">
            Deallocating will vacate student room allocations and free up room slots immediately.
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Deallocation Scope</label>
        <select name="hostel_id" class="form-select">
          ${hostelOptions}
        </select>
        <small style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; display: block;">Select whether to deallocate the entire campus or a specific hostel block.</small>
      </div>

      <div class="form-group">
        <label class="form-label">Confirmation</label>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
          <input type="checkbox" id="confirm-dealloc" name="confirmed" required style="accent-color: #f87171; width: 16px; height: 16px;" />
          <label for="confirm-dealloc" style="font-size: 13px; color: var(--text-primary); cursor: pointer;">I confirm that I want to vacate the selected student room allocations.</label>
        </div>
      </div>
    `;

    openModal('⚠️ Bulk Student Deallocation', bodyHTML, async (formData) => {
      const selectedHostelId = formData.get('hostel_id');
      const confirmed = formData.get('confirmed');

      if (!confirmed) {
        showToast('Please check the confirmation box to proceed.', 'error');
        return;
      }

      let targets = allocatedStudents;
      if (selectedHostelId !== 'ALL') {
        targets = allocatedStudents.filter(s => s.hostel_id === selectedHostelId);
      }

      if (targets.length === 0) {
        showToast('No allocated students match the selected scope.', 'info');
        return;
      }

      const targetAllocationIds = targets.map(s => s.allocation_id);
      const vacatedDate = new Date().toISOString().split('T')[0];

      const { error: deallocError } = await supabase
        .from('room_allocations')
        .update({ status: 'vacated', vacated_date: vacatedDate })
        .in('id', targetAllocationIds);

      if (deallocError) {
        showToast('Deallocation failed: ' + deallocError.message, 'error');
        return;
      }

      showToast(`Successfully deallocated ${targets.length} students. Rooms are now vacant and ready for new allocations.`, 'success');
      closeModal();
      await loadData();
    });
  };

  /**
   * Random Allocation Modal (Capacity & Room Size Aware)
   */
  const openRandomAllocationModal = async () => {
    // 1. Get currently unallocated students
    const unallocatedStudents = allStudents.filter(s => s.status === 'Pending');

    if (unallocatedStudents.length === 0) {
      showToast('All registered students are already allocated to rooms!', 'info');
      return;
    }

    // 2. Fetch all hostels and rooms with capacities
    const [{ data: hostels }, { data: rooms }] = await Promise.all([
      supabase.from('hostels').select('id, name').order('name'),
      supabase.from('rooms').select('id, hostel_id, room_number, floor, capacity, occupied_count').order('room_number')
    ]);

    if (!rooms || rooms.length === 0) {
      showToast('No rooms found in the system.', 'error');
      return;
    }

    // Calculate total remaining slots across rooms (strictly based on room capacity)
    const availableRooms = rooms.filter(r => (r.capacity - (r.occupied_count || 0)) > 0);
    const totalAvailableSlots = availableRooms.reduce((acc, r) => acc + (r.capacity - (r.occupied_count || 0)), 0);

    const hostelOptions = `
      <option value="ALL">All Hostels (Distribute across campus)</option>
      ${(hostels || []).map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
    `;

    const bodyHTML = `
      <div style="margin-bottom: 20px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 14px 16px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; text-align: left;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 2px;">Unallocated Students</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-acid-yellow);">${unallocatedStudents.length}</div>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 2px;">Total Free Beds</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">${totalAvailableSlots} <span style="font-size: 12px; font-weight: 400; color: var(--text-secondary);">(${availableRooms.length} rooms)</span></div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Target Hostel Block</label>
        <select id="alloc-hostel-select" name="hostel_id" class="form-select">
          ${hostelOptions}
        </select>
        <small style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; display: block;">Select a specific block or distribute students across all available hostel blocks.</small>
      </div>

      <div class="form-group">
        <label class="form-label">Allocation Strategy</label>
        <select name="strategy" class="form-select">
          <option value="random_scatter">Pure Random Scatter (Shuffle across all free beds)</option>
          <option value="fill_first">Compact Filling (Fill partially occupied rooms first)</option>
          <option value="balanced_floors">Balanced Floor Distribution (Even spread across floors)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Max Students to Allocate</label>
        <input type="number" name="batch_limit" class="form-input" min="1" max="${unallocatedStudents.length}" value="${unallocatedStudents.length}" />
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Default is all currently pending students (${unallocatedStudents.length}).</small>
      </div>
    `;

    openModal('Random Room Allocation', bodyHTML, async (formData) => {
      const selectedHostelId = formData.get('hostel_id');
      const strategy = formData.get('strategy') || 'random_scatter';
      const batchLimit = parseInt(formData.get('batch_limit'), 10) || unallocatedStudents.length;

      // Filter eligible rooms by hostel selection
      let eligibleRooms = rooms.map(r => ({
        ...r,
        remaining_slots: r.capacity - (r.occupied_count || 0)
      })).filter(r => r.remaining_slots > 0);

      if (selectedHostelId !== 'ALL') {
        eligibleRooms = eligibleRooms.filter(r => r.hostel_id === selectedHostelId);
      }

      if (eligibleRooms.length === 0) {
        showToast('No rooms with available capacity found for the selected criteria.', 'error');
        return;
      }

      // Build available slots list based on room capacity
      let slotPool = [];
      eligibleRooms.forEach(room => {
        for (let i = 0; i < room.remaining_slots; i++) {
          slotPool.push({
            room_id: room.id,
            room_number: room.room_number,
            floor: room.floor,
            hostel_id: room.hostel_id,
            capacity: room.capacity,
            occupied_count: room.occupied_count
          });
        }
      });

      // Apply strategy ordering
      if (strategy === 'fill_first') {
        // Sort slots: rooms with existing occupants come first
        slotPool.sort((a, b) => b.occupied_count - a.occupied_count);
      } else if (strategy === 'balanced_floors') {
        // Sort by floor alternation
        slotPool.sort((a, b) => (a.floor % 3) - (b.floor % 3));
      } else {
        // Pure Random Shuffle of slots (Fisher-Yates)
        for (let i = slotPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [slotPool[i], slotPool[j]] = [slotPool[j], slotPool[i]];
        }
      }

      // Shuffle students for unbiased random selection
      const studentsToAllocate = [...unallocatedStudents];
      for (let i = studentsToAllocate.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [studentsToAllocate[i], studentsToAllocate[j]] = [studentsToAllocate[j], studentsToAllocate[i]];
      }

      const totalToAssign = Math.min(studentsToAllocate.length, slotPool.length, batchLimit);
      const allocatedRecords = [];
      const today = new Date().toISOString().split('T')[0];

      for (let idx = 0; idx < totalToAssign; idx++) {
        allocatedRecords.push({
          student_id: studentsToAllocate[idx].id,
          room_id: slotPool[idx].room_id,
          status: 'active',
          allocated_date: today
        });
      }

      // Batch insert allocations
      const { error: allocError } = await supabase
        .from('room_allocations')
        .insert(allocatedRecords);

      if (allocError) {
        showToast('Random allocation failed: ' + allocError.message, 'error');
        return;
      }

      showToast(`Successfully allocated ${totalToAssign} students across rooms based on capacity!`, 'success');
      closeModal();
      await loadData();
    });
  };

  /**
   * Edit Student Modal
   */
  const openEditStudentModal = async (student) => {
    // Fetch available rooms across all hostels
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, room_number, floor, capacity, occupied_count, hostel:hostel_id(name)')
      .order('hostel_id');

    const availableRooms = (rooms || []).filter(r => {
      const isCurrent = r.id === student.room_id;
      const freeSlots = r.capacity - (r.occupied_count || 0);
      return isCurrent || freeSlots > 0;
    });

    let roomOptions = `<option value="">-- No Room (Unallocated) --</option>`;
    availableRooms.forEach(r => {
      const isSelected = r.id === student.room_id ? 'selected' : '';
      const freeSlots = r.capacity - (r.occupied_count || 0);
      roomOptions += `<option value="${r.id}" ${isSelected}>${r.hostel?.name || 'Block'} - Room ${r.room_number} (Cap: ${r.capacity}, Left: ${freeSlots})</option>`;
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="form-label" style="margin: 0;">Assigned Room</label>
          <button type="button" id="auto-pick-room-btn" class="btn btn-sm btn-secondary" style="font-size: 11px; padding: 3px 8px;">
            Auto-Pick Random Room
          </button>
        </div>
        <select id="edit-room-select" name="room_id" class="form-select">
          ${roomOptions}
        </select>
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Only rooms with available capacity are shown.</small>
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

    // Auto-pick random room event listener
    setTimeout(() => {
      const autoPickBtn = document.getElementById('auto-pick-room-btn');
      const roomSelect = document.getElementById('edit-room-select');
      if (autoPickBtn && roomSelect) {
        autoPickBtn.onclick = () => {
          const validOptions = Array.from(roomSelect.options).filter(opt => opt.value !== '' && opt.value !== student.room_id);
          if (validOptions.length === 0) {
            showToast('No other rooms with available capacity.', 'info');
            return;
          }
          const randomOpt = validOptions[Math.floor(Math.random() * validOptions.length)];
          roomSelect.value = randomOpt.value;
          showToast(`Selected: ${randomOpt.text}`, 'info');
        };
      }
    }, 50);
  };

  searchInput.addEventListener('input', renderFilteredTable);

  await loadData();
}
