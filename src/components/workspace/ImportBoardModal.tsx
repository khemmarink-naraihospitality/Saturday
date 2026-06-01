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
    const [isSuccess, setIsSuccess] = useState(false);
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
                const mainSheetName = workbook.SheetNames[0];
                const updatesSheetName = workbook.SheetNames.find(s => s.toLowerCase() === 'updates' || s.toLowerCase().includes('update'));
                
                const worksheet = workbook.Sheets[mainSheetName];
                const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                const updatesRows: any[] = updatesSheetName 
                    ? XLSX.utils.sheet_to_json(workbook.Sheets[updatesSheetName], { header: 1 })
                    : [];

                // Shared Containers
                const columns: any[] = [];
                const groups: any[] = [];
                const updatesMap: Record<string, any[]> = {};

                // --- HELPERS ---
                const parseFiles = (val: any) => {
                    if (!val) return [];
                    const str = String(val).trim();
                    const urls = str.split(/[\n,;]+/).map(u => u.trim()).filter(u => u.startsWith('http') || u.startsWith('/'));
                    return urls.map(url => ({
                        id: Math.random().toString(36).substring(7),
                        name: url.split('/').pop() || 'File',
                        url: url,
                        type: 'link'
                    }));
                };

                const parseDate = (val: any, includeTime = false) => {
                    if (!val) return null;
                    let date: Date;
                    if (typeof val === 'number') {
                        date = new Date((val - 25569) * 86400 * 1000);
                    } else {
                        const str = String(val).trim();
                        date = new Date(str);
                        if (isNaN(date.getTime())) {
                            const separator = str.includes('-') ? '-' : (str.includes('/') ? '/' : null);
                            if (separator) {
                                const parts = str.split(separator);
                                if (parts.length === 3) {
                                    if (parts[0].length === 4) {
                                        date = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
                                    } else {
                                        let y = parts[2];
                                        if (y.length === 2) y = '20' + y;
                                        date = new Date(`${y}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                                    }
                                }
                            }
                        }
                    }
                    if (isNaN(date.getTime())) return String(val);
                    return includeTime ? date.toISOString() : date.toISOString().split('T')[0];
                };

                // --- 1. Parse Updates Sheet ---
                if (updatesRows.length > 0) {
                    const header = updatesRows[0].map((h: any) => String(h || '').toLowerCase().trim());
                    const colIdx = {
                        itemId: header.indexOf('item id'),
                        contentType: header.indexOf('content type'),
                        user: header.indexOf('user'),
                        createdAt: header.indexOf('created at'),
                        content: header.indexOf('update content'),
                        postId: header.indexOf('post id'),
                        parentId: header.indexOf('parent post id')
                    };

                    if (colIdx.itemId === -1) colIdx.itemId = 0;
                    if (colIdx.contentType === -1) colIdx.contentType = 2;
                    if (colIdx.user === -1) colIdx.user = 3;
                    if (colIdx.createdAt === -1) colIdx.createdAt = 4;
                    if (colIdx.content === -1) colIdx.content = 5;
                    if (colIdx.postId === -1) colIdx.postId = 6;
                    if (colIdx.parentId === -1) colIdx.parentId = 7;

                    updatesRows.forEach((uRow, uIdx) => {
                        if (uIdx === 0) return;
                        const itemId = String(uRow[colIdx.itemId] || '').trim();
                        if (!itemId) return;
                        if (!updatesMap[itemId]) updatesMap[itemId] = [];
                        
                        const createdAtRaw = uRow[colIdx.createdAt];
                        const dateVal = parseDate(createdAtRaw, true);
                        const dateObj = new Date(dateVal && !isNaN(new Date(dateVal).getTime()) ? dateVal : new Date());
                        const dateStr = !isNaN(dateObj.getTime()) 
                            ? dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : String(createdAtRaw);

                        let content = String(uRow[colIdx.content] || '');
                        if (!content.includes('Update</span>') && String(uRow[colIdx.contentType]).toLowerCase() !== 'reply') {
                            content = `
                                <div style="margin-bottom: 8px;">
                                    <span style="color: #2563eb; font-weight: 700; font-family: serif; font-size: 14px;">Update ${dateStr}</span>
                                </div>
                                <div style="font-weight: 600; color: #1a1728; margin-bottom: 8px;">${content}</div>
                            `;
                        }

                        const imgRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
                        content = content.replace(imgRegex, (url) => `<img src="${url}" style="max-width: 100%; border-radius: 0px; margin-top: 10px; border: 1px solid #eee;" />`);

                        updatesMap[itemId].push({
                            id: Math.random().toString(36).substring(7),
                            author: String(uRow[colIdx.user] || 'System'),
                            createdAt: dateObj.toISOString(),
                            content: content,
                            contentType: String(uRow[colIdx.contentType] || 'Update'),
                            postId: String(uRow[colIdx.postId] || ''),
                            parentId: String(uRow[colIdx.parentId] || '')
                        });
                    });
                }

                // --- 2. Board Configuration ---
                let boardTitle = file.name.replace('.xlsx', '');
                let description = '';
                if (rows[0] && rows[0][0]) boardTitle = String(rows[0][0]).trim();
                if (rows[1] && rows[1][0]) description = String(rows[1][0]).trim();

                const defaultCols: any[] = [
                    { title: 'Status', type: 'status', options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: '00c87501-c875-c875-c875-00c87500c876', label: 'Completed', color: '#00c875' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' },
                        { id: 'fdab3d01-ab3d-ab3d-ab3d-fdab3d00fdac', label: 'In Progress', color: '#fdab3d' },
                        { id: 'stuck-red-id', label: 'Stuck', color: '#e2445c' },
                        { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Not Start', color: '#333333' },
                        { id: 'na-black-id', label: 'N/A', color: '#333333' },
                        { id: 'ffd53300-d533-d533-d533-ffd53300ffd5', label: 'Waiting', color: '#c4c4c4' }
                    ]},
                    { title: 'Champion', type: 'text' },
                    { title: 'Timeline', type: 'timeline' },
                    { title: 'SOR Complete', type: 'status', options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: '', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' }
                    ]},
                    { title: 'SOR File', type: 'files' },
                    { title: 'Stakeholders', type: 'text' },
                    { title: 'Numbers', type: 'number' },
                    { title: 'RFI Sent', type: 'status', options: [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: '', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' }
                    ]},
                    { title: 'Current Contract', type: 'text' },
                    { title: 'RFI FILE', type: 'files' },
                    { title: 'Quotes', type: 'files' },
                    { title: 'Milestones', type: 'text' },
                    { title: 'System Cost', type: 'number' },
                    { title: 'annual cost 5 properties IT', type: 'number' },
                    { title: 'Setup Cost', type: 'number' },
                    { title: 'Consultant Budget', type: 'number' },
                    { title: 'Consultant Name', type: 'text' },
                    { title: 'Interface with', type: 'text' },
                    { title: 'Testing capabilities?', type: 'text' },
                    { title: 'Interface milestone', type: 'text' },
                    { title: 'Tags', type: 'text' },
                    { title: 'Item ID (auto generated)', type: 'text' }
                ];
                columns.push(...defaultCols);

                let currentGroup: any = null;
                let currentMainItem: any = null;
                let isInsideSubitems = false;

                // --- 3. Dynamic Header detection for Main Sheet ---
                let mainColIdx: Record<string, number> = {};
                const headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some((c: any) => String(c).toLowerCase() === 'status' || String(c).toLowerCase() === 'champion'));
                if (headerRowIdx !== -1) {
                    const h = rows[headerRowIdx].map((c: any) => String(c || '').toLowerCase().trim());
                    mainColIdx = {
                        status: h.indexOf('status'),
                        champion: h.indexOf('champion'),
                        timelineStart: h.indexOf('timeline') !== -1 ? h.indexOf('timeline') : h.indexOf('start date'),
                        timelineEnd: h.indexOf('timeline') !== -1 ? h.indexOf('timeline') + 1 : h.indexOf('end date'),
                        sorComplete: h.indexOf('sor complete'),
                        sorFile: h.indexOf('sor file'),
                        stakeholders: h.indexOf('stakeholders'),
                        numbers: h.indexOf('numbers'),
                        rfiSent: h.indexOf('rfi sent'),
                        currentContract: h.indexOf('current contract'),
                        rfiFile: h.indexOf('rfi file'),
                        quotes: h.indexOf('quotes'),
                        milestones: h.indexOf('milestones'),
                        systemCost: h.indexOf('system cost'),
                        annualCost: h.indexOf('annual cost 5 properties it'),
                        setupCost: h.indexOf('setup cost'),
                        consultantBudget: h.indexOf('consultant budget'),
                        consultantName: h.indexOf('consultant name'),
                        interfaceWith: h.indexOf('interface with'),
                        testing: h.indexOf('testing capabilities?'),
                        milestone: h.indexOf('interface milestone'),
                        tags: h.indexOf('tags'),
                        itemId: h.indexOf('item id (auto generated)')
                    };
                }

                const getVal = (row: any[], key: keyof typeof mainColIdx, fallbackIdx: number) => {
                    const idx = mainColIdx[key] === -1 || mainColIdx[key] === undefined ? fallbackIdx : mainColIdx[key];
                    return row[idx];
                };

                rows.forEach((row, idx) => {
                    if (headerRowIdx !== -1 && idx <= headerRowIdx) return;
                    if (idx < 2) return;
                    const firstVal = row[0]?.toString().trim();
                    const secondVal = row[1]?.toString().trim();
                    if (!firstVal && !secondVal) return;

                    if (firstVal && (firstVal.startsWith('Priority') || (idx > 2 && row.filter(Boolean).length === 1 && firstVal !== 'Subitems'))) {
                        let groupColor = '#579bfc'; // Default Monday Blue
                        if (firstVal.includes('1')) groupColor = '#ff9800'; // Orange
                        else if (firstVal.includes('2')) groupColor = '#e2445c'; // Red
                        else if (firstVal.includes('3')) groupColor = '#00c875'; // Green
                        else if (firstVal.includes('Integration') || firstVal.includes('Project')) groupColor = '#a25ddc'; // Purple
                        
                        currentGroup = { title: firstVal, color: groupColor, items: [] };
                        groups.push(currentGroup);
                        currentMainItem = null;
                        isInsideSubitems = false;
                        return;
                    }

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
                    const startDate = parseDate(getVal(row, 'timelineStart', 4));
                    const endDate = parseDate(getVal(row, 'timelineEnd', 5));
                    if (startDate || endDate) timelineValue = { from: startDate, to: endDate || startDate };

                    const valuesMap: Record<string, any> = {
                        'Status': getVal(row, 'status', 2) || '',
                        'Champion': getVal(row, 'champion', 3) || '',
                        'Timeline': timelineValue,
                        'SOR Complete': isInsideSubitems ? parseDate(getVal(row, 'sorComplete', 6)) : (getVal(row, 'sorComplete', 6) || ''),
                        'SOR File': parseFiles(getVal(row, 'sorFile', 7)),
                        'Stakeholders': getVal(row, 'stakeholders', 8) || '',
                        'Numbers': getVal(row, 'numbers', 9) || '',
                        'RFI Sent': getVal(row, 'rfiSent', 10) || '',
                        'Current Contract': getVal(row, 'currentContract', 11) || '',
                        'RFI FILE': parseFiles(getVal(row, 'rfiFile', 12)),
                        'Quotes': parseFiles(getVal(row, 'quotes', 13)),
                        'Milestones': getVal(row, 'milestones', 14) || '',
                        'System Cost': getVal(row, 'systemCost', 15) || '',
                        'annual cost 5 properties IT': getVal(row, 'annualCost', 16) || '',
                        'Setup Cost': getVal(row, 'setupCost', 17) || '',
                        'Consultant Budget': getVal(row, 'consultantBudget', 18) || '',
                        'Consultant Name': getVal(row, 'consultantName', 19) || '',
                        'Interface with': getVal(row, 'interfaceWith', 20) || '',
                        'Testing capabilities?': getVal(row, 'testing', 21) || '',
                        'Interface milestone': getVal(row, 'milestone', 22) || '',
                        'Tags': getVal(row, 'tags', 23) || '',
                        'Item ID (auto generated)': String(getVal(row, 'itemId', 24) || '')
                    };
                    
                    const itemData = {
                        title: firstVal || secondVal || 'Missing Title',
                        values: valuesMap,
                        subitems: []
                    };

                    if (isInsideSubitems && currentMainItem && (!firstVal || firstVal === '')) {
                        currentMainItem.subitems.push(itemData);
                    } else {
                        currentMainItem = itemData;
                        currentGroup.items.push(currentMainItem);
                        isInsideSubitems = false;
                    }
                });

                setPreview({ title: boardTitle, description, groups, columns, updatesMap });
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
                columns: preview.columns,
                updatesMap: preview.updatesMap
            });
            setIsSuccess(true);
            showToast('Board imported successfully', 'success');
            
            setTimeout(() => {
                useBoardStore.getState().navigateTo('board');
                onClose();
            }, 2000);
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
                backgroundColor: 'white', borderRadius: '0px', width: '900px', maxWidth: '95vw',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
                {isSuccess ? (
                    <div style={{ 
                        padding: '60px 40px', display: 'flex', flexDirection: 'column', 
                        alignItems: 'center', justifyContent: 'center', gap: '20px' 
                    }}>
                        <CheckCircle2 size={64} color="hsl(var(--color-brand-primary))" className="animate-bounce" />
                        <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Import successful!</h2>
                        <p style={{ color: 'hsl(var(--color-text-tertiary))' }}>Your board has been created and populated.</p>
                    </div>
                ) : (
                    <>
                        <div style={{
                            padding: '24px', borderBottom: '1px solid hsl(var(--color-border))',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
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
                                                    <span>Mapped <strong>{preview.columns.length} columns</strong></span>
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
                    </>
                )}
            </div>
        </div>
    );
};
