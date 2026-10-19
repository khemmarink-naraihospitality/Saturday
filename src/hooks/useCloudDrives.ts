import { useAuth } from '../contexts/AuthContext';
import { driveSourcesFor } from '../lib/fileLinks';

/** Which cloud-file sources to offer this person — see driveSourcesFor. */
export const useCloudDrives = () => {
    const { user } = useAuth();
    return driveSourcesFor(user);
};
