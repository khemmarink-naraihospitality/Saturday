import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Loader2, FileText, CheckCircle2, Layers, Plus, AlertCircle } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { showToast } from '@/utils/toast';

interface ImportBoardModalProps {
    onClose: () => void;
}

const parseDate = (val: any, isUpdate = false) => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    
    const s = String(val).trim();
    if (!s) return null;

    // Excel Serial Date check
    if (!isNaN(Number(s)) && Number(s) > 30000) {
        const d = new Date((Number(s) - 25569) * 86400 * 1000);
        return d.toISOString();
    }

    // Try various formats
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();

    return isUpdate ? null : s;
};

const parseFiles = (val: any) => {
    if (!val) return [];
    const s = String(val).trim();
    if (!s) return [];
    
    const urls = s.split(/[\s,]+/).filter(u => u.startsWith('http'));
    return urls.map(url => ({
        id: Math.random().toString(36).substring(7),
        name: url.split('/').pop() || 'File',
        url: url,
        type: 'link'
    }));
};

export const ImportBoardModal: React.FC<ImportBoardModalProps> = ({ onClose }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [importResults, setImportResults] = useState<{ boards: number; items: number } | null>(null);
    const [previews, setPreviews] = useState<any[]>([]);
    const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const importExcelBoard = useBoardStore(state => state.importExcelBoard);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length > 0) {
            const excelFiles = selectedFiles.filter(f => f.name.endsWith('.xlsx'));
            if (excelFiles.length > 0) {
                setFiles(prev => [...prev, ...excelFiles]);
                excelFiles.forEach(f => parseExcel(f));
            } else {
                showToast('Please select valid .xlsx files', 'error');
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const parseExcel = async (file: File) => {
        setIsParsing(true);
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // --- 1. Parse Updates Map ---
                const updatesMap: Record<string, any[]> = {};
                const updatesSheet = workbook.SheetNames.find(n => n.toLowerCase().includes('update'));
                if (updatesSheet) {
                    const uRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[updatesSheet], { header: 1 });
                    const uHeader = (uRows[0] || []).map((h: any) => String(h || '').toLowerCase().trim());
                    
                    const colIdx = {
                        itemId: uHeader.indexOf('item id') !== -1 ? uHeader.indexOf('item id') : 0,
                        user: 4, // Column E
                        createdAt: 5, // Column F
                        content: 6, // Column G
                        contentType: uHeader.indexOf('content type') !== -1 ? uHeader.indexOf('content type') : 2,
                        postId: uHeader.indexOf('post id') !== -1 ? uHeader.indexOf('post id') : 7,
                        parentId: uHeader.indexOf('parent post id') !== -1 ? uHeader.indexOf('parent post id') : 8
                    };

                    uRows.forEach((uRow, uIdx) => {
                        if (uIdx === 0) return;
                        const itemId = String(uRow[colIdx.itemId] || '').trim();
                        if (!itemId) return;
                        if (!updatesMap[itemId]) updatesMap[itemId] = [];
                        
                        const createdAtRaw = uRow[colIdx.createdAt];
                        const dateVal = parseDate(createdAtRaw, true);
                        const dateObj = new Date(dateVal && !isNaN(new Date(dateVal).getTime()) ? dateVal : new Date());

                        let content = String(uRow[colIdx.content] || '').trim();
                        // Clean "Update [Date]" redundant markers
                        content = content.replace(/^Update\s+\d{1,2}\s+\w{3,9}\s+\d{4}\s*/i, '').trim();
                        
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

                // --- 2. Iterate Data Sheets ---
                const filePreviews: any[] = [];
                workbook.SheetNames.forEach((sheetName) => {
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
                        if (rIdx < 2) return;
                        const firstVal = row[0]?.toString().trim();
                        const secondVal = row[1]?.toString().trim();
                        
                        if (firstVal && (firstVal.startsWith('Priority') || (rIdx > 1 && row.filter((v: any) => v !== undefined && v !== '').length === 1 && firstVal !== 'Subitems' && firstVal !== 'Name'))) {
                            let groupColor = '#579bfc';
                            if (firstVal.includes('1')) groupColor = '#ff9800';
                            else if (firstVal.includes('2')) groupColor = '#e2445c';
                            else if (firstVal.includes('3')) groupColor = '#00c875';
                            else if (firstVal.includes('Integration') || firstVal.includes('Project')) groupColor = '#a25ddc';
                            
                            currentGroup = { title: firstVal, color: groupColor, items: [] };
                            groups.push(currentGroup);
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }

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
                        const sd = parseDate(getVal(row, 'timelineStart', 4));
                        const ed = parseDate(getVal(row, 'timelineEnd', 5));
                        if (sd || ed) timelineValue = { from: sd, to: ed || sd };

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

                    filePreviews.push({ 
                        id: `${file.name}-${sheetName}`,
                        fileName: file.name,
                        title: sheetName, 
                        groups, 
                        columns, 
                        updatesMap 
                    });
                });

                setPreviews(prev => [...prev, ...filePreviews]);
                setSelectedSheetIds(prev => [...prev, ...filePreviews.map(p => p.id)]);
                setIsParsing(false);
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.error(err);
            showToast('Failed to parse Excel file', 'error');
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
                if (!selectedSheetIds.includes(preview.id)) continue;
                
                await importExcelBoard(preview.title, { 
                    description: `Imported from ${preview.fileName}`,
                    groups: preview.groups, 
                    columns: preview.columns,
                    updatesMap: preview.updatesMap
                });

                boardCount++;
                preview.groups.forEach((g: any) => totalItems += g.items.length);
            }

            setImportResults({ boards: boardCount, items: totalItems });
            setIsSuccess(true);
            showToast('Multi-file import completed', 'success');
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
            backgroundColor: 'rgba(26, 23, 40, 0.8)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white', width: '900px', maxWidth: '95vw',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                borderRadius: '0px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid #eee', overflow: 'hidden', position: 'relative'
            }}>
                {isSuccess ? (
                    <div style={{
                        padding: '60px 40px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', textAlign: 'center', gap: '24px'
                    }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={48} color="#10b981" />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0', fontFamily: 'serif' }}>Import Complete!</h2>
                            <p style={{ color: '#6b7280', fontSize: '16px' }}>Successfully created <strong>{importResults?.boards} boards</strong> with <strong>{importResults?.items} items</strong> across all files.</p>
                        </div>
                        <button 
                            onClick={onClose}
                            style={{ 
                                padding: '12px 32px', backgroundColor: '#1a1728', color: 'white', 
                                border: 'none', borderRadius: '0px', fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                            }}
                        >
                            Close Summary
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{
                            padding: '24px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '0px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', fontFamily: 'serif' }}>Multi-File Project Import</h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Import multiple files and sheets as concurrent boards</p>
                                </div>
                            </div>
                            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                            {files.length === 0 ? (
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        height: '280px', border: '2px dashed #e2e8f0', borderRadius: '0px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#f8fafc'
                                    }}
                                >
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" multiple style={{ display: 'none' }} />
                                    <div style={{ width: '56px', height: '56px', borderRadius: '0px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
                                        <Upload size={28} color="#2563eb" />
                                    </div>
                                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Select Excel files to import</span>
                                    <span style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>You can select multiple files at once</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Selected Files & Previews</h3>
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={14} /> Add More Files
                                        </button>
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" multiple style={{ display: 'none' }} />
                                    </div>

                                    {isParsing && previews.length === 0 ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
                                            <Loader2 className="animate-spin" size={24} color="#2563eb" />
                                            <span style={{ fontSize: '15px', color: '#64748b' }}>Parsing Excel workbooks...</span>
                                        </div>
                                    ) : (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                                Detected <strong>{previews.length}</strong> possible boards across <strong>{files.length}</strong> files.
                                            </p>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '12px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                                                {previews.map((sheet) => (
                                                    <div 
                                                        key={sheet.id}
                                                        onClick={() => {
                                                            setSelectedSheetIds(prev => 
                                                                prev.includes(sheet.id) 
                                                                    ? prev.filter(id => id !== sheet.id)
                                                                    : [...prev, sheet.id]
                                                            )
                                                        }}
                                                        style={{
                                                            padding: '16px', border: '2px solid', 
                                                            borderColor: selectedSheetIds.includes(sheet.id) ? '#2563eb' : '#f1f5f9',
                                                            backgroundColor: selectedSheetIds.includes(sheet.id) ? '#f0f9ff' : 'white',
                                                            borderRadius: '0px', cursor: 'pointer', transition: 'all 0.2s',
                                                            display: 'flex', alignItems: 'center', gap: '12px'
                                                        }}
                                                    >
                                                        <input type="checkbox" checked={selectedSheetIds.includes(sheet.id)} readOnly style={{ accentColor: '#2563eb', width: '18px', height: '18px' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>{sheet.title}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>File: {sheet.fileName}</div>
                                                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{sheet.groups.reduce((acc: number, g: any) => acc + g.items.length, 0)} Items found</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {selectedSheetIds.length > 0 && (
                                                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '0px', backgroundColor: 'white' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#666', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>Import Statistics</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>{selectedSheetIds.length}</div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>BOARDS</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>
                                                                {previews.filter(p => selectedSheetIds.includes(p.id)).reduce((acc, p) => acc + p.groups.length, 0)}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>GROUPS</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>
                                                                {previews.filter(p => selectedSheetIds.includes(p.id)).reduce((acc, p) => acc + p.groups.reduce((a: number, g: any) => a + g.items.length, 0), 0)}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>ITEMS</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#f8fafc' }}>
                            <button 
                                onClick={onClose}
                                disabled={isImporting}
                                style={{ padding: '10px 20px', borderRadius: '0px', border: '1px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleImport}
                                disabled={selectedSheetIds.length === 0 || isImporting}
                                style={{ 
                                    padding: '10px 28px', borderRadius: '0px', border: 'none', 
                                    background: selectedSheetIds.length > 0 ? '#1a1728' : '#94a3b8', 
                                    color: 'white', fontSize: '14px', fontWeight: 700, 
                                    cursor: selectedSheetIds.length > 0 ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', gap: '10px'
                                }}
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={18} /> : <Layers size={18} />}
                                {isImporting ? `Importing ${selectedSheetIds.length} Boards...` : `Import ${selectedSheetIds.length} Boards`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
