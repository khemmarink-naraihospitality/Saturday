import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Archive, Home, Star } from 'lucide-react';
import { useBoardStore } from '../../../store/useBoardStore';
import { ArchiveTrashModal } from '../../workspace/ArchiveTrashModal';

interface SidebarHeaderProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export const SidebarHeader = ({ searchQuery, setSearchQuery }: SidebarHeaderProps) => {
    const { addWorkspace, navigateTo, activePage } = useBoardStore();

    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newWorkspaceTitle, setNewWorkspaceTitle] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
        <div className="sidebar-header" style={{ padding: '0 16px', marginBottom: '0px', width: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
                onClick={() => navigateTo('home')}
                style={{
                    marginBottom: '6px',
                    marginTop: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'hsl(var(--color-text-primary))', letterSpacing: '-0.5px' }}>NHG</span>
                    <span style={{ fontSize: '16px', fontWeight: 400, color: 'hsl(var(--color-text-secondary))', letterSpacing: '-0.2px' }}>Saturday.com</span>
                </div>
            </div>

            {/* Main Navigation */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px', marginBottom: '8px' }}>
                <button
                    onClick={() => navigateTo('home')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activePage === 'home' ? 'hsl(var(--color-bg-hover))' : 'transparent',
                        color: activePage === 'home' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease',
                        textAlign: 'left'
                    }}
                    onMouseOver={(e) => {
                        if (activePage !== 'home') {
                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))';
                            e.currentTarget.style.color = 'hsl(var(--color-text-primary))';
                        }
                    }}
                    onMouseOut={(e) => {
                        if (activePage !== 'home') {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'hsl(var(--color-text-secondary))';
                        }
                    }}
                >
                    <Home size={18} />
                    <span style={{ fontSize: '12px', fontWeight: activePage === 'home' ? 600 : 400 }}>Home</span>
                </button>

                <button
                    onClick={() => navigateTo('favorites')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: activePage === 'favorites' ? 'hsl(var(--color-bg-hover))' : 'transparent',
                        color: activePage === 'favorites' ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease',
                        textAlign: 'left'
                    }}
                    onMouseOver={(e) => {
                        if (activePage !== 'favorites') {
                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))';
                            e.currentTarget.style.color = 'hsl(var(--color-text-primary))';
                        }
                    }}
                    onMouseOut={(e) => {
                        if (activePage !== 'favorites') {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'hsl(var(--color-text-secondary))';
                        }
                    }}
                >
                    <Star size={18} />
                    <span style={{ fontSize: '12px', fontWeight: activePage === 'favorites' ? 600 : 400 }}>Favorites</span>
                </button>
            </div>


            {/* Workspaces Title & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', width: '100%', marginBottom: '8px' }}>
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
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'white',
                                borderRadius: '8px', boxShadow: 'var(--shadow-lg)', border: '1px solid #eee', width: '200px', zIndex: 100, overflow: 'hidden'
                            }}>
                                <div style={{ padding: '8px' }}>
                                    <button
                                        onClick={() => { setIsMenuOpen(false); setIsCreatingWorkspace(true); }}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: 'none', background: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', color: '#444' }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <Plus size={16} />
                                        <span style={{ fontSize: '14px' }}>Create Workspace</span>
                                    </button>
                                    <button
                                        onClick={() => { setIsMenuOpen(false); setIsArchiveModalOpen(true); }}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: 'none', background: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', color: '#444' }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <Archive size={16} />
                                        <span style={{ fontSize: '14px' }}>Archive/Trash</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Search Input */}
            <div style={{ width: '100%', padding: '0 4px', marginBottom: '8px', display: 'flex', alignItems: 'center', backgroundColor: 'hsl(var(--color-bg-hover))', borderRadius: '6px', border: '1px solid hsl(var(--color-border))' }}>
                <Search size={16} style={{ color: 'hsl(var(--color-text-secondary))', marginLeft: '8px' }} />
                <input
                    type="text"
                    placeholder="Search workspaces..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        outline: 'none',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                />
            </div>

            {/* Modals */}
            {isArchiveModalOpen && (
                <ArchiveTrashModal onClose={() => setIsArchiveModalOpen(false)} />
            )}

            {isCreatingWorkspace && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', width: '400px', boxShadow: 'var(--shadow-xl)' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Create new workspace</h2>
                        <form onSubmit={handleCreateWorkspace}>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Workspace title"
                                value={newWorkspaceTitle}
                                onChange={(e) => setNewWorkspaceTitle(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '15px', marginBottom: '24px', outline: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingWorkspace(false)}
                                    style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newWorkspaceTitle.trim() || isSubmitting}
                                    style={{
                                        padding: '10px 20px', borderRadius: '6px', border: 'none',
                                        backgroundColor: !newWorkspaceTitle.trim() || isSubmitting ? '#ddd' : '#0073ea',
                                        color: 'white', cursor: !newWorkspaceTitle.trim() || isSubmitting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 500
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
