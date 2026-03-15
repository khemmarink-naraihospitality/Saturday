import { useState } from 'react';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { WorkspaceList } from './sidebar/WorkspaceList';
import '../../styles/sidebar_tree.css';

export const Sidebar = () => {
    // State managed at Sidebar level to coordinate between Header and List
    const [activeTab, setActiveTab] = useState<'my-workspaces' | 'shared'>('my-workspaces');
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <aside className="sidebar">
            <SidebarHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            <WorkspaceList
                activeTab={activeTab}
                searchQuery={searchQuery}
            />

            <div className="sidebar-footer">
                <span className="footer-power">Powered by jirawat.k</span>
            </div>
        </aside>
    );
};
