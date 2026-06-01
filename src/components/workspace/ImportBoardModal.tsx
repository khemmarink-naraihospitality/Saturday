import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Layers } from 'lucide-react';
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
    const [importResults, setImportResults] = useState<{ boards: number; items: number } | null>(null);
    const [previews, setPreviews] = useState<any[]>([]);
    const [selectedSheetIndices, setSelectedSheetIndices] = useState<number[]>([]);
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
                
                const updatesSheetName = workbook.SheetNames.find(s => s.toLowerCase() === 'updates' || s.toLowerCase().includes('update'));
                const updatesRows: any[] = updatesSheetName 
                    ? XLSX.utils.sheet_to_json(workbook.Sheets[updatesSheetName], { header: 1 })
                    : [];

                // --- Global Helpers ---
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

                // --- 1. Parse Updates Map (Shared) ---
                const updatesMap: Record<string, any[]> = {};
                if (updatesRows.length > 0) {
                    // Optimized specific indices based on user request:
                    // Column E: User (idx 4)
                    // Column F: Created At (idx 5)
                    // Column G: Update Content (idx 6)
                    const uHeader = (updatesRows[0] || []).map((h: any) => String(h || '').toLowerCase().trim());
                    const colIdx = {
                        itemId: uHeader.indexOf('item id') !== -1 ? uHeader.indexOf('item id') : 0,
                        user: 4, // Column E
                        createdAt: 5, // Column F
                        content: 6, // Column G
                        contentType: uHeader.indexOf('content type') !== -1 ? uHeader.indexOf('content type') : 2,
                        postId: uHeader.indexOf('post id') !== -1 ? uHeader.indexOf('post id') : 7,
                        parentId: uHeader.indexOf('parent post id') !== -1 ? uHeader.indexOf('parent post id') : 8
                    };

                    updatesRows.forEach((uRow, uIdx) => {
                        if (uIdx === 0) return;
                        const itemId = String(uRow[colIdx.itemId] || '').trim();
                        if (!itemId) return;
                        if (!updatesMap[itemId]) updatesMap[itemId] = [];
                        
                        const createdAtRaw = uRow[colIdx.createdAt];
                        const dateVal = parseDate(createdAtRaw, true);
                        const dateObj = new Date(dateVal && !isNaN(new Date(dateVal).getTime()) ? dateVal : new Date());

                        let content = String(uRow[colIdx.content] || '');
                        
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

                // --- 2. Iterate Sheets for Boards ---
                const detectedPreviews: any[] = [];
                workbook.SheetNames.forEach((sheetName, sheetIdx) => {
                    if (sheetName.toLowerCase().includes('update')) return;

                    const worksheet = workbook.Sheets[sheetName];
                    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (rows.length < 3) return;

                    const columns: any[] = [
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

                    const groups: any[] = [];
                    let currentGroup: any = null;
                    let currentMainItem: any = null;
                    let isInsideSubitems = false;

                    rows.forEach((row, rIdx) => {
                        // Skip board title and description rows
                        if (rIdx < 2) return;
                        
                        const firstVal = row[0]?.toString().trim();
                        const secondVal = row[1]?.toString().trim();
                        
                        // Detect Group (Priority 1, 2, 3, etc.)
                        // Groups are often standalone values in the first column or contain "Priority"
                        if (firstVal && (firstVal.startsWith('Priority') || (rIdx > 1 && row.filter((v: any) => v !== undefined && v !== '').length === 1 && firstVal !== 'Subitems' && firstVal !== 'Name'))) {
                            let groupColor = '#579bfc';
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

                        // Skip header row and metadata rows for item processing
                        if (headerRowIdx !== -1 && rIdx <= headerRowIdx) return;
                        if (!firstVal && !secondVal) return;

                        if (firstVal === 'Name' || firstVal === 'Subitems') {
                            if (firstVal === 'Subitems') isInsideSubitems = true;
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

                        const itemData = {
                            title: firstVal || secondVal || 'Missing Title',
                            values: {
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
                            },
                            subitems: []
                        };

                        if (isInsideSubitems && currentMainItem && (!firstVal || firstVal === '')) {
                            currentMainItem.subitems.push(itemData);
                        } else {
                            currentMainItem = itemData;
                            currentGroup.items.push(currentMainItem);
                        }
                    });

                    detectedPreviews.push({ title: sheetName, groups, columns, updatesMap, sheetIdx });
                });

                setPreviews(detectedPreviews);
                setSelectedSheetIndices(detectedPreviews.map(p => p.sheetIdx));
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
        if (previews.length === 0) return;
        setIsImporting(true);
        let totalItems = 0;
        let boardCount = 0;

        try {
            for (const preview of previews) {
                if (!selectedSheetIndices.includes(preview.sheetIdx)) continue;
                
                await importExcelBoard(preview.title, { 
                    description: '',
                    groups: preview.groups, 
                    columns: preview.columns,
                    updatesMap: preview.updatesMap
                });

                boardCount++;
                preview.groups.forEach((g: any) => totalItems += g.items.length);
            }

            setImportResults({ boards: boardCount, items: totalItems });
            setIsSuccess(true);
            showToast('Multi-board import completed', 'success');
        } catch (err: any) {
            console.error(err);
            showToast(err.message || 'Import failed.', 'error');
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
                {isSuccess && importResults ? (
                    <div style={{ 
                        padding: '60px 40px', display: 'flex', flexDirection: 'column', 
                        alignItems: 'center', justifyContent: 'center', gap: '24px', textAlign: 'center'
                    }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={48} color="#10b981" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>Import Complete!</h2>
                            <p style={{ color: '#6b7280', fontSize: '16px' }}>Successfully created <strong>{importResults.boards} boards</strong> with <strong>{importResults.items} items</strong>.</p>
                        </div>
                        <button 
                            onClick={() => { useBoardStore.getState().navigateTo('board'); onClose(); }}
                            style={{ 
                                padding: '12px 32px', backgroundColor: '#2563eb', color: 'white', 
                                border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)'
                            }}
                        >
                            Go to Boards
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{
                            padding: '24px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Multi-Board Project Import</h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Every sheet becomes a new board</p>
                                </div>
                            </div>
                            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                            {!file ? (
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        height: '240px', border: '2px dashed #e2e8f0', borderRadius: '12px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#f8fafc'
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.borderColor = '#2563eb', e.currentTarget.style.backgroundColor = '#f0f9ff')}
                                    onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0', e.currentTarget.style.backgroundColor = '#f8fafc')}
                                >
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" style={{ display: 'none' }} />
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
                                        <Upload size={28} color="#2563eb" />
                                    </div>
                                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Select multi-sheet Excel file</span>
                                    <span style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Updates history will be linked automatically</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                                        <FileText size={32} color="#2563eb" />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{file.name}</div>
                                            <div style={{ fontSize: '13px', color: '#64748b' }}>Detected {previews.length} target boards</div>
                                        </div>
                                        <button onClick={() => { setFile(null); setPreviews([]); }} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Change</button>
                                    </div>

                                    {isParsing ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
                                            <Loader2 className="animate-spin" size={24} color="#2563eb" />
                                            <span style={{ fontSize: '15px', color: '#64748b' }}>Scanning all sheets for board data...</span>
                                        </div>
                                    ) : previews.length > 0 && (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Select Sheets to Import</h3>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>{selectedSheetIndices.length} of {previews.length} selected</span>
                                            </div>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                                                {previews.map((sheet, idx) => (
                                                    <div 
                                                        key={idx}
                                                        onClick={() => {
                                                            setSelectedSheetIndices(prev => 
                                                                prev.includes(sheet.sheetIdx) 
                                                                    ? prev.filter(i => i !== sheet.sheetIdx)
                                                                    : [...prev, sheet.sheetIdx]
                                                            )
                                                        }}
                                                        style={{
                                                            padding: '16px', border: '2px solid', 
                                                            borderColor: selectedSheetIndices.includes(sheet.sheetIdx) ? '#2563eb' : '#f1f5f9',
                                                            backgroundColor: selectedSheetIndices.includes(sheet.sheetIdx) ? '#f0f9ff' : 'white',
                                                            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                                                            display: 'flex', alignItems: 'center', gap: '12px'
                                                        }}
                                                    >
                                                        <input type="checkbox" checked={selectedSheetIndices.includes(sheet.sheetIdx)} readOnly style={{ accentColor: '#2563eb', width: '18px', height: '18px' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{sheet.title}</div>
                                                            <div style={{ fontSize: '12px', color: '#64748b' }}>{sheet.groups.reduce((acc: number, g: any) => acc + g.items.length, 0)} Items found</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <AlertCircle size={20} color="#16a34a" />
                                                <p style={{ margin: 0, fontSize: '13px', color: '#166534', fontWeight: 500 }}>
                                                    Updates column mapping (User, Created At, Content) has been optimized for Columns E, F, and G.
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
                                style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleImport}
                                disabled={selectedSheetIndices.length === 0 || isImporting}
                                style={{ 
                                    padding: '10px 28px', borderRadius: '6px', border: 'none', 
                                    background: selectedSheetIndices.length > 0 ? '#2563eb' : '#94a3b8', 
                                    color: 'white', fontSize: '14px', fontWeight: 700, 
                                    cursor: selectedSheetIndices.length > 0 ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    boxShadow: selectedSheetIndices.length > 0 ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none'
                                }}
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={18} /> : <Layers size={18} />}
                                {isImporting ? `Importing ${selectedSheetIndices.length} Boards...` : `Import ${selectedSheetIndices.length} Boards`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
