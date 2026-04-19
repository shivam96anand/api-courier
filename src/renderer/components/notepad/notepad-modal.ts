/**
 * Dirty-modal controller. Wraps the markup built by `notepad-layout.ts` and
 * exposes a Promise-based API for asking the user what to do with unsaved
 * changes. Supports keyboard navigation: Enter = primary action (Save),
 * Escape = Cancel.
 */
export type CloseDecision = 'save' | 'discard' | 'cancel';

export interface DirtyModalElements {
  modal: HTMLElement;
  buttons: NodeListOf<HTMLElement>;
}

export class DirtyModal {
  private resolver: ((decision: CloseDecision) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly modal: HTMLElement,
    private readonly options?: { titleEl?: HTMLElement; bodyEl?: HTMLElement }
  ) {
    modal.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.resolve((btn as HTMLElement).dataset.action as CloseDecision);
      });
    });
  }

  /**
   * Open the modal and resolve when the user makes a choice.
   * Optionally override the title/body for context-specific prompts.
   */
  prompt(message?: { title?: string; body?: string }): Promise<CloseDecision> {
    if (this.resolver) {
      // Already open — resolve the previous request as cancel and start fresh.
      this.resolve('cancel');
    }
    if (message?.title && this.options?.titleEl) {
      this.options.titleEl.textContent = message.title;
    }
    if (message?.body && this.options?.bodyEl) {
      this.options.bodyEl.textContent = message.body;
    }
    this.modal.classList.remove('hidden');
    this.attachKeyHandler();
    // Focus the primary action so Enter triggers Save by default.
    const primary = this.modal.querySelector(
      '[data-action="save"]'
    ) as HTMLElement | null;
    primary?.focus();
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  /** Force the modal closed (e.g. on app exit). Resolves any pending prompt. */
  cancel(): void {
    if (this.resolver) this.resolve('cancel');
  }

  private resolve(decision: CloseDecision): void {
    this.modal.classList.add('hidden');
    this.detachKeyHandler();
    if (this.resolver) {
      this.resolver(decision);
      this.resolver = null;
    }
  }

  private attachKeyHandler(): void {
    if (this.keyHandler) return;
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.resolve('cancel');
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement | null;
        // If a non-button is focused, default to Save.
        if (!target || target.tagName !== 'BUTTON') {
          e.preventDefault();
          this.resolve('save');
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler, true);
  }

  private detachKeyHandler(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }
}
