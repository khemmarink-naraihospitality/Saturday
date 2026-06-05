import { useEffect, useRef, useState } from 'react';
import {
    Bold, Italic, Underline, Strikethrough,
    List, ListOrdered, Link,
    Minus, Palette, Table2, CheckSquare,
    AlignLeft, AlignCenter, AlignRight,
    Type, ChevronDown
} from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';

interface RichTextEditorProps {
    value: string; // HTML string
    onChange: (html: string) => void;
    footer?: React.ReactNode;
}

const TEXT_COLORS = [
    { label: 'Black', value: '#000000' },
    { label: 'Gray 1', value: '#323338' },
    { label: 'Gray 2', value: '#676879' },
    { label: 'Gray 3', value: '#abb4be' },
    { label: 'Gray 4', value: '#d0d4d9' },
    { label: 'White', value: '#ffffff' },

    { label: 'Blue', value: '#0073ea' },
    { label: 'Soft Blue', value: '#00a9ff' },
    { label: 'Indigo', value: '#579bfc' },
    { label: 'Purple', value: '#a25ddc' },
    { label: 'Deep Purple', value: '#784bd1' },
    { label: 'Pink', value: '#ff5ac4' },

    { label: 'Red', value: '#e2445c' },
    { label: 'Soft Red', value: '#ff642e' },
    { label: 'Orange', value: '#fdab3d' },
    { label: 'Yellow', value: '#ffcb00' },
    { label: 'Lime', value: '#9cd326' },
    { label: 'Green', value: '#00c875' },
    
    { label: 'Teal', value: '#00d1d1' },
    { label: 'Dark Blue', value: '#0086c0' },
    { label: 'Dark Indigo', value: '#225091' },
    { label: 'Dark Purple', value: '#401694' },
    { label: 'Dark Green', value: '#007f36' },
    { label: 'Brown', value: '#7f5347' },
];

const FONTS = [
    { label: 'Default', value: 'inherit' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Courier New', value: '"Courier New", Courier, monospace' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
];

export const RichTextEditor = ({ value, onChange, footer }: RichTextEditorProps) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionPosition, setMentionPosition] = useState<{ top: number, left: number } | null>(null);
    const [mentionRange, setMentionRange] = useState<Range | null>(null);
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);

    // Hyperlink State
    const [isLinkUIOpen, setIsLinkUIOpen] = useState(false);
    const [linkData, setLinkData] = useState({ text: '', url: '' });
    const [savedSelection, setSavedSelection] = useState<Range | null>(null);

    // Color State
    const [isColorUIOpen, setIsColorUIOpen] = useState(false);
    const [colorMode, setColorMode] = useState<'text' | 'highlight'>('text');
    const [activeColorSource, setActiveColorSource] = useState<'color' | 'highlight' | null>(null);

    // Typography State
    const [isTypeUIOpen, setIsTypeUIOpen] = useState(false);

    // Font State
    const [isFontUIOpen, setIsFontUIOpen] = useState(false);

    // Helper to get display name (prefer email username)
    const getDisplayName = (member: any) => {
        const profileData = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        const profile = profileData || {};
        if (profile.email) {
            return profile.email.split('@')[0];
        }
        return profile.full_name || 'Unknown';
    };

    const filteredMembers = mentionQuery !== null
        ? activeBoardMembers.filter(m => {
            const name = getDisplayName(m);
            const match = name.toLowerCase().includes(mentionQuery.toLowerCase());
            return match;
        })
        : [];

    useEffect(() => {
        if (mentionQuery !== null) {
            console.log('[RichTextEditor] Mention Active:', mentionQuery);
        }
    }, [mentionQuery, activeBoardMembers, filteredMembers.length]);

    const isInternalUpdate = useRef(false);

    // Sync external value to editor ONLY if different and not focused
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (isColorUIOpen || isTypeUIOpen || isFontUIOpen) {
                // If the click is not inside a popover or a toolbar button
                const isInsidePopover = target.closest('.editor-popover');
                const isToolbarButton = target.closest('button[title]');
                if (!isInsidePopover && !isToolbarButton) {
                    setIsColorUIOpen(false);
                    setIsTypeUIOpen(false);
                    setIsFontUIOpen(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isColorUIOpen, isTypeUIOpen, isFontUIOpen]);

    useEffect(() => {
        // Skip sync if UI is open
        if (isLinkUIOpen || isColorUIOpen || isFontUIOpen) return;

        // Skip sync if we just performed an internal update (to avoid race with stale props)
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }

        if (editorRef.current && !isFocused && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
        // Handle empty initial case
        if (editorRef.current && !value && !isFocused) {
            editorRef.current.innerHTML = '';
        }
    }, [value, isFocused, isLinkUIOpen, isColorUIOpen]);

    const exec = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        handleChange();
    };

    const handleChange = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            checkMention();
        }
    };

    const checkMention = () => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const text = range.startContainer.textContent || '';
        const cursorOffset = range.startOffset;

        // Find last @ before cursor
        const lastAt = text.lastIndexOf('@', cursorOffset - 1);

        if (lastAt !== -1) {
            const query = text.substring(lastAt + 1, cursorOffset);

            // Simple validation: Ensure @ is preceded by space or is start of line
            const charBefore = lastAt > 0 ? text[lastAt - 1] : ' ';
            if (charBefore === ' ' || charBefore === '\n' || charBefore === '\u00A0') { // 00A0 is nbsp
                setMentionQuery(query);
                setMentionRange(range.cloneRange()); // Save the range!

                // Get coordinates
                const rect = range.getBoundingClientRect();
                setMentionPosition({
                    top: rect.bottom, // Relative to viewport
                    left: rect.left
                });
                return;
            }
        }

        setMentionQuery(null);
        setMentionPosition(null);
        setMentionRange(null);
    };

    const insertMention = (name: string, userId: string) => {
        if (!mentionRange) return; // Use the saved range

        const range = mentionRange;
        const node = range.startContainer;
        const text = node.textContent || '';
        const cursorOffset = range.startOffset;

        const lastAt = text.lastIndexOf('@', cursorOffset - 1);

        if (lastAt !== -1) {
            // Remove the @query
            range.setStart(node, lastAt);
            range.setEnd(node, cursorOffset);
            range.deleteContents();

            // Insert the name chip
            const span = document.createElement('span');
            span.textContent = `@${name}`;
            span.setAttribute('data-id', userId); // CRITICAL: Add data-id for parsing
            span.style.color = '#1d4ed8'; // darker blue
            span.style.backgroundColor = '#dbeafe'; // light blue bg
            span.style.padding = '2px 6px';
            span.style.borderRadius = '12px';
            span.style.fontWeight = '500';
            span.style.display = 'inline-block';
            span.contentEditable = 'false';

            range.insertNode(span);

            // Add space after
            const space = document.createTextNode('\u00A0');
            range.setStartAfter(span);
            range.insertNode(space);

            // Move cursor to end
            range.setStartAfter(space);
            range.collapse(true);

            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }

            setMentionQuery(null);
            setMentionPosition(null);
            setMentionRange(null);
            handleChange();
        }
    };

    // --- Hyperlink Handlers ---

    const openLinkUI = () => {
        setIsColorUIOpen(false);
        setIsTypeUIOpen(false);
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) {
            // If no selection, just open empty
            setLinkData({ text: '', url: '' });
            setIsLinkUIOpen(true);
            return;
        }

        const range = selection.getRangeAt(0);
        setSavedSelection(range.cloneRange()); // Save range

        const selectedText = range.toString();
        // If it looks like a URL, pre-fill URL, otherwise Text
        const isUrl = /^(http|https):\/\//.test(selectedText);
        setLinkData({
            text: isUrl ? '' : selectedText,
            url: isUrl ? selectedText : ''
        });

        setIsLinkUIOpen(true);
    };

    const insertLink = () => {
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }

        const { text, url } = linkData;
        if (!url) {
            closeLinkUI();
            return;
        }

        const finalUrl = url.startsWith('http') ? url : `https://${url}`;
        const displayText = text || url;

        // Flag internal update to skip next sync
        isInternalUpdate.current = true;

        const html = `<a href="${finalUrl}" target="_blank" rel="noopener noreferrer" style="color: #0073ea; text-decoration: underline;">${displayText}</a>`;

        exec('insertHTML', html);

        closeLinkUI();
    };

    const closeLinkUI = () => {
        setIsLinkUIOpen(false);
        setSavedSelection(null);
        setLinkData({ text: '', url: '' });
        // Return focus to editor
        editorRef.current?.focus();
    };

    // Use the savedSelection specifically when applying changes
    const applyColor = (color: string) => {
        const selection = window.getSelection();
        if (savedSelection && selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }
        if (colorMode === 'text') {
            exec('foreColor', color);
        } else {
            // Need to handle hiliteColor carefully for contentEditable
            // Note: document.execCommand('hiliteColor') uses <span style="background-color: ...">
            exec('hiliteColor', color);
        }
        setIsColorUIOpen(false);
        setActiveColorSource(null);
        setSavedSelection(null);
    };

    const applyTypography = (tag: string) => {
        exec('formatBlock', tag);
        setIsTypeUIOpen(false);
    };

    const applyFont = (fontFamily: string) => {
        if (fontFamily === 'inherit') {
            const MARKER = '--font-reset--';
            document.execCommand('fontName', false, MARKER);
            if (editorRef.current) {
                editorRef.current.querySelectorAll(`font[face="${MARKER}"]`).forEach(el => {
                    const parent = el.parentNode;
                    if (!parent) return;
                    while (el.firstChild) parent.insertBefore(el.firstChild, el);
                    parent.removeChild(el);
                });
                onChange(editorRef.current.innerHTML);
            }
        } else {
            exec('fontName', fontFamily);
        }
        setIsFontUIOpen(false);
        editorRef.current?.focus();
    };

    const insertTable = () => {
        const tableHtml = `
            <table style="border-collapse: collapse; width: 100%; border: 1px solid hsl(var(--color-border)); margin: 12px 0;">
                <thead>
                    <tr style="background-color: hsl(var(--color-bg-subtle));">
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 1</th>
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 2</th>
                        <th style="border: 1px solid hsl(var(--color-border)); padding: 8px; text-align: left; font-weight: 600;">Header 3</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 1</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 2</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 3</td>
                    </tr>
                    <tr>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 4</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 5</td>
                        <td style="border: 1px solid hsl(var(--color-border)); padding: 8px;">Cell 6</td>
                    </tr>
                </tbody>
            </table>
            <p><br></p>
        `;
        exec('insertHTML', tableHtml);
    };

    const insertChecklist = () => {
        const checklistHtml = `
            <div class="editor-checklist-item" style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                <div contenteditable="false" style="margin-top: 4px;">
                    <input type="checkbox" style="width: 16px; height: 16px; cursor: pointer;" />
                </div>
                <div style="flex: 1;">Checklist item</div>
            </div>
            <p><br></p>
        `;
        exec('insertHTML', checklistHtml);
    };


    const tools = [
        { id: 'type', icon: Type, label: 'Typography', action: () => { setIsTypeUIOpen(!isTypeUIOpen); setIsFontUIOpen(false); setIsColorUIOpen(false); setIsLinkUIOpen(false); } },
        { id: 'font', text: 'Font', label: 'Font', action: () => { setIsFontUIOpen(!isFontUIOpen); setIsTypeUIOpen(false); setIsColorUIOpen(false); setIsLinkUIOpen(false); } },
        { type: 'separator' },
        { id: 'bold', icon: Bold, label: 'Bold', action: () => exec('bold') },
        { id: 'italic', icon: Italic, label: 'Italic', action: () => exec('italic') },
        { id: 'underline', icon: Underline, label: 'Underline', action: () => exec('underline') },
        { id: 'strike', icon: Strikethrough, label: 'Strikethrough', action: () => exec('strikeThrough') },
        { id: 'color', icon: Palette, label: 'Color', action: () => { 
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                setSavedSelection(selection.getRangeAt(0).cloneRange());
            }
            // Keep current colorMode or default to text
            setActiveColorSource('color');
            setIsColorUIOpen(!isColorUIOpen || activeColorSource !== 'color'); 
            setIsTypeUIOpen(false); 
            setIsLinkUIOpen(false); 
        } },
        { type: 'separator' },
        { id: 'ul', icon: List, label: 'Bullet List', action: () => exec('insertUnorderedList') },
        { id: 'ol', icon: ListOrdered, label: 'Ordered List', action: () => exec('insertOrderedList') },
        { id: 'checklist', icon: CheckSquare, label: 'Checklist', action: () => insertChecklist() },
        { type: 'separator' },
        { id: 'align-left', icon: AlignLeft, label: 'Align Left', action: () => exec('justifyLeft') },
        { id: 'align-center', icon: AlignCenter, label: 'Align Center', action: () => exec('justifyCenter') },
        { id: 'align-right', icon: AlignRight, label: 'Align Right', action: () => exec('justifyRight') },
        { type: 'separator' },
        { id: 'table', icon: Table2, label: 'Table', action: () => insertTable() },
        { id: 'link', icon: Link, label: 'Link', action: () => openLinkUI() },
        { id: 'hr', icon: Minus, label: 'Horizontal Rule', action: () => exec('insertHorizontalRule') }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid hsl(var(--color-border))',
            borderRadius: '8px',
            overflow: 'visible', // Changed to visible for popup
            backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
            boxShadow: isFocused ? '0 0 0 2px hsl(var(--color-brand-light))' : 'none',
            transition: 'box-shadow 0.2s',
            position: 'relative'
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 12px',
                borderBottom: '1px solid hsl(var(--color-border))',
                backgroundColor: 'hsl(var(--color-bg-subtle))', // Dark mode fix
                flexWrap: 'wrap',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px'
            }}>
                {tools.map((tool, index) => {
                    if (tool.type === 'separator') {
                        return (
                            <div key={index} style={{
                                width: '1px',
                                height: '20px',
                                backgroundColor: 'hsl(var(--color-border))',
                                margin: '0 8px'
                            }} />
                        );
                    }

                    const Icon = tool.icon as any;
                    const isDropdown = tool.id === 'type' || tool.id === 'color' || tool.id === 'font';
                    const isActive = (tool.id === 'color' && isColorUIOpen) || (tool.id === 'type' && isTypeUIOpen) || (tool.id === 'font' && isFontUIOpen);
                    const isWide = tool.id === 'type' || tool.id === 'font';
                    return (
                        <div key={tool.id} style={{ position: 'relative' }}>
                            <button
                                onClick={(e) => {
                                    e.preventDefault(); // Prevent losing focus
                                    tool.action?.();
                                }}
                                title={tool.label}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: isWide ? 'auto' : '28px',
                                    height: '28px',
                                    padding: isWide ? '0 8px' : '0',
                                    border: 'none',
                                    background: isActive ? 'rgba(0,0,0,0.1)' : 'transparent',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    color: 'hsl(var(--color-text-secondary))',
                                    gap: '4px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isActive ? 'rgba(0,0,0,0.1)' : 'transparent'}
                            >
                                {(tool as any).text ? (
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{(tool as any).text}</span>
                                ) : (
                                    <Icon size={16} strokeWidth={2.5} />
                                )}
                                {isDropdown && <ChevronDown size={12} />}
                            </button>

                            {/* Typography Popover */}
                            {tool.id === 'type' && isTypeUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10002,
                                    padding: '4px',
                                    width: '180px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {[
                                        { label: 'Normal Text', tag: 'p' },
                                        { label: 'Heading 1', tag: 'h1', style: { fontSize: '24px', fontWeight: 700 } },
                                        { label: 'Heading 2', tag: 'h2', style: { fontSize: '20px', fontWeight: 600 } },
                                        { label: 'Heading 3', tag: 'h3', style: { fontSize: '18px', fontWeight: 600 } },
                                    ].map(item => (
                                        <button
                                            key={item.tag}
                                            onClick={(e) => { e.preventDefault(); applyTypography(item.tag); }}
                                            style={{
                                                padding: '8px 12px',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '4px',
                                                ...(item.style || {})
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Font Picker Popover */}
                            {tool.id === 'font' && isFontUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10002,
                                    padding: '4px',
                                    width: '210px',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    {FONTS.map(font => (
                                        <button
                                            key={font.value}
                                            onClick={(e) => { e.preventDefault(); applyFont(font.value); }}
                                            style={{
                                                padding: '8px 12px',
                                                textAlign: 'left',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '4px',
                                                fontFamily: font.value === 'inherit' ? 'inherit' : font.value,
                                                fontSize: '14px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {font.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Color Picker Popover */}
                            {tool.id === activeColorSource && isColorUIOpen && (
                                <div className="editor-popover" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '8px',
                                    backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 10001,
                                    padding: '12px',
                                    width: '240px'
                                }}>
                                    {/* Tabs */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '1px solid hsl(var(--color-border))', paddingBottom: '8px' }}>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setColorMode('text'); }}
                                            style={{
                                                flex: 1,
                                                padding: '4px',
                                                fontSize: '12px',
                                                background: colorMode === 'text' ? 'hsl(var(--color-bg-subtle))' : 'none',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                color: colorMode === 'text' ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-secondary))',
                                                fontWeight: colorMode === 'text' ? 600 : 400
                                            }}
                                        >
                                            Text
                                        </button>
                                        <button 
                                            onClick={(e) => { e.preventDefault(); setColorMode('highlight'); }}
                                            style={{
                                                flex: 1,
                                                padding: '4px',
                                                fontSize: '12px',
                                                background: colorMode === 'highlight' ? 'hsl(var(--color-bg-subtle))' : 'none',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                color: colorMode === 'highlight' ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-secondary))',
                                                fontWeight: colorMode === 'highlight' ? 600 : 400
                                            }}
                                        >
                                            Highlight
                                        </button>
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(6, 1fr)',
                                        gap: '6px'
                                    }}>
                                    {TEXT_COLORS.map(color => (
                                        <button
                                            key={color.value}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                applyColor(color.value);
                                            }}
                                            title={color.label}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '4px',
                                                backgroundColor: color.value,
                                                border: '1px solid rgba(0,0,0,0.1)',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                        />
                                    ))}
                                    {/* Reset Color */}
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            applyColor(colorMode === 'text' ? 'inherit' : 'transparent');
                                        }}
                                        title="Reset Color"
                                        style={{
                                            gridColumn: '1 / -1',
                                            marginTop: '8px',
                                            padding: '6px',
                                            fontSize: '12px',
                                            background: 'none',
                                            border: '1px solid hsl(var(--color-border))',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            color: 'hsl(var(--color-text-secondary))',
                                            fontWeight: 500,
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-text-secondary))';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-border))';
                                        }}
                                    >
                                        Auto (Reset)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

            {/* Editor Area */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleChange}
                onKeyUp={(e) => {
                    // Navigate mention list TODO
                    if (e.key === 'Escape') {
                        setMentionQuery(null);
                        closeLinkUI();
                        setIsColorUIOpen(false);
                    }
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                    setIsFocused(false);
                    // Delay to allow click
                    setTimeout(() => setMentionQuery(null), 200);
                }}
                style={{
                    minHeight: '120px',
                    padding: '16px',
                    fontSize: '14px',
                    outline: 'none',
                    lineHeight: '1.5',
                    color: 'hsl(var(--color-text-primary))' // Dark mode fix
                }}
                className="rich-text-content"
            />

            {/* Footer slot */}
            {footer && (
                <div style={{
                    borderTop: '1px solid hsl(var(--color-border))',
                    backgroundColor: 'hsl(var(--color-bg-subtle))',
                    borderBottomLeftRadius: '8px',
                    borderBottomRightRadius: '8px',
                    overflow: 'visible'
                }}>
                    {footer}
                </div>
            )}

            {/* Mention Suggestions Popup */}
            {
                mentionQuery !== null && filteredMembers.length > 0 && (
                    <div style={{
                        position: 'fixed', // Use fixed to handle viewport relative from getBoundingClientRect
                        top: mentionPosition?.top,
                        left: mentionPosition?.left,
                        backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        zIndex: 9999,
                        minWidth: '200px',
                        maxHeight: '200px',
                        overflowY: 'auto'
                    }}>
                        {filteredMembers.map((member, i) => (
                            <div
                                key={member.user_id || i}
                                onClick={() => insertMention(getDisplayName(member), member.user_id)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',

                                    gap: '8px',
                                    borderBottom: i < filteredMembers.length - 1 ? '1px solid hsl(var(--color-border))' : 'none', // Dark mode fix
                                    backgroundColor: 'hsl(var(--color-bg-surface))' // default
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'} // Dark mode fix
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface))'}
                            >
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    backgroundColor: '#e0e7ff', overflow: 'hidden',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '10px', color: '#3730a3', fontWeight: 'bold'
                                }}>
                                    {(() => {
                                        const profileData = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
                                        const profile = profileData || {};
                                        return profile.avatar_url ? (
                                            <img 
                                                src={profile.avatar_url} 
                                                alt="" 
                                                referrerPolicy="no-referrer"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            />
                                        ) : (
                                            (profile.full_name?.[0] || profile.email?.[0] || '?').toUpperCase()
                                        );
                                    })()}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '13px', color: 'hsl(var(--color-text-primary))', fontWeight: 500 }}>
                                        {getDisplayName(member)}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-secondary))' }}>
                                        {member.profiles?.email || ''}
                                        {member.role === 'owner' && <span style={{ marginLeft: '4px', color: '#f59e0b', fontWeight: 'bold' }}>(Owner)</span>}
                                        {member.role === 'workspace_owner' && <span style={{ marginLeft: '4px', color: '#854d0e', fontWeight: 'bold', fontSize: '10px' }}>(Workspace Owner)</span>}
                                    </span>
                                </div>
                            </div>
                        ))}

                    </div>
                )
            }

            {/* Hyperlink Popover */}
            {
                isLinkUIOpen && (
                    <div style={{
                        position: 'absolute',
                        top: '40px', // Below toolbar
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'hsl(var(--color-bg-surface))', // Dark mode fix
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        zIndex: 10000,
                        padding: '16px',
                        width: '320px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Add Link</span>
                            <button onClick={closeLinkUI} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}>✕</button>
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Text to display</label>
                            <input
                                type="text"
                                value={linkData.text}
                                onChange={(e) => setLinkData({ ...linkData, text: e.target.value })}
                                placeholder="Text to display"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))', // Dark mode fix
                                    fontSize: '14px',
                                    outline: 'none',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                                autoFocus
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500, marginBottom: '4px', display: 'block' }}>Link address</label>
                            <input
                                type="text"
                                value={linkData.url}
                                onChange={(e) => setLinkData({ ...linkData, url: e.target.value })}
                                placeholder="www.example.com"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    backgroundColor: 'hsl(var(--color-bg-canvas))', // Dark mode fix
                                    fontSize: '14px',
                                    outline: 'none',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            <button
                                onClick={closeLinkUI}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid hsl(var(--color-border))',
                                    background: 'transparent',
                                    color: 'hsl(var(--color-text-primary))',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={insertLink}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: 'hsl(var(--color-brand-primary))',
                                    color: 'white',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Save Link
                            </button>
                        </div>
                    </div>
                )
            }

            <style>{`
                .rich-text-content ul {
                    list-style-type: disc;
                    padding-left: 24px;
                    margin-top: 8px;
                    margin-bottom: 8px;
                }
                .rich-text-content ol {
                    list-style-type: decimal;
                    padding-left: 24px;
                    margin-top: 8px;
                    margin-bottom: 8px;
                }
                .rich-text-content li {
                    margin-bottom: 4px;
                }
                .rich-text-content a {
                    color: hsl(var(--color-brand-primary));
                    text-decoration: underline;
                }
                .rich-text-content table {
                    border-collapse: collapse;
                    width: 100%;
                    border: 1px solid hsl(var(--color-border));
                    margin: 12px 0;
                }
                .rich-text-content th, .rich-text-content td {
                    border: 1px solid hsl(var(--color-border));
                    padding: 8px;
                    min-width: 50px;
                }
                .rich-text-content th {
                    background-color: hsl(var(--color-bg-subtle));
                    font-weight: 600;
                }
                .editor-checklist-item input[type="checkbox"] {
                    accent-color: hsl(var(--color-brand-primary));
                }
            `}</style>
        </div >
    );
};
