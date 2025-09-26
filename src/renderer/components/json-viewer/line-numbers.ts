export class LineNumbersManager {
  private lineHeightPx = 0;

  public generateLineNumbers(container: HTMLElement): void {
    const lineNumbers = container.querySelector('.line-numbers') as HTMLElement;
    const nodesContainer = container.querySelector('.json-nodes-container') as HTMLElement;
    if (!lineNumbers || !nodesContainer) return;

    const nodeElements = nodesContainer.querySelectorAll('.json-node, .json-node-bracket');
    const fragment = document.createDocumentFragment();

    if (this.lineHeightPx === 0) {
      this.measureLineHeight(nodesContainer);
    }

    let lineNumber = 1;

    if (nodeElements.length > 1000) {
      nodeElements.forEach((element: Element) => {
        const nodeElement = element as HTMLElement;
        const lineDiv = document.createElement('div');
        lineDiv.className = 'line-number';
        lineDiv.textContent = lineNumber.toString();

        const nodeHeight = nodeElement.getBoundingClientRect().height;
        lineDiv.style.height = `${nodeHeight}px`;
        lineDiv.style.lineHeight = `${nodeHeight}px`;

        fragment.appendChild(lineDiv);
        lineNumber++;
      });
    } else {
      nodeElements.forEach((element: Element) => {
        const nodeElement = element as HTMLElement;
        const nodeHeight = nodeElement.getBoundingClientRect().height;

        const visualLines = Math.max(1, Math.round(nodeHeight / this.lineHeightPx));

        for (let i = 0; i < visualLines; i++) {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'line-number';
          lineDiv.textContent = lineNumber.toString();

          lineDiv.style.height = `${this.lineHeightPx}px`;
          lineDiv.style.lineHeight = `${this.lineHeightPx}px`;
          lineDiv.style.display = 'block';

          fragment.appendChild(lineDiv);
          lineNumber++;
        }
      });
    }

    lineNumbers.innerHTML = '';
    lineNumbers.appendChild(fragment);
  }

  private measureLineHeight(nodesContainer: HTMLElement): void {
    const testElement = document.createElement('div');
    testElement.className = 'json-node';
    testElement.style.position = 'absolute';
    testElement.style.visibility = 'hidden';
    testElement.style.top = '-9999px';
    testElement.style.left = '-9999px';
    testElement.style.whiteSpace = 'nowrap';
    testElement.style.height = 'auto';
    testElement.style.minHeight = '0';
    testElement.style.maxHeight = 'none';
    testElement.innerHTML = '<div class="node-content"><span class="expand-icon"></span><span class="key">"test"</span><span class="separator">: </span><span class="value">"M"</span></div>';

    nodesContainer.appendChild(testElement);
    this.lineHeightPx = testElement.getBoundingClientRect().height;
    nodesContainer.removeChild(testElement);

    if (this.lineHeightPx <= 0) {
      this.lineHeightPx = 20;
    }
  }

  public syncLineNumbersScroll(container: HTMLElement): void {
    const lineNumbers = container.querySelector('.line-numbers') as HTMLElement;
    const content = container.querySelector('.json-content') as HTMLElement;

    if (lineNumbers && content) {
      lineNumbers.scrollTop = content.scrollTop;
    }
  }

  public reset(): void {
    this.lineHeightPx = 0;
  }
}