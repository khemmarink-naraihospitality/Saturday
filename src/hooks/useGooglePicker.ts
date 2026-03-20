
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

export const useGooglePicker = () => {
    const [accessToken, setAccessToken] = useState<string | null>(null);

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
                        .addView(google.picker.ViewId.DOCS)
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
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
                callback: (response: any) => {
                    if (response.access_token) {
                        setAccessToken(response.access_token);
                        showPicker(response.access_token);
                    }
                },
            });
            tokenClient.requestAccessToken();
        }
    }, [accessToken]);

    return { openPicker };
};
