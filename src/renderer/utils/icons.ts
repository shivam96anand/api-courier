export type IconName =
  | 'chat'
  | 'import'
  | 'export'
  | 'file'
  | 'folder'
  | 'globe'
  | 'settings'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'warning'
  | 'clock'
  | 'clipboard'
  | 'paperclip'
  | 'send'
  | 'bot'
  | 'search'
  | 'duplicate'
  | 'close'
  | 'layers'
  | 'arrow-up'
  | 'arrow-down'
  | 'collapse'
  | 'expand'
  | 'maximize'
  | 'eye'
  | 'eye-off'
  | 'pin'
  | 'check';

const icons: Record<IconName, string> = {
  chat: `
    <path d="M6 5h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H9l-5 4v-4H6a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z"/>
    <path d="M8 11h8M8 14h6"/>
  `,
  import: `
<path d="M12 3v10"/>
<path d="M12 13l-4-4M12 13l4-4"/>
<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>

  `,
  export: `
<path d="M12 21V11"/>
<path d="M12 11l-4 4M12 11l4 4"/>
<path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>

  `,
  file: `
    <path d="M7 3h7l5 5v13H7z"/>
    <path d="M14 3v5h5"/>
    <path d="M9 13h8M9 17h6"/>
  `,
  folder: `
    <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  `,
  globe: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M3 12h18M12 3a12 12 0 0 1 0 18M12 3a12 12 0 0 0 0 18"/>
  `,
  settings: `
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
  `,
  plus: `
    <path d="M12 5v14M5 12h14"/>
  `,
  edit: `
    <path d="M4 20l4-1 10-10-3-3-10 10-1 4z"/>
    <path d="M14 6l3 3"/>
  `,
  trash: `
    <path d="M5 7h14M9 7V5h6v2"/>
    <path d="M8 7v12M12 7v12M16 7v12"/>
    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/>
  `,
  warning: `
    <path d="M12 3l9 16H3l9-16z"/>
    <path d="M12 9v4M12 17h.01"/>
  `,
  clock: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 3"/>
  `,
  clipboard: `
    <path d="M9 4h6a2 2 0 0 1 2 2v13H7V6a2 2 0 0 1 2-2z"/>
    <path d="M9 4V2h6v2"/>
  `,
  paperclip: `
    <path d="M8 12l6-6a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7"/>
  `,
  send: `
    <path d="M3 11l18-8-6 18-3-7-9-3z"/>
    <path d="M12 12l9-9"/>
  `,
  bot: `
    <rect x="4" y="7" width="16" height="11" rx="3"/>
    <path d="M12 3v4M8.5 11h.01M15.5 11h.01M9 15h6"/>
  `,
  search: `
    <circle cx="11" cy="11" r="6"/>
    <path d="M16 16l5 5"/>
  `,
  duplicate: `
    <path d="M8 8h10v10H8z"/>
    <path d="M6 6h10v10"/>
  `,
  close: `
    <path d="M6 6l12 12M18 6l-12 12"/>
  `,
  layers: `
    <path d="M12 4l8 4-8 4-8-4 8-4z"/>
    <path d="M4 14l8 4 8-4"/>
  `,
  'arrow-up': `
    <path d="M12 5l-6 6M12 5l6 6"/>
    <path d="M12 5v14"/>
  `,
  'arrow-down': `
    <path d="M12 19l-6-6M12 19l6-6"/>
    <path d="M12 5v14"/>
  `,
  collapse: `
    <path d="M6 14l6-6 6 6"/>
  `,
  expand: `
    <path d="M6 10l6 6 6-6"/>
  `,
  maximize: `
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/>
    <path d="M9 4L4 9M20 15l-5 5M15 4l5 5M4 15l5 5"/>
  `,
  eye: `
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/>
    <circle cx="12" cy="12" r="3"/>
  `,
  'eye-off': `
    <path d="M3 5l18 18"/>
    <path d="M6.5 6.5C8 5.5 9.9 5 12 5c6 0 10 7 10 7a17.8 17.8 0 0 1-4.1 4.7"/>
    <path d="M9.5 9.5a3.5 3.5 0 0 0 5 5"/>
    <path d="M5 9.8C3.4 11.3 2 13 2 13s4 6 10 6c1.8 0 3.4-.4 4.8-1.1"/>
  `,
  pin: `
    <path d="M12 22s6-6.2 6-11a6 6 0 1 0-12 0c0 4.8 6 11 6 11z"/>
    <circle cx="12" cy="11" r="2.5"/>
  `,
  check: `
    <path d="M5 12l4 4 10-10"/>
  `,
};

export function iconHtml(name: IconName, className: string = ''): string {
  const classes = ['ui-icon', className].filter(Boolean).join(' ');
  const markup = icons[name] || icons.file;
  return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${markup}</svg>`;
}

export function createIconElement(
  name: IconName,
  options?: {
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
    title?: string;
  }
): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = iconHtml(name, options?.className);
  const svg = template.content.firstElementChild as SVGSVGElement;

  if (options?.style) {
    Object.assign(svg.style, options.style);
  }

  if (options?.title) {
    svg.setAttribute('title', options.title);
  }

  return svg;
}
