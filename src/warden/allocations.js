import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';
import { formatDateForDB, formatDateForUI } from '../utils/date.js';
import { vacateAllocation } from '../utils/db.js';

export async function render(container) {
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: directHostels }, { data: junctionHostels }] = await Promise.all([
    supabase.from('hostels').select('id, name').eq('warden_id', user.id),
    supabase.from('hostel_wardens').select('hostel:hostel_id(id, name)').eq('warden_id', user.id)
  ]);

  const assignedHostelMap = new Map();
  directHostels?.forEach(h => assignedHostelMap.set(h.id, h));
  junctionHostels?.forEach(jh => {
    if (jh.hostel) assignedHostelMap.set(jh.hostel.id, jh.hostel);
  });

  const assignedHostels = Array.from(assignedHostelMap.values());

  if (assignedHostels.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.innerHTML = `
      <div class="empty-state-icon">🏢</div>
      <div class="empty-state-text">You are not assigned to any hostel block yet.</div>
    `;
    container.appendChild(msg);
    return;
  }

  const hostelIds = assignedHostels.map(h => h.id);

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'page-actions-container';

  const randomBtn = document.createElement('button');
  randomBtn.className = 'btn btn-secondary';
  randomBtn.textContent = 'Auto-Allocate (Random)';
  randomBtn.onclick = () => openWardenRandomAllocationModal();

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = 'Allocate Student';
  newBtn.onclick = () => openAllocationModal();

  actionsContainer.appendChild(randomBtn);
  actionsContainer.appendChild(newBtn);

  createPageLayout(container, {
    title: 'Room Allocations',
    description: `Managing ${assignedHostels.map(h => h.name).join(', ')}`,
    actions: [actionsContainer]
  });

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('room_allocations')
      .select('*, student:student_id(full_name, phone), room:room_id!inner(id, room_number, floor, capacity, occupied_count, hostel_id, hostel:hostel_id(name))')
      .in('room.hostel_id', hostelIds)
      .order('allocated_date', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'phone', label: 'Phone', render: (val, row) => row.student?.phone || 'N/A' },
        { key: 'hostel', label: 'Hostel Block', render: (val, row) => row.room?.hostel?.name || 'Block' },
        { key: 'room', label: 'Room', render: (val, row) => `Room ${row.room?.room_number || 'N/A'} (Floor ${row.room?.floor})` },
        { key: 'allocated_date', label: 'Allocated Date', render: (val) => formatDateForUI(val) },
        { key: 'status', label: 'Status', render: (val, row) => createStatusBadge(row.status) }
      ],
      rows: data,
      actions: [
        {
          label: 'Vacate',
          class: 'btn btn-sm btn-danger',
          onClick: async (row) => {
            if (row.status === 'vacated') {
              showToast('This allocation is already vacated', 'info');
              return;
            }
            if (confirm(`Vacate ${row.student?.full_name || 'student'} from Room ${row.room?.room_number}?`)) {
              const { error } = await vacateAllocation(row.id);
              if (error) {
                showToast(error.message, 'error');
              } else {
                showToast('Student vacated successfully', 'success');
                await loadData();
              }
            }
          }
        }
      ],
      emptyMessage: 'No allocations found.'
    });
  };

  const openAllocationModal = async () => {
    const { data: rooms, error: rError } = await supabase
      .from('rooms')
      .select('*, hostel:hostel_id(name)')
      .in('hostel_id', hostelIds)
      .order('room_number');

    if (rError) { showToast(rError.message, 'error'); return; }

    const availableRooms = rooms.filter(r => (r.occupied_count || 0) < r.capacity);
    if (availableRooms.length === 0) {
      showToast('No rooms with available capacity in your assigned blocks.', 'error');
      return;
    }

    const { data: students, error: sError } = await supabase.from('profiles').select('id, full_name').eq('role', 'student');
    if (sError) { showToast(sError.message, 'error'); return; }

    const { data: activeAllocs, error: aError } = await supabase.from('room_allocations').select('student_id').eq('status', 'active');
    if (aError) { showToast(aError.message, 'error'); return; }

    const activeStudentIds = new Set(activeAllocs.map(a => a.student_id));
    const availableStudents = students.filter(s => !activeStudentIds.has(s.id));

    if (availableStudents.length === 0) {
      showToast('All registered students are currently allocated', 'info');
      return;
    }

    const roomOptions = availableRooms.map(r => `<option value="${r.id}">${r.hostel?.name || 'Block'} - Room ${r.room_number} (Free: ${r.capacity - (r.occupied_count || 0)}/${r.capacity})</option>`).join('');
    const studentOptions = availableStudents.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Student</label>
        <select name="student_id" class="form-select" required>
          ${studentOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Room (Capacity-Filtered)</label>
        <select name="room_id" class="form-select" required>
          ${roomOptions}
        </select>
      </div>
    `;

    openModal('Allocate Room', bodyHTML, async (formData) => {
      const student_id = formData.get('student_id');
      const room_id = formData.get('room_id');

      const { error } = await supabase.from('room_allocations').insert({
        room_id,
        student_id,
        status: 'active',
        allocated_date: formatDateForDB()
      });

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Student allocated successfully!', 'success');
        closeModal();
        await loadData();
      }
    });
  };

  const openWardenRandomAllocationModal = async () => {
    const { data: rooms, error: rError } = await supabase
      .from('rooms')
      .select('id, hostel_id, room_number, floor, capacity, occupied_count')
      .in('hostel_id', hostelIds);

    if (rError) { showToast(rError.message, 'error'); return; }

    const availableRooms = rooms.filter(r => (r.capacity - (r.occupied_count || 0)) > 0);
    const totalSlots = availableRooms.reduce((sum, r) => sum + (r.capacity - (r.occupied_count || 0)), 0);

    if (totalSlots === 0) {
      showToast('All rooms in your assigned hostel blocks are currently full.', 'info');
      return;
    }

    const [{ data: students }, { data: activeAllocs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'student'),
      supabase.from('room_allocations').select('student_id').eq('status', 'active')
    ]);

    const activeIds = new Set(activeAllocs?.map(a => a.student_id) || []);
    const unallocated = (students || []).filter(s => !activeIds.has(s.id));

    if (unallocated.length === 0) {
      showToast('All students campus-wide are already allocated to rooms!', 'info');
      return;
    }

    const bodyHTML = `
      <div style="margin-bottom: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 14px 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">Unallocated Students</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-acid-yellow);">${unallocated.length}</div>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted);">Your Block Free Beds</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">${totalSlots}</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Number of Students to Allocate</label>
        <input type="number" name="count" class="form-input" min="1" max="${Math.min(unallocated.length, totalSlots)}" value="${Math.min(unallocated.length, totalSlots)}" />
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Slots available: ${totalSlots}.</small>
      </div>
    `;

    openModal('Auto-Allocate to Your Block', bodyHTML, async (formData) => {
      const count = parseInt(formData.get('count'), 10) || Math.min(unallocated.length, totalSlots);

      const slotPool = [];
      availableRooms.forEach(r => {
        const free = r.capacity - (r.occupied_count || 0);
        for (let i = 0; i < free; i++) {
          slotPool.push(r.id);
        }
      });

      for (let i = slotPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slotPool[i], slotPool[j]] = [slotPool[j], slotPool[i]];
      }

      const studentPool = [...unallocated];
      for (let i = studentPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [studentPool[i], studentPool[j]] = [studentPool[j], studentPool[i]];
      }

      const toAllocate = Math.min(count, slotPool.length, studentPool.length);
      const records = [];
      const today = formatDateForDB();

      for (let i = 0; i < toAllocate; i++) {
        records.push({
          student_id: studentPool[i].id,
          room_id: slotPool[i],
          status: 'active',
          allocated_date: today
        });
      }

      const { error: insError } = await supabase.from('room_allocations').insert(records);
      if (insError) {
        showToast(insError.message, 'error');
        return;
      }

      showToast(`Successfully allocated ${toAllocate} students based on room capacity!`, 'success');
      closeModal();
      await loadData();
    });
  };

  await loadData();
}
