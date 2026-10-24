import type { SVGProps } from "react";

/**
 * The design system's outline icon set: 24 px viewBox, 1.75 stroke,
 * currentColor, no fill. Icons are decorative by default
 * (aria-hidden); the control that uses one carries the accessible
 * name. Each icon is its own export so unused icons tree-shake away.
 */
export type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {/* Ring + eight teeth + hub: drawn as primitives so it reads as
          a gear, not a sun, at 24 px. */}
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M18.6 12h2.8M16.7 16.7l2 2M12 18.6v2.8M7.3 16.7l-2 2M5.4 12H2.6M7.3 7.3l-2-2M12 5.4V2.6M16.7 7.3l2-2" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12.5l5 5L19.5 7" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5L22 20H2z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" />
    </svg>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4l16 16" />
      <path d="M8.5 16.2a5 5 0 0 1 5.6-.6M5.5 12.5a10.5 10.5 0 0 1 4.2-2.6M12.6 9.9c2.1.2 4.1 1 5.9 2.6M15.5 16.2a5 5 0 0 0-1.4-1.1" />
      <circle cx="12" cy="19.4" r="0.4" fill="currentColor" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 5L7.5 12l7 7" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 5l7 7-7 7" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s-6.5-5.3-6.5-10.2A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.8C18.5 15.7 12 21 12 21z" />
      <circle cx="12" cy="10.6" r="2.3" />
    </svg>
  );
}

/** Speedometer/odometer gauge — the app's signature icon. */
export function GaugeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 15.5a8.5 8.5 0 1 1 16 0" />
      <path d="M12 15.5l4.2-4.7" />
      <circle cx="12" cy="15.5" r="1.1" />
      <path d="M4.2 15.5h1.6M18.2 15.5h1.6M12 6.9v1.6" />
    </svg>
  );
}

export function CarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 16.5v2M20 16.5v2M4 16.5l1.6-6A2.5 2.5 0 0 1 8 8.7h8a2.5 2.5 0 0 1 2.4 1.8l1.6 6M4 16.5h16M4 13.5h16" />
      <circle cx="7.4" cy="18.7" r="1.5" />
      <circle cx="16.6" cy="18.7" r="1.5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v11M7 11l5 5 5-5M4.5 20h15" />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11M8 6L12 2.5 16 6" />
      <path d="M6 10.5H5A1.5 1.5 0 0 0 3.5 12v7A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 19 10.5h-1" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.7 3.8v3.6h-3.6" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16.8 4.2a1.8 1.8 0 0 1 2.5 2.5L8 18l-3.8 1L5.2 15.2z" />
      <path d="M14.8 6.2l2.5 2.5" />
    </svg>
  );
}
