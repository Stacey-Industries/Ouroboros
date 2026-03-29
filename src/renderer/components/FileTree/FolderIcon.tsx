/**
 * FolderIcon — small SVG folder icon used in tree section headers.
 */

import React from 'react';

export function FolderIcon(): React.ReactElement<any> {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5L6.5 4H10.5C11.052 4 11.5 4.448 11.5 5V9.5C11.5 10.052 11.052 10.5 10.5 10.5H2.5C1.948 10.5 1.5 10.052 1.5 9.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
