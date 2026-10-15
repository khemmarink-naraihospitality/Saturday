import { useState } from 'react';
import { ExternalLink, Link2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../store/useBoardStore';
import { useGooglePicker } from '../../hooks/useGooglePicker';
import { getGoogleDriveFileName, isValidGoogleDriveUrl } from '../../lib/utils';
import type { FileLink, Item } from '../../types';
import { BottomSheet, EmptyState, PrimaryButton } from '../ui';
import { DRIVE_ICON, FileIcon } from '../cells/CellView';

const hostOf = (url: string) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

/**
 * The item's Files tab: its Google Drive links, as on desktop — add one by
 * pasting a link (Drive only, the desktop rule) or picking from Drive; open or
 * remove one from its "…".
 */
export const FilesTab = ({ item, canEdit }: { item: Item; canEdit: boolean }) => {
    const updateItemFiles = useBoardStore(state => state.updateItemFiles);
    const { openPicker } = useGooglePicker();
    const [adding, setAdding] = useState(false);
    const [url, setUrl] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [menuFor, setMenuFor] = useState<FileLink | null>(null);
    const files = item.files || [];

    const resetForm = () => {
        setUrl('');
        setName('');
        setError(null);
    };

    const addLink = () => {
        let link = url.trim();
        if (!link) return;
        if (!link.startsWith('http')) link = `https://${link}`;
        if (!isValidGoogleDriveUrl(link)) {
            setError('Only Google Drive links can be added here.');
            return;
        }
        const file: FileLink = { id: uuidv4(), name: name.trim() || getGoogleDriveFileName(link), url: link, type: 'google-drive' };
        void updateItemFiles(item.id, [...files, file]);
        resetForm();
        setAdding(false);
    };

    const pickFromDrive = () => openPicker(result => {
        void updateItemFiles(item.id, [...(useBoardStore.getState().boards
            .flatMap(b => b.items).find(i => i.id === item.id)?.files || []), {
            id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType,
        }]);
    });

    return (
        <div className="m-files">
            {canEdit && (
                <div className="m-files__add">
                    <button type="button" className="m-files__add-btn" onClick={() => { resetForm(); setAdding(true); }}>
                        <Link2 size={19} /> Add a Drive link
                    </button>
                    <button type="button" className="m-files__add-btn" onClick={pickFromDrive}>
                        <img src={DRIVE_ICON} alt="" width={19} height={19} /> Google Drive
                    </button>
                </div>
            )}

            {files.length === 0 ? (
                <EmptyState title="No files yet">{canEdit ? 'Add a Google Drive link to share it with the team.' : 'Files added to this item will show here.'}</EmptyState>
            ) : (
                <div className="m-props__card">
                    {files.map(file => (
                        <div key={file.id} className="m-file-row">
                            <a className="m-file-row__open" href={file.url} target="_blank" rel="noopener noreferrer">
                                <span className="m-file-row__icon"><FileIcon file={file} size={26} /></span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                    <span className="m-file-row__name m-truncate">{file.name}</span>
                                    <span className="m-file-row__host m-truncate">{hostOf(file.url)}</span>
                                </span>
                            </a>
                            <button type="button" className="m-file-row__more" onClick={() => setMenuFor(file)} aria-label={`More for ${file.name}`}>
                                <MoreHorizontal size={21} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <BottomSheet
                open={adding}
                onClose={() => setAdding(false)}
                title="Add a Drive link"
                headerRight={<PrimaryButton onClick={addLink} disabled={!url.trim()} style={{ minHeight: 38, padding: '0 16px', fontSize: 15 }}>Add</PrimaryButton>}
            >
                <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label className="m-input-field" style={error ? { boxShadow: 'inset 0 0 0 1.5px hsl(var(--color-danger))' } : undefined}>
                        <Plus size={18} style={{ flexShrink: 0, opacity: 0.6 }} />
                        <input
                            autoFocus
                            type="url"
                            inputMode="url"
                            enterKeyHint="next"
                            placeholder="Paste a Google Drive link"
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setError(null); }}
                            aria-label="Google Drive link"
                        />
                    </label>
                    {error && <div style={{ color: 'hsl(var(--color-danger))', fontSize: 14 }}>{error}</div>}
                    <label className="m-input-field">
                        <input
                            type="text"
                            enterKeyHint="done"
                            placeholder="Name (optional)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
                            aria-label="File name"
                        />
                    </label>
                </div>
            </BottomSheet>

            <BottomSheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name || 'File'}>
                <div style={{ padding: '6px 0 16px' }}>
                    <button
                        type="button"
                        className="m-action"
                        onClick={() => {
                            const target = menuFor;
                            setMenuFor(null);
                            if (target) window.open(target.url, '_blank', 'noopener,noreferrer');
                        }}
                    >
                        <span className="m-action__icon"><ExternalLink size={20} /></span>
                        <span style={{ flex: 1 }}>Open</span>
                    </button>
                    {canEdit && (
                        <button
                            type="button"
                            className="m-action m-action--danger"
                            onClick={() => {
                                const target = menuFor;
                                setMenuFor(null);
                                if (target) void updateItemFiles(item.id, files.filter(f => f.id !== target.id));
                            }}
                        >
                            <span className="m-action__icon"><Trash2 size={20} /></span>
                            <span style={{ flex: 1 }}>Remove from this item</span>
                        </button>
                    )}
                </div>
            </BottomSheet>
        </div>
    );
};
