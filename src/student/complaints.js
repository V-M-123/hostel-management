import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { filterComplaints } from '../utils/complaintsFilter.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'My Complaints';
  
  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ New Complaint';
  actions.appendChild(addBtn);

  header.append(title, actions);
  container.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.style.marginBottom = '16px';
  filterBar.innerHTML = `
    <select id="studentStatusFilter" class="form-select" style="width: auto; display: inline-block;">
      <option value="active" selected>Active Issues (Unresolved)</option>
      <option value="open">Open</option>
      <option value="in_progress">In Progress</option>
      <option value="resolved">Resolved (< 10 days)</option>
      <option value="all">All Complaints</option>
    </select>
  `;
  container.appendChild(filterBar);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  // Fetch student's room allocation safely (avoids maybeSingle multiple rows error)
  const { data: allocations, error: allocError } = await supabase
    .from('room_allocations')
    .select('id, room_id, status, room:room_id(id, room_number, floor, hostel:hostel_id(name))')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('allocated_date', { ascending: false });

  let allocation = allocations && allocations.length > 0 ? allocations[0] : null;

  // Fallback to any latest allocation if no active found
  if (!allocation) {
    const { data: anyAlloc } = await supabase
      .from('room_allocations')
      .select('id, room_id, status, room:room_id(id, room_number, floor, hostel:hostel_id(name))')
      .eq('student_id', user.id)
      .order('allocated_date', { ascending: false })
      .limit(1);
    if (anyAlloc && anyAlloc.length > 0) {
      allocation = anyAlloc[0];
    }
  }

  // If no room is allocated, display a helpful notice banner
  if (!allocation) {
    const notice = document.createElement('div');
    notice.style.marginBottom = '20px';
    notice.style.padding = '14px 18px';
    notice.style.background = 'rgba(232, 168, 56, 0.08)';
    notice.style.border = '1px solid rgba(232, 168, 56, 0.25)';
    notice.style.borderRadius = 'var(--radius)';
    notice.style.display = 'flex';
    notice.style.alignItems = 'center';
    notice.style.gap = '12px';
    notice.style.color = 'var(--color-ink)';
    notice.innerHTML = `
      <span style="font-size: 20px;">🏢</span>
      <div>
        <div style="font-weight: 500; margin-bottom: 2px;">No Active Room Allocation</div>
        <div style="font-size: 13px; color: var(--color-muted);">You are not currently assigned to a hostel room. Please ask your warden or administrator for room allocation to log room-specific maintenance requests.</div>
      </div>
    `;
    container.appendChild(notice);
  }

  addBtn.addEventListener('click', async () => {
    if (!allocation) {
      // Fetch available rooms so the student can select or contact admin
      const { data: rooms } = await supabase.from('rooms').select('id, room_number, hostel:hostel_id(name)').order('room_number').limit(50);
      
      if (!rooms || rooms.length === 0) {
        showToast('You must be assigned to a room by your warden or administrator before filing a complaint.', 'error');
        return;
      }

      const roomOptions = rooms.map(r => `<option value="${r.id}">${r.hostel?.name || 'Block'} — Room ${r.room_number}</option>`).join('');

      const bodyHTML = `
        <div style="margin-bottom: 16px; background: rgba(232, 168, 56, 0.08); border: 1px solid rgba(232, 168, 56, 0.25); border-radius: var(--radius-sm); padding: 12px 14px; font-size: 13px; color: var(--color-ink);">
          ⚠️ You do not have an active room allocation. Please select your room to log this complaint:
        </div>
        <div class="form-group">
          <label class="form-label">Select Room / Location</label>
          <select name="room_id" class="form-select" required>
            ${roomOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select name="category" class="form-select" required>
            <option value="maintenance">Maintenance</option>
            <option value="cleanliness">Cleanliness</option>
            <option value="noise">Noise</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" required rows="4" placeholder="Describe the issue..."></textarea>
        </div>
      `;

      openModal('File a Complaint', bodyHTML, async (formData) => {
        const roomId = formData.get('room_id');
        const category = formData.get('category');
        const description = formData.get('description');
        const { error } = await supabase.from('complaints').insert({
          student_id: user.id,
          room_id: roomId,
          category,
          description
        });
        if (error) {
          showToast(error.message, 'error');
        } else {
          showToast('Complaint filed successfully!', 'success');
          closeModal();
          await render(container);
        }
      });
      return;
    }

    const roomLabel = `${allocation.room?.hostel?.name || 'Hostel Block'} — Room ${allocation.room?.room_number || 'Your Room'}`;

    const bodyHTML = `
      <div style="margin-bottom: 16px; background: rgba(232, 168, 56, 0.06); border: 1px solid var(--color-rule); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; color: var(--color-ink);">
        <strong>Assigned Location:</strong> ${roomLabel}
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select name="category" class="form-select" required>
          <option value="maintenance">Maintenance</option>
          <option value="cleanliness">Cleanliness</option>
          <option value="noise">Noise</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea name="description" class="form-textarea" required rows="4" placeholder="Describe the issue..."></textarea>
      </div>
    `;

    openModal('New Complaint', bodyHTML, async (formData) => {
      const category = formData.get('category');
      const description = formData.get('description');
      const { error } = await supabase.from('complaints').insert({
        student_id: user.id,
        room_id: allocation.room_id,
        category,
        description
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Complaint filed successfully!', 'success');
        closeModal();
        await render(container);
      }
    });
  });

  let allComplaints = [];
  try {
    const res = await supabase
      .from('complaints')
      .select('*, room:room_id(room_number)')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false });
    allComplaints = res.data || [];
  } catch (e) {
    console.warn('Complaints query error:', e);
  }

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const renderTableData = () => {
    tableContainer.innerHTML = '';
    const statusVal = document.getElementById('studentStatusFilter').value;
    const filtered = filterComplaints(allComplaints, statusVal, 'all');

    renderTable(tableContainer, {
      columns: [
        { key: 'category', label: 'Category', render: (val) => val.charAt(0).toUpperCase() + val.slice(1) },
        { key: 'description', label: 'Description', render: (val) => val.length > 80 ? val.substring(0, 80) + '...' : val },
        { key: 'room', label: 'Room', render: (val) => val?.room_number || 'N/A' },
        { key: 'status', label: 'Status', render: (val) => {
            const span = document.createElement('span');
            span.className = `status-badge status-${val}`;
            span.textContent = val.replace('_', ' ').toUpperCase();
            return span;
        }},
        { key: 'created_at', label: 'Filed On', render: (val) => new Date(val).toLocaleDateString() },
        { key: 'resolved_at', label: 'Resolved On', render: (val) => val ? new Date(val).toLocaleDateString() : '-' },
      ],
      rows: filtered || [],
      emptyMessage: 'No active complaints filed'
    });
  };

  document.getElementById('studentStatusFilter').addEventListener('change', renderTableData);
  renderTableData();
}
