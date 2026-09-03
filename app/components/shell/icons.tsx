// Minimal SF-style line icons (24px grid, round caps, currentColor).
import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P & { children: React.ReactNode }) {
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

export function CalendarIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 2.75V6M16 2.75V6M3 9.75h18" />
      <path d="M9.5 13.5h5" />
    </Svg>
  );
}

export function WeeksIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M3.5 8.5h17M8.5 8.5v12" />
      <circle cx="13.5" cy="13.5" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function ActivityIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 12.6l3 3 6-6.5" />
    </Svg>
  );
}

export function ProfileIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c1.35-3.4 3.9-5.2 7.2-5.2s5.85 1.8 7.2 5.2" />
    </Svg>
  );
}

export function PlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function PencilIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 20l1.1-4.1L16.9 4.1a2.1 2.1 0 0 1 3 3L8.1 18.9 4 20z" />
      <path d="M14.5 6.5l3 3" />
    </Svg>
  );
}

export function TrashIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M6.5 6.5l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Svg>
  );
}

export function XIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function ChevronDownIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 9.5l6 6 6-6" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14.5 6L8.5 12l6 6" />
    </Svg>
  );
}

export function ChevronRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M9.5 6l6 6-6 6" />
    </Svg>
  );
}

export function NotesIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
      <path d="M8.5 8.5h7M8.5 12.5h7M8.5 16.5h4" />
    </Svg>
  );
}

export function SunIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5" />
    </Svg>
  );
}

export function MoonIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M20.5 14.3A8.3 8.3 0 1 1 9.7 3.5a6.8 6.8 0 0 0 10.8 10.8z" />
    </Svg>
  );
}

export function DeviceIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <path d="M8 20.5h8M12 17v3.5" />
    </Svg>
  );
}

export function FilterIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Svg>
  );
}

export function SearchIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  );
}

export function BellIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
      <path d="M10.3 19.5a2 2 0 0 0 3.4 0" />
    </Svg>
  );
}

export function DownloadIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </Svg>
  );
}

export function PrintIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M7 8V3.5h10V8" />
      <rect x="4" y="8" width="16" height="8.5" rx="2" />
      <path d="M7 13.5h10v7H7z" />
    </Svg>
  );
}

export function ClockIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function RepeatIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M17 2.5l3.5 3.5L17 9.5" />
      <path d="M20.5 6H8A4.5 4.5 0 0 0 3.5 10.5V12" />
      <path d="M7 21.5L3.5 18 7 14.5" />
      <path d="M3.5 18H16a4.5 4.5 0 0 0 4.5-4.5V12" />
    </Svg>
  );
}

export function TargetIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </Svg>
  );
}

export function AlertIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3.5L2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5M12 17.2v0.05" />
    </Svg>
  );
}

export function GridIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </Svg>
  );
}

export function EntryIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 15.5V8.5M8.5 12h7" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    </Svg>
  );
}

/** Money received — arrow landing in a tray. */
export function IncomeCatIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3.5v9M8.5 9L12 12.5 15.5 9" />
      <path d="M4.5 13.5v4a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4" />
    </Svg>
  );
}

/** Money spent — arrow leaving a tray. */
export function OutflowCatIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 12.5v-9M8.5 7L12 3.5 15.5 7" />
      <path d="M4.5 13.5v4a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-4" />
    </Svg>
  );
}

/** Piggy bank — savings. */
export function SavingsCatIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="4" y="8" width="14" height="9" rx="4.5" />
      <path d="M9.5 8V6.3h5V8" />
      <path d="M8 17v2.2M14 17v2.2" />
      <circle cx="14.4" cy="12" r="0.55" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Credit card — debt payments. */
export function DebtCatIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M6.5 14.5h4" />
    </Svg>
  );
}

/** Receipt — anything else. */
export function OtherCatIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 19.1z" />
      <path d="M9 8.5h6M9 12h6" />
    </Svg>
  );
}

/** Growth trend — investments. */
export function InvestmentsCatIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 17l5-5 3.5 3.5L19 9" />
      <path d="M14.5 9H19v4.5" />
    </Svg>
  );
}