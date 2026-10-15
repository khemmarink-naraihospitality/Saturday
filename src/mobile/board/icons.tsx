import { useId } from 'react';

/** Three stacked bars: collapse / expand every group (reference 18's control row). */
export const StackedRowsIcon = ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <rect x="4" y="4" width="16" height="4" rx="1.2" />
        <rect x="4" y="10" width="16" height="4" rx="1.2" />
        <rect x="4" y="16" width="16" height="4" rx="1.2" />
    </svg>
);

/** A four-point sparkle in a colour sweep: the AI button of the floating toolbar. */
export const AiSparkleIcon = ({ size = 22 }: { size?: number }) => {
    // React's ids contain colons, which not every engine accepts inside url(#…).
    const id = `m-ai-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#ff5ac4" />
                    <stop offset="0.35" stopColor="#8b5cf6" />
                    <stop offset="0.65" stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#22c55e" />
                </linearGradient>
            </defs>
            <path
                d="M12 2.5c.7 4.9 4.6 8.8 9.5 9.5-4.9.7-8.8 4.6-9.5 9.5-.7-4.9-4.6-8.8-9.5-9.5 4.9-.7 8.8-4.6 9.5-9.5Z"
                fill={`url(#${id})`}
            />
        </svg>
    );
};
