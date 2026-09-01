import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';

export async function render(container) {
  container.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Fee Reports';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'page-actions';
  const recordBtn = document.createElement('button');
  recordBtn.className = 'btn btn-primary';
  recordBtn.textContent = '+ Record Fee';
  recordBtn.onclick = () => openRecordFeeModal();
  actions.appendChild(recordBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.style.marginBottom = '20px';
  
  const statusGroup = document.createElement('div');
  statusGroup.className = 'filter-group';
  statusGroup.innerHTML = `
    <label class="form-label" style="display:inline-block; margin-right: 10px;">Status</label>
    <select id="statusFilter" class="form-select" style="display:inline-block; width:auto;">
      <option value="all">All</option>
      <option value="due">Due</option>
      <option value="paid">Paid</option>
      <option value="overdue">Overdue</option>
    </select>
  `;
  filterBar.appendChild(statusGroup);
  container.appendChild(filterBar);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';
    const statusFilter = document.getElementById('statusFilter').value;
    
    let query = supabase
      .from('fee_payments')
      .select('*, student:student_id(full_name), recorder:recorded_by(full_name)');
      
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.order('due_date', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'amount', label: 'Amount', render: (val, row) => `$${row.amount}` },
        { key: 'due_date', label: 'Due Date', render: (val, row) => new Date(row.due_date).toLocaleDateString() },
        { key: 'paid_date', label: 'Paid Date', render: (val, row) => row.paid_date ? new Date(row.paid_date).toLocaleDateString() : '-' },
        { key: 'status', label: 'Status', render: (val, row) => {
            const badge = document.createElement('span');
            badge.className = `status-badge status-${row.status}`;
            badge.textContent = row.status;
            return badge;
        }},
        { key: 'recorder', label: 'Recorded By', render: (val, row) => row.recorder?.full_name || 'System' }
      ],
      rows: data,
      actions: [
        { label: 'Edit', class: 'btn btn-sm btn-secondary', onClick: (row) => editFee(row) },
        { label: 'Delete', class: 'btn btn-sm btn-danger', onClick: async (row) => {
            if (confirm('Delete this fee record?')) {
              const { error } = await supabase.from('fee_payments').delete().eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Deleted successfully'); loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No fee records found.'
    });
  };

  document.getElementById('statusFilter').addEventListener('change', loadData);

  const openRecordFeeModal = async () => {
    const { data: students, error: sError } = await supabase.from('profiles').select('id, full_name').eq('role', 'student');
    if (sError) { showToast(sError.message, 'error'); return; }

    let studentOptions = students.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Student</label>
        <select name="student_id" class="form-select" required>
          ${studentOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" name="amount" class="form-input" min="0" step="0.01" required />
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input type="date" name="due_date" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select name="status" class="form-select" required>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
    `;

    openModal('Record Fee', bodyHTML, async (formData) => {
      const studentId = formData.get('student_id');
      const amount = parseFloat(formData.get('amount'));
      const dueDate = formData.get('due_date');
      const status = formData.get('status');
      
      const { error } = await supabase.rpc('create_fee_record', {
        p_student_id: studentId,
        p_amount: amount,
        p_due_date: dueDate,
        p_status: status
      });
      
      if (error) throw error;
      showToast('Fee recorded successfully');
      closeModal();
      loadData();
    });
  };

  const editFee = (row) => {
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Status</label>
        <select name="status" class="form-select" id="editStatus" required>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Paid Date (if paid)</label>
        <input type="date" name="paid_date" class="form-input" id="editPaidDate" />
      </div>
    `;

    openModal('Edit Fee', bodyHTML, async (formData) => {
      const status = formData.get('status');
      const paidDate = formData.get('paid_date') || null;
      
      const { error } = await supabase.from('fee_payments').update({ status, paid_date: paidDate }).eq('id', row.id);
      
      if (error) throw error;
      showToast('Fee updated successfully');
      closeModal();
      loadData();
    });
    
    document.getElementById('editStatus').value = row.status;
    if (row.paid_date) {
        document.getElementById('editPaidDate').value = row.paid_date.split('T')[0];
    }
  };

  loadData();
}
