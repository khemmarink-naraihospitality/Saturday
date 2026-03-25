
import { useState, useCallback } from 'react';

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
                    const picker = new google.picker.PickerBuilder()
                        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                        .enableFeature(google.picker.Feature.SUPPORT_TEAM_DRIVES)
                        .addView(google.picker.ViewId.DOCS)
                        .addView(new google.picker.DocsView().setOwnedByMe(false).setTitle('Shared with me'))
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

        if (accessToken) {
            showPicker(accessToken);
        } else {
            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                prompt: '', // Changed from 'select_account' to avoid constant prompting
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
                callback: (response: any) => {
                    if (response.error) {
                        console.error('Google OAuth Error:', response);
                        alert(`Google Access Error: ${response.error_description || response.error}`);
                        return;
                    }
                    if (response.access_token) {
                        cachedAccessToken = response.access_token;
                        setAccessToken(response.access_token);
                        showPicker(response.access_token);
                    }
                },
                error_callback: (err: any) => {
                    console.error('Google Auth Error:', err);
                    alert('Could not authenticate with Google. Please check if your popup is blocked.');
                }
            });
            tokenClient.requestAccessToken({ prompt: '' });
        }
    }, [accessToken]);

    return { openPicker };
};
