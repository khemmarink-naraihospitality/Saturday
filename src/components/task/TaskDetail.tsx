import { useState, useEffect, useRef } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { X, MessageSquare, FileText, Trash2, Plus, ExternalLink, Edit2, Paperclip, Link2, ChevronDown } from 'lucide-react';
import { GifStickerPicker } from '../ui/GifStickerPicker';
import { ConfirmModal } from '../ui/ConfirmModal';
import { RichTextEditor } from '../ui/RichTextEditor';
import { isValidGoogleDriveUrl, getGoogleDriveFileName } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { FileLink } from '../../types';
import { useGooglePicker } from '../../hooks/useGooglePicker';

// Valid, de-duplicated updates for an item. Re-imports / Monday exports can repeat the
// same post — sometimes as near-identical copies that differ only in length. Two updates
// are treated as the same when they share author + timestamp + the first 50 chars of their
// plain-text content; among duplicates we keep the longest (most complete) version.
const plainTextOf = (html: any): string =>
    String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Normalize to minute precision so timestamps that display identically are treated as equal.
const minuteKeyOf = (createdAt: any): string => {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return String(createdAt || '');
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
};

const dedupeKeyOf = (u: any): string =>
    `${u.author}::${minuteKeyOf(u.createdAt)}::${plainTextOf(u.content).slice(0, 50)}`;

const getDedupedUpdates = (updates: any): any[] => {
    if (!Array.isArray(updates)) return [];
    const valid = updates.filter((u: any) => typeof u === 'object' && u?.id);

    // Pick the longest-content update for each key
    const bestByKey = new Map<string, any>();
    for (const u of valid) {
        const k = dedupeKeyOf(u);
        const existing = bestByKey.get(k);
        if (!existing || plainTextOf(u.content).length > plainTextOf(existing.content).length) {
            bestByKey.set(k, u);
        }
    }

    // Preserve original (first-seen) ordering of the kept updates
    const seen = new Set<string>();
    const result: any[] = [];
    for (const u of valid) {
        const k = dedupeKeyOf(u);
        if (seen.has(k)) continue;
        seen.add(k);
        result.push(bestByKey.get(k));
    }
    return result;
};

export const TaskDetail = ({ itemId, onClose }: { itemId: string; onClose: () => void }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const activeItem = board?.items.find(i => i.id === itemId);
    const addUpdate = useBoardStore(state => state.addUpdate);
    const editUpdate = useBoardStore(state => state.editUpdate);
    const deleteUpdate = useBoardStore(state => state.deleteUpdate);
    const updateItemTitle = useBoardStore(state => state.updateItemTitle);
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);

    // Global Draft State (Persistence)
    const draftText = useBoardStore(state => state.drafts[itemId] || '');
    const setDraft = useBoardStore(state => state.setDraft);

    const { currentUser } = useUserStore();

    // Resolve a post author's real profile picture: board members first, falling back
    // to the signed-in user's own avatar when the post is theirs (e.g. just-created updates).
    const getAuthorAvatarUrl = (userId?: string): string | null => {
        if (!userId) return null;
        const member = activeBoardMembers.find((m: any) => m.user_id === userId);
        if (member?.profiles?.avatar_url) return member.profiles.avatar_url;
        if (userId === currentUser.id && currentUser.avatar?.startsWith('http')) return currentUser.avatar;
        return null;
    };

    const [activeTab, setActiveTab] = useState<'updates' | 'files'>('updates');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
    const [editUpdateContent, setEditUpdateContent] = useState<string>('');

    // Reply State
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState<string>('');
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

    // File Tab State
    const [fileUrl, setFileUrl] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileError, setFileError] = useState<string | null>(null);

    // Updates Attach State
    const [draftFiles, setDraftFiles] = useState<FileLink[]>([]);
    const [showUrlPanel, setShowUrlPanel] = useState(false);
    const [attachUrl, setAttachUrl] = useState('');
    const [attachError, setAttachError] = useState<string | null>(null);
    const [showEmojiPanel, setShowEmojiPanel] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifPickerPos, setGifPickerPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
    const [emojiPickerPos, setEmojiPickerPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
    const [emojiSearch, setEmojiSearch] = useState('');
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const gifButtonRef = useRef<HTMLButtonElement>(null);
    const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Edit mode action bar state
    const [showEditEmojiPanel, setShowEditEmojiPanel] = useState(false);
    const [showEditGifPicker, setShowEditGifPicker] = useState(false);
    const [editGifPickerPos, setEditGifPickerPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
    const [editEmojiPickerPos, setEditEmojiPickerPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
    const [editEmojiSearch, setEditEmojiSearch] = useState('');
    const [showEditUrlPanel, setShowEditUrlPanel] = useState(false);
    const [editAttachUrl, setEditAttachUrl] = useState('');
    const [editDraftFiles, setEditDraftFiles] = useState<FileLink[]>([]);
    const editEmojiButtonRef = useRef<HTMLButtonElement>(null);
    const editEmojiPickerRef = useRef<HTMLDivElement>(null);
    const editGifButtonRef = useRef<HTMLButtonElement>(null);

    // Auto-grow the item title textarea up to 2 lines as content changes
    useEffect(() => {
        const el = titleTextareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 64)}px`;
    }, [activeItem?.title]);

    useEffect(() => {
        if (!showEmojiPanel) return;
        const handler = (e: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node) &&
                emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) {
                setShowEmojiPanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showEmojiPanel]);

    useEffect(() => {
        if (!showEditEmojiPanel) return;
        const handler = (e: MouseEvent) => {
            if (editEmojiPickerRef.current && !editEmojiPickerRef.current.contains(e.target as Node) &&
                editEmojiButtonRef.current && !editEmojiButtonRef.current.contains(e.target as Node)) {
                setShowEditEmojiPanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showEditEmojiPanel]);


    const updateItemFiles = useBoardStore(state => state.updateItemFiles);
    const { openPicker } = useGooglePicker();

    const handleAddFile = () => {
        if (!fileUrl.trim()) return;

        let url = fileUrl.trim();
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }

        if (!isValidGoogleDriveUrl(url)) {
            setFileError('Only Google Drive links are allowed.');
            return;
        }

        let name = fileName.trim();
        if (!name) {
            name = getGoogleDriveFileName(url);
        }

        const newFile: FileLink = {
            id: uuidv4(),
            name: name,
            url: url,
            type: 'google-drive'
        };

        const currentFiles = activeItem?.files || [];
        updateItemFiles(itemId, [...currentFiles, newFile]);

        // Reset form
        setFileUrl('');
        setFileName('');
        setFileError(null);
    };

    // FIX: Keep component mounted when reloading data to preserve typed text
    if (!activeItem) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '32px', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                <div style={{
                    width: '24px',
                    height: '24px',
                    border: '3px solid #f3f3f3',
                    borderTop: '3px solid #3498db',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                <p style={{ marginTop: '16px', fontSize: '14px' }}>Loading item...</p>
            </div>
        );
    }

    const EMOJI_CATEGORIES = [
        { label: 'Smileys & People', emojis: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😎','🤩','🥳','😢','😭','😤','😠','🤯','😳','🥺','😱','🤔','🤗','😴','🫡','😒','😏','🤭','🙄','😌'] },
        { label: 'Gestures', emojis: ['👍','👎','👋','✌️','🤞','👌','🙏','👏','🤝','💪','🤙','🫶','🤜','🤛','👊','✊','🖐️','👐','🤲','🫱'] },
        { label: 'Love & Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💯','🔥','⭐','✨','🌟','💫','🎊','🎉','🏆','🥇'] },
        { label: 'Objects & Alerts', emojis: ['✅','❌','⚠️','💡','📌','📎','🎯','🚀','💬','📝','🔑','💎','🎁','📅','📊','🔔','🎶','🌈','🍕','🌙'] },
    ];

    const handleEmojiSelect = (emoji: string) => {
        setDraft(itemId, draftText + emoji);
        setShowEmojiPanel(false);
    };

    const handleGifSelect = (url: string) => {
        setDraft(itemId, draftText + `<img src="${url}" alt="GIF" style="max-width:100%;border-radius:6px;margin:4px 0;" />`);
    };

    const handleAddEditAttachUrl = () => {
        if (!editAttachUrl.trim()) return;
        let url = editAttachUrl.trim();
        if (!url.startsWith('http')) url = `https://${url}`;
        const name = url.includes('drive.google.com') || url.includes('docs.google.com')
            ? getGoogleDriveFileName(url)
            : (url.split('/').pop()?.split('?')[0] || 'Attached File');
        const type = url.includes('drive.google.com') || url.includes('docs.google.com') ? 'google-drive' : 'file-url';
        setEditDraftFiles(prev => [...prev, { id: uuidv4(), name, url, type }]);
        setEditAttachUrl('');
        setShowEditUrlPanel(false);
    };

    const handleEditEmojiSelect = (emoji: string) => {
        setEditUpdateContent(editUpdateContent + emoji);
        setShowEditEmojiPanel(false);
    };

    const handleEditGifSelect = (url: string) => {
        setEditUpdateContent(editUpdateContent + `<img src="${url}" alt="GIF" style="max-width:100%;border-radius:6px;margin:4px 0;" />`);
    };

    const toggleEditGifPicker = () => {
        if (showEditGifPicker) { setShowEditGifPicker(false); return; }
        if (editGifButtonRef.current) {
            const rect = editGifButtonRef.current.getBoundingClientRect();
            setEditGifPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
        }
        setShowEditGifPicker(true);
    };

    const toggleGifPicker = () => {
        if (showGifPicker) {
            setShowGifPicker(false);
            return;
        }
        if (gifButtonRef.current) {
            const rect = gifButtonRef.current.getBoundingClientRect();
            setGifPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
        }
        setShowGifPicker(true);
        setShowUrlPanel(false);
    };

    const calcPickerPos = (rect: DOMRect): { top?: number; bottom?: number; left: number } => {
        const PICKER_HEIGHT = 390;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 328));
        if (rect.top > PICKER_HEIGHT + 8) {
            // Enough space above button → anchor from bottom (appear above)
            return { bottom: window.innerHeight - rect.top + 8, left };
        }
        // Not enough space above → appear below button
        return { top: rect.bottom + 8, left };
    };

    const toggleEmojiPicker = () => {
        if (showEmojiPanel) { setShowEmojiPanel(false); return; }
        if (emojiButtonRef.current) {
            setEmojiPickerPos(calcPickerPos(emojiButtonRef.current.getBoundingClientRect()));
        }
        setEmojiSearch('');
        setShowEmojiPanel(true);
    };

    const toggleEditEmojiPicker = () => {
        if (showEditEmojiPanel) { setShowEditEmojiPanel(false); return; }
        if (editEmojiButtonRef.current) {
            setEditEmojiPickerPos(calcPickerPos(editEmojiButtonRef.current.getBoundingClientRect()));
        }
        setEditEmojiSearch('');
        setShowEditEmojiPanel(true);
    };

    const handleAddAttachUrl = () => {
        if (!attachUrl.trim()) return;
        let url = attachUrl.trim();
        if (!url.startsWith('http')) url = `https://${url}`;
        const name = url.includes('drive.google.com') || url.includes('docs.google.com')
            ? getGoogleDriveFileName(url)
            : (url.split('/').pop()?.split('?')[0] || 'Attached File');
        const type = url.includes('drive.google.com') || url.includes('docs.google.com') ? 'google-drive' : 'file-url';
        setDraftFiles(prev => [...prev, { id: uuidv4(), name, url, type }]);
        setAttachUrl('');
        setAttachError(null);
        setShowUrlPanel(false);
    };

    const handleSendUpdate = () => {
        // Strip HTML tags to check if empty
        const textOnly = draftText.replace(/<[^>]*>/g, '').trim();
        if (!textOnly && !draftText.includes('<img') && draftFiles.length === 0) return;

        addUpdate(itemId, draftText, { name: currentUser.name, id: currentUser.id, userId: currentUser.id }, draftFiles);
        setDraft(itemId, '');
        setDraftFiles([]);
        setShowUrlPanel(false);
    };

    const handleDeleteClick = (updateId: string) => {
        setDeleteConfirmId(updateId);
    };

    const handleSendReply = (parentId: string) => {
        if (!replyDraft.trim()) return;
        addUpdate(itemId, replyDraft, { name: currentUser.name, id: currentUser.id, userId: currentUser.id }, [], parentId);
        setReplyDraft('');
        setReplyingToId(null);
    };



    const tabs = [
        { id: 'updates', label: 'Updates', icon: MessageSquare },
        { id: 'files', label: 'Files', icon: FileText }
    ] as const;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* ... Header and Tabs ... */}
            <div style={{
                padding: '24px 32px',
                borderBottom: '1px solid hsl(var(--color-border))',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                backgroundColor: 'hsl(var(--color-bg-surface))'
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h2 style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: 1,
                            minWidth: 0
                        }}>

                            <textarea
                                ref={titleTextareaRef}
                                value={activeItem.title}
                                onChange={(e) => updateItemTitle(itemId, e.target.value, false)}
                                onBlur={(e) => updateItemTitle(itemId, e.target.value, true)} // Log only on blur
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault(); // Title is single-field; Enter commits instead of inserting a newline
                                        updateItemTitle(itemId, activeItem.title, true); // Log on Enter
                                        e.currentTarget.blur();
                                    }
                                }}
                                rows={1}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    fontWeight: 'inherit',
                                    lineHeight: '1.3',
                                    width: '100%',
                                    outline: 'none',
                                    color: 'inherit',
                                    resize: 'none',
                                    overflow: 'hidden',
                                    maxHeight: '64px',
                                    display: 'block'
                                }}
                            />
                        </h2>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '4px',
                        color: 'hsl(var(--color-text-tertiary))'
                    }}
                >
                    <X size={24} />
                </button>
            </div>

            {/* New Tab List (Removed Activity) */}
            <div style={{
                padding: '0 32px',
                borderBottom: '1px solid hsl(var(--color-border))',
                backgroundColor: 'hsl(var(--color-bg-surface))', // Use surface color
                display: 'flex',
                gap: '24px'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        style={{
                            padding: '12px 0',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid hsl(var(--color-brand-primary))' : '2px solid transparent',
                            color: activeTab === tab.id ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '14px',
                            fontWeight: 500
                        }}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                        {tab.id === 'updates' && getDedupedUpdates(activeItem.updates).length > 0 && (
                            <span style={{
                                background: 'hsl(var(--color-brand-primary))',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '11px'
                            }}>{getDedupedUpdates(activeItem.updates).length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '32px', backgroundColor: 'hsl(var(--color-bg-canvas))' }}>
                {activeTab === 'updates' && (
                    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                        {/* Input Area (New WYSIWYG) */}
                        <div style={{ marginBottom: '32px' }}>
                            <RichTextEditor
                                value={draftText}
                                onChange={(val) => setDraft(itemId, val)}
                                footer={
                                    <div>
                                        {/* URL attach panel */}
                                        {showUrlPanel && (
                                            <div style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--color-border))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={attachUrl}
                                                        onChange={(e) => { setAttachUrl(e.target.value); setAttachError(null); }}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddAttachUrl()}
                                                        placeholder="Paste link to attach..."
                                                        autoFocus
                                                        style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: attachError ? '1px solid #e11d48' : '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))' }}
                                                    />
                                                    <button onClick={handleAddAttachUrl} disabled={!attachUrl.trim()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: attachUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)', color: 'white', fontSize: '13px', fontWeight: 500, cursor: attachUrl.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                                    <button onClick={() => { setShowUrlPanel(false); setAttachUrl(''); setAttachError(null); }} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>✕</button>
                                                </div>
                                                {attachError && <div style={{ fontSize: '12px', color: '#e11d48' }}>{attachError}</div>}
                                            </div>
                                        )}

                                        {/* GIF Picker (rendered via fixed position) */}
                                        {showGifPicker && (
                                            <GifStickerPicker
                                                onSelect={handleGifSelect}
                                                onClose={() => setShowGifPicker(false)}
                                                anchorBottom={gifPickerPos.bottom}
                                                anchorLeft={gifPickerPos.left}
                                            />
                                        )}

                                        {/* Pending file chips */}
                                        {draftFiles.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                                {draftFiles.map(file => (
                                                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', color: 'hsl(var(--color-text-primary))', maxWidth: '200px' }}>
                                                        {file.type === 'google-drive' ? (
                                                            <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                        ) : (
                                                            <Link2 size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                        )}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                        <button onClick={() => setDraftFiles(prev => prev.filter(f => f.id !== file.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0, lineHeight: 1, fontSize: '11px', flexShrink: 0 }}>✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Action bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                                            {/* Left: action buttons */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                {/* @ mention */}
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); setDraft(itemId, draftText + '@'); }}
                                                    title="Mention someone"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >@</button>

                                                {/* Paperclip / File URL */}
                                                <button
                                                    onClick={() => { setShowUrlPanel(!showUrlPanel); setShowGifPicker(false); }}
                                                    title="Attach file URL"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                ><Paperclip size={16} /></button>

                                                {/* GIF */}
                                                <button
                                                    ref={gifButtonRef}
                                                    onClick={toggleGifPicker}
                                                    title="Insert GIF or Sticker"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30px', padding: '0 7px', borderRadius: '5px', border: 'none', backgroundColor: showGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.03em' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                >GIF</button>

                                                {/* Emoji */}
                                                <button
                                                    ref={emojiButtonRef}
                                                    onClick={toggleEmojiPicker}
                                                    title="Add emoji"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '17px', padding: 0 }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                >😊</button>

                                                {/* Google Drive */}
                                                <button
                                                    onClick={() => openPicker((result) => {
                                                        setDraftFiles(prev => [...prev, { id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType }]);
                                                    })}
                                                    title="Attach from Google Drive"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="Google Drive" style={{ width: '18px', height: '18px' }} />
                                                </button>
                                            </div>

                                            {/* Right: Update button */}
                                            <div style={{ display: 'flex' }}>
                                                <button
                                                    onClick={handleSendUpdate}
                                                    style={{ backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none', padding: '7px 16px', borderRadius: '6px 0 0 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    style={{ backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.25)', padding: '7px 8px', borderRadius: '0 6px 6px 0', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        {/* Updates List */}
                        {(getDedupedUpdates(activeItem.updates).length === 0) ? (
                            <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <img src="https://cdn.monday.com/images/pulse-page-empty-state.svg" alt="No updates" style={{ width: '200px', opacity: 0.6 }} />
                                </div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 500 }}>No updates yet for this item</h3>
                                <p style={{ margin: 0, fontSize: '14px' }}>Be the first one to update about progress, mention someone or upload files.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {(() => {
                                    const validUpdates = getDedupedUpdates(activeItem.updates);

                                    // Separate top-level updates and replies
                                    // Use update.id as fallback when postId is absent (for new replies created in-app)
                                    const hasParent = (u: any) => u.parentId && validUpdates.some((p: any) => p.postId === u.parentId || p.id === u.parentId);
                                    const topLevel = validUpdates.filter((u: any) => !hasParent(u));
                                    const replies = validUpdates.filter((u: any) => hasParent(u));

                                    const renderUpdate = (update: any, depth = 0) => (
                                        <div key={update.id} style={{
                                            backgroundColor: depth === 0 ? 'white' : 'transparent',
                                            borderRadius: '0px', // Sharp architectural corners
                                            border: depth === 0 ? '1px solid hsl(var(--color-border))' : 'none',
                                            padding: depth === 0 ? '24px' : '16px 0 0 52px',
                                            position: 'relative',
                                            marginBottom: depth === 0 ? '16px' : '0',
                                            borderLeft: depth === 0 && deleteConfirmId === update.id ? '4px solid hsl(var(--color-dangerous))' : (depth === 0 ? '1px solid hsl(var(--color-border))' : 'none'),
                                            boxShadow: depth === 0 ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    {(() => {
                                                        const avatarUrl = getAuthorAvatarUrl(update.userId);
                                                        const size = depth === 0 ? '40px' : '32px';
                                                        if (avatarUrl) {
                                                            return (
                                                                <img
                                                                    src={avatarUrl}
                                                                    alt=""
                                                                    referrerPolicy="no-referrer"
                                                                    style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                                />
                                                            );
                                                        }
                                                        return (
                                                            <div style={{
                                                                width: size,
                                                                height: size,
                                                                borderRadius: '50%',
                                                                backgroundColor: update.author.toLowerCase().includes('lubd') ? '#1a1728' : (update.contentType === 'Reply' ? '#2563eb' : '#00c875'),
                                                                color: 'white',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: depth === 0 ? '16px' : '12px',
                                                                fontWeight: 700,
                                                                flexShrink: 0,
                                                                fontFamily: 'serif'
                                                            }}>
                                                                {update.author.charAt(0)}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: depth === 0 ? '15px' : '14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1a1728' }}>
                                                            {update.author}
                                                            {update.contentType === 'Reply' && (
                                                                <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, backgroundColor: '#eff6ff', padding: '2px 6px', letterSpacing: '0.05em' }}>REPLY</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                                            {(() => {
                                                                const d = new Date(update.createdAt);
                                                                if (isNaN(d.getTime())) return update.createdAt;
                                                                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                                {(update.userId === currentUser.id || update.author === currentUser.name) && (
                                                    <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                                                        <button
                                                            onClick={() => {
                                                                setEditingUpdateId(update.id);
                                                                setEditUpdateContent(update.content);
                                                                setEditDraftFiles(update.files || []);
                                                                setShowEditUrlPanel(false);
                                                            }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(update.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {editingUpdateId === update.id ? (
                                                <div style={{ marginTop: '12px' }}>
                                                    <RichTextEditor
                                                        value={editUpdateContent}
                                                        onChange={(val) => setEditUpdateContent(val)}
                                                        footer={
                                                            <div>
                                                                {/* GIF Picker for edit mode */}
                                                                {showEditGifPicker && (
                                                                    <GifStickerPicker
                                                                        onSelect={handleEditGifSelect}
                                                                        onClose={() => setShowEditGifPicker(false)}
                                                                        anchorBottom={editGifPickerPos.bottom}
                                                                        anchorLeft={editGifPickerPos.left}
                                                                    />
                                                                )}

                                                                {/* URL Attach panel */}
                                                                {showEditUrlPanel && (
                                                                    <div style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--color-border))', display: 'flex', gap: '8px' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={editAttachUrl}
                                                                            onChange={(e) => setEditAttachUrl(e.target.value)}
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleAddEditAttachUrl()}
                                                                            placeholder="Paste link to attach..."
                                                                            autoFocus
                                                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))' }}
                                                                        />
                                                                        <button onClick={handleAddEditAttachUrl} disabled={!editAttachUrl.trim()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: editAttachUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)', color: 'white', fontSize: '13px', fontWeight: 500, cursor: editAttachUrl.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                                                        <button onClick={() => { setShowEditUrlPanel(false); setEditAttachUrl(''); }} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>✕</button>
                                                                    </div>
                                                                )}

                                                                {/* File chips */}
                                                                {editDraftFiles.length > 0 && (
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                                                        {editDraftFiles.map(file => (
                                                                            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', color: 'hsl(var(--color-text-primary))', maxWidth: '200px' }}>
                                                                                {file.type === 'google-drive' ? (
                                                                                    <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                                ) : (
                                                                                    <Link2 size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                                                )}
                                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                                                <button onClick={() => setEditDraftFiles(prev => prev.filter(f => f.id !== file.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0, lineHeight: 1, fontSize: '11px', flexShrink: 0 }}>✕</button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Edit action bar */}
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                        {/* @ mention */}
                                                                        <button
                                                                            onMouseDown={(e) => { e.preventDefault(); setEditUpdateContent(editUpdateContent + '@'); }}
                                                                            title="Mention someone"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                        >@</button>

                                                                        {/* Paperclip */}
                                                                        <button
                                                                            onClick={() => { setShowEditUrlPanel(!showEditUrlPanel); setShowEditGifPicker(false); }}
                                                                            title="Attach file URL"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEditUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        ><Paperclip size={16} /></button>

                                                                        {/* GIF */}
                                                                        <button
                                                                            ref={editGifButtonRef}
                                                                            onClick={toggleEditGifPicker}
                                                                            title="Insert GIF or Sticker"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30px', padding: '0 7px', borderRadius: '5px', border: 'none', backgroundColor: showEditGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.03em' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        >GIF</button>

                                                                        {/* Emoji */}
                                                                        <button
                                                                            ref={editEmojiButtonRef}
                                                                            onClick={toggleEditEmojiPicker}
                                                                            title="Add emoji"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEditEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '17px', padding: 0 }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        >😊</button>

                                                                        {/* Google Drive */}
                                                                        <button
                                                                            onClick={() => openPicker((result) => {
                                                                                setEditDraftFiles(prev => [...prev, { id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType }]);
                                                                            })}
                                                                            title="Attach from Google Drive"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                        >
                                                                            <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="Google Drive" style={{ width: '18px', height: '18px' }} />
                                                                        </button>
                                                                    </div>

                                                                    {/* Right: Cancel + Save */}
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <button
                                                                            onClick={() => { setEditingUpdateId(null); setShowEditEmojiPanel(false); setShowEditGifPicker(false); setShowEditUrlPanel(false); setEditDraftFiles([]); }}
                                                                            style={{ background: 'transparent', color: 'hsl(var(--color-text-secondary))', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                                                                        >Cancel</button>
                                                                        <button
                                                                            onClick={() => { editUpdate(itemId, update.id, editUpdateContent, editDraftFiles); setEditingUpdateId(null); setEditDraftFiles([]); }}
                                                                            style={{ backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                                                                        >Save</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div
                                                        className="prose prose-sm max-w-none narai-update-content"
                                                        style={{ color: '#1a1728', lineHeight: 1.6, fontSize: '14px' }}
                                                        dangerouslySetInnerHTML={{ __html: update.content }}
                                                    />
                                                    {update.files && update.files.length > 0 && (
                                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid hsl(var(--color-border))' }}>
                                                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-secondary))', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                <Paperclip size={11} /> Attachments
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {update.files.map((file: FileLink) => (
                                                                    <a
                                                                        key={file.id}
                                                                        href={file.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            padding: '5px 12px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid hsl(var(--color-border))',
                                                                            backgroundColor: 'hsl(var(--color-bg-subtle))',
                                                                            color: 'hsl(var(--color-text-primary))',
                                                                            fontSize: '13px',
                                                                            textDecoration: 'none',
                                                                            maxWidth: '260px',
                                                                            transition: 'background 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))'}
                                                                    >
                                                                        {file.type === 'google-drive' ? (
                                                                            <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="" style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                                                                        ) : (
                                                                            <Link2 size={13} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                                        )}
                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                                        <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            
                                            {/* Like / Reply action bar — top-level only */}
                                            {depth === 0 && editingUpdateId !== update.id && (
                                                <>
                                                    {/* Like count badge — only visible when liked */}
                                                    {likedIds.has(update.id) && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                backgroundColor: '#FFF8DC',
                                                                border: '1px solid #F0C040',
                                                                borderRadius: '20px',
                                                                padding: '2px 10px',
                                                                fontSize: '13px', fontWeight: 600,
                                                                color: '#5A4A00',
                                                                cursor: 'pointer', userSelect: 'none'
                                                            }}
                                                                onClick={() => setLikedIds(prev => { const n = new Set(prev); n.delete(update.id); return n; })}
                                                            >
                                                                👍 1
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '2px',
                                                        marginTop: likedIds.has(update.id) ? '8px' : '12px',
                                                        paddingTop: '8px',
                                                        borderTop: '1px solid hsl(var(--color-border))'
                                                    }}>
                                                        {/* Like button */}
                                                        <button
                                                            onClick={() => setLikedIds(prev => {
                                                                const n = new Set(prev);
                                                                if (n.has(update.id)) { n.delete(update.id); } else { n.add(update.id); }
                                                                return n;
                                                            })}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '5px',
                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                color: likedIds.has(update.id) ? '#D4A000' : 'hsl(var(--color-text-secondary))',
                                                                fontSize: likedIds.has(update.id) ? '18px' : '13px',
                                                                padding: '4px 10px', borderRadius: '4px', fontWeight: 500,
                                                                lineHeight: 1
                                                            }}
                                                            onMouseEnter={(e) => { if (!likedIds.has(update.id)) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                                                            onMouseLeave={(e) => { if (!likedIds.has(update.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            {likedIds.has(update.id) ? '👍' : <><span>👍</span><span>Like</span></>}
                                                        </button>

                                                        <button
                                                            onClick={() => { setReplyingToId(replyingToId === update.id ? null : update.id); setReplyDraft(''); }}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: replyingToId === update.id ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))', fontSize: '13px', padding: '4px 10px', borderRadius: '4px', fontWeight: 500 }}
                                                            onMouseEnter={(e) => { if (replyingToId !== update.id) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                                                            onMouseLeave={(e) => { if (replyingToId !== update.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            ↩ Reply
                                                        </button>
                                                    </div>

                                                    {replyingToId === update.id && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                                                            <div style={{
                                                                width: '32px', height: '32px', borderRadius: '50%',
                                                                backgroundColor: currentUser.name?.toLowerCase().includes('lubd') ? '#1a1728' : '#00c875',
                                                                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '13px', fontWeight: 700, flexShrink: 0, fontFamily: 'serif'
                                                            }}>
                                                                {currentUser.name?.charAt(0) || '?'}
                                                            </div>
                                                            <div style={{ 
                                                                flex: 1, 
                                                                border: '1px solid #0073ea', 
                                                                borderRadius: '8px', 
                                                                backgroundColor: 'white', 
                                                                display: 'flex', 
                                                                flexDirection: 'column', 
                                                                overflow: 'hidden' 
                                                            }}>
                                                                <textarea
                                                                    value={replyDraft}
                                                                    onChange={(e) => setReplyDraft(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(update.id); }
                                                                        if (e.key === 'Escape') { setReplyingToId(null); setReplyDraft(''); }
                                                                    }}
                                                                    placeholder="Write a reply..."
                                                                    autoFocus
                                                                    style={{
                                                                        width: '100%', minHeight: '60px', padding: '12px',
                                                                        border: 'none', resize: 'none', fontSize: '14px', outline: 'none',
                                                                        backgroundColor: 'transparent', color: '#1f1f1f', fontFamily: 'inherit'
                                                                    }}
                                                                />
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'white' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: '#666' }}>
                                                                        <span style={{ cursor: 'pointer', fontWeight: 700, fontSize: '16px', color: '#666' }} title="Mention">@</span>
                                                                        <span title="Attach File" style={{ display: 'flex' }}><Paperclip size={18} style={{ cursor: 'pointer', color: '#666' }} /></span>
                                                                        <span style={{ cursor: 'pointer', fontWeight: 700, fontSize: '12px', letterSpacing: '0.03em', color: '#666' }} title="GIF">GIF</span>
                                                                        <span style={{ cursor: 'pointer', fontSize: '18px', color: '#666' }} title="Emoji">😊</span>
                                                                        <span title="Rich Text" style={{ display: 'flex' }}><Edit2 size={16} style={{ cursor: 'pointer', color: '#666' }} /></span>
                                                                    </div>
                                                                    <div style={{ display: 'flex' }}>
                                                                        <button
                                                                            onClick={() => handleSendReply(update.id)}
                                                                            disabled={!replyDraft.trim()}
                                                                            style={{
                                                                                backgroundColor: '#0073ea', color: 'white', border: 'none',
                                                                                padding: '6px 16px', borderRadius: '4px 0 0 4px', cursor: replyDraft.trim() ? 'pointer' : 'not-allowed',
                                                                                fontSize: '13px', fontWeight: 500, opacity: replyDraft.trim() ? 1 : 0.6
                                                                            }}
                                                                        >
                                                                            Reply
                                                                        </button>
                                                                        <button
                                                                            disabled={!replyDraft.trim()}
                                                                            style={{
                                                                                backgroundColor: '#0060c2', color: 'white', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.2)',
                                                                                padding: '6px 8px', borderRadius: '0 4px 4px 0', cursor: replyDraft.trim() ? 'pointer' : 'not-allowed',
                                                                                display: 'flex', alignItems: 'center', opacity: replyDraft.trim() ? 1 : 0.6
                                                                            }}
                                                                        >
                                                                            <ChevronDown size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Render Replies for this update */}
                                            {replies.filter(r => r.parentId === update.postId || r.parentId === update.id).map(reply => renderUpdate(reply, depth + 1))}
                                        </div>
                                    );

                                    return topLevel.map(u => renderUpdate(u));
                                })()}
                            </div>
                        )}
                    </div>
                )}

                <ConfirmModal
                    isOpen={!!deleteConfirmId}
                    title="Delete Update"
                    message="Delete this update?"
                    confirmText="Yes"
                    cancelText="No"
                    onConfirm={() => {
                        if (deleteConfirmId) deleteUpdate(itemId, deleteConfirmId);
                        setDeleteConfirmId(null);
                    }}
                    onCancel={() => setDeleteConfirmId(null)}
                />

                {activeTab === 'files' && (
                    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Files</h3>

                            {/* Inline Add File Form */}
                            <div style={{
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                padding: '20px',
                                borderRadius: '8px',
                                border: '1px solid #e1e4e8',
                                marginBottom: '24px'
                            }}>
                                <div style={{ marginBottom: '16px', fontWeight: 500, fontSize: '14px' }}>Add Google Drive Link</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ flex: 1 }}>
                                            <input
                                                type="text"
                                                placeholder="Paste Google Drive Link here..."
                                                value={fileUrl}
                                                onChange={(e) => {
                                                    setFileUrl(e.target.value);
                                                    if (fileError) setFileError(null);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: '4px',
                                                    border: fileError ? '1px solid #e11d48' : '1px solid hsl(var(--color-border))',
                                                    fontSize: '14px',
                                                    outline: 'none',
                                                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                                                    color: 'hsl(var(--color-text-primary))'
                                                }}
                                            />
                                            {fileError && <div style={{ color: '#e11d48', fontSize: '12px', marginTop: '4px' }}>{fileError}</div>}
                                        </div>
                                        <div style={{ width: '200px' }}>
                                            <input
                                                type="text"
                                                placeholder="File Name (Optional)"
                                                value={fileName}
                                                onChange={(e) => setFileName(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: '4px',
                                                    border: '1px solid hsl(var(--color-border))',
                                                    fontSize: '14px',
                                                    outline: 'none',
                                                    backgroundColor: 'hsl(var(--color-bg-canvas))',
                                                    color: 'hsl(var(--color-text-primary))'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={handleAddFile}
                                            disabled={!fileUrl.trim()}
                                            style={{
                                                backgroundColor: fileUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '8px 16px',
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                cursor: fileUrl.trim() ? 'pointer' : 'not-allowed',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Plus size={16} /> Add Link
                                        </button>
                                        <button
                                            onClick={() => {
                                                openPicker((result) => {
                                                    const newFile: FileLink = {
                                                        id: uuidv4(),
                                                        name: result.name,
                                                        url: result.url,
                                                        type: 'google-drive',
                                                        iconUrl: result.iconUrl,
                                                        mimeType: result.mimeType
                                                    };
                                                    const currentFiles = activeItem?.files || [];
                                                    updateItemFiles(itemId, [...currentFiles, newFile]);
                                                });
                                            }}
                                            style={{
                                                backgroundColor: 'white',
                                                color: '#3c4043',
                                                border: '1px solid #dadce0',
                                                borderRadius: '4px',
                                                padding: '8px 16px',
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)'
                                            }}
                                        >
                                            <img src="https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png" alt="" style={{ width: '18px', height: '18px' }} />
                                            Google Drive
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(!activeItem.files || activeItem.files.length === 0) ? (
                            <div style={{ textAlign: 'center', color: '#888', padding: '40px', border: '1px dashed #ccc', borderRadius: '8px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <FileText size={48} opacity={0.3} />
                                </div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 500 }}>No files attached yet</h3>
                                <p style={{ margin: 0, fontSize: '14px' }}>Upload files to share with your team.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                {activeItem.files.map((file) => (
                                    <div key={file.id} style={{
                                        backgroundColor: 'hsl(var(--color-bg-surface))',
                                        borderRadius: '8px',
                                        border: '1px solid hsl(var(--color-border))',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        transition: 'box-shadow 0.2s',
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'hsl(var(--color-brand-primary))'
                                            }}>
                                                <FileText size={20} />
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newFiles = activeItem.files?.filter(f => f.id !== file.id) || [];
                                                    updateItemFiles(itemId, newFiles);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: '#999',
                                                    padding: '4px'
                                                }}
                                                title="Remove File"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                                                {file.name}
                                            </div>
                                            <a
                                                href={fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: '12px', color: 'hsl(var(--color-brand-primary))', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Open Link <ExternalLink size={10} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Emoji Picker — fixed portal for new update composer */}
            {showEmojiPanel && (() => {
                const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
                const q = emojiSearch.trim().toLowerCase();
                const filtered = q ? allEmojis.filter(e => e.includes(emojiSearch)) : null;
                return (
                    <div ref={emojiPickerRef} style={{
                        position: 'fixed', top: emojiPickerPos.top, bottom: emojiPickerPos.bottom, left: emojiPickerPos.left,
                        width: '320px', maxHeight: '380px', zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Emoji</span>
                                <button onClick={() => setShowEmojiPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '18px', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                            </div>
                            <input type="text" placeholder="Search emoji..." value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} autoFocus
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 4px' }}>
                            {filtered ? (
                                filtered.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                        {filtered.map((emoji, i) => (
                                            <button key={i} onClick={() => handleEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No results for "{emojiSearch}"</div>
                                )
                            ) : (
                                EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.label} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-tertiary))', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: '4px' }}>{cat.label}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                            {cat.emojis.map((emoji, i) => (
                                                <button key={i} onClick={() => handleEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Emoji Picker — fixed portal for edit mode */}
            {showEditEmojiPanel && (() => {
                const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
                const filtered = editEmojiSearch.trim() ? allEmojis.filter(e => e.includes(editEmojiSearch)) : null;
                return (
                    <div ref={editEmojiPickerRef} style={{
                        position: 'fixed', top: editEmojiPickerPos.top, bottom: editEmojiPickerPos.bottom, left: editEmojiPickerPos.left,
                        width: '320px', maxHeight: '380px', zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Emoji</span>
                                <button onClick={() => setShowEditEmojiPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '18px', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                            </div>
                            <input type="text" placeholder="Search emoji..." value={editEmojiSearch} onChange={e => setEditEmojiSearch(e.target.value)} autoFocus
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 4px' }}>
                            {filtered ? (
                                filtered.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                        {filtered.map((emoji, i) => (
                                            <button key={i} onClick={() => handleEditEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No results for "{editEmojiSearch}"</div>
                                )
                            ) : (
                                EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.label} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-tertiary))', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: '4px' }}>{cat.label}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                            {cat.emojis.map((emoji, i) => (
                                                <button key={i} onClick={() => handleEditEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
