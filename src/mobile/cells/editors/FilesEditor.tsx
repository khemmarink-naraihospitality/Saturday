import { useEffect, useState } from 'react';
import { ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon, Link2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useBoardStore } from '../../../store/useBoardStore';
import { useGooglePicker } from '../../../hooks/useGooglePicker';
import type { FileLink } from '../../../types';
import { BottomSheet, PrimaryButton, TextButton } from '../../ui';
import { DRIVE_ICON, FileIcon } from '../CellView';
import { fileLinkFromUrl, isOneDriveUrl, ONEDRIVE_ICON } from '../../../lib/fileLinks';
import type { EditorProps } from './types';

const hostOf = (url: string) => {
    try {
        return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

/** The empty state's picture: a few kinds of file on a soft tile (reference 23, drawn with our own icons). */
const FilesArt = () => (
    <div className="m-files-art" aria-hidden="true">
        <span className="m-files-art__blob" />
        <span className="m-files-art__tile m-files-art__tile--a"><FileSpreadsheet size={30} /></span>
        <span className="m-files-art__tile m-files-art__tile--b"><img src={DRIVE_ICON} alt="" width={30} height={30} /></span>
        <span className="m-files-art__tile m-files-art__tile--c"><FileText size={28} /></span>
        <span className="m-files-art__tile m-files-art__tile--d"><ImageIcon size={28} /></span>
    </div>
);

/**
 * A files column — reference screenshot 23: what's attached, or a picture and
 * a line when nothing is, and the ways to add at the bottom. Our files are
 * links (a name and a URL) and Google Drive picks, as in the desktop
 * FilesPicker; every change is saved at once, as there.
 */
export const FilesEditor = ({ open, onClose, item, column, value }: EditorProps) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { openPicker } = useGooglePicker();
    const files: FileLink[] = Array.isArray(value) ? (value as FileLink[]) : [];
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');

    useEffect(() => {
        if (!open) return;
        setAdding(false);
        setName('');
        setUrl('');
    }, [open]);

    const save = (next: FileLink[]) => void updateItemValue(item.id, column.id, next);

    // The cell's files as they are now — a Drive pick lands after an await.
    const currentFiles = (): FileLink[] => {
        const board = useBoardStore.getState().boards.find(b => b.items.some(i => i.id === item.id));
        const v = board?.items.find(i => i.id === item.id)?.values[column.id];
        return Array.isArray(v) ? v as FileLink[] : [];
    };

    // 'onedrive': the same form, for a OneDrive / SharePoint share link (name optional).
    const [kind, setKind] = useState<'link' | 'onedrive'>('link');
    const [error, setError] = useState<string | null>(null);

    const addLink = () => {
        if (!url.trim()) return;
        if (kind === 'link' && !name.trim()) return;
        if (kind === 'onedrive' && !isOneDriveUrl(url)) {
            setError('Paste a OneDrive or SharePoint link (1drv.ms, onedrive.live.com or …sharepoint.com).');
            return;
        }
        const file = fileLinkFromUrl(url, name, uuidv4);
        if (!file) return;
        save([...files, file]);
        setAdding(false);
        setName('');
        setUrl('');
        setError(null);
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={column.title}
            size="medium"
            testId="m-cell-editor"
            footer={!adding ? (
                <div className="m-files-bar">
                    <button type="button" className="m-files-bar__btn" onClick={() => { setKind('link'); setAdding(true); }}>
                        <span className="m-files-bar__icon"><Link2 size={22} /></span>
                        Link
                    </button>
                    <button type="button" className="m-files-bar__btn" onClick={() => { setKind('onedrive'); setAdding(true); }}>
                        <span className="m-files-bar__icon"><img src={ONEDRIVE_ICON} alt="" width={24} height={24} /></span>
                        OneDrive
                    </button>
                    <button
                        type="button"
                        className="m-files-bar__btn"
                        onClick={() => openPicker(result => save([...currentFiles(), {
                            id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType,
                        }]))}
                    >
                        <span className="m-files-bar__icon"><img src={DRIVE_ICON} alt="" width={22} height={22} /></span>
                        Google Drive
                    </button>
                </div>
            ) : undefined}
        >
            {adding ? (
                <div className="m-editor-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label className="m-editor-field">
                        <span>{kind === 'onedrive' ? 'Name (optional)' : 'Name'}</span>
                        <input autoFocus type="text" enterKeyHint="next" placeholder="Contract 2026" value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label className="m-editor-field">
                        <span>Link</span>
                        <input
                            type="url"
                            inputMode="url"
                            enterKeyHint="done"
                            placeholder="https://"
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
                        />
                    </label>
                    {error && <div style={{ color: 'hsl(var(--color-danger))', fontSize: 14 }}>{error}</div>}
                    <PrimaryButton onClick={addLink} disabled={(kind === 'link' && !name.trim()) || !url.trim()}>Add file</PrimaryButton>
                    <TextButton onClick={() => { setAdding(false); setError(null); }} style={{ alignSelf: 'center' }}>Cancel</TextButton>
                </div>
            ) : files.length === 0 ? (
                <div className="m-files-empty">
                    <FilesArt />
                    <div className="m-files-empty__title">Add files</div>
                    <div className="m-files-empty__text">Links and Drive files will be shown here</div>
                </div>
            ) : (
                <div className="m-editor-pad">
                    <div className="m-file-list-card">
                        {files.map(file => (
                            <div key={file.id} className="m-file-line">
                                <a className="m-file-line__open" href={file.url} target="_blank" rel="noopener noreferrer">
                                    <span className="m-file-line__icon"><FileIcon file={file} size={24} /></span>
                                    <span style={{ minWidth: 0, flex: 1 }}>
                                        <span className="m-truncate m-file-line__name">{file.name}</span>
                                        <span className="m-truncate m-file-line__host">{hostOf(file.url)} <ExternalLink size={12} /></span>
                                    </span>
                                </a>
                                <button type="button" className="m-file-line__remove" onClick={() => save(files.filter(f => f.id !== file.id))} aria-label={`Remove ${file.name}`}>
                                    <X size={19} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </BottomSheet>
    );
};
