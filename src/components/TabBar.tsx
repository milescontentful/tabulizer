import { Flex, Button } from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import type { TabConfig } from '../types';
import { OTHER_TAB_ID } from '../types';

interface TabBarProps {
  tabs: TabConfig[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect }: TabBarProps) {
  return (
    <Flex
      gap="spacing2Xs"
      alignItems="center"
      style={{
        paddingTop: '8px',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isOtherTab = tab.id === OTHER_TAB_ID;

        return (
          <Button
            key={tab.id}
            variant="transparent"
            size="small"
            onClick={() => onTabSelect(tab.id)}
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: isActive ? `2px solid ${tokens.blue600}` : '2px solid transparent',
              marginBottom: '-1px',
              paddingBottom: '10px',
              paddingTop: '10px',
              paddingLeft: '16px',
              paddingRight: '16px',
              color: isActive ? tokens.blue600 : isOtherTab ? tokens.gray500 : tokens.gray600,
              fontWeight: isActive ? 600 : 500,
              fontStyle: isOtherTab ? 'italic' : 'normal',
              background: isActive ? tokens.blue100 : 'transparent',
              transition: 'all 0.15s ease',
              fontSize: '14px',
            }}
          >
            {tab.name}
            {tab.fieldIds.length > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  fontSize: '12px',
                  color: isActive ? tokens.blue600 : tokens.gray500,
                  fontWeight: 400,
                  opacity: 0.8,
                }}
              >
                ({tab.fieldIds.length})
              </span>
            )}
          </Button>
        );
      })}
    </Flex>
  );
}

export default TabBar;
