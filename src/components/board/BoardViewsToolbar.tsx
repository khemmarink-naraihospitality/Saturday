import React, { useState, useRef } from 'react';
import { Search, Filter, ArrowUpDown, LayoutPanelLeft, ChevronDown, LayoutGrid } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { createPortal } from 'react-dom';

export const BoardViewsToolbar = () => {
    const addItem = useBoardStore(state => state.addItem);
    const addGroup = useBoardStore(state => state.addGroup);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const firstGroupId = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId)?.groups[0]?.id);
    
    const [showDropdown, setShowDropdown] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    
    const dropdownBtnRef = useRef<HTMLButtonElement>(null);
    const sortBtnRef = useRef<HTMLDivElement>(null);
    const filterBtnRef = useRef<HTMLDivElement>(null);
    const groupByBtnRef = useRef<HTMLDivElement>(null);

    const handleAddItem = () => {
        if (activeBoardId && firstGroupId) {
            addItem("New Item", firstGroupId);
        }
    };

    const handleAddGroup = () => {
        if (activeBoardId) {
            addGroup("New Group");
            setShowDropdown(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 32px', // Symmetric padding for perfect gap balance
            backgroundColor: 'hsl(var(--color-bg-canvas))',
        }}>
            {/* Toolbar Items: Primary Action & Tools */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', height: '32px', position: 'relative' }}>
                    <button
                        onClick={handleAddItem}
                        style={{
                            backgroundColor: 'hsl(var(--color-brand-primary))',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px 0 0 4px',
                            padding: '0 12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        New Item
                    </button>
                    <button 
                        ref={dropdownBtnRef}
                        onClick={() => setShowDropdown(!showDropdown)}
                        style={{
                            backgroundColor: 'hsl(var(--color-brand-primary))',
                            color: 'white',
                            border: 'none',
                            borderLeft: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '0 4px 4px 0',
                            padding: '0 6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <ChevronDown size={16} />
                    </button>
                    
                    {showDropdown && dropdownBtnRef.current && createPortal(
                        <>
                            <div 
                                style={{ position: 'fixed', inset: 0, zIndex: 9998 }} 
                                onClick={() => setShowDropdown(false)} 
                            />
                            <div style={{
                                position: 'fixed',
                                top: dropdownBtnRef.current.getBoundingClientRect().top, // Align with top of button
                                left: dropdownBtnRef.current.getBoundingClientRect().right + 8, // Position to the RIGHT
                                backgroundColor: 'white',
                                border: '1px solid hsl(var(--color-border))',
                                borderRadius: '8px',
                                padding: '8px 0',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '4px 4px 16px rgba(0,0,0,0.15)', // Adjusted shadow for right position
                                zIndex: 9999,
                                width: '220px'
                            }}>
                                <div 
                                    onClick={handleAddGroup}
                                    style={dropdownItemStyle}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <LayoutGrid size={16} />
                                    <span>New group of items</span>
                                </div>
                            </div>
                        </>,
                        document.body
                    )}
                </div>

                <div 
                    className="toolbar-item" 
                    style={{ 
                        ...toolbarItemStyle, 
                        padding: '0 8px', 
                        gap: '4px',
                        border: isSearchFocused ? '1px solid hsl(var(--color-brand-primary))' : '1px solid transparent',
                        backgroundColor: isSearchFocused ? 'white' : 'transparent',
                        boxShadow: isSearchFocused ? '0 0 0 2px rgba(var(--color-brand-primary-rgb), 0.1)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search"
                        value={useBoardStore(state => state.searchQuery)}
                        onChange={(e) => useBoardStore.getState().setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        style={{
                            border: 'none',
                            background: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            color: 'hsl(var(--color-text-primary))',
                            width: '100px',
                            padding: '4px 0'
                        }}
                    />
                </div>
                
                <div style={{ width: '1px', height: '16px', backgroundColor: 'hsl(var(--color-border))', margin: '0 4px' }} />

                <div 
                    ref={filterBtnRef}
                    className="toolbar-item" 
                    style={toolbarItemStyle}
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                >
                    <Filter size={16} />
                    <span>Filter</span>
                    <ChevronDown size={14} />
                </div>

                {showFilterDropdown && filterBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }} 
                            onClick={() => setShowFilterDropdown(false)} 
                        />
                        <div style={{
                            position: 'fixed',
                            top: filterBtnRef.current.getBoundingClientRect().bottom + 8,
                            left: filterBtnRef.current.getBoundingClientRect().left,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            zIndex: 9999,
                            width: '280px',
                            gap: '12px'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>Filter by</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns.map(col => (
                                    <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{col.title}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {(col.options || []).map(opt => {
                                                const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                                const currentFilters = board?.filters || [];
                                                const isActive = currentFilters.some(f => f.columnId === col.id && f.values.includes(opt.id || opt.label));
                                                
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => {
                                                            const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                                            if (!board) return;
                                                            const currentFilters = [...(board.filters || [])];
                                                            const existingFilterIdx = currentFilters.findIndex(f => f.columnId === col.id);
                                                            const val = opt.id || opt.label;

                                                            if (existingFilterIdx !== -1) {
                                                                const values = [...currentFilters[existingFilterIdx].values];
                                                                if (values.includes(val)) {
                                                                    currentFilters[existingFilterIdx].values = values.filter(v => v !== val);
                                                                    if (currentFilters[existingFilterIdx].values.length === 0) {
                                                                        currentFilters.splice(existingFilterIdx, 1);
                                                                    }
                                                                } else {
                                                                    currentFilters[existingFilterIdx].values.push(val);
                                                                }
                                                            } else {
                                                                currentFilters.push({ columnId: col.id, values: [val] });
                                                            }
                                                            useBoardStore.getState().setBoardFilters(activeBoardId, currentFilters);
                                                        }}
                                                        style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '11px',
                                                            border: 'none',
                                                            backgroundColor: isActive ? opt.color : 'hsl(var(--color-bg-subtle))',
                                                            color: isActive ? 'white' : 'hsl(var(--color-text-secondary))',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.1s'
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={() => activeBoardId && useBoardStore.getState().setBoardFilters(activeBoardId, [])}
                                style={{
                                    marginTop: '8px',
                                    padding: '6px',
                                    fontSize: '12px',
                                    color: 'hsl(var(--color-brand-primary))',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                }}
                            >
                                Clear all filters
                            </button>
                        </div>
                    </>,
                    document.body
                )}

                <div 
                    ref={sortBtnRef}
                    className="toolbar-item" 
                    style={toolbarItemStyle}
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                >
                    <ArrowUpDown size={16} />
                    <span>Sort</span>
                </div>

                {showSortDropdown && sortBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }} 
                            onClick={() => setShowSortDropdown(false)} 
                        />
                        <div style={{
                            position: 'fixed',
                            top: sortBtnRef.current.getBoundingClientRect().bottom + 8,
                            left: sortBtnRef.current.getBoundingClientRect().left,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            padding: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            zIndex: 9999,
                            width: '200px'
                        }}>
                            <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>Sort by</div>
                            <div 
                                onClick={() => {
                                    useBoardStore.getState().setSort(activeBoardId, null);
                                    setShowSortDropdown(false);
                                }}
                                style={dropdownItemStyle}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <span style={{ fontSize: '13px' }}>None</span>
                            </div>
                            {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns.map(col => (
                                <div 
                                    key={col.id}
                                    onClick={() => {
                                        const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                        const currentSort = board?.sort;
                                        const nextDirection = (currentSort?.columnId === col.id && currentSort.direction === 'asc') ? 'desc' : 'asc';
                                        useBoardStore.getState().setSort(activeBoardId, { columnId: col.id, direction: nextDirection });
                                        setShowSortDropdown(false);
                                    }}
                                    style={dropdownItemStyle}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <span style={{ fontSize: '13px' }}>{col.title}</span>
                                    {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.sort?.columnId === col.id && (
                                        <span style={{ fontSize: '10px', marginLeft: 'auto', opacity: 0.6 }}>
                                            {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.sort?.direction === 'asc' ? 'ASC' : 'DESC'}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>,
                    document.body
                )}

                <div 
                    ref={groupByBtnRef}
                    className="toolbar-item" 
                    style={toolbarItemStyle}
                    onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
                >
                    <LayoutPanelLeft size={16} />
                    <span>Group by</span>
                </div>

                {showGroupByDropdown && groupByBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }} 
                            onClick={() => setShowGroupByDropdown(false)} 
                        />
                        <div style={{
                            position: 'fixed',
                            top: groupByBtnRef.current.getBoundingClientRect().bottom + 8,
                            left: groupByBtnRef.current.getBoundingClientRect().left,
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            padding: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                            zIndex: 9999,
                            width: '200px'
                        }}>
                            <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>Group by</div>
                            <div 
                                onClick={() => {
                                    useBoardStore.getState().setBoardGroupBy(activeBoardId, null);
                                    setShowGroupByDropdown(false);
                                }}
                                style={dropdownItemStyle}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <span style={{ fontSize: '13px' }}>Default (Groups)</span>
                            </div>
                            {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns.filter(c => ['status', 'dropdown', 'people'].includes(c.type)).map(col => (
                                <div 
                                    key={col.id}
                                    onClick={() => {
                                        useBoardStore.getState().setBoardGroupBy(activeBoardId, col.id);
                                        setShowGroupByDropdown(false);
                                    }}
                                    style={dropdownItemStyle}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <span style={{ fontSize: '13px' }}>{col.title}</span>
                                    {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.groupByColumnId === col.id && (
                                        <span style={{ fontSize: '10px', marginLeft: 'auto', color: 'hsl(var(--color-brand-primary))' }}>●</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>,
                    document.body
                )}
            </div>

            {/* Right Side: Empty */}
            <div />
        </div>
    );
};

const toolbarItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: 'hsl(var(--color-text-secondary))',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
};

const dropdownItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    fontSize: '14px',
    color: 'hsl(var(--color-text-primary))',
    cursor: 'pointer',
    transition: 'background-color 0.1s',
};
