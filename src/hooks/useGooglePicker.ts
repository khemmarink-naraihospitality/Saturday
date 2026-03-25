
import { useState, useCallback } from 'react';
import { useUserStore } from '../store/useUserStore';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface GooglePickerResult {
    id: string;
    name: string;
    url: string;
    iconUrl?: string;
    mimeType?: string;
}


let cachedAccessToken: string | null = null;

export const useGooglePicker = () => {
    const { currentUser } = useUserStore();
    const [accessToken, setAccessToken] = useState<string | null>(cachedAccessToken);

    const openPicker = useCallback((onSelect: (result: GooglePickerResult) => void) => {
        // @ts-ignore
        const gapi = window.gapi;
        // @ts-ignore
        const google = window.google;

        if (!gapi || !google) {
            console.error('Google API or GIS not loaded');
            alert('Google library not loaded. Please ensure you have a stable internet connection and turn off any ad-blockers.');
            return;
        }

        if (!GOOGLE_CLIENT_ID) {
            console.error('VITE_GOOGLE_CLIENT_ID is missing');
            alert('Config Error: VITE_GOOGLE_CLIENT_ID is missing.');
            return;
        }

        const showPicker = (token: string) => {
            gapi.load('picker', {
                callback: () => {
                    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
                        .setIncludeFolders(true)
                        .setSelectFolderEnabled(false)
                        .setEnableTeamDrives(true)
                        .setParent('root');

                    const sharedWithMeView = new google.picker.DocsView(google.picker.ViewId.DOCS)
                        .setOwnedByMe(false)
                        .setTitle('Shared with me')
                        .setEnableTeamDrives(true);

                    const picker = new google.picker.PickerBuilder()
                        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                        .enableFeature(google.picker.Feature.SUPPORT_TEAM_DRIVES)
                        .addView(docsView)
                        .addView(sharedWithMeView)
                        .addView(google.picker.ViewId.RECENTLY_PICKED)
                        .setOAuthToken(token)
                        .setDeveloperKey(GOOGLE_API_KEY)
                        .setCallback((data: any) => {
                            if (data.action === google.picker.Action.PICKED) {
                                const doc = data.docs[0];
                                onSelect({
                                    id: doc.id,
                                    name: doc.name,
                                    url: doc.url,
                                    iconUrl: doc.iconUrl,
                                    mimeType: doc.mimeType
                                });
                            }
                        })
                        .build();
                    picker.setVisible(true);
                }
            });
        };

        const handleTokenResponse = (response: any) => {
            if (response.error) {
                console.error('Google OAuth Error:', response);
                if (response.error === 'popup_blocked_by_browser') {
                    alert('Google login popup was blocked by your browser. Please allow popups for this site.');
                } else if (response.error === 'redirect_uri_mismatch') {
                    alert('Google Error: redirect_uri_mismatch. Please check the Redirect URIs in your Google Cloud Console.');
                } else if (response.error !== 'interaction_required' && response.error !== 'consent_required') {
                    alert(`Google Access Error: ${response.error_description || response.error}`);
                }
                return;
            }
            if (response.access_token) {
                cachedAccessToken = response.access_token;
                setAccessToken(response.access_token);
                showPicker(response.access_token);
            }
        };

        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            hint: currentUser?.email, 
            prompt: '', 
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
            callback: handleTokenResponse,
            error_callback: (err: any) => {
                console.error('Google Auth Error:', err);
                if (err.type === 'popup_failed_to_open') {
                    alert('Could not open the login popup. Please click again and avoid moving your mouse away immediately.');
                }
            }
        });

        if (accessToken) {
            showPicker(accessToken);
        } else {
            // This MUST be called directly in the user click handler's execution path
            tokenClient.requestAccessToken({ prompt: '', hint: currentUser?.email });
        }
    }, [accessToken, currentUser?.email]);

    return { openPicker };
};
