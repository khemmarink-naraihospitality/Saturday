import { useState, useCallback, useEffect, useRef } from 'react';
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
    const tokenClientRef = useRef<any>(null);
    const onSelectRef = useRef<((result: GooglePickerResult) => void) | null>(null);

    const showPicker = useCallback((token: string) => {
        // @ts-ignore
        const gapi = window.gapi;
        // @ts-ignore
        const google = window.google;

        if (!gapi || !google) return;

        gapi.load('picker', {
            callback: () => {
                // 1. My Drive (Standard Docs View)
                const myDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
                    .setIncludeFolders(true)
                    .setSelectFolderEnabled(false)
                    .setParent('root');

                // 2. Shared with me
                const sharedWithMeView = new google.picker.DocsView()
                    .setOwnedByMe(false)
                    .setIncludeFolders(true)
                    .setLabel('Shared with me');

                // 3. Shared drives (Team Drives)
                const sharedDrivesView = new google.picker.DocsView()
                    .setEnableTeamDrives(true)
                    .setIncludeFolders(true)
                    .setLabel('Shared drives');

                const picker = new google.picker.PickerBuilder()
                    .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                    .enableFeature(google.picker.Feature.SUPPORT_TEAM_DRIVES)
                    .addView(myDriveView)
                    .addView(sharedWithMeView)
                    .addView(sharedDrivesView)
                    .addView(google.picker.ViewId.RECENTLY_PICKED)
                    .setOAuthToken(token)
                    .setDeveloperKey(GOOGLE_API_KEY)
                    .setCallback((data: any) => {
                        if (data.action === google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            if (onSelectRef.current) {
                                onSelectRef.current({
                                    id: doc.id,
                                    name: doc.name,
                                    url: doc.url,
                                    iconUrl: doc.iconUrl,
                                    mimeType: doc.mimeType
                                });
                            }
                        }
                    })
                    .build();
                picker.setVisible(true);
            }
        });
    }, []);

    useEffect(() => {
        // @ts-ignore
        const google = window.google;
        if (!google || !google.accounts || !GOOGLE_CLIENT_ID) return;

        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
            hint: currentUser?.email,
            callback: (response: any) => {
                if (response.access_token) {
                    cachedAccessToken = response.access_token;
                    setAccessToken(response.access_token);
                    showPicker(response.access_token);
                } else if (response.error) {
                    console.error('Google OAuth Error:', response);
                    alert(`Failed to connect to Google Drive: ${response.error_description || response.error}. Please check if pop-ups are allowed.`);
                }
            },
        });
    }, [currentUser?.email, showPicker]);

    const openPicker = useCallback((onSelect: (result: GooglePickerResult) => void) => {
        onSelectRef.current = onSelect;

        if (accessToken) {
            showPicker(accessToken);
        } else if (tokenClientRef.current) {
            // Use select_account if no token to ensure user can pick the right account
            tokenClientRef.current.requestAccessToken({ prompt: 'select_account', hint: currentUser?.email });
        } else {
            alert('Google initialization in progress. Please wait a second and try again.');
        }
    }, [accessToken, currentUser?.email, showPicker]);

    return { openPicker };
};
