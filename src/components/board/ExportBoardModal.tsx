import { useState, useEffect } from 'react';
import { X, Download, FileText, Table } from 'lucide-react';

interface ExportBoardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (filename: string, format: 'csv' | 'xlsx') => void;
    defaultFilename: string;
}

export const ExportBoardModal = ({ isOpen, onClose, onExport, defaultFilename }: ExportBoardModalProps) => {
    const [filename, setFilename] = useState(defaultFilename);
    const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');

    // Sync default filename when modal opens or prop changes
    useEffect(() => {
        if (isOpen) {
            setFilename(defaultFilename);
            setFormat('csv');
        }
    }, [isOpen, defaultFilename]);

    if (!isOpen) return null;

    const handleExport = () => {
        // Validation: Ensure not empty
        const finalName = filename.trim() || 'Board_Export';
        onExport(finalName, format);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: 'hsl(var(--color-bg-surface))',
                borderRadius: '8px',
                width: '400px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                border: '1px solid hsl(var(--color-border))',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid hsl(var(--color-border))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} className="text-brand-primary" />
                        Export Board Data
                    </h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 20px' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'hsl(var(--color-text-secondary))' }}>
                            Export Format
                        </label>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input 
                                    type="radio" 
                                    name="export_format" 
                                    value="csv" 
                                    checked={format === 'csv'} 
                                    onChange={() => setFormat('csv')} 
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '14px', color: 'hsl(var(--color-text-primary))' }}>CSV Document</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input 
                                    type="radio" 
                                    name="export_format" 
                                    value="xlsx" 
                                    checked={format === 'xlsx'} 
                                    onChange={() => setFormat('xlsx')} 
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '14px', color: 'hsl(var(--color-text-primary))' }}>Excel (.xlsx)</span>
                            </label>
                        </div>
                    </div>

                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'hsl(var(--color-text-secondary))' }}>
                        File Name
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '6px',
                            background: 'hsl(var(--color-bg-subtle))',
                            padding: '0 12px'
                        }}>
                            {format === 'csv' ? <FileText size={16} color="hsl(var(--color-text-tertiary))" /> : <Table size={16} color="hsl(var(--color-text-tertiary))" />}
                            <input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                autoFocus
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '10px 8px',
                                    fontSize: '14px',
                                    outline: 'none',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                            />
                            <span style={{ fontSize: '14px', color: 'hsl(var(--color-text-tertiary))', userSelect: 'none' }}>
                                .{format}
                            </span>
                        </div>
                    </div>
                    <p style={{ marginTop: '12px', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                        Choose a name for your export file. Avoid special characters like / \ : * ? " &lt; &gt; |.
                    </p>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid hsl(var(--color-border))',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    backgroundColor: 'hsl(var(--color-bg-subtle))'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            background: 'transparent',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'hsl(var(--color-text-secondary))'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        style={{
                            padding: '8px 16px',
                            background: 'hsl(var(--color-brand-primary))',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Download size={16} />
                        Export
                    </button>
                </div>
            </div>
        </div>
    );
};
