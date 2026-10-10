/** Looks up an element that index.html is known to contain. A missing id is a programming error. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

export function svgById<T extends SVGElement = SVGElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as unknown as T;
}

/** Sets text only when it changed, so a 60 fps render loop does not thrash the DOM or VoiceOver. */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setAttr(element: Element, name: string, value: string | null): void {
  if (value === null) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

export function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Brief, non-blocking message. Also read out by VoiceOver (the element is a polite live region). */
export function toast(message: string, durationMs = 4000): void {
  const element = byId('toast');
  element.textContent = message;
  element.hidden = false;
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, durationMs);
}

/** Opens a <dialog> as a modal sheet and lets a tap on the dimmed backdrop dismiss it. */
export function openSheet(dialog: HTMLDialogElement, onBackdrop?: () => void): void {
  if (!dialog.open) dialog.showModal();
  dialog.onclick = (event) => {
    if (event.target !== dialog) return;
    // Only taps outside the sheet's box count (padding inside the box also targets the dialog).
    const box = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (inside) return;
    if (onBackdrop) onBackdrop();
    else dialog.close('cancel');
  };
}

export type ConfirmOptions = {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
};

/** Native-feeling confirmation sheet. Resolves true only for an explicit tap on the confirm button. */
export function confirmSheet(options: ConfirmOptions): Promise<boolean> {
  const dialog = byId<HTMLDialogElement>('confirm-sheet');
  byId('confirm-title').textContent = options.title;
  byId('confirm-text').textContent = options.text;
  byId('confirm-yes').textContent = options.confirmLabel;
  byId('confirm-no').textContent = options.cancelLabel;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    openSheet(dialog);
    byId('confirm-no').focus();
  });
}
