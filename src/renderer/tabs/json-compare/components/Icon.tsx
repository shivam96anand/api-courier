/**
 * Common SVG icon for compact toolbar buttons. 16x16 viewBox.
 * Keep this file tiny; do not pull in an icon library.
 */
import React from 'react';

type IconName =
  | 'swap'
  | 'clear'
  | 'copy'
  | 'format'
  | 'minify'
  | 'sort'
  | 'upload'
  | 'download'
  | 'check'
  | 'close'
  | 'chevron-up'
  | 'chevron-down'
  | 'cog'
  | 'plus'
  | 'minus'
  | 'wand';

const PATHS: Record<IconName, React.ReactNode> = {
  swap: <path d="M7 7h10M13 3l4 4-4 4M17 17H7M11 13l-4 4 4 4" />,
  clear: <path d="M6 6l12 12M18 6l-12 12" />,
  copy: (
    <>
      <path d="M8 8h10v10H8z" />
      <path d="M6 6h10v10" />
    </>
  ),
  format: <path d="M4 6h16M4 12h10M4 18h16" />,
  minify: <path d="M4 7h16M4 12h16M4 17h16" />,
  sort: <path d="M7 4v16m-3-3l3 3 3-3M17 20V4m-3 3l3-3 3 3" />,
  upload: <path d="M12 16V4m-5 5l5-5 5 5M4 20h16" />,
  download: <path d="M12 4v12m-5-5l5 5 5-5M4 20h16" />,
  check: <path d="M5 12l4 4 10-10" />,
  close: <path d="M6 6l12 12M18 6l-12 12" />,
  'chevron-up': <path d="M6 15l6-6 6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.86 1.18 1.43 2.09 1.43H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  wand: <path d="M3 21l9-9M14 7l3 3M13 4l3 3-9 9-3-3z" />,
};

interface IconProps {
  name: IconName;
  className?: string;
  title?: string;
}

const Icon: React.FC<IconProps> = ({ name, className = '', title }) => (
  <svg
    className={`ui-icon ui-icon--sm ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
  >
    {title ? <title>{title}</title> : null}
    {PATHS[name]}
  </svg>
);

export default Icon;
export type { IconName };
