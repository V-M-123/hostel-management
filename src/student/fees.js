import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Fee Status';
  header.appendChild(title);
  container.appendChild(header);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  let fees = [];
  try {
    const res = await supabase
      .from('fee_payments')
      .select('*')
      .eq('student_id', user.id)
      .order('due_date', { ascending: false });
    fees = res.data || [];
  } catch (e) {
    console.warn('Fees query error:', e);
  }

  let totalDue = 0, totalPaid = 0, totalOverdue = 0;
  if (fees) {
    fees.forEach(f => {
      if (f.status === 'due') totalDue += Number(f.amount);
      if (f.status === 'paid') totalPaid += Number(f.amount);
      if (f.status === 'overdue') totalOverdue += Number(f.amount);
    });
  }

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
    createCard('Total Paid', totalPaid, 'success'),
    createCard('Total Due', totalDue, 'warning'),
    createCard('Total Overdue', totalOverdue, 'danger')
  );
  container.appendChild(cardsGrid);

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  renderTable(tableContainer, {
    columns: [
      { key: 'amount', label: 'Amount', render: (val) => `₹${Number(val).toFixed(2)}` },
      { key: 'due_date', label: 'Due Date', render: (val) => val ? new Date(val).toLocaleDateString() : '-' },
      { key: 'paid_date', label: 'Paid Date', render: (val) => val ? new Date(val).toLocaleDateString() : '-' },
      { key: 'status', label: 'Status', render: (val) => {
          const span = document.createElement('span');
          span.className = `status-badge status-${val}`;
          span.textContent = val.toUpperCase();
          return span;
      }}
    ],
    rows: fees || [],
    emptyMessage: 'No fee records found'
  });
}
