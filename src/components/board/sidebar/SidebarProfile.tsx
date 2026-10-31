import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useUserStore } from '../../../store/useUserStore';
import { ProfileMenu } from '../../layout/ProfileMenu';
import { ProfileSettingsModal } from '../../layout/ProfileSettingsModal';
import { ArchiveTrashModal } from '../../workspace/ArchiveTrashModal';

const ROLE_LABEL: Record<string, string> = {
    super_admin: 'Super admin',
    it_admin: 'IT admin',
};

/**
 * The signed-in person, at the bottom of the sidebar above "Powered by" (the
 * top bar has no avatar): picture, name and role, opening the account menu —
 * Profile Settings, Trash, Admin Console, Log out — upwards. `compact` is the
 * collapsed rail: the avatar alone, menu to its right.
 */
export const SidebarProfile = ({ compact = false }: { compact?: boolean }) => {
    const { user } = useAuth();
    const { currentUser } = useUserStore();
    const [open, setOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showTrash, setShowTrash] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    // The same picture and initial as the top bar's avatar.
    const avatar = currentUser.avatar?.startsWith('http') ? currentUser.avatar : user?.user_metadata?.avatar_url;
    const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    const initial = name.charAt(0).toUpperCase();
    const role = ROLE_LABEL[currentUser.system_role || ''] || 'Member';

    return (
        <div className={`sidebar-profile${compact ? ' sidebar-profile--compact' : ''}`} ref={ref}>
            <button
                type="button"
                className="sidebar-profile__button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="menu"
                title={user?.email || 'Profile'}
            >
                <span className="sidebar-profile__avatar">
                    {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
                </span>
                {!compact && (
                    <>
                        <span className="sidebar-profile__text">
                            <span className="sidebar-profile__name">{name}</span>
                            <span className="sidebar-profile__role">{role}</span>
                        </span>
                        <ChevronsUpDown size={14} className="sidebar-profile__caret" />
                    </>
                )}
            </button>

            {open && (
                <ProfileMenu
                    placement={compact ? 'right' : 'above'}
                    onClose={() => setOpen(false)}
                    onOpenSettings={() => setShowSettings(true)}
                    onOpenTrash={() => setShowTrash(true)}
                />
            )}

            {showSettings && <ProfileSettingsModal onClose={() => setShowSettings(false)} />}
            {showTrash && <ArchiveTrashModal onClose={() => setShowTrash(false)} />}
        </div>
    );
};
