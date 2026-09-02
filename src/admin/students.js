import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { renderEmptyState } from '../components/emptyState.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">Student Directory</h1>
      <p style="color: var(--text-secondary); font-size: 14px;">Campus-wide student registrations and room allocation status</p>
    </div>
  `;

  const searchControls = document.createElement('div');
  searchControls.style.display = 'flex';
  searchControls.style.gap = '12px';
  searchControls.style.alignItems = 'center';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search by name or phone...';
  searchInput.className = 'form-input';
  searchInput.style.width = '240px';

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
          status,
          allocated_date,
          room:room_id(
            room_number,
            floor,
            hostel:hostel_id(name)
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
        room: activeAlloc?.room?.room_number ? `Room ${activeAlloc.room.room_number}` : 'No Room',
        floor: activeAlloc?.room?.floor ? `Floor ${activeAlloc.room.floor}` : '-',
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
      emptyMessage: 'No students found'
    });
  };

  searchInput.addEventListener('input', renderFilteredTable);

  await loadData();
}
