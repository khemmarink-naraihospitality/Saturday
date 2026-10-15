import type { ReactNode } from 'react';

export const Spinner = ({ size = 26 }: { size?: number }) => (
    <div className="m-spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />
);

/** Fills its container and centres a spinner with an optional line under it. */
export const CenteredSpinner = ({ message }: { message?: string }) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, color: 'hsl(var(--m-text-3))', fontSize: 14 }}>
        <Spinner />
        {message}
    </div>
);

export const EmptyState = ({ icon, title, children }: { icon?: ReactNode; title?: ReactNode; children?: ReactNode }) => (
    <div className="m-empty">
        {icon}
        {title && <div className="m-empty__title">{title}</div>}
        {children && <div>{children}</div>}
    </div>
);
