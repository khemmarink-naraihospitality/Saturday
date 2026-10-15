import { greetingFor } from '../ui';

/** Home — reference: screenshots 15 and 16. Owned by the "screens" agent. */
export const HomeScreen = () => (
    <div className="m-screen" data-testid="m-home">
        <div className="m-scroll m-scroll--tabbar" style={{ padding: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>{greetingFor()}</h1>
        </div>
    </div>
);
