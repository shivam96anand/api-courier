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
    
    // Use fixed line height for better performance - avoid getBoundingClientRect
    nodeElements.forEach((element: Element) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'line-number';
      lineDiv.textContent = lineNumber.toString();
      
      // Use consistent line height for all elements
      lineDiv.style.height = `${this.lineHeightPx}px`;
      lineDiv.style.lineHeight = `${this.lineHeightPx}px`;
      lineDiv.style.display = 'block';
      lineDiv.style.boxSizing = 'border-box';
      
      fragment.appendChild(lineDiv);
      lineNumber++;
    });

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
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        lineNumbers.scrollTop = content.scrollTop;
      });
    }
  }

  public reset(): void {
    this.lineHeightPx = 0;
  }
}