import type { CSSProperties } from 'react';
import { Building2, ExternalLink, LogOut, ShieldCheck, UserCog, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';

/**
 * The account menu: who is signed in, Profile Settings, Trash, the Admin
 * Console for admins, the Virtual Office, Log out. It opens from the profile at the bottom of the
 * sidebar (SidebarProfile): upwards, or to the right of the collapsed rail.
 * 'below' is for an avatar at the top of a page.
 */
export const ProfileMenu = ({ placement = 'below', onClose, onOpenSettings, onOpenTrash }: {
    placement?: 'below' | 'above' | 'right';
    onClose: () => void;
    onOpenSettings: () => void;
    /** Shown as a "Trash" entry when given. */
    onOpenTrash?: () => void;
}) => {
    const { user, signOut } = useAuth();
    const { currentUser } = useUserStore();
    const navigateTo = useBoardStore(state => state.navigateTo);

    const handleSignOut = async () => {
        await signOut();
        onClose();
    };

    const position: CSSProperties = placement === 'above'
        ? { bottom: 'calc(100% + 8px)', left: 0, right: 0 }
        : placement === 'right'
            ? { bottom: 0, left: 'calc(100% + 10px)' }
            : { top: '44px', right: 0 };

    return (
        // Opened from NHG's sidebar it takes the page's colours back (nhg_ui.css)
        <div className={placement === 'below' ? undefined : 'nhg-on-page'} style={{
            position: 'absolute',
            ...position,
            backgroundColor: 'hsl(var(--color-bg-surface))', // surface
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: '240px',
            zIndex: 1000,
            border: '1px solid hsl(var(--color-border))',
            overflow: 'hidden'
        }}>
            {/* User Info */}
            <div style={{
                padding: '16px',
                borderBottom: '1px solid hsl(var(--color-border))'
            }}>
                <div style={{
                    fontWeight: 600,
                    fontSize: '14px',
                    marginBottom: '4px',
                    color: 'hsl(var(--color-text-primary))'
                }}>
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{
                    fontSize: '13px',
                    color: 'hsl(var(--color-text-tertiary))'
                }}>
                    {user?.email}
                </div>
            </div>

            {/* Profile Settings (all users) */}
            <button
                onClick={() => {
                    onClose();
                    onOpenSettings();
                }}
                style={menuItemStyle}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <UserCog size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                <span style={{ fontWeight: 500 }}>Profile Settings</span>
            </button>

            {/* Every archived or deleted board the person can restore */}
            {onOpenTrash && (
                <button
                    onClick={() => {
                        onClose();
                        onOpenTrash();
                    }}
                    style={menuItemStyle}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <Trash2 size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                    <span style={{ fontWeight: 500 }}>Trash</span>
                </button>
            )}

            {/* Admin Console Button (Only for admins) */}
            {(currentUser?.system_role === 'super_admin' || currentUser?.system_role === 'it_admin') && (
                <button
                    onClick={() => {
                        onClose();
                        navigateTo('admin');
                    }}
                    style={menuItemStyle}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <ShieldCheck size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                    <span style={{ fontWeight: 500 }}>Admin Console</span>
                </button>
            )}

            {/* The NHG Agents Ecosystem on OneSpace, for every account, in its own tab:
                the same entry OneSpace's account menu has (19-Nov-2026). */}
            <a
                href={VIRTUAL_OFFICE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                aria-label="Virtual Office (opens in a new tab)"
                style={{ ...menuItemStyle, textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <Building2 size={16} style={{ color: 'var(--color-icon-accent, #6366f1)' }} />
                <span style={{ fontWeight: 500 }}>Virtual Office</span>
                <ExternalLink size={13} aria-hidden="true" style={{ marginLeft: 'auto', color: 'hsl(var(--color-text-tertiary))' }} />
            </a>

            <div style={{ height: '1px', backgroundColor: 'hsl(var(--color-border))', margin: '4px 0' }} />

            {/* Logout Button */}
            <button
                onClick={handleSignOut}
                style={menuItemStyle}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                <LogOut size={16} />
                <span>Log out</span>
            </button>
        </div>
    );
};

/** OneSpace's Virtual Office (NHG Agents Ecosystem). It asks for a OneSpace sign-in,
 * which the shared nhgspace.com session already is for anyone who came through the portal. */
export const VIRTUAL_OFFICE_URL = 'https://one.nhgspace.com/virtual-office';

const menuItemStyle: CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: 'hsl(var(--color-text-primary))',
    transition: 'background-color 0.2s'
};
