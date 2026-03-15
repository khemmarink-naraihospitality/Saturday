import { useState } from 'react';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { WorkspaceList } from './sidebar/WorkspaceList';
import '../../styles/sidebar_tree.css';

export const Sidebar = () => {
    // State managed at Sidebar level for filtering
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <aside className="sidebar">
            <SidebarHeader
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            <WorkspaceList
                searchQuery={searchQuery}
            />

            <div className="sidebar-footer">
                <span className="footer-power">Powered by jirawat.k</span>
            </div>
        </aside>
    );
};
