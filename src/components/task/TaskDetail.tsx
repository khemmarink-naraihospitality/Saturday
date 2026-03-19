import { useState } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { X, Send, MessageSquare, FileText, Trash2, Plus, ExternalLink, Edit2 } from 'lucide-react';
import { RichTextEditor } from '../ui/RichTextEditor';
import { isValidGoogleDriveUrl, getGoogleDriveFileName } from '../../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { FileLink } from '../../types';

export const TaskDetail = ({ itemId, onClose }: { itemId: string; onClose: () => void }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const activeItem = board?.items.find(i => i.id === itemId);
    const addUpdate = useBoardStore(state => state.addUpdate);
    const deleteUpdate = useBoardStore(state => state.deleteUpdate);
    const editUpdate = useBoardStore(state => state.editUpdate);
    const updateItemTitle = useBoardStore(state => state.updateItemTitle);

    // Global Draft State (Persistence)
    const draftText = useBoardStore(state => state.drafts[itemId] || '');
    const setDraft = useBoardStore(state => state.setDraft);

    const { currentUser } = useUserStore();

    const [activeTab, setActiveTab] = useState<'updates' | 'files'>('updates');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
    const [editUpdateContent, setEditUpdateContent] = useState<string>('');

    // File Tab State
    const [fileUrl, setFileUrl] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileError, setFileError] = useState<string | null>(null);

    const updateItemFiles = useBoardStore(state => state.updateItemFiles);

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

    const handleSendUpdate = () => {
        // Strip HTML tags to check if empty
        const textOnly = draftText.replace(/<[^>]*>/g, '').trim();
        if (!textOnly && !draftText.includes('<img')) return;

        addUpdate(itemId, draftText, { name: currentUser.name, id: currentUser.id });
        setDraft(itemId, ''); // Clear global draft
    };

    const handleDeleteClick = (updateId: string) => {
        setDeleteConfirmId(updateId);
    };

    const confirmDelete = (updateId: string) => {
        deleteUpdate(itemId, updateId);
        setDeleteConfirmId(null);
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
                            gap: '8px'
                        }}>

                            <input
                                value={activeItem.title}
                                onChange={(e) => updateItemTitle(itemId, e.target.value, false)}
                                onBlur={(e) => updateItemTitle(itemId, e.target.value, true)} // Log only on blur
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        updateItemTitle(itemId, activeItem.title, true); // Log on Enter
                                        e.currentTarget.blur();
                                    }
                                }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 'inherit',
                                    fontWeight: 'inherit',
                                    width: '100%',
                                    outline: 'none',
                                    color: 'inherit'
                                }}
                            />
                        </h2>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'hsl(var(--color-text-secondary))' }}>
                        <span>Pulse: {activeItem.title}</span>
                        <span>•</span>
                        <span>Group: {(board?.groups.find(g => g.id === activeItem.groupId)?.title)}</span>
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
                        {tab.id === 'updates' && Array.isArray(activeItem.updates) && activeItem.updates.filter(u => typeof u === 'object' && u?.id).length > 0 && (
                            <span style={{
                                background: 'hsl(var(--color-brand-primary))',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '11px'
                            }}>{activeItem.updates.filter(u => typeof u === 'object' && u?.id).length}</span>
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
                            />
                            <div style={{
                                marginTop: '12px',
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}>
                                <button
                                    onClick={handleSendUpdate}
                                    style={{
                                        backgroundColor: 'hsl(var(--color-brand-primary))',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 24px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontWeight: 500
                                    }}
                                >
                                    Update <Send size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Updates List */}
                        {(!activeItem.updates || !Array.isArray(activeItem.updates) || activeItem.updates.filter(u => typeof u === 'object' && u?.id).length === 0) ? (
                            <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <img src="https://cdn.monday.com/images/pulse-page-empty-state.svg" alt="No updates" style={{ width: '200px', opacity: 0.6 }} />
                                </div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 500 }}>No updates yet for this item</h3>
                                <p style={{ margin: 0, fontSize: '14px' }}>Be the first one to update about progress, mention someone or upload files.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {activeItem.updates.filter(u => typeof u === 'object' && u?.id).map(update => (
                                    <div key={update.id} style={{
                                        backgroundColor: 'hsl(var(--color-bg-surface))',
                                        borderRadius: '8px',
                                        border: '1px solid hsl(var(--color-border))',
                                        padding: '20px',
                                        position: 'relative',
                                        borderLeft: deleteConfirmId === update.id ? '4px solid hsl(var(--color-dangerous))' : '1px solid hsl(var(--color-border))'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    backgroundColor: '#00c875',
                                                    color: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '14px',
                                                    fontWeight: 600
                                                }}>
                                                    {update.author.charAt(0)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{update.author}</div>
                                                    <div style={{ fontSize: '12px', color: '#888' }}>
                                                        {new Date(update.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Delete and Edit Actions */}
                                            {(update.author === currentUser.name || currentUser.role === 'owner' || currentUser.role === 'admin') && (
                                                <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                                                    {update.author === currentUser.name && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingUpdateId(update.id);
                                                                setEditUpdateContent(update.content);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: '#9ca3af',
                                                                padding: '4px'
                                                            }}
                                                            title="Edit Update"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteClick(update.id)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: '#9ca3af',
                                                            padding: '4px'
                                                        }}
                                                        title="Delete Update"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>

                                                    {deleteConfirmId === update.id && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '100%',
                                                            right: 0,
                                                            marginTop: '4px',
                                                            backgroundColor: 'hsl(var(--color-bg-surface))',
                                                            border: '1px solid #fee2e2',
                                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                                            borderRadius: '6px',
                                                            padding: '8px',
                                                            zIndex: 10,
                                                            minWidth: '120px'
                                                        }}>
                                                            <div style={{ fontSize: '12px', marginBottom: '8px', color: '#ef4444', fontWeight: 500 }}>Delete this update?</div>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    onClick={() => confirmDelete(update.id)}
                                                                    style={{
                                                                        flex: 1,
                                                                        backgroundColor: '#ef4444',
                                                                        color: 'white',
                                                                        border: 'none',
                                                                        borderRadius: '4px',
                                                                        padding: '4px',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Delete
                                                                </button>
                                                                <button
                                                                    onClick={() => setDeleteConfirmId(null)}
                                                                    style={{
                                                                        flex: 1,
                                                                        backgroundColor: '#f3f4f6',
                                                                        color: '#374151',
                                                                        border: '1px solid #d1d5db',
                                                                        borderRadius: '4px',
                                                                        padding: '4px',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {/* Render HTML Content or Editor */}
                                        {editingUpdateId === update.id ? (
                                            <div style={{ marginTop: '12px' }}>
                                                <RichTextEditor
                                                    value={editUpdateContent}
                                                    onChange={(val) => setEditUpdateContent(val)}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                                                    <button
                                                        onClick={() => setEditingUpdateId(null)}
                                                        style={{
                                                            backgroundColor: 'transparent',
                                                            color: 'hsl(var(--color-text-secondary))',
                                                            border: 'none',
                                                            padding: '6px 16px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '13px',
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            editUpdate(itemId, update.id, editUpdateContent);
                                                            setEditingUpdateId(null);
                                                        }}
                                                        style={{
                                                            backgroundColor: 'hsl(var(--color-brand-primary))',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '6px 16px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            fontSize: '13px',
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="prose prose-sm max-w-none"
                                                style={{ color: 'hsl(var(--color-text-primary))' }}
                                                dangerouslySetInnerHTML={{ __html: update.content }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
                                                backgroundColor: fileUrl.trim() ? '#0073ea' : '#cce5ff',
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
                                                backgroundColor: '#e6f4ff',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#0073ea'
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
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: '12px', color: '#0073ea', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
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
        </div>
    );
};
