import { showToast } from './toast.js';
import { animateModalIn, animateModalOut } from '../utils/motionTransitions.js';

let isClosing = false;

export function openModal(title, bodyHTML, onSubmit) {
  closeModal(true); // force close any existing

  isClosing = false;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'modal-overlay';
  overlay.style.pointerEvents = 'auto';
  
  const content = document.createElement('div');
  content.className = 'modal-content modal-container';
  content.style.pointerEvents = 'auto';
  
  const header = document.createElement('div');
  header.className = 'modal-header';
  const hTitle = document.createElement('h3');
  hTitle.className = 'modal-title';
  hTitle.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => closeModal();
  header.appendChild(hTitle);
  header.appendChild(closeBtn);
  
  const body = document.createElement('div');
  body.className = 'modal-body';
  const form = document.createElement('form');
  form.innerHTML = bodyHTML;
  body.appendChild(form);
  
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => closeModal();
  
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = 'Submit';
  
  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);
  form.appendChild(footer);
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    
    // Support both FormData.get('field') and data.field
    const entries = Object.fromEntries(formData.entries());
    Object.assign(formData, entries);
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
      await onSubmit(formData, entries);
    } catch (err) {
      console.error('[Modal] Submit handler error:', err);
      showToast(err.message || 'An unexpected error occurred', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  });
  
  content.appendChild(header);
  content.appendChild(body);
  overlay.appendChild(content);
  
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Automatically link paired date inputs (e.g. from_date & to_date)
  const fromDateInput = form.querySelector('input[name="from_date"], input[name="start_date"]');
  const toDateInput = form.querySelector('input[name="to_date"], input[name="end_date"]');
  if (fromDateInput && toDateInput) {
    const handleFromChange = () => {
      if (fromDateInput.value) {
        toDateInput.min = fromDateInput.value;
        if (toDateInput.value && toDateInput.value < fromDateInput.value) {
          toDateInput.value = fromDateInput.value;
        }
      }
    };
    fromDateInput.addEventListener('change', handleFromChange);
    fromDateInput.addEventListener('input', handleFromChange);

    toDateInput.addEventListener('change', () => {
      if (fromDateInput.value && toDateInput.value && toDateInput.value < fromDateInput.value) {
        showToast('To Date cannot be earlier than From Date', 'warning');
        toDateInput.value = fromDateInput.value;
      }
    });

    // Run initial sync if fromDate has value
    if (fromDateInput.value) {
      toDateInput.min = fromDateInput.value;
    }
  }

  if (typeof onMount === 'function') {
    try {
      onMount(form, content);
    } catch (e) {
      console.error('[Modal onMount error]', e);
    }
  }

  // Trigger motion.dev spring animation
  animateModalIn(overlay, content);
  
  const escapeHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escapeHandler);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  
  overlay._cleanup = () => {
    document.removeEventListener('keydown', escapeHandler);
  };
}

export async function closeModal(instant = false) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay || isClosing) return;

  if (instant) {
    if (overlay._cleanup) overlay._cleanup();
    overlay.remove();
    document.body.style.overflow = '';
    return;
  }

  isClosing = true;
  const content = overlay.querySelector('.modal-content');
  if (overlay._cleanup) overlay._cleanup();
  
  try {
    await animateModalOut(overlay, content);
  } catch (e) {}

  overlay.remove();
  document.body.style.overflow = '';
  isClosing = false;
}
