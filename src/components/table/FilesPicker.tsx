import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText } from 'lucide-react';
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
    const pickerRef = useRef<HTMLDivElement>(null);
    const { openPicker } = useGooglePicker();

    useEffect(() => {
        // Click outside handler
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onSave(localFiles);
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [localFiles, onSave, onClose]);

    const handleRemoveFile = (id: string) => {
        setLocalFiles(localFiles.filter(f => f.id !== id));
    };

    // Calculate position (similar to other pickers)
    const style: React.CSSProperties = {
        position: 'fixed',
        top: position.bottom + 4,
        left: position.left,
        minWidth: '300px',
        maxWidth: '400px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid #e1e4e8',
        zIndex: 1000,
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    };

    // Auto-adjust if off screen (vertical)
    if (style.top && (style.top as number) + 300 > window.innerHeight) {
        // Show above if not enough space below
        style.top = undefined;
        style.bottom = window.innerHeight - position.top + 4;
    }

    // Auto-adjust if off screen (horizontal)
    const pickerWidth = 320; // Approx width
    if ((style.left as number) + pickerWidth > window.innerWidth) {
        style.left = undefined;
        const newLeft = window.innerWidth - pickerWidth - 16;
        style.left = Math.max(16, newLeft);
    }

    return createPortal(
        <div ref={pickerRef} style={style}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
                Attached Files (Google Drive)
            </div>

            {/* List of Files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {localFiles.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', padding: '8px 0' }}>
                        No files attached yet.
                    </div>
                )}
                {localFiles.map(file => (
                    <div key={file.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        backgroundColor: '#f5f7fa',
                        borderRadius: '4px',
                        fontSize: '12px'
                    }}>
                        <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#0073ea',
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '240px'
                            }}
                        >
                            {file.type === 'google-drive' ? (
                                <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                    <path d="m6.6 66.85 15.4-26.75h58.7l-15.4 26.75z" fill="#0066da" />
                                    <path d="m22 40.1 15.4-26.75h58.7l-15.4 26.75z" fill="#00ac47" />
                                    <path d="m0 53.45 15.4-26.75 15.4 26.75-15.4 26.75z" fill="#ea4335" />
                                    <path d="m6.6 66.85 15.4-26.75 15.4 26.75-15.4 26.75z" fill="#ffbc00" />
                                    <path d="m22 40.1 15.4-26.75h58.7l-15.4 26.75z" fill="#2eb0cd" />
                                    <path d="m22 40.1 15.4-26.75 30.8 53.5-15.4 26.75z" fill="#0066da" />
                                    <path d="m52.8 0 15.4 26.75-30.8 53.5-15.4-26.75z" fill="#ffbc00" />
                                </svg>
                            ) : (
                                <FileText size={14} />
                            )}
                            <span title={file.name}>{file.name}</span>
                        </a>
                        <button
                            onClick={() => handleRemoveFile(file.id)}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                color: '#666',
                                display: 'flex'
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ height: '1px', backgroundColor: '#e1e4e8', margin: '4px 0' }} />

            {/* Google Drive Picker Button */}
            <button
                onClick={() => {
                    openPicker((result) => {
                        const newFile = {
                            id: uuidv4(),
                            name: result.name,
                            url: result.url,
                            type: 'google-drive',
                            iconUrl: result.iconUrl,
                            mimeType: result.mimeType
                        } as FileLink;
                        const updatedFiles = [...localFiles, newFile];
                        onSave(updatedFiles);
                        onClose();
                    });
                }}
                style={{
                    backgroundColor: 'white',
                    color: '#333',
                    border: '1px solid #d0d4e4',
                    borderRadius: '4px',
                    padding: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '4px'
                }}
            >
                <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 15.4-26.75h58.7l-15.4 26.75z" fill="#0066da" />
                    <path d="m22 40.1 15.4-26.75h58.7l-15.4 26.75z" fill="#00ac47" />
                    <path d="m0 53.45 15.4-26.75 15.4 26.75-15.4 26.75z" fill="#ea4335" />
                    <path d="m6.6 66.85 15.4-26.75 15.4 26.75-15.4 26.75z" fill="#ffbc00" />
                </svg>
                Select from Google Drive
            </button>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                <button
                    onClick={onClose}
                    style={{
                        padding: '6px 20px',
                        backgroundColor: 'hsl(var(--color-primary))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'opacity 0.2s'
                    }}
                >
                    OK
                </button>
            </div>
        </div>,
        document.body
    );
};
