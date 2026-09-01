import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';
  
  const { data: { user } } = await supabase.auth.getUser();
  const { data: hostel, error: hError } = await supabase.from('hostels').select('id').eq('warden_id', user.id).single();

  if (hError || !hostel) {
    const msg = document.createElement('p');
    msg.textContent = 'You are not assigned to any hostel block yet.';
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
  const allocBtn = document.createElement('button');
  allocBtn.className = 'btn btn-primary';
  allocBtn.textContent = '+ Allocate Student';
  allocBtn.onclick = () => openAllocationModal();
  actions.appendChild(allocBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const { data, error } = await supabase
      .from('room_allocations')
      .select('*, student:student_id(full_name), room:room_id(room_number)')
      .order('allocated_date', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'room', label: 'Room', render: (val, row) => row.room?.room_number || 'Unknown' },
        { key: 'allocated_date', label: 'Allocated Date', render: (val, row) => new Date(row.allocated_date).toLocaleDateString() },
        { key: 'vacated_date', label: 'Vacated Date', render: (val, row) => row.vacated_date ? new Date(row.vacated_date).toLocaleDateString() : '-' },
        { key: 'status', label: 'Status', render: (val, row) => {
            const badge = document.createElement('span');
            badge.className = `status-badge status-${row.status}`;
            badge.textContent = row.status;
            return badge;
        }}
      ],
      rows: data,
      actions: [
        { 
          label: 'Vacate', 
          class: 'btn btn-sm btn-secondary', 
          onClick: async (row) => {
            if (row.status === 'vacated') {
                showToast('Already vacated', 'info');
                return;
            }
            if (confirm(`Vacate ${row.student?.full_name} from Room ${row.room?.room_number}?`)) {
              const vacatedDate = new Date().toISOString().split('T')[0];
              const { error } = await supabase.from('room_allocations').update({ status: 'vacated', vacated_date: vacatedDate }).eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Vacated successfully'); loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No allocations found.'
    });
  };

  const openAllocationModal = async () => {
    // get available rooms
    const { data: rooms, error: rError } = await supabase.from('rooms').select('*').eq('hostel_id', hostelId);
    if (rError) { showToast(rError.message, 'error'); return; }
    
    const availableRooms = rooms.filter(r => (r.occupied_count || 0) < r.capacity);
    if (availableRooms.length === 0) {
        showToast('No rooms with available capacity', 'error');
        return;
    }

    // get students
    const { data: students, error: sError } = await supabase.from('profiles').select('id, full_name').eq('role', 'student');
    if (sError) { showToast(sError.message, 'error'); return; }

    // get active allocations to filter students
    const { data: activeAllocs, error: aError } = await supabase.from('room_allocations').select('student_id').eq('status', 'active');
    if (aError) { showToast(aError.message, 'error'); return; }
    
    const activeStudentIds = new Set(activeAllocs.map(a => a.student_id));
    const availableStudents = students.filter(s => !activeStudentIds.has(s.id));
    
    if (availableStudents.length === 0) {
        showToast('No available students to allocate', 'error');
        return;
    }

    let roomOptions = availableRooms.map(r => `<option value="${r.id}">${r.room_number} (Capacity: ${r.capacity - r.occupied_count} left)</option>`).join('');
    let studentOptions = availableStudents.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');

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
      
      const { error } = await supabase.from('room_allocations').insert({ room_id, student_id, status: 'active' });
      if (error) throw error;
      
      showToast('Student allocated successfully');
      closeModal();
      loadData();
    });
  };

  loadData();
}
