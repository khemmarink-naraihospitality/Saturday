
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column, FileLink } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { FileText, Plus } from 'lucide-react';
import { FilesPicker } from '../FilesPicker';

interface FilesCellProps {
    itemId: string;
    column: Column;
    files?: FileLink[];
}

const FILE_ICONS = {
    sheets: "https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png",
    docs: "https://www.gstatic.com/images/branding/product/1x/docs_2020q4_48dp.png",
    slides: "https://www.gstatic.com/images/branding/product/1x/slides_2020q4_48dp.png",
    forms: "https://www.gstatic.com/images/branding/product/1x/forms_2020q4_48dp.png",
    drive: "https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png",
    pdf: "https://drive-thirdparty.googleusercontent.com/32/type/application/pdf"
};

export const FilesCell: React.FC<FilesCellProps> = memo(({ itemId, column, files: propFiles }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const files: FileLink[] = Array.isArray(propFiles) ? propFiles : [];

    const startEditing = useCallback(() => {
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
    }, [can]);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={startEditing}
                style={{
                    width: '100%',
                    height: '100%',
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
                                        // iconUrl = FILE_ICONS.photos; // We'll just let it use the file.iconUrl or generic
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
                        updateItemValue(itemId, column.id, newFiles);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                />
            )}
        </>
    );
});
