import { useState, type ReactNode } from 'react';
import { ChevronRight, LayoutGrid, LifeBuoy, LogOut, Monitor, Moon, ShieldCheck } from 'lucide-react';
import './screens.css';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { useThemeStore } from '../../store/useThemeStore';
import { useAuth } from '../../contexts/AuthContext';
import { setLayoutOverride } from '../../hooks/useIsMobile';
import { Avatar, BottomSheet, Card, PrimaryButton } from '../ui';
import { openWorkspaces } from '../nav/navigation';

// The same form as the desktop's floating "Contact support" button.
const SUPPORT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSej_72lQitnkvE18rIHRwtkBud6fe5Hn48pRWCnbpFlmETQSg/viewform?usp=header';

const MenuItem = ({ icon, label, hint, onClick, right, danger = false }: {
    icon: ReactNode;
    label: ReactNode;
    hint?: ReactNode;
    onClick: () => void;
    right?: ReactNode;
    danger?: boolean;
}) => (
    <button type="button" className={`m-menu__item${danger ? ' m-menu__item--danger' : ''}`} onClick={onClick}>
        <span className="m-menu__icon">{icon}</span>
        <span className="m-menu__label">
            {label}
            {hint && <span className="m-menu__hint">{hint}</span>}
        </span>
        {right ?? <ChevronRight size={18} color="hsl(var(--m-text-3))" />}
    </button>
);

/** The More tab: the account, appearance, the admin console, the desktop layout, signing out. */
export const MoreScreen = () => {
    const user = useUserStore(state => state.currentUser);
    const theme = useThemeStore(state => state.theme);
    const toggleTheme = useThemeStore(state => state.toggleTheme);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const { signOut } = useAuth();
    const [confirmSignOut, setConfirmSignOut] = useState(false);

    const isAdmin = user?.system_role === 'super_admin' || user?.system_role === 'it_admin';
    const avatarUrl = user?.avatar && /^https?:\/\//.test(user.avatar) ? user.avatar : null;

    return (
        <div className="m-screen" data-testid="m-more">
            <div className="m-scroll m-scroll--tabbar">
                <h1 className="m-tab-title">More</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 16px 0' }}>
                    <Card>
                        <div className="m-profile">
                            <Avatar name={user?.name || user?.email} src={avatarUrl} size={52} />
                            <div style={{ minWidth: 0 }}>
                                <div className="m-profile__name m-truncate">{user?.name}</div>
                                {user?.email && <div className="m-profile__email m-truncate">{user.email}</div>}
                            </div>
                        </div>
                    </Card>

                    <Card className="m-menu">
                        <MenuItem icon={<LayoutGrid size={20} />} label="Workspaces" onClick={openWorkspaces} />
                        <MenuItem
                            icon={<Moon size={20} />}
                            label="Dark mode"
                            onClick={toggleTheme}
                            right={<span className={`m-switch${theme === 'dark' ? ' m-switch--on' : ''}`} role="switch" aria-checked={theme === 'dark'} />}
                        />
                        {isAdmin && (
                            <MenuItem icon={<ShieldCheck size={20} />} label="Admin console" onClick={() => navigateTo('admin')} />
                        )}
                    </Card>

                    <Card className="m-menu">
                        <MenuItem
                            icon={<Monitor size={20} />}
                            label="Desktop site"
                            hint="Use the full desktop layout on this phone"
                            onClick={() => setLayoutOverride('desktop')}
                        />
                        <MenuItem
                            icon={<LifeBuoy size={20} />}
                            label="Contact support"
                            onClick={() => window.open(SUPPORT_FORM_URL, '_blank', 'noopener')}
                        />
                    </Card>

                    <Card className="m-menu">
                        <MenuItem icon={<LogOut size={20} />} label="Sign out" danger onClick={() => setConfirmSignOut(true)} right={<span />} />
                    </Card>
                </div>
            </div>

            <BottomSheet open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Sign out?">
                <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 15, color: 'hsl(var(--m-text-2))' }}>
                        You'll need to sign in again to use Saturday on this phone.
                    </div>
                    <PrimaryButton
                        style={{ background: 'hsl(var(--color-danger))' }}
                        onClick={() => { setConfirmSignOut(false); void signOut(); }}
                    >
                        Sign out
                    </PrimaryButton>
                </div>
            </BottomSheet>
        </div>
    );
};
