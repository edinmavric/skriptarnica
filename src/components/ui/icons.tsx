import type { SVGProps } from 'react';

/**
 * Line icons drawn for the app: 24px grid, 1.75 stroke, round caps — like a pen sketch.
 * Decorative by default (aria-hidden); pass `title` for a standalone meaningful icon.
 */
type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.8 12 4l8.5 6.8" />
    <path d="M5.5 9.5V20h4.8v-5.6h3.4V20h4.8V9.5" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.6" cy="10.4" r="6.1" />
    <path d="m15.2 15.1 5.3 5.2" />
  </Icon>
);
export const CommunityIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.6 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5Z" />
    <path d="M18.5 9h1.2a1.6 1.6 0 0 1 1.6 1.6v5.2a1.6 1.6 0 0 1-1.6 1.6h-.9v2.6l-3.1-2.6h-3.6" />
  </Icon>
);
export const LibraryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 4.5h3.2v15H4.5z" />
    <path d="M9.7 6h3.2v13.5H9.7z" />
    <path d="m15 6.3 3-.8 3.3 13.4-3 .8z" />
  </Icon>
);
export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.3" r="3.8" />
    <path d="M4.6 20.2c.9-3.9 3.8-6 7.4-6s6.5 2.1 7.4 6" />
  </Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.3 16.6V10.8a5.7 5.7 0 0 1 11.4 0v5.8l1.6 1.9H4.7z" />
    <path d="M10 20.4a2.2 2.2 0 0 0 4 0" />
  </Icon>
);
export const BookmarkIcon = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <Icon {...rest}>
      <path d="M6.5 3.8h11v16.6L12 16.3l-5.5 4.1z" fill={filled ? 'currentColor' : 'none'} />
    </Icon>
  );
};
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 21V4.3" />
    <path d="M5.5 4.8c4.4-2 6.8 2 13 .1v8.6c-6.2 1.9-8.6-2.1-13-.1" />
  </Icon>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19.5V5" />
    <path d="m5.8 11 6.2-6.3 6.2 6.3" />
  </Icon>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5V19" />
    <path d="m18.2 13-6.2 6.3L5.8 13" />
  </Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9.3 6 6 6-6" />
  </Icon>
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.3 6 6 6-6 6" />
  </Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.7 6-6 6 6 6" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6.2 18 18M18 6 6 18" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.8 12.6 4.4 4.3 9.9-10.2" />
  </Icon>
);
export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15.5V4.2" />
    <path d="m7.4 8.6 4.6-4.5 4.6 4.5" />
    <path d="M4.5 14.5v4.2c0 .7.6 1.3 1.3 1.3h12.4c.7 0 1.3-.6 1.3-1.3v-4.2" />
  </Icon>
);
export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.2 3.5h7.6l4.6 4.6v12.4H6.2z" />
    <path d="M13.5 3.7v4.7h4.7" />
    <path d="M9 13h6.2M9 16.3h4.4" />
  </Icon>
);
export const StarIcon = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <Icon {...rest}>
      <path
        d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Icon>
  );
};
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12.2h16M4 17.4h11" />
  </Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.9" />
    <path d="M12 2.8v2.1M12 19.1v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" />
  </Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.6 14.6A7.9 7.9 0 0 1 9.4 4.4a7.9 7.9 0 1 0 10.2 10.2Z" />
  </Icon>
);
export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.3" y="4.5" width="17.4" height="11.8" rx="1.4" />
    <path d="M8.5 20h7M12 16.4V20" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.9" />
    <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M5.8 18.2l1.7-1.7M16.5 7.5l1.7-1.7" />
  </Icon>
);
export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.8 4.5H6.2v15h7.6" />
    <path d="M10.5 12h10M17 8.4l3.5 3.6-3.5 3.6" />
  </Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 4.5h6v6M19.3 4.7l-8.6 8.6" />
    <path d="M17.5 13.8v5.7H4.5v-13h5.7" />
  </Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="9.7" rx="1.6" />
    <path d="M8.3 10.5V8a3.7 3.7 0 0 1 7.4 0v2.5" />
  </Icon>
);
export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.6 3.8 5.6 5.6-2.4.8-3.3 3.3.3 4.1-1.6 1.6-3.8-3.8-4.6 4.6M8.8 11.7l-1.6 1.6 3.5 3.5" />
    <path d="m14.6 3.8-.8 2.4-3.3 3.3-4.1-.3L4.8 10.8l3.8 3.8" />
  </Icon>
);
export const MessageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9.3a1 1 0 0 1-1 1H10l-4.3 3.4v-3.4H4.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
  </Icon>
);
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.8 12s3.4-6.3 9.2-6.3 9.2 6.3 9.2 6.3-3.4 6.3-9.2 6.3S2.8 12 2.8 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.2v11.3" />
    <path d="m7.4 11.1 4.6 4.5 4.6-4.5" />
    <path d="M4.5 14.5v4.2c0 .7.6 1.3 1.3 1.3h12.4c.7 0 1.3-.6 1.3-1.3v-4.2" />
  </Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.6 21.2 19.6H2.8z" />
    <path d="M12 9.6v4.6M12 17.1v.1" />
  </Icon>
);
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v5.4M12 7.8v.1" />
  </Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15.4 4.8 3.8 3.8L8.6 19.2l-4.6.8.8-4.6z" />
    <path d="m13.4 6.8 3.8 3.8" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.7 7V4.6h4.6V7M6.4 7l.9 13h9.4l.9-13" />
  </Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.4 19 6v5.4c0 4.4-3 7.8-7 9.2-4-1.4-7-4.8-7-9.2V6z" />
    <path d="m8.8 12.1 2.3 2.2 4.3-4.4" />
  </Icon>
);
export const QuoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 7.5C6.8 8.3 5 10.4 5 13.4V17h4.4v-4.4H7" />
    <path d="M19 7.5c-2.7.8-4.5 2.9-4.5 5.9V17h4.4v-4.4h-2.4" />
  </Icon>
);
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16.5" />
    <path d="M6.8 16.5v-4.3M11 16.5V7.8M15.2 16.5v-6.4M19.4 16.5V5" />
  </Icon>
);
