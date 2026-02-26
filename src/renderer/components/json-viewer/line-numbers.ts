export class LineNumbersManager {
  public generateLineNumbers(container: HTMLElement): void {
    const lineNumbers = container.querySelector('.line-numbers') as HTMLElement;
    const nodesContainer = container.querySelector('.json-nodes-container') as HTMLElement;
    if (!lineNumbers || !nodesContainer) return;

    const nodeElements = nodesContainer.querySelectorAll('.json-node, .json-node-bracket');
    const fragment = document.createDocumentFragment();

    let lineNumber = 1;

    // Match each line-number row to the actual rendered JSON row height.
    // This prevents drift when CSS/padding/zoom/font metrics vary.
    nodeElements.forEach((element: Element) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'line-number';
      lineDiv.textContent = lineNumber.toString();

      // Use sub-pixel row height to prevent cumulative drift at high line numbers.
      const rowHeight = element.getBoundingClientRect().height;
      lineDiv.style.height = `${rowHeight}px`;
      lineDiv.style.lineHeight = `${rowHeight}px`;
      lineDiv.style.paddingTop = '0';
      lineDiv.style.paddingBottom = '0';
      lineDiv.style.display = 'block';
      lineDiv.style.boxSizing = 'border-box';

      fragment.appendChild(lineDiv);
      lineNumber++;
    });

    lineNumbers.innerHTML = '';
    lineNumbers.appendChild(fragment);
  }

  public syncLineNumbersScroll(container: HTMLElement): void {
    const lineNumbers = container.querySelector('.line-numbers') as HTMLElement;
    const content = container.querySelector('.json-content') as HTMLElement;

    if (lineNumbers && content) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        lineNumbers.scrollTop = content.scrollTop;
      });
    }
  }

  public reset(): void {
    // no-op
  }
}
