/**
 * Variable Autocomplete - Provides suggestions when typing "{{" in input fields
 * Shows suggestions from folder variables, environment variables, and global variables
 */

import { Environment } from '../../../shared/types';
import { getSystemVariableDefinitions } from '../../../shared/system-variables';

interface AutocompleteOption {
  name: string;
  value: string;
  source: 'Folder' | 'Environment' | 'Global' | 'System';
}

let globalAutocompleteBox: HTMLDivElement | null = null;
let currentInputElement: HTMLInputElement | null = null;
let selectedIndex = -1;
let filteredOptions: AutocompleteOption[] = [];

/**
 * Removes the global autocomplete box if it exists
 */
function removeAutocompleteBox(): void {
  if (globalAutocompleteBox) {
    globalAutocompleteBox.remove();
    globalAutocompleteBox = null;
    currentInputElement = null;
    selectedIndex = -1;
    filteredOptions = [];
  }
}

/**
 * Gets all available variables sorted by priority: Folder → Environment → Global
 */
function getAllVariables(
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> },
  folderVars: Record<string, string>
): AutocompleteOption[] {
  const options: AutocompleteOption[] = [];
  const seen = new Set<string>();

  // 1. Folder variables (highest priority)
  Object.entries(folderVars).forEach(([name, value]) => {
    options.push({ name, value, source: 'Folder' });
    seen.add(name);
  });

  // 2. Environment variables
  if (activeEnvironment) {
    Object.entries(activeEnvironment.variables).forEach(([name, value]) => {
      // Skip if already exists in folder vars
      if (!folderVars[name]) {
        options.push({ name, value, source: 'Environment' });
        seen.add(name);
      }
    });
  }

  // 3. Global variables (lowest priority)
  Object.entries(globals.variables).forEach(([name, value]) => {
    // Skip if already exists in folder or environment vars
    if (!folderVars[name] && (!activeEnvironment || !activeEnvironment.variables[name])) {
      options.push({ name, value, source: 'Global' });
      seen.add(name);
    }
  });

  // 4. System variables (lowest priority, dynamic)
  getSystemVariableDefinitions().forEach((definition) => {
    const sampleValue = definition.generator();
    const names = [definition.name, ...(definition.aliases || [])];
    names.forEach((name) => {
      if (!seen.has(name)) {
        options.push({ name, value: sampleValue, source: 'System' });
        seen.add(name);
      }
    });
  });

  return options;
}

/**
 * Filters options based on the search query
 */
function filterOptions(options: AutocompleteOption[], query: string): AutocompleteOption[] {
  if (!query) {
    return options;
  }

  const lowerQuery = query.toLowerCase();
  return options.filter(option =>
    option.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Detects if cursor is inside "{{...}}" and returns the search query
 */
function detectVariableContext(input: HTMLInputElement): { isInVariable: boolean; query: string; startPos: number } | null {
  const value = input.value;
  const cursorPos = input.selectionStart || 0;

  // Find the last "{{" before cursor
  const lastOpenIndex = value.lastIndexOf('{{', cursorPos - 1);

  if (lastOpenIndex === -1) {
    return null;
  }

  // Check if there's a closing "}}" after the opening "{{"
  const closeIndex = value.indexOf('}}', lastOpenIndex);

  // If there's a close and it's before cursor, we're not in a variable
  if (closeIndex !== -1 && closeIndex < cursorPos) {
    return null;
  }

  // Extract the query (text between "{{" and cursor)
  const query = value.substring(lastOpenIndex + 2, cursorPos);

  return {
    isInVariable: true,
    query,
    startPos: lastOpenIndex
  };
}

/**
 * Creates the autocomplete dropdown
 */
function createAutocompleteBox(
  inputElement: HTMLInputElement,
  options: AutocompleteOption[]
): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'variable-autocomplete-box';

  if (options.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'variable-autocomplete-item empty';
    emptyItem.textContent = 'No variables found';
    box.appendChild(emptyItem);
    return box;
  }

  options.forEach((option, index) => {
    const item = document.createElement('div');
    item.className = 'variable-autocomplete-item';
    if (index === selectedIndex) {
      item.classList.add('selected');
    }

    // Left side: Name + Value
    const leftSide = document.createElement('div');
    leftSide.className = 'variable-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'variable-name';
    nameSpan.textContent = option.name;

    // Badge inside name span
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'variable-badge';
    badgeSpan.textContent = `[${option.source}]`;

    nameSpan.appendChild(badgeSpan);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'variable-value';
    valueSpan.textContent = option.value;

    leftSide.appendChild(nameSpan);
    leftSide.appendChild(valueSpan);

    item.appendChild(leftSide);

    // Mouse click to select
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent input blur
      selectOption(inputElement, option);
    });

    // Mouse hover to highlight
    item.addEventListener('mouseenter', () => {
      selectedIndex = index;
      updateSelection();
    });

    box.appendChild(item);
  });

  return box;
}

/**
 * Positions the autocomplete box below the input
 */
function positionAutocompleteBox(inputElement: HTMLInputElement, box: HTMLDivElement): void {
  const inputRect = inputElement.getBoundingClientRect();

  box.style.position = 'fixed';
  box.style.left = `${inputRect.left}px`;
  box.style.top = `${inputRect.bottom + 4}px`; // 4px gap below input
  box.style.width = `${inputRect.width}px`;
  box.style.zIndex = '10000';
}

/**
 * Updates the selected item highlighting
 */
function updateSelection(): void {
  if (!globalAutocompleteBox) return;

  const items = globalAutocompleteBox.querySelectorAll('.variable-autocomplete-item:not(.empty)');
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected');
      // Scroll into view if needed
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * Selects an option and inserts it into the input
 */
function selectOption(inputElement: HTMLInputElement, option: AutocompleteOption): void {
  const context = detectVariableContext(inputElement);
  if (!context) return;

  const value = inputElement.value;
  const { startPos } = context;
  const cursorPos = inputElement.selectionStart || 0;

  // Replace "{{...partial" with "{{VariableName}}"
  const newValue =
    value.substring(0, startPos) +
    `{{${option.name}}}` +
    value.substring(cursorPos);

  inputElement.value = newValue;

  // Position cursor after the inserted variable
  const newCursorPos = startPos + option.name.length + 4; // "{{" + name + "}}"
  inputElement.setSelectionRange(newCursorPos, newCursorPos);

  // Trigger input event to update highlighting
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));

  // Close the autocomplete box
  removeAutocompleteBox();
}

/**
 * Shows or updates the autocomplete box
 */
export function showAutocomplete(
  inputElement: HTMLInputElement,
  activeEnvironment: Environment | undefined,
  globals: { variables: Record<string, string> },
  folderVars: Record<string, string>
): void {
  const context = detectVariableContext(inputElement);

  // If not in variable context, hide autocomplete
  if (!context || !context.isInVariable) {
    removeAutocompleteBox();
    return;
  }

  // Get all variables
  const allOptions = getAllVariables(activeEnvironment, globals, folderVars);

  // Filter based on query
  filteredOptions = filterOptions(allOptions, context.query);

  // Remove existing box
  if (globalAutocompleteBox) {
    globalAutocompleteBox.remove();
  }

  // Reset selection
  selectedIndex = filteredOptions.length > 0 ? 0 : -1;

  // Create new box
  globalAutocompleteBox = createAutocompleteBox(inputElement, filteredOptions);
  document.body.appendChild(globalAutocompleteBox);

  // Position it
  positionAutocompleteBox(inputElement, globalAutocompleteBox);

  // Store current input
  currentInputElement = inputElement;
}

/**
 * Handles keyboard navigation
 */
export function handleAutocompleteKeydown(
  event: KeyboardEvent,
  inputElement: HTMLInputElement
): boolean {
  if (!globalAutocompleteBox || filteredOptions.length === 0) {
    return false; // Let the event propagate
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
      updateSelection();
      return true;

    case 'ArrowUp':
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection();
      return true;

    case 'Enter':
      event.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
        selectOption(inputElement, filteredOptions[selectedIndex]);
      }
      return true;

    case 'Tab':
      event.preventDefault();
      // Select first item or currently selected item
      const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0;
      if (indexToSelect < filteredOptions.length) {
        selectOption(inputElement, filteredOptions[indexToSelect]);
      }
      return true;

    case 'Escape':
      event.preventDefault();
      removeAutocompleteBox();
      return true;

    default:
      return false;
  }
}

/**
 * Sets up autocomplete for an input element
 */
export function setupAutocomplete(
  inputElement: HTMLInputElement,
  getContext: () => {
    activeEnvironment: Environment | undefined;
    globals: { variables: Record<string, string> };
    folderVars: Record<string, string>;
  }
): void {
  // Prevent duplicate setup
  if ((inputElement as any).__autocompleteSetup) {
    return;
  }
  (inputElement as any).__autocompleteSetup = true;

  // Handle input changes
  inputElement.addEventListener('input', () => {
    const context = getContext();
    showAutocomplete(inputElement, context.activeEnvironment, context.globals, context.folderVars);
  });

  // Handle keyboard navigation
  inputElement.addEventListener('keydown', (event) => {
    handleAutocompleteKeydown(event, inputElement);
  });

  // Close on blur
  inputElement.addEventListener('blur', () => {
    // Delay to allow click events on autocomplete items
    setTimeout(() => {
      if (currentInputElement === inputElement) {
        removeAutocompleteBox();
      }
    }, 200);
  });

  // Close on click outside
  document.addEventListener('click', (event) => {
    if (currentInputElement === inputElement) {
      const target = event.target as HTMLElement;
      if (!inputElement.contains(target) && !globalAutocompleteBox?.contains(target)) {
        removeAutocompleteBox();
      }
    }
  });
}

/**
 * Cleanup autocomplete (call when input is removed)
 */
export function cleanupAutocomplete(inputElement: HTMLInputElement): void {
  if (currentInputElement === inputElement) {
    removeAutocompleteBox();
  }
  (inputElement as any).__autocompleteSetup = false;
}
