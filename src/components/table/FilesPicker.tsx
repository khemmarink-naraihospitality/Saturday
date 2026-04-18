import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { FileLink } from '../../types';
import { useGooglePicker } from '../../hooks/useGooglePicker';

interface FilesPickerProps {
    files: FileLink[];
    position: { top: number, left: number, width: number, bottom: number };
    onSave: (newFiles: FileLink[]) => void;
    onClose: () => void;
}

export const FilesPicker = ({ files = [], position, onSave, onClose }: FilesPickerProps) => {
    const [localFiles, setLocalFiles] = useState<FileLink[]>(files || []);
    const [isAddingUrl, setIsAddingUrl] = useState(false);
    const [urlName, setUrlName] = useState('');
    const [urlValue, setUrlValue] = useState('');
    
    const pickerRef = useRef<HTMLDivElement>(null);
    const { openPicker } = useGooglePicker();

    useEffect(() => {
        setLocalFiles(files || []);
    }, [files]);

    useEffect(() => {
        // Click outside handler
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleRemoveFile = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = localFiles.filter(f => f.id !== id);
        setLocalFiles(updated);
        onSave(updated); // Sync immediately
    };

    const handleAddUrlFile = () => {
        if (!urlName.trim() || !urlValue.trim()) return;
        
        const newFile: FileLink = {
            id: uuidv4(),
            name: urlName,
            url: urlValue.trim(),
            type: 'file-url'
        };
        
        const updated = [...localFiles, newFile];
        setLocalFiles(updated);
        onSave(updated); // Sync immediately
        setIsAddingUrl(false);
        setUrlName('');
        setUrlValue('');
    };

    // Calculate position
    const style: React.CSSProperties = {
        position: 'fixed',
        top: position.bottom + 4,
        left: position.left,
        minWidth: '320px',
        maxWidth: '400px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid #e1e4e8',
        zIndex: 1000,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    };

    // Auto-adjust if off screen (vertical)
    if (style.top && (style.top as number) + 350 > window.innerHeight) {
        style.top = undefined;
        style.bottom = window.innerHeight - position.top + 4;
    }

    // Auto-adjust if off screen (horizontal)
    const pickerWidth = 320;
    if ((style.left as number) + pickerWidth > window.innerWidth) {
        style.left = undefined;
        const newLeft = window.innerWidth - pickerWidth - 16;
        style.left = Math.max(16, newLeft);
    }

    const handleClose = (save: boolean = true) => {
        if (save) onSave(localFiles);
        onClose();
    };

    return createPortal(
        <div ref={pickerRef} style={style}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>
                    Attached Files
                </div>
                <button 
                  onClick={() => handleClose(true)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '4px' }}
                >
                    <X size={16} />
                </button>
            </div>

            {/* List of Files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                {localFiles.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', padding: '12px 0', textAlign: 'center', border: '1px dashed #eee', borderRadius: '4px' }}>
                        No files attached yet.
                    </div>
                )}
                {localFiles.map(file => (
                    <div key={file.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #edf2f7',
                        borderRadius: '6px',
                        fontSize: '12px'
                    }}>
                        <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: '#0073ea',
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1
                            }}
                        >
                            {(() => {
                                let iconUrl = file.iconUrl;
                                const mime = file.mimeType?.toLowerCase() || '';
                                const name = file.name.toLowerCase();

                                if (mime.includes('spreadsheet')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/sheets_2020q4_48dp.png";
                                } else if (mime.includes('document')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/docs_2020q4_48dp.png";
                                } else if (mime.includes('presentation')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/slides_2020q4_48dp.png";
                                } else if (mime.includes('form')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/forms_2020q4_48dp.png";
                                } else if (mime.includes('pdf') || name.endsWith('.pdf')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/pdf_48dp.png";
                                } else if (mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg')) {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/photos_48dp.png"; // Fixed icon mapping
                                } else if (file.type === 'google-drive') {
                                    iconUrl = "https://www.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png";
                                }

                                return iconUrl ? (
                                    <img src={iconUrl} alt="" referrerPolicy="no-referrer" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                ) : (
                                    <Globe size={16} color="#666" />
                                );
                            })()}
                            <span title={file.name} style={{ fontWeight: 500 }}>{file.name}</span>
                        </a>
                        <button
                            onClick={(e) => handleRemoveFile(e, file.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94a3b8', display: 'flex' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />

            {/* Addition Choice */}
            {isAddingUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#666', textTransform: 'uppercase', marginBottom: '2px' }}>Add File URL</div>
                    <input 
                        autoFocus
                        placeholder="File Name (e.g. My Document)"
                        value={urlName}
                        onChange={(e) => setUrlName(e.target.value)}
                        style={{ padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddUrlFile()}
                    />
                    <input 
                        placeholder="https://example.com/file.pdf"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        style={{ padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddUrlFile()}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button 
                            onClick={() => setIsAddingUrl(false)}
                            style={{ flex: 1, padding: '8px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleAddUrlFile}
                            disabled={!urlName.trim() || !urlValue.trim()}
                            style={{ 
                              flex: 2, 
                              padding: '8px', 
                              fontSize: '13px', 
                              background: '#0073ea', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '4px', 
                              cursor: 'pointer', 
                              opacity: (!urlName.trim() || !urlValue.trim()) ? 0.6 : 1,
                              fontWeight: 600
                            }}
                        >
                            Add File
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Google Drive Option */}
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
                                const updatedFiles = [...localFiles, newFile];
                                onSave(updatedFiles);
                                onClose();
                            });
                        }}
                        style={{
                            flex: 1,
                            backgroundColor: 'white',
                            color: '#333',
                            border: '1px solid #d0d4e4',
                            borderRadius: '8px',
                            padding: '12px 8px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.borderColor = '#0073ea';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#d0d4e4';
                        }}
                    >
                        <img 
                            src="https://commons.wikimedia.org/wiki/Special:FilePath/Google%20Drive%20icon%20%282020%29.svg" 
                            alt="Google Drive" 
                            width="24" 
                            height="24" 
                        />
                        Google Drive
                    </button>

                    {/* File URL Option */}
                    <button
                        onClick={() => setIsAddingUrl(true)}
                        style={{
                            flex: 1,
                            backgroundColor: 'white',
                            color: '#333',
                            border: '1px solid #d0d4e4',
                            borderRadius: '8px',
                            padding: '12px 8px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.borderColor = '#0073ea';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderColor = '#d0d4e4';
                        }}
                    >
                        <div style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '6px', 
                            backgroundColor: '#f1f5f9', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#475569'
                        }}>
                            <Globe size={18} />
                        </div>
                        File URL
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: isAddingUrl ? '0' : '8px' }}>
                <button
                    onClick={() => handleClose(true)}
                    style={{
                        padding: '10px 24px',
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    OK
                </button>
            </div>
        </div>,
        document.body
    );
};
