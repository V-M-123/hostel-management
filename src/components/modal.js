export function openModal(title, bodyHTML, onSubmit) {
  closeModal(); // ensure no duplicates

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  
  const header = document.createElement('div');
  header.className = 'modal-header';
  const hTitle = document.createElement('span');
  hTitle.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = closeModal;
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
  cancelBtn.onclick = closeModal;
  
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
    const data = Object.fromEntries(formData.entries());
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    try {
      await onSubmit(data);
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

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    if (overlay._cleanup) overlay._cleanup();
    overlay.remove();
    document.body.style.overflow = '';
  }
}
