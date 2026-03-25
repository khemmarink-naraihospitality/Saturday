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
                // Initialize default DocsView correctly
                const docsView = new google.picker.DocsView();
                docsView.setIncludeFolders(true);
                docsView.setSelectFolderEnabled(false);
                docsView.setEnableTeamDrives(true);
                docsView.setParent('root');

                // Initialize Shared with me view correctly
                const sharedWithMeView = new google.picker.DocsView();
                sharedWithMeView.setOwnedByMe(false);
                sharedWithMeView.setEnableTeamDrives(true);

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
                }
            },
        });
    }, [currentUser?.email, showPicker]);

    const openPicker = useCallback((onSelect: (result: GooglePickerResult) => void) => {
        onSelectRef.current = onSelect;

        if (accessToken) {
            showPicker(accessToken);
        } else if (tokenClientRef.current) {
            tokenClientRef.current.requestAccessToken({ prompt: '', hint: currentUser?.email });
        } else {
            alert('Google initialization in progress. Please wait a second and try again.');
        }
    }, [accessToken, currentUser?.email, showPicker]);

    return { openPicker };
};
