import { locations } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useMemo } from 'react';
import ConfigScreen from './locations/ConfigScreen';
import EntryEditor from './locations/EntryEditor';

const ComponentLocationSettings = {
  [locations.LOCATION_APP_CONFIG]: ConfigScreen,
  [locations.LOCATION_ENTRY_EDITOR]: EntryEditor,
};

function App() {
  const sdk = useSDK();

  const Component = useMemo(() => {
    for (const [location, component] of Object.entries(
      ComponentLocationSettings
    )) {
      if (sdk.location.is(location)) {
        return component;
      }
    }
    return null;
  }, [sdk.location]);

  if (!Component) {
    return (
      <div style={{ padding: '20px' }}>
        <p>This app location is not supported. Tabulizer runs in the Entry editor and App configuration locations.</p>
      </div>
    );
  }

  return <Component />;
}

export default App;
