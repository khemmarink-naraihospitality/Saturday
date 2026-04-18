import { GlobalTopActions } from './GlobalTopActions';

export const TopBar = () => {
    return (
        <div style={{
            height: '50px',
            width: '100%',
            backgroundColor: 'hsl(var(--color-bg-surface))',
            borderBottom: '1px solid hsl(var(--color-border))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 24px',
            gap: '12px',
            flexShrink: 0,
            zIndex: 50 // Ensure above table sticky headers if any conflict
        }}>
            <GlobalTopActions />
        </div>
    );
};

