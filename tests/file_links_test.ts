/**
 * Manual verification for src/lib/fileLinks.ts — which links count as Google
 * Drive, OneDrive / SharePoint or other, and the name a link gets.
 * Run with:  npx tsx tests/file_links_test.ts
 */
import { driveSourcesFor, fileLinkFromUrl, fileTypeForUrl, getOneDriveFileName, isOneDriveUrl, ONEDRIVE_ICON } from '../src/lib/fileLinks';

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) passed++;
    else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
    check(name, JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);

// isOneDriveUrl
check('1drv.ms short link', isOneDriveUrl('https://1drv.ms/x/s!AbCdEf'));
check('onedrive.live.com', isOneDriveUrl('https://onedrive.live.com/?id=ABC&cid=1'));
check('company SharePoint', isOneDriveUrl('https://lubd.sharepoint.com/sites/IT/Shared%20Documents/a.docx'));
check('OneDrive for Business (-my)', isOneDriveUrl('https://lubd-my.sharepoint.com/:w:/g/personal/khemmarin_k_lubd_com/EaBc'));
check('without a scheme', isOneDriveUrl('lubd.sharepoint.com/sites/IT'));
check('www host is not a OneDrive host', !isOneDriveUrl('https://www.example.com/sharepoint.com'));
check('lookalike host is refused', !isOneDriveUrl('https://evilsharepoint.com/x') && !isOneDriveUrl('https://sharepoint.com.evil.io/x'));
check('google link is not', !isOneDriveUrl('https://drive.google.com/file/d/1/view'));
check('empty / junk', !isOneDriveUrl('') && !isOneDriveUrl('not a url at all'));

// fileTypeForUrl
eq('type: onedrive', fileTypeForUrl('https://1drv.ms/x/s!A'), 'onedrive');
eq('type: google drive', fileTypeForUrl('https://docs.google.com/document/d/1/edit'), 'google-drive');
eq('type: other', fileTypeForUrl('https://example.com/file.pdf'), 'file-url');

// names
eq('name from a SharePoint path', getOneDriveFileName('https://lubd.sharepoint.com/sites/IT/Shared%20Documents/Budget%202026.xlsx?web=1'), 'Budget 2026.xlsx');
eq('name from the id= of a my-link', getOneDriveFileName('https://lubd-my.sharepoint.com/personal/k/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Fk%2FDocuments%2FPlan.pptx&parent=x'), 'Plan.pptx');
eq('a share link with no file name', getOneDriveFileName('https://1drv.ms/x/s!AbCdEf'), 'OneDrive file');
eq('name from a folder link falls back', getOneDriveFileName('https://lubd.sharepoint.com/sites/IT/Shared%20Documents'), 'OneDrive file');

// fileLinkFromUrl
let n = 0;
const id = () => `id${++n}`;
eq('a OneDrive link, named by us', fileLinkFromUrl('1drv.ms/x/s!A', '', id), { id: 'id1', name: 'OneDrive file', url: 'https://1drv.ms/x/s!A', type: 'onedrive' });
eq('a name given wins', fileLinkFromUrl('https://1drv.ms/x/s!A', '  Q3 deck ', id)?.name, 'Q3 deck');
eq('a Google Doc keeps its name rule', fileLinkFromUrl('https://docs.google.com/spreadsheets/d/1/edit', '', id)?.name, 'Google Sheet');
eq('another site: last path segment', fileLinkFromUrl('https://example.com/a/b/report.pdf?x=1', '', id)?.name, 'report.pdf');
eq('nothing typed', fileLinkFromUrl('   ', 'x', id), null);
check('the icon is an inline image', ONEDRIVE_ICON.startsWith('data:image/svg+xml'));

// driveSourcesFor: what to offer by how the person signed in
eq('google sign-in: Google Drive only', driveSourcesFor({ app_metadata: { provider: 'google' }, identities: [{ provider: 'google', last_sign_in_at: '2026-10-19T01:00:00Z' }] }), { google: true, onedrive: false });
eq('microsoft sign-in: OneDrive only', driveSourcesFor({ app_metadata: { provider: 'azure' }, identities: [{ provider: 'azure', last_sign_in_at: '2026-10-19T01:00:00Z' }] }), { google: false, onedrive: true });
eq('email account: both', driveSourcesFor({ app_metadata: { provider: 'email' }, identities: [{ provider: 'email', last_sign_in_at: '2026-10-19T01:00:00Z' }] }), { google: true, onedrive: true });
eq('has both identities: the one used last wins', driveSourcesFor({ app_metadata: { provider: 'google' }, identities: [
    { provider: 'google', last_sign_in_at: '2026-10-01T00:00:00Z' }, { provider: 'azure', last_sign_in_at: '2026-10-19T00:00:00Z' }] }), { google: false, onedrive: true });
eq('no identities listed: the first provider', driveSourcesFor({ app_metadata: { provider: 'azure' } }), { google: false, onedrive: true });
eq('nobody signed in yet: both', driveSourcesFor(null), { google: true, onedrive: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
