import { Box } from '@contentful/f36-components';
import type { TabConfig } from '../types';

interface TabPanelProps {
  tab: TabConfig;
  isActive: boolean;
  children: React.ReactNode;
}

export function TabPanel({ tab, isActive, children }: TabPanelProps) {
  if (!isActive) {
    return null;
  }

  return (
    <Box
      role="tabpanel"
      aria-labelledby={`tab-${tab.id}`}
      id={`tabpanel-${tab.id}`}
      style={{
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
      {children}
    </Box>
  );
}

export default TabPanel;
