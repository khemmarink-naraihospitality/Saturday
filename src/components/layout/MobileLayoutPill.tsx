import { Smartphone } from 'lucide-react';
import { setLayoutOverride, useForcedDesktopOnPhone } from '../../hooks/useIsMobile';

/**
 * The way back to the phone layout after choosing More > Desktop site. Renders
 * nothing unless a phone-sized screen has been pinned to the desktop layout, so
 * on an actual desktop it is never there.
 */
export const MobileLayoutPill = () => {
    const show = useForcedDesktopOnPhone();
    if (!show) return null;

    return (
        <button
            onClick={() => setLayoutOverride(null)}
            style={{
                position: 'fixed',
                left: '12px',
                bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '999px',
                backgroundColor: 'hsl(var(--color-brand-primary))',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)'
            }}
        >
            <Smartphone size={15} />
            Mobile view
        </button>
    );
};
