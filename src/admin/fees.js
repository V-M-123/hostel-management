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
  title.textContent = 'Fee Reports & Payments';
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
    <label class="form-label" style="display:inline-block; margin-right: 10px;">Status Filter</label>
    <select id="statusFilter" class="form-select" style="display:inline-block; width:auto;">
      <option value="unpaid" selected>Outstanding Only (Due & Overdue)</option>
      <option value="due">Due</option>
      <option value="overdue">Overdue</option>
      <option value="paid">Paid Records</option>
      <option value="all">All Records</option>
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
      .select('*, student:student_id(full_name, phone), recorder:recorded_by(full_name)');
      
    if (statusFilter === 'unpaid') {
      query = query.neq('status', 'paid');
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query.order('due_date', { ascending: false });

    if (error) { showToast(error.message, 'error'); return; }

    renderTable(tableContainer, {
      columns: [
        { key: 'student', label: 'Student', render: (val, row) => row.student?.full_name || 'Unknown' },
        { key: 'amount', label: 'Amount', render: (val, row) => `₹${Number(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
        { key: 'due_date', label: 'Due Date', render: (val, row) => row.due_date ? new Date(row.due_date).toLocaleDateString() : '-' },
        { key: 'paid_date', label: 'Paid Date', render: (val, row) => {
            if (row.paid_date) {
              const span = document.createElement('span');
              span.style.color = 'var(--color-acid-yellow)';
              span.style.fontWeight = '500';
              span.textContent = new Date(row.paid_date).toLocaleDateString();
              return span;
            }
            return '-';
        }},
        { key: 'status', label: 'Status', render: (val, row) => {
            const badge = document.createElement('span');
            badge.className = `status-badge status-${row.status}`;
            badge.textContent = row.status.toUpperCase();
            return badge;
        }},
        { key: 'recorder', label: 'Recorded By', render: (val, row) => row.recorder?.full_name || 'Admin' }
      ],
      rows: data,
      actions: [
        { 
          label: 'Mark Paid', 
          class: 'btn btn-sm btn-primary',
          show: (row) => row.status !== 'paid',
          onClick: (row) => openMarkPaidModal(row)
        },
        { 
          label: 'Edit', 
          class: 'btn btn-sm btn-secondary', 
          onClick: (row) => editFee(row) 
        },
        { 
          label: 'Delete', 
          class: 'btn btn-sm btn-danger', 
          onClick: async (row) => {
            if (confirm(`Delete fee payment record of ₹${Number(row.amount).toFixed(2)} for ${row.student?.full_name || 'student'}?`)) {
              const { error } = await supabase.from('fee_payments').delete().eq('id', row.id);
              if (error) showToast(error.message, 'error');
              else { showToast('Fee record deleted successfully', 'success'); await loadData(); }
            }
          }
        }
      ],
      emptyMessage: 'No fee records found for the selected filter.'
    });
  };

  document.getElementById('statusFilter').addEventListener('change', loadData);

  /**
   * Quick Mark Paid Modal
   */
  const openMarkPaidModal = (row) => {
    const today = new Date().toISOString().split('T')[0];
    const bodyHTML = `
      <div style="margin-bottom: 16px; background: rgba(209, 254, 23, 0.05); border: 1px solid rgba(209, 254, 23, 0.2); border-radius: var(--radius-sm); padding: 12px 14px;">
        <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 4px;"><strong>Student:</strong> ${row.student?.full_name || 'Student'}</div>
        <div style="font-size: 13px; color: var(--text-primary);"><strong>Amount:</strong> ₹${Number(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Payment / Paid Date</label>
        <input type="date" name="paid_date" class="form-input" value="${today}" max="${today}" required />
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Select the date payment was received.</small>
      </div>
    `;

    openModal('Mark Fee as Paid', bodyHTML, async (formData) => {
      const paidDate = formData.get('paid_date') || today;
      const { error } = await supabase
        .from('fee_payments')
        .update({ 
          status: 'paid', 
          paid_date: paidDate 
        })
        .eq('id', row.id);

      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast(`Fee marked as paid on ${new Date(paidDate).toLocaleDateString()}!`, 'success');
        closeModal();
        await loadData();
      }
    });
  };

  /**
   * Record Fee Modal with dynamic Paid Date input
   */
  const openRecordFeeModal = async () => {
    const { data: students, error: sError } = await supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name');
    if (sError) { showToast(sError.message, 'error'); return; }

    const today = new Date().toISOString().split('T')[0];
    let studentOptions = students.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Student</label>
        <select name="student_id" class="form-select" required>
          ${studentOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount (₹)</label>
        <input type="number" step="0.01" name="amount" class="form-input" min="1" placeholder="15000.00" required />
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input type="date" name="due_date" class="form-input" value="${today}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Payment Status</label>
        <select id="new-fee-status" name="status" class="form-select" required>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div class="form-group" id="paid-date-group" style="display: none;">
        <label class="form-label">Paid Date</label>
        <input type="date" id="new-fee-paid-date" name="paid_date" class="form-input" value="${today}" />
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Date the fee was paid.</small>
      </div>
    `;

    openModal('Record Fee Payment', bodyHTML, async (formData) => {
      const studentId = formData.get('student_id');
      const amount = parseFloat(formData.get('amount'));
      const dueDate = formData.get('due_date');
      const status = formData.get('status');
      const paidDate = status === 'paid' ? (formData.get('paid_date') || today) : null;
      
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('fee_payments')
        .insert({
          student_id: studentId,
          amount,
          due_date: dueDate,
          status,
          paid_date: paidDate,
          recorded_by: user.id
        });
      
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Fee recorded successfully', 'success');
        closeModal();
        await loadData();
      }
    });

    // Auto-toggle Paid Date input on status change
    setTimeout(() => {
      const statusSelect = document.getElementById('new-fee-status');
      const paidDateGroup = document.getElementById('paid-date-group');
      if (statusSelect && paidDateGroup) {
        statusSelect.addEventListener('change', (e) => {
          paidDateGroup.style.display = e.target.value === 'paid' ? 'block' : 'none';
        });
      }
    }, 50);
  };

  /**
   * Edit Fee Modal with Paid Date updations
   */
  const editFee = (row) => {
    const today = new Date().toISOString().split('T')[0];
    const currentPaidDate = row.paid_date ? row.paid_date.split('T')[0] : '';

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Amount (₹)</label>
        <input type="number" step="0.01" name="amount" class="form-input" value="${Number(row.amount).toFixed(2)}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input type="date" name="due_date" class="form-input" value="${row.due_date ? row.due_date.split('T')[0] : ''}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="edit-fee-status" name="status" class="form-select" required>
          <option value="due" ${row.status === 'due' ? 'selected' : ''}>Due</option>
          <option value="paid" ${row.status === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="overdue" ${row.status === 'overdue' ? 'selected' : ''}>Overdue</option>
        </select>
      </div>
      <div class="form-group" id="edit-paid-date-group" style="${row.status === 'paid' ? 'display: block;' : 'display: none;'}">
        <label class="form-label">Paid Date</label>
        <input type="date" id="edit-paid-date-input" name="paid_date" class="form-input" value="${currentPaidDate || today}" />
        <small style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: block;">Update the date payment was settled.</small>
      </div>
    `;

    openModal(`Edit Fee — ${row.student?.full_name || 'Student'}`, bodyHTML, async (formData) => {
      const amount = parseFloat(formData.get('amount'));
      const dueDate = formData.get('due_date');
      const status = formData.get('status');
      let paidDate = formData.get('paid_date') || null;

      if (status === 'paid' && !paidDate) {
        paidDate = today;
      } else if (status !== 'paid') {
        paidDate = null;
      }
      
      const { error } = await supabase
        .from('fee_payments')
        .update({ 
          amount,
          due_date: dueDate,
          status, 
          paid_date: paidDate 
        })
        .eq('id', row.id);
      
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Fee payment and paid date updated successfully!', 'success');
        closeModal();
        await loadData();
      }
    });

    // Dynamic show/hide and auto-preset paid date
    setTimeout(() => {
      const statusSelect = document.getElementById('edit-fee-status');
      const paidDateGroup = document.getElementById('edit-paid-date-group');
      const paidDateInput = document.getElementById('edit-paid-date-input');

      if (statusSelect && paidDateGroup && paidDateInput) {
        statusSelect.addEventListener('change', (e) => {
          if (e.target.value === 'paid') {
            paidDateGroup.style.display = 'block';
            if (!paidDateInput.value) {
              paidDateInput.value = today;
            }
          } else {
            paidDateGroup.style.display = 'none';
          }
        });
      }
    }, 50);
  };

  await loadData();
}
