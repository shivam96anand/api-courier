/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DirtyModal } from '../notepad-modal';

function buildModal() {
  document.body.innerHTML = `
    <div id="m" class="hidden">
      <div id="t"></div>
      <div id="b"></div>
      <button data-action="save">Save</button>
      <button data-action="discard">Discard</button>
      <button data-action="cancel">Cancel</button>
    </div>
  `;
  const modalEl = document.getElementById('m') as HTMLElement;
  const titleEl = document.getElementById('t') as HTMLElement;
  const bodyEl = document.getElementById('b') as HTMLElement;
  return new DirtyModal(modalEl, { titleEl, bodyEl });
}

describe('DirtyModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the modal when prompt() is called', () => {
    const modal = buildModal();
    void modal.prompt();
    expect(document.getElementById('m')!.classList.contains('hidden')).toBe(
      false
    );
  });

  it('applies optional title and body overrides', async () => {
    const modal = buildModal();
    void modal.prompt({ title: 'Bye?', body: 'Save first?' });
    expect(document.getElementById('t')!.textContent).toBe('Bye?');
    expect(document.getElementById('b')!.textContent).toBe('Save first?');
  });

  it('resolves with the clicked action', async () => {
    const modal = buildModal();
    const p = modal.prompt();
    (document.querySelector('[data-action="discard"]') as HTMLElement).click();
    await expect(p).resolves.toBe('discard');
  });

  it('hides the modal after a decision', async () => {
    const modal = buildModal();
    const p = modal.prompt();
    (document.querySelector('[data-action="save"]') as HTMLElement).click();
    await p;
    expect(document.getElementById('m')!.classList.contains('hidden')).toBe(
      true
    );
  });

  it('Escape resolves as cancel', async () => {
    const modal = buildModal();
    const p = modal.prompt();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(p).resolves.toBe('cancel');
  });

  it('Enter on body resolves as save', async () => {
    const modal = buildModal();
    const p = modal.prompt();
    // Simulate focus on the modal body (non-button) before pressing Enter.
    const evt = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(evt, 'target', { value: document.body });
    document.dispatchEvent(evt);
    await expect(p).resolves.toBe('save');
  });

  it('cancel() resolves any pending prompt', async () => {
    const modal = buildModal();
    const p = modal.prompt();
    modal.cancel();
    await expect(p).resolves.toBe('cancel');
  });

  it('opening a second prompt cancels the first', async () => {
    const modal = buildModal();
    const first = modal.prompt();
    const second = modal.prompt();
    await expect(first).resolves.toBe('cancel');
    (document.querySelector('[data-action="save"]') as HTMLElement).click();
    await expect(second).resolves.toBe('save');
  });
});
