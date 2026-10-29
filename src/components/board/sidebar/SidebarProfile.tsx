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
 * NHG's profile, at the bottom of the sidebar instead of the top bar (the
 * avatar there is hidden under NHG). The menu is the top bar's, plus the
 * Trash. `compact` is the collapsed rail: the avatar alone, menu to its right.
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
        <div className={`nhg-profile${compact ? ' nhg-profile--compact' : ''}`} ref={ref}>
            <button
                type="button"
                className="nhg-profile__button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="menu"
                title={user?.email || 'Profile'}
            >
                <span className="nhg-profile__avatar">
                    {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initial}
                </span>
                {!compact && (
                    <>
                        <span className="nhg-profile__text">
                            <span className="nhg-profile__name">{name}</span>
                            <span className="nhg-profile__role">{role}</span>
                        </span>
                        <ChevronsUpDown size={14} className="nhg-profile__caret" />
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
