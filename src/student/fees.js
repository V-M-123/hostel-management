import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';
import { formatDateForUI } from '../utils/date.js';

export async function render(container) {
  container.innerHTML = '';

  createPageLayout(container, {
    title: 'Fee Status'
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  let allFees = [];
  try {
    const res = await supabase
      .from('fee_payments')
      .select('*')
      .eq('student_id', user.id)
      .order('due_date', { ascending: false });
    allFees = res.data || [];
  } catch (e) {
    console.warn('Fees query error:', e);
  }

  let totalDue = 0, totalPaid = 0, totalOverdue = 0;
  allFees.forEach(f => {
    if (f.status === 'due') totalDue += Number(f.amount);
    if (f.status === 'paid') totalPaid += Number(f.amount);
    if (f.status === 'overdue') totalOverdue += Number(f.amount);
  });

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'cards-grid';
  cardsGrid.style.marginBottom = '20px';

  const createCard = (label, amount, colorClass) => {
    const card = document.createElement('div');
    card.className = 'stat-card glass-panel';
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = `₹${amount.toFixed(2)}`;
    if (colorClass) val.style.color = `var(--${colorClass})`;
    const lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = label;
    card.append(val, lbl);
    return card;
  };

  cardsGrid.append(
    createCard('Outstanding Due', totalDue, 'warning'),
    createCard('Overdue Amount', totalOverdue, 'danger'),
    createCard('Total Paid to Date', totalPaid, 'success')
  );
  container.appendChild(cardsGrid);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.style.marginBottom = '16px';
  filterBar.innerHTML = `
    <select id="studentFeeFilter" class="form-select" style="width: auto; display: inline-block;">
      <option value="unpaid" selected>Outstanding Dues Only</option>
      <option value="due">Due Only</option>
      <option value="overdue">Overdue Only</option>
      <option value="paid">Paid Receipts</option>
      <option value="all">All Fee Records</option>
    </select>
  `;
  container.appendChild(filterBar);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const renderFeeTable = () => {
    tableContainer.innerHTML = '';
    const filter = document.getElementById('studentFeeFilter').value;

    const filtered = allFees.filter(f => {
      if (filter === 'unpaid') return f.status !== 'paid';
      if (filter === 'all') return true;
      return f.status === filter;
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'amount', label: 'Amount', render: (val) => `₹${Number(val).toFixed(2)}` },
        { key: 'due_date', label: 'Due Date', render: (val) => formatDateForUI(val) },
        { key: 'paid_date', label: 'Paid Date', render: (val) => formatDateForUI(val) },
        { key: 'status', label: 'Status', render: (val) => createStatusBadge(val) }
      ],
      rows: filtered || [],
      emptyMessage: 'No outstanding fees pending.'
    });
  };

  document.getElementById('studentFeeFilter').addEventListener('change', renderFeeTable);
  renderFeeTable();
}
