import React from 'react';

const createIcon = (path, viewBox = '0 0 24 24') =>
  function Icon({ className = '', title = '' }) {
    return (
      <svg
        viewBox={viewBox}
        className={className}
        aria-hidden={title ? undefined : 'true'}
        role={title ? 'img' : 'presentation'}
      >
        {title ? <title>{title}</title> : null}
        {path}
      </svg>
    );
  };

export const MenuIcon = createIcon(
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>
);

export const CloseIcon = createIcon(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </>
);

export const DashboardIcon = createIcon(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="11" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="17" width="7" height="3" rx="1.5" />
  </>
);

export const CasesIcon = createIcon(
  <>
    <path d="M7 5h8l4 4v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    <path d="M15 5v4h4" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </>
);

export const ClientsIcon = createIcon(
  <>
    <path d="M16 20a4 4 0 0 0-8 0" />
    <circle cx="12" cy="11" r="4" />
    <path d="M6 20a3 3 0 0 0-3-3" />
    <path d="M18 17a3 3 0 0 1 3 3" />
  </>
);

export const HearingsIcon = createIcon(
  <>
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M8 4v4" />
    <path d="M16 4v4" />
    <path d="M4 10h16" />
  </>
);

export const PaymentsIcon = createIcon(
  <>
    <path d="M12 3v18" />
    <path d="M16 7.5a4 4 0 0 0-4-2.5 4 4 0 0 0 0 8 4 4 0 0 1 0 8 4 4 0 0 1-4-2.5" />
  </>
);

export const DocumentsIcon = createIcon(
  <>
    <path d="M8 3h7l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M15 3v5h5" />
    <path d="M10 13h4" />
    <path d="M10 17h6" />
  </>
);

export const ShareIcon = createIcon(
  <>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.7 10.7l6.6-3.4" />
    <path d="M8.7 13.3l6.6 3.4" />
  </>
);

export const MessageIcon = createIcon(
  <>
    <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="M8 10h8" />
    <path d="M8 13h5" />
  </>
);

export const WhatsAppIcon = createIcon(
  <>
    <path d="M20 11.5A8.5 8.5 0 0 1 7.5 19L4 20l1.1-3.2A8.5 8.5 0 1 1 20 11.5Z" />
    <path d="M9.6 8.8c.3-.5.6-.5.8-.5h.6c.2 0 .4 0 .6.5.2.6.8 1.9.8 2s.1.3 0 .5c-.1.1-.2.3-.4.4l-.5.4c-.1.1-.3.2-.1.5.2.3.8 1.2 1.8 2 .9.8 1.7 1.1 2 .2.2-.4.4-.3.7-.2l1.7.8c.2.1.4.2.4.4s-.1 1-.7 1.5c-.6.5-1.3.5-1.7.4-.4-.1-2.8-1.1-4.7-3.7-1.9-2.6-1.8-4.6-1.3-5.2Z" />
  </>
);

export const GlobeIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18" />
    <path d="M12 3a15 15 0 0 0 0 18" />
  </>
);

export const InfoIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </>
);

export const ArrowRightIcon = createIcon(<path d="M5 12h14m-6-6 6 6-6 6" />);
export const ArrowLeftIcon = createIcon(<path d="M19 12H5m6-6-6 6 6 6" />);
export const PlusIcon = createIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
);
export const CopyIcon = createIcon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <rect x="4" y="4" width="11" height="11" rx="2" />
  </>
);
export const EyeIcon = createIcon(
  <>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </>
);
export const LockIcon = createIcon(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
  </>
);
export const UnlockIcon = createIcon(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M16 11V8a4 4 0 0 0-7.2-2.4" />
  </>
);
