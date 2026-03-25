
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
            console.error('Google API not loaded');
            return;
        }

        const showPicker = (token: string) => {
            // Ensure picker library is loaded via gapi
            gapi.load('picker', {
                callback: () => {
                    // Create a detailed DocsView to ensure access to all Drives
                    const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
                        .setIncludeFolders(true)
                        .setSelectFolderEnabled(false)
                        .setEnableTeamDrives(true) // Crucial for Shared/Team Drives
                        .setParent('root'); // Start from the root to show all sidebar options

                    // Another view specifically for Shared with me
                    const sharedWithMeView = new google.picker.DocsView(google.picker.ViewId.DOCS)
                        .setOwnedByMe(false)
                        .setTitle('Shared with me')
                        .setEnableTeamDrives(true);

                    const picker = new google.picker.PickerBuilder()
                        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                        .enableFeature(google.picker.Feature.SUPPORT_TEAM_DRIVES)
                        .enableFeature(google.picker.Feature.NAV_HIDDEN === undefined ? (google.picker.Feature as any).NAV_HIDDEN : (google.picker.Feature as any).NAV_HIDDEN) // Ensure nav is visible
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
                // If silent refresh failed, try with UI
                if (response.error === 'interaction_required' || response.error === 'consent_required') {
                    tokenClient.requestAccessToken({ prompt: '', hint: currentUser?.email });
                } else {
                    console.error('Google OAuth Error:', response);
                    // For other errors, we might still want to try with UI
                    tokenClient.requestAccessToken({ prompt: '', hint: currentUser?.email });
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
            hint: currentUser?.email, // Pre-select the account
            prompt: '', // Default behavior
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
            callback: handleTokenResponse,
            error_callback: (err: any) => {
                console.error('Google Auth Error:', err);
            }
        });

        if (accessToken) {
            // Ideally check if token is still valid, but for now just show picker
            showPicker(accessToken);
        } else {
            // Try to get token. Since we don't know for sure if it will prompt, 
            // we'll rely on the hint to make it easy.
            tokenClient.requestAccessToken({ prompt: '', hint: currentUser?.email });
        }
    }, [accessToken, currentUser?.email]);

    return { openPicker };
};
