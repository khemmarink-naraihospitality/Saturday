
import React, { useRef, useState } from 'react';
import type { Item, Column, FileLink } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { FileText, Plus } from 'lucide-react';
import { FilesPicker } from '../FilesPicker';

interface FilesCellProps {
    item: Item;
    column: Column;
}

const FILE_ICONS = {
    sheets: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Sheets%202020%20Logo.svg",
    docs: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Docs%202020%20Logo.svg",
    slides: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Slides%202020%20Logo.svg",
    forms: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Forms%202020%20Logo.svg",
    photos: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Photos%20icon%20%282020-2025%29.svg",
    drive: "https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Drive%20icon%20%282020%29.svg",
    pdf: "https://commons.wikimedia.org/wiki/Special:FilePath/PDF%20icon.svg"
};

export const FilesCell: React.FC<FilesCellProps> = ({ item, column }) => {
    const value = item.values[column.id];
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const files: FileLink[] = Array.isArray(value) ? value : [];

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => {
                    if (!can('edit_items')) return;
                    if (cellRef.current) {
                        const rect = cellRef.current.getBoundingClientRect();
                        setPickerPos({
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            bottom: rect.bottom
                        });
                        setIsEditing(true);
                    }
                }}
                style={{
                    width: '100%',
                    height: '100%',
                    borderRight: '1px solid hsl(var(--color-cell-border))',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden'
                }}
            >
                {files.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {(files.length > 4 ? files.slice(0, 3) : files).map((file, idx) => (
                            <a
                                key={idx}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={file.name}
                                style={{ 
                                    textDecoration: 'none',
                                    marginLeft: idx > 0 ? '-10px' : '0',
                                    zIndex: idx + 1
                                }}
                            >
                                {(() => {
                                    let iconUrl = file.iconUrl;
                                    const mime = file.mimeType?.toLowerCase() || '';
                                    const name = file.name.toLowerCase();

                                    if (mime.includes('spreadsheet')) {
                                        iconUrl = FILE_ICONS.sheets;
                                    } else if (mime.includes('document')) {
                                        iconUrl = FILE_ICONS.docs;
                                    } else if (mime.includes('presentation')) {
                                        iconUrl = FILE_ICONS.slides;
                                    } else if (mime.includes('form')) {
                                        iconUrl = FILE_ICONS.forms;
                                    } else if (mime.includes('pdf') || name.endsWith('.pdf')) {
                                        iconUrl = FILE_ICONS.pdf;
                                    } else if (mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg')) {
                                        iconUrl = FILE_ICONS.photos;
                                    } else if (file.type === 'google-drive') {
                                        iconUrl = FILE_ICONS.drive;
                                    }

                                    return (
                                        <div style={{
                                            width: '26px',
                                            height: '26px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: '#fff',
                                            borderRadius: '50%',
                                            border: '2px solid white',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                            overflow: 'hidden'
                                        }}>
                                            {iconUrl ? (
                                                <img
                                                    src={iconUrl}
                                                    alt=""
                                                    referrerPolicy="no-referrer"
                                                    style={{ width: '18px', height: '18px', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <FileText size={18} color="#666" />
                                            )}
                                        </div>
                                    );
                                })()}
                            </a>
                        ))}
                        {files.length > 4 && (
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: '#e5e7eb',
                                color: '#6b7280',
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid white',
                                marginLeft: '-10px',
                                zIndex: 10,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}>
                                +{files.length - 3}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ color: 'hsl(var(--color-text-tertiary))', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Plus size={16} />
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <FilesPicker
                    files={files}
                    position={pickerPos!}
                    onSave={(newFiles) => {
                        updateItemValue(item.id, column.id, newFiles);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                />
            )}
        </>
    );
};
