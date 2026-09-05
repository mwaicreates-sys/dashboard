// Minimal SF-style line icons (24px grid, round caps, currentColor)
// for the platform-admin area. Mirrors app/components/shell/icons.tsx.
import { SVGProps, ReactNode } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Storefront / business marker. */
export function BuildingIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.5 21h17" />
      <path d="M4.5 21V10.5H3l4.5-4.2V10h7V6.3L19 10.5h-1.5V21" />
      <path d="M9 21v-5h6v5" />
      <path d="M4.5 12.5h15" />
    </Svg>
  );
}

/** Back arrow. */
export function ArrowLeftIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}

/** Shield (platform admin brand mark). */
export function ShieldIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.2-3.6" />
    </Svg>
  );
}

/** Calendar icon (unused but available). */
export function CalendarIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 2.75V6M16 2.75V6M3 9.75h18" />
      <path d="M9.5 13.5h5" />
    </Svg>
  );
}

/** Users / user-plus icon. */
export function UserPlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 1 0-8 4 4 0 0 1 8 0v1.5" />
      <path d="M12 16v6M9 19h6" />
    </Svg>
  );
}

/** Multiple users icon. */
export function UsersIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 1 0-8 4 4 0 0 1 8 0v1.5" />
      <path d="M12 16v6" />
      <path d="M9 19h6" />
      <circle cx="12" cy="8" r="3" />
    </Svg>
  );
}

/** Single user / profile icon. */
export function UserIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c1.35-3.4 3.9-5.2 7.2-5.2s5.85 1.8 7.2 5.2" />
    </Svg>
  );
}

/** Notification bell. */
export function BellIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Z" />
      <path d="M18 8A6 6 0 0 0 6 8c0 4.8-2 6.8-2 6.8h16S18 12.8 18 8Z" />
    </Svg>
  );
}

/** Search / magnifying glass. */
export function SearchIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </Svg>
  );
}

/** Chevron down (for avatar dropdown). */
export function ChevronDownIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 9.5l6 6 6-6" />
    </Svg>
  );
}

/** X icon (close button). */
export function XIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Check icon (notification indicator). */
export function CheckIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

/** Mail / envelope icon. */
export function MailIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 6h16" />
      <path d="M4 6l8 8 8-8" />
    </Svg>
  );
}