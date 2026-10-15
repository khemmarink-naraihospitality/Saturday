import { Bell, CircleEllipsis, House, PieChart, Star, type LucideIcon } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { openTab, TAB_FOR_PAGE, type MobileTab } from '../nav/navigation';

const TABS: { tab: MobileTab; label: string; icon: LucideIcon; fillWhenActive: boolean }[] = [
    { tab: 'home', label: 'Home', icon: House, fillWhenActive: true },
    { tab: 'favorites', label: 'Favorites', icon: Star, fillWhenActive: true },
    { tab: 'dashboard', label: 'Dashboard', icon: PieChart, fillWhenActive: false },
    { tab: 'notifications', label: 'Notifications', icon: Bell, fillWhenActive: true },
    { tab: 'more', label: 'More', icon: CircleEllipsis, fillWhenActive: false },
];

/** The floating bar along the bottom of the top-level screens. */
export const TabBar = () => {
    const activePage = useBoardStore(state => state.activePage);
    const unread = useBoardStore(state => (state.notifications || []).filter(n => !n.is_read).length);
    const activeTab = TAB_FOR_PAGE[activePage];

    return (
        <nav className="m-tabbar" aria-label="Main">
            {TABS.map(({ tab, label, icon: Icon, fillWhenActive }) => {
                const active = activeTab === tab;
                return (
                    <button
                        key={tab}
                        type="button"
                        className={`m-tabbar__item${active ? ' m-tabbar__item--active' : ''}`}
                        aria-label={label}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => { if (!active) openTab(tab); }}
                    >
                        <Icon
                            size={27}
                            strokeWidth={active ? 2.1 : 1.8}
                            fill={active && fillWhenActive ? 'currentColor' : 'none'}
                            fillOpacity={active && fillWhenActive ? 0.95 : 0}
                        />
                        {tab === 'notifications' && unread > 0 && (
                            <span className="m-tabbar__badge">{unread > 99 ? '99+' : unread}</span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
};
