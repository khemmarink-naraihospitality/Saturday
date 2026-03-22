import { useState, useEffect } from 'react';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { WorkspaceList } from './sidebar/WorkspaceList';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import '../../styles/sidebar_tree.css';

export const Sidebar = () => {
    const [searchQuery, setSearchQuery] = useState('');
    
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved, 10) : 260;
    });
    
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('sidebarCollapsed') === 'true';
    });

    const [isResizing, setIsResizing] = useState(false);
    const [isHoveringResizer, setIsHoveringResizer] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidebarWidth', sidebarWidth.toString());
    }, [sidebarWidth]);

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
    }, [isCollapsed]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            // Limit width between 200 and 600
            const newWidth = Math.max(200, Math.min(e.clientX, 600));
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
            }
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            // Prevent text selection while dragging
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.userSelect = '';
        }
        
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    if (isCollapsed) {
        return (
            <aside 
                className="sidebar" 
                style={{ 
                    width: '20px', 
                    minWidth: '20px', 
                    padding: 0, 
                    transition: 'width 0.2s, min-width 0.2s',
                    backgroundColor: 'transparent',
                    borderRight: 'none'
                }}
            >
                <div 
                    title="Expand Sidebar"
                    style={{
                        position: 'absolute',
                        top: '16px',
                        left: '0px',
                        width: '24px',
                        height: '24px',
                        backgroundColor: 'white',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '0 4px 4px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 100,
                        boxShadow: '2px 0 8px rgba(0,0,0,0.05)',
                        color: '#676879'
                    }}
                    onClick={() => setIsCollapsed(false)}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f6f8'; e.currentTarget.style.color = '#323338'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#676879'; }}
                >
                    <ChevronRight size={14} />
                </div>
            </aside>
        );
    }

    return (
        <aside 
            className="sidebar" 
            style={{ 
                width: `${sidebarWidth}px`, 
                minWidth: `${sidebarWidth}px`,
                transition: isResizing ? 'none' : 'width 0.2s, min-width 0.2s'
            }}
        >
            <div style={{ paddingRight: '8px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            </div>

            {/* Resizer Handle */}
            <div 
                style={{
                    position: 'absolute',
                    top: 0,
                    right: -3,
                    width: '6px',
                    height: '100%',
                    cursor: 'col-resize',
                    backgroundColor: isResizing || isHoveringResizer ? 'rgba(0, 115, 234, 0.5)' : 'transparent',
                    transition: 'background-color 0.2s',
                    zIndex: 10
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                }}
                onMouseEnter={() => setIsHoveringResizer(true)}
                onMouseLeave={() => setIsHoveringResizer(false)}
            />

            {/* Collapse Toggle Button */}
            <div 
                title="Collapse Sidebar"
                style={{
                    position: 'absolute',
                    top: '16px',
                    right: '-12px',
                    width: '24px',
                    height: '24px',
                    backgroundColor: 'white',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 100,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    opacity: isHoveringResizer ? 1 : 0,
                    transition: 'opacity 0.2s, background-color 0.2s, color 0.2s',
                    color: '#676879'
                }}
                onClick={() => setIsCollapsed(true)}
                onMouseEnter={(e) => { 
                    setIsHoveringResizer(true); 
                    e.currentTarget.style.backgroundColor = '#f5f6f8'; 
                    e.currentTarget.style.color = '#323338';
                }}
                onMouseLeave={(e) => { 
                    setIsHoveringResizer(false); 
                    e.currentTarget.style.backgroundColor = 'white'; 
                    e.currentTarget.style.color = '#676879';
                }}
            >
                <ChevronLeft size={14} />
            </div>

        </aside>
    );
};
