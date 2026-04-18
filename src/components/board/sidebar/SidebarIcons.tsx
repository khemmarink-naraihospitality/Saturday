import React from 'react';

export const BoardIcon = ({ size = 16, className = "", style = {} }: { size?: number, className?: string, style?: React.CSSProperties }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
    >
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <path d="M3 11h18" />
        <path d="M9 3v8" />
        <path d="M15 11v10" />
    </svg>
);

export const WorkspaceIcon = ({ title, isActive }: { title: string, isActive: boolean }) => {
    const initial = title.trim().charAt(0).toUpperCase() || '?';
    return (
        <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: isActive ? 'hsl(var(--color-brand-primary))' : '#e6e9ef',
            color: isActive ? 'white' : '#676879',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            flexShrink: 0,
            transition: 'all 0.2s',
            position: 'relative',
            zIndex: 2
        }}>
            {initial}
        </div>
    );
};
