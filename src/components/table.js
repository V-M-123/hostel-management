import { renderEmptyState } from './emptyState.js';

export function renderTable(container, options) {
  const { columns, rows, actions, emptyMessage = 'No data available' } = options;
  
  if (!rows || rows.length === 0) {
    renderEmptyState(container, emptyMessage);
    return;
  }
  
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-container glass-panel';
  
  const table = document.createElement('table');
  table.className = 'data-table';
  
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    trHead.appendChild(th);
  });
  if (actions && actions.length > 0) {
    const thActions = document.createElement('th');
    thActions.textContent = 'Actions';
    trHead.appendChild(thActions);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    
    columns.forEach(col => {
      const td = document.createElement('td');
      if (col.render) {
        const result = col.render(row[col.key], row);
        if (result instanceof HTMLElement) {
          td.appendChild(result);
        } else {
          td.textContent = result;
        }
      } else {
        td.textContent = row[col.key] || '';
      }
      tr.appendChild(td);
    });
    
    if (actions && actions.length > 0) {
      const tdActions = document.createElement('td');
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${action.class || 'btn-secondary'}`;
        btn.style.marginRight = '8px';
        btn.textContent = action.label;
        btn.onclick = () => action.onClick(row);
        tdActions.appendChild(btn);
      });
      tr.appendChild(tdActions);
    }
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}
