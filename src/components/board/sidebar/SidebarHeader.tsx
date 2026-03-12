import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Archive, Users } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { ArchiveTrashModal } from '../../workspace/ArchiveTrashModal';

interface SidebarHeaderProps {
    activeTab: 'my-workspaces' | 'shared';
    setActiveTab: (tab: 'my-workspaces' | 'shared') => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export const SidebarHeader = ({ activeTab, setActiveTab, searchQuery, setSearchQuery }: SidebarHeaderProps) => {
    const { addWorkspace, navigateTo } = useBoardStore();
    const { currentUser } = useUserStore();
    const user = currentUser;

    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newWorkspaceTitle.trim() && !isSubmitting) {
            setIsSubmitting(true);
            try {
                await addWorkspace(newWorkspaceTitle);
                setNewWorkspaceTitle('');
                setIsCreatingWorkspace(false);
            } catch (error: any) {
                console.error('[SidebarHeader] Workspace creation error:', error);
                alert(`Failed to create workspace: ${error.message || 'Unknown error'}. Please check your internet connection or database permissions.`);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    return (
        <div className="sidebar-header" style={{ padding: '0 16px', marginBottom: '12px', width: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
                onClick={() => navigateTo('home')}
                style={{
                    marginBottom: '16px',
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                    backgroundColor: 'white'
                }}>
                    <img
                        src="https://guideline.lubd.com/wp-content/uploads/2025/11/NHG128-1.png"
                        alt="Logo"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                </div>
                <span style={{ fontSize: '22px', fontWeight: 700, color: 'hsl(var(--color-text-primary))', letterSpacing: '-0.5px' }}>NHG Saturday.com</span>
            </div>

            {/* Admin Link (Only for System Admins) */}
            {(user?.system_role === 'super_admin' || user?.system_role === 'it_admin') && (
                <div style={{ padding: '0 4px', marginBottom: '8px' }}>
                    <button
                        onClick={() => navigateTo('admin')}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            border: '1px solid #6366f1',
                            borderRadius: '4px',
                            backgroundColor: '#e0e7ff',
                            color: '#4338ca',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(99, 102, 241, 0.1)'
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        <span>Admin Console</span>
                    </button>
                </div>
            )}

            {/* Workspaces Tabs */}
            <div style={{ display: 'flex', padding: '0 4px', width: '100%', marginBottom: '4px', borderBottom: '1px solid #f0f0f0' }}>
                <button
                    onClick={() => setActiveTab('my-workspaces')}
                    style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        color: activeTab === 'my-workspaces' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                        fontSize: '13px',
                        fontWeight: activeTab === 'my-workspaces' ? 600 : 400,
                        cursor: 'pointer',
                        borderBottom: activeTab === 'my-workspaces' ? '2px solid #0073ea' : 'none',
                        transition: 'all 0.2s',
                        marginBottom: '-1px'
                    }}
                >
                    Workspaces
                </button>
                <button
                    onClick={() => setActiveTab('shared')}
                    style={{
                        padding: '8px 12px',
                        border: 'none',
                        background: 'none',
                        color: activeTab === 'shared' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                        fontSize: '13px',
                        fontWeight: activeTab === 'shared' ? 600 : 400,
                        cursor: 'pointer',
                        borderBottom: activeTab === 'shared' ? '2px solid #0073ea' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        marginBottom: '-1px'
                    }}
                >
                    <Users size={14} />
                    <span>Shared</span>
                </button>
            </div>

            {/* Workspaces Title & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', width: '100%', marginBottom: '12px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Workspaces</span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* More Menu (...) */}
                    <div style={{ position: 'relative' }} ref={menuRef}>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
                                borderRadius: '4px', color: 'hsl(var(--color-text-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        
                        {isMenuOpen && (
                            <div 
                                style={{
                                    position: 'absolute', top: '100%', left: '0', 
                                    backgroundColor: 'white', border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 100, width: '220px', padding: '8px 4px', marginTop: '4px'
                                }}
                            >
                                <div 
                                    className="sidebar-more-menu-item"
                                    onClick={() => { setIsMenuOpen(false); setIsCreatingWorkspace(true); }}
                                >
                                    <Plus size={14} /> Add new workspace
                                </div>
                                <div style={{ height: '1px', backgroundColor: 'hsl(var(--color-border))', margin: '4px 0' }}></div>
                                <div 
                                    className="sidebar-more-menu-item"
                                    onClick={() => { setIsMenuOpen(false); setIsArchiveModalOpen(true); }}
                                >
                                    <Archive size={14} /> View archive/trash
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Search Icon */}
                    <button
                        onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                        style={{
                            background: showSearch ? 'hsl(var(--color-bg-hover))' : 'transparent', 
                            border: 'none', cursor: 'pointer', padding: '4px',
                            borderRadius: '4px', color: 'hsl(var(--color-text-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onMouseOver={(e) => { if (!showSearch) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))' }}
                        onMouseOut={(e) => { if (!showSearch) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                        <Search size={16} />
                    </button>
                </div>
            </div>

            {/* Search Input (Toggled) */}
            {showSearch && (
                <div style={{ display: 'flex', gap: '8px', position: 'relative', width: '100%', marginBottom: '12px', padding: '0 4px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#676879' }} />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search workspaces..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 8px 6px 30px',
                                borderRadius: '4px',
                                border: '1px solid hsl(var(--color-border))',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                fontSize: '13px',
                                outline: 'none',
                                color: 'hsl(var(--color-text-primary))'
                            }}
                        />
                    </div>
                </div>
            )}

            {isArchiveModalOpen && (
                <ArchiveTrashModal onClose={() => setIsArchiveModalOpen(false)} />
            )}

            <style>{`
                .sidebar-more-menu-item {
                    padding: 8px 12px;
                    display: flex;
                    alignItems: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    border-radius: 4px;
                    color: hsl(var(--color-text-primary));
                    transition: background-color 0.2s;
                }
                .sidebar-more-menu-item:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
            `}</style>


            {/* Workspace Creation Modal */}
            {isCreatingWorkspace && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000
                }} onClick={() => setIsCreatingWorkspace(false)}>
                    <div style={{
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        padding: '24px',
                        borderRadius: '8px',
                        width: '320px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Create Workspace</h3>
                        <form onSubmit={handleCreateWorkspace}>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Workspace Name (e.g. Marketing)"
                                value={newWorkspaceTitle}
                                onChange={(e) => setNewWorkspaceTitle(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    marginBottom: '16px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingWorkspace(false)}
                                    style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    style={{
                                        padding: '6px 12px',
                                        background: isSubmitting ? '#ccc' : '#0073ea',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: isSubmitting ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {isSubmitting ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
