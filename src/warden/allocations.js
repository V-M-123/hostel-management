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
  title.textContent = 'Room Allocations';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ Allocate Student';
  newBtn.onclick = () => openAllocationModal();
  actions.appendChild(newBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('room_allocations')
      .select('*, student:student_id(full_name, phone), room:room_id!inner(room_number, floor, hostel_id)')
      .eq('room.hostel_id', hostelId)
      .order('allocated_date', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'phone', label: 'Phone', render: (val, row) => row.student?.phone || 'N/A' },
        { key: 'room', label: 'Room', render: (val, row) => row.room?.room_number || 'N/A' },
        { key: 'floor', label: 'Floor', render: (val, row) => row.room?.floor?.toString() || 'N/A' },
        { key: 'allocated_date', label: 'Allocated Date', render: (val) => val ? new Date(val).toLocaleDateString() : 'N/A' },
        { key: 'status', label: 'Status', render: (val, row) => {
            const statusClass = row.status === 'active' ? 'status-active' : 'status-vacated';
            const badge = document.createElement('span');
            badge.className = `status-badge ${statusClass}`;
            badge.textContent = row.status ? row.status.toUpperCase() : 'UNKNOWN';
            return badge;
        }}
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
              const vacatedDate = new Date().toISOString().split('T')[0];
              const { error } = await supabase
                .from('room_allocations')
                .update({ status: 'vacated', vacated_date: vacatedDate })
                .eq('id', row.id);

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
    // 1. Get rooms in this hostel
    const { data: rooms, error: rError } = await supabase.from('rooms').select('*').eq('hostel_id', hostelId);
    if (rError) { showToast(rError.message, 'error'); return; }
    
    const availableRooms = rooms.filter(r => (r.occupied_count || 0) < r.capacity);
    if (availableRooms.length === 0) {
      showToast('No rooms with available capacity', 'error');
      return;
    }

    // 2. Get students
    const { data: students, error: sError } = await supabase.from('profiles').select('id, full_name').eq('role', 'student');
    if (sError) { showToast(sError.message, 'error'); return; }

    // 3. Filter out currently active students
    const { data: activeAllocs, error: aError } = await supabase.from('room_allocations').select('student_id').eq('status', 'active');
    if (aError) { showToast(aError.message, 'error'); return; }
    
    const activeStudentIds = new Set(activeAllocs.map(a => a.student_id));
    const availableStudents = students.filter(s => !activeStudentIds.has(s.id));
    
    if (availableStudents.length === 0) {
      showToast('All registered students are currently allocated', 'info');
      return;
    }

    const roomOptions = availableRooms.map(r => `<option value="${r.id}">${r.room_number} (Left: ${r.capacity - (r.occupied_count || 0)})</option>`).join('');
    const studentOptions = availableStudents.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Student</label>
        <select name="student_id" class="form-select" required>
          ${studentOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Room</label>
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
        allocated_date: new Date().toISOString().split('T')[0]
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

  await loadData();
}
