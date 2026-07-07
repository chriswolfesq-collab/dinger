// Modal focus management shared by help and stats dialogs.

let lastFocusedEl = null;

function getFocusableEls(container) {
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function trapFocusKeydown(e, modal) {
  if (e.key !== 'Tab') return;
  const focusable = getFocusableEls(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function toggleModal(modal, show, triggerEl) {
  const wasOpen = !modal.classList.contains('hidden');
  modal.classList.toggle('hidden', !show);

  if (show && !wasOpen) {
    lastFocusedEl = triggerEl || document.activeElement;
    const focusable = getFocusableEls(modal);
    if (focusable.length) focusable[0].focus();
    modal._trapHandler = (e) => trapFocusKeydown(e, modal);
    modal.addEventListener('keydown', modal._trapHandler);
  } else if (!show && wasOpen) {
    if (modal._trapHandler) {
      modal.removeEventListener('keydown', modal._trapHandler);
      modal._trapHandler = null;
    }
    if (lastFocusedEl) lastFocusedEl.focus();
  }
}
