import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useToast } from '../../hooks/useToast';

interface ImportBoardModalProps {
    onClose: () => void;
}

export const ImportBoardModal: React.FC<ImportBoardModalProps> = ({ onClose }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [preview, setPreview] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const importExcelBoard = useBoardStore(state => state.importExcelBoard);
    const { showToast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.name.endsWith('.xlsx')) {
                setFile(selectedFile);
                parseExcel(selectedFile);
            } else {
                showToast('Please select a valid .xlsx file', 'error');
            }
        }
    };

    const parseExcel = async (file: File) => {
        setIsParsing(true);
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Row 1 is board title, Row 2 is description
                let boardTitle = file.name.replace('.xlsx', '');
                let description = '';
                
                if (rows[0] && rows[0][0]) {
                    boardTitle = String(rows[0][0]).replace(/^1\)\s*/, '').trim(); // Remove "1) " prefix
                }
                if (rows[1] && rows[1][0]) {
                    description = String(rows[1][0]).trim();
                }

                const columns: any[] = [];
                const groups: any[] = [];
                
                // Full Saturday Schema mapped as per implementation plan (A-Q)
                const defaultCols: any[] = [
                    { title: 'Subitems', type: 'text' },
                    { title: 'Status', type: 'status', options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: '00c87501-c875-c875-c875-00c87500c876', label: 'Completed', color: '#00c875' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' },
                        { id: 'fdab3d01-ab3d-ab3d-ab3d-fdab3d00fdac', label: 'In Progress', color: '#579bfc' },
                        { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Not Start', color: '#e2445c' },
                        { id: 'ffd53300-d533-d533-d533-ffd53300ffd5', label: 'Waiting', color: '#ffd533' }
                    ]},
                    { title: 'Champion', type: 'text' },
                    { title: 'Timeline', type: 'timeline' },
                    { title: 'Date', type: 'date' },
                    { title: 'ST Files', type: 'files' },
                    { title: 'SOR Complete', type: 'text' },
                    { title: 'SOR File', type: 'text' },
                    { title: 'Stakeholders', type: 'text' },
                    { title: 'Numbers', type: 'text' },
                    { title: 'If I Sent', type: 'text' },
                    { title: 'Current', type: 'text' },
                    { title: 'Remark', type: 'text' },
                    { title: 'Dropdown', type: 'text' },
                    { title: 'Item ID', type: 'text' }
                ];

                columns.push(...defaultCols);

                let currentGroup: any = null;
                let currentMainItem: any = null;
                let isInsideSubitems = false;

                rows.forEach((row, idx) => {
                    if (idx < 2) return; // Skip title/description headers

                    const firstVal = row[0]?.toString().trim();
                    const secondVal = row[1]?.toString().trim(); // Used to check Subitems indicator

                    if (!firstVal && !secondVal) return; // Skip empty rows completely

                    // Group Detection (e.g. "Priority 1")
                    if (firstVal && (firstVal.startsWith('Priority') || (idx > 2 && row.filter(Boolean).length === 1 && firstVal !== 'Subitems'))) {
                        currentGroup = { title: firstVal, color: '#579bfc', items: [] };
                        groups.push(currentGroup);
                        currentMainItem = null;
                        isInsideSubitems = false;
                        return;
                    }

                    // Columns Header detection & Subitem mode toggle
                    if (firstVal === 'Name' || firstVal === 'Subitems') {
                        if (firstVal === 'Subitems') isInsideSubitems = true;
                        return;
                    }
                    if (secondVal === 'Subitems' && !firstVal) {
                        isInsideSubitems = true;
                        return;
                    }

                    if (!currentGroup) {
                        currentGroup = { title: 'Imported Group', color: '#579bfc', items: [] };
                        groups.push(currentGroup);
                    }

                    let timelineValue = null;
                    if (row[4] || row[5]) {
                        timelineValue = {
                            from: row[4] ? String(row[4]).trim() : null,
                            to: row[5] ? String(row[5]).trim() : null,
                        };
                    }

                    // Map all specific values horizontally according to column B -> Q (Indices 1 -> 16)
                    const valuesMap: Record<string, any> = {
                        'Subitems': row[1] || '',
                        'Status': row[2] || '',
                        'Champion': row[3] || '',
                        'Timeline': timelineValue,
                        'Date': row[6] || '',
                        'ST Files': row[7] || '',
                        'SOR Complete': row[8] || '',
                        'SOR File': row[9] || '',
                        'Stakeholders': row[10] || '',
                        'Numbers': row[11] || '',
                        'If I Sent': row[12] || '',
                        'Current': row[13] || '',
                        'Remark': row[14] || '',
                        'Dropdown': row[15] || '',
                        'Item ID': row[16] || ''
                    };
                    
                    // Note: Excel export might shift depending on hidden columns. We extract all text.
                    const itemData = {
                        title: firstVal || secondVal || 'Missing Title',
                        values: valuesMap,
                        subitems: []
                    };

                    if (isInsideSubitems && currentMainItem) {
                        currentMainItem.subitems.push(itemData);
                    } else {
                        currentMainItem = itemData;
                        currentGroup.items.push(currentMainItem);
                        isInsideSubitems = false; // Reset subitem flag for new main items
                    }
                });

                setPreview({ title: boardTitle, description, groups, columns });
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.error(err);
            showToast('Failed to parse Excel file', 'error');
        } finally {
            setIsParsing(false);
        }
    };

    const handleImport = async () => {
        if (!preview) return;
        setIsImporting(true);
        try {
            await importExcelBoard(preview.title, { 
                description: preview.description,
                groups: preview.groups, 
                columns: preview.columns 
            });
            showToast('Board imported successfully', 'success');
            onClose();
        } catch (err: any) {
            console.error(err);
            showToast(err.message || 'Import failed. Please check file format.', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                width: '600px', backgroundColor: 'white', borderRadius: '12px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', maxHeight: '90vh'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <Upload size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>Import Board from Excel</h2>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Support Sunday/Monday styled .xlsx templates</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {!file ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                height: '200px', border: '2px dashed #e2e8f0', borderRadius: '8px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#f8fafc'
                            }}
                            onMouseOver={e => (e.currentTarget.style.borderColor = '#2563eb', e.currentTarget.style.backgroundColor = '#f0f9ff')}
                            onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0', e.currentTarget.style.backgroundColor = '#f8fafc')}
                        >
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" style={{ display: 'none' }} />
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '12px' }}>
                                <FileText size={24} color="#64748b" />
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>Click to upload or drag & drop</span>
                            <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Only .xlsx files are supported</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                                <FileText size={24} color="#2563eb" />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{file.name}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b' }}>{(file.size / 1024).toFixed(1)} KB</div>
                                </div>
                                <button onClick={() => { setFile(null); setPreview(null); }} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>Remove</button>
                            </div>

                            {isParsing ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '10px' }}>
                                    <Loader2 className="animate-spin" size={18} color="#2563eb" />
                                    <span style={{ fontSize: '14px', color: '#64748b' }}>Parsing board structure...</span>
                                </div>
                            ) : preview && (
                                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Board Preview</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                                            <CheckCircle2 size={16} color="#10b981" />
                                            <span>Detected <strong>{preview.groups.length} groups</strong></span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                                            <CheckCircle2 size={16} color="#10b981" />
                                            <span>Found <strong>{preview.groups.reduce((acc: number, g: any) => acc + g.items.length, 0)} main items</strong></span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                                            <CheckCircle2 size={16} color="#10b981" />
                                            <span>Mapped <strong>{preview.columns.length} columns</strong> (Status, Champion, Timeline)</span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff7ed', borderRadius: '8px', border: '1px solid #ffedd5', display: 'flex', gap: '10px' }}>
                                        <AlertCircle size={20} color="#f97316" style={{ flexShrink: 0 }} />
                                        <p style={{ margin: 0, fontSize: '12px', color: '#9a3412', lineHeight: 1.5 }}>
                                            Make sure your Excel sheet matches the template. Status colors and Subitems will be preserved during import.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#f8fafc' }}>
                    <button 
                        onClick={onClose}
                        disabled={isImporting}
                        style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: '#64748b' }}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleImport}
                        disabled={!preview || isImporting}
                        style={{ 
                            padding: '8px 24px', borderRadius: '6px', border: 'none', 
                            background: preview ? '#2563eb' : '#94a3b8', 
                            color: 'white', fontSize: '14px', fontWeight: 600, 
                            cursor: preview ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        {isImporting && <Loader2 className="animate-spin" size={16} />}
                        {isImporting ? 'Importing...' : 'Confirm Import'}
                    </button>
                </div>
            </div>
        </div>
    );
};
