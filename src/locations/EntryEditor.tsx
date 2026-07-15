import { useState, useMemo, useCallback, useEffect } from 'react';
import { EditorAppSDK, EditorLocaleSettings } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Menu,
  Text,
  Tooltip,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import {
  ChevronDownIcon,
  CycleIcon,
  LanguageIcon,
  ListBulletedIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
} from '@contentful/f36-icons';
import { TabBar } from '../components/TabBar';
import { TabPanel } from '../components/TabPanel';
import { FieldRenderer } from '../components/FieldRenderer';
import { TranslationView } from '../components/TranslationView';
import { useTabConfigReader } from '../hooks/useTabConfig';
import type { DisplayMode, LayoutType } from '../types';

const DISPLAY_MODE_ICONS = {
  compact: MenuIcon,
  verbose: ListBulletedIcon,
  translation: LanguageIcon,
} as const;

const DISPLAY_MODE_LABELS = {
  compact: 'Compact',
  verbose: 'Verbose',
  translation: 'Translation',
} as const;

function EntryEditor() {
  const sdk = useSDK<EditorAppSDK>();
  const { tabs, columns, layoutType: configuredLayout } = useTabConfigReader(sdk);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? '');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('compact');
  // Active layout defaults to configured layout but can be toggled by user
  const [activeLayout, setActiveLayout] = useState<LayoutType>(configuredLayout);

  // Check if both layouts have content (to show toggle)
  const hasTabs = tabs.length > 0;
  const hasColumns = columns.length > 0;

  // Only show Translation mode if multiple locales are available
  const showTranslationMode = sdk.locales.available.length > 1;

  // Track the current locale settings from the sidebar
  const [localeSettings, setLocaleSettings] = useState<EditorLocaleSettings>(
    () => sdk.editor.getLocaleSettings()
  );

  // Force refresh counter - remounts the content area when locales are manually refreshed
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscribe to locale settings changes from the sidebar
  useEffect(() => {
    const unsubscribe = sdk.editor.onLocaleSettingsChanged((settings) => {
      setLocaleSettings(settings);
    });
    return () => unsubscribe();
  }, [sdk.editor]);

  // Manual escape hatch if the locale subscription misses a change
  const handleRefresh = useCallback(() => {
    setLocaleSettings(sdk.editor.getLocaleSettings());
    setRefreshKey((k) => k + 1);
  }, [sdk.editor]);

  // Get all active locales from the sidebar settings
  // Always put the default (source) locale first for translation workflow
  const activeLocales = useMemo(() => {
    if (localeSettings.active && localeSettings.active.length > 0) {
      const locales = [...localeSettings.active];
      // Sort so default locale is always first (source on left, target on right)
      locales.sort((a, b) => {
        if (a === sdk.locales.default) return -1;
        if (b === sdk.locales.default) return 1;
        return 0;
      });
      return locales;
    }
    return [sdk.locales.default];
  }, [localeSettings.active, sdk.locales.default]);

  // Build a set of valid field IDs for quick lookup
  const validFieldIds = useMemo(() => {
    return new Set(sdk.contentType.fields.map((f) => f.id));
  }, [sdk.contentType.fields]);

  // Ensure we have a valid active tab
  const currentActiveTabId = tabs.find((t) => t.id === activeTabId)
    ? activeTabId
    : tabs[0]?.id ?? '';

  // Open app config to add/edit tabs
  const handleOpenConfig = useCallback(() => {
    sdk.navigator.openAppConfig();
  }, [sdk.navigator]);

  const DisplayModeIcon = DISPLAY_MODE_ICONS[displayMode];

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.colorWhite,
      }}
    >
      {/* Top Tab Bar */}
      <Flex
        alignItems="center"
        justifyContent="space-between"
        style={{
          borderBottom: `1px solid ${tokens.gray300}`,
          backgroundColor: tokens.colorWhite,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: `0 ${tokens.spacingM}`,
        }}
      >
        <Flex alignItems="center">
          {displayMode === 'translation' ? (
            // Tabs/columns don't apply in Translation mode - show a clear label instead
            <Flex alignItems="center" gap="spacingXs" style={{ padding: `${tokens.spacingXs} 0` }}>
              <LanguageIcon size="small" style={{ color: tokens.blue600 }} />
              <Text fontWeight="fontWeightMedium">Translation</Text>
              <Text fontSize="fontSizeS" fontColor="gray500">
                All localized fields, Content Model order
              </Text>
            </Flex>
          ) : activeLayout === 'tabs' ? (
            <>
              <TabBar
                tabs={tabs}
                activeTabId={currentActiveTabId}
                onTabSelect={setActiveTabId}
              />
              <Tooltip content="Add or edit tabs in App Settings" placement="bottom">
                <IconButton
                  variant="transparent"
                  size="small"
                  aria-label="Add new tab"
                  icon={<PlusIcon />}
                  onClick={handleOpenConfig}
                  style={{ marginLeft: '4px', color: tokens.gray500 }}
                />
              </Tooltip>
            </>
          ) : (
            <Flex alignItems="center" style={{ padding: `${tokens.spacingXs} 0` }}>
              <Text fontWeight="fontWeightMedium">{columns.length} Column Layout</Text>
            </Flex>
          )}
        </Flex>

        <Flex alignItems="center" gap="spacingXs" style={{ padding: `${tokens.spacingXs} 0` }}>
          {/* Display Mode Toggle */}
          <Menu>
            <Menu.Trigger>
              <Button
                size="small"
                variant="secondary"
                startIcon={<DisplayModeIcon />}
                endIcon={<ChevronDownIcon />}
              >
                {DISPLAY_MODE_LABELS[displayMode]}
              </Button>
            </Menu.Trigger>
            <Menu.List>
              {(['compact', 'verbose', ...(showTranslationMode ? ['translation'] : [])] as DisplayMode[]).map(
                (mode) => {
                  const Icon = DISPLAY_MODE_ICONS[mode];
                  return (
                    <Menu.Item
                      key={mode}
                      onClick={() => setDisplayMode(mode)}
                      isActive={displayMode === mode}
                    >
                      <Flex alignItems="center" gap="spacingXs">
                        <Icon size="tiny" />
                        {DISPLAY_MODE_LABELS[mode]}
                      </Flex>
                    </Menu.Item>
                  );
                }
              )}
            </Menu.List>
          </Menu>

          {/* Layout Toggle - only when both layouts are configured and not in translation mode */}
          {hasTabs && hasColumns && displayMode !== 'translation' && (
            <Menu>
              <Menu.Trigger>
                <Button
                  size="small"
                  variant="secondary"
                  startIcon={activeLayout === 'tabs' ? <MenuIcon /> : <TableIcon />}
                  endIcon={<ChevronDownIcon />}
                >
                  {activeLayout === 'tabs' ? 'Tabs' : 'Columns'}
                </Button>
              </Menu.Trigger>
              <Menu.List>
                <Menu.Item onClick={() => setActiveLayout('tabs')} isActive={activeLayout === 'tabs'}>
                  <Flex alignItems="center" gap="spacingXs">
                    <MenuIcon size="tiny" />
                    Tabs
                  </Flex>
                </Menu.Item>
                <Menu.Item
                  onClick={() => setActiveLayout('columns')}
                  isActive={activeLayout === 'columns'}
                >
                  <Flex alignItems="center" gap="spacingXs">
                    <TableIcon size="tiny" />
                    Columns
                  </Flex>
                </Menu.Item>
              </Menu.List>
            </Menu>
          )}

          {/* Refresh Button */}
          <Tooltip content="Refresh locales" placement="bottom">
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Refresh"
              icon={<CycleIcon />}
              onClick={handleRefresh}
              style={{ color: tokens.gray500 }}
            />
          </Tooltip>

          {/* Settings Button */}
          <Tooltip content="Configure layout" placement="bottom">
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Tab settings"
              icon={<SettingsIcon />}
              onClick={handleOpenConfig}
              style={{ color: tokens.gray500 }}
            />
          </Tooltip>
        </Flex>
      </Flex>

      {/* Content Area */}
      <Box
        key={refreshKey}
        padding="spacingL"
        style={{ maxWidth: displayMode === 'translation' ? '100%' : '1400px', margin: '0 auto' }}
      >
        {/* Translation Mode - Always uses Content Model order, ignoring tab/column config */}
        {displayMode === 'translation' ? (
          <TranslationView
            locales={activeLocales}
            defaultLocale={sdk.locales.default}
            sdk={sdk}
          />
        ) : !hasTabs && !hasColumns ? (
          // No configuration - show helpful empty state
          <Box
            padding="spacingXl"
            style={{
              textAlign: 'center',
              color: tokens.gray500,
              border: `2px dashed ${tokens.gray300}`,
              borderRadius: tokens.borderRadiusMedium,
              background: tokens.gray100,
            }}
          >
            <Text as="div" fontWeight="fontWeightMedium" marginBottom="spacingM">
              No layout configured for this content type
            </Text>
            <Text as="div" marginBottom="spacingL">
              Click the <SettingsIcon size="tiny" style={{ verticalAlign: 'middle' }} /> settings
              button to create tabs or columns for organizing fields.
            </Text>
            <Button variant="primary" onClick={handleOpenConfig}>
              Configure Layout
            </Button>
          </Box>
        ) : activeLayout === 'tabs' ? (
          // Tabs Layout
          tabs.map((tab) => (
            <TabPanel key={tab.id} tab={tab} isActive={tab.id === currentActiveTabId}>
              <Flex flexDirection="column" gap="spacingL">
                {tab.fieldIds.length === 0 ? (
                  <Box
                    padding="spacingXl"
                    style={{
                      textAlign: 'center',
                      color: tokens.gray500,
                      border: `2px dashed ${tokens.gray300}`,
                      borderRadius: tokens.borderRadiusMedium,
                    }}
                  >
                    No fields in this tab. Click the{' '}
                    <SettingsIcon size="tiny" style={{ verticalAlign: 'middle' }} /> button to
                    configure fields.
                  </Box>
                ) : (
                  tab.fieldIds.map((fieldId) => {
                    if (!validFieldIds.has(fieldId)) return null;
                    return (
                      <FieldRenderer
                        key={fieldId}
                        fieldId={fieldId}
                        sdk={sdk}
                        locales={activeLocales}
                        defaultLocale={sdk.locales.default}
                        displayMode={displayMode}
                      />
                    );
                  })
                )}
              </Flex>
            </TabPanel>
          ))
        ) : (
          // Columns Layout
          <Flex gap="spacingL" style={{ alignItems: 'flex-start' }}>
            {columns.map((column) => (
              <Box key={column.id} style={{ flex: '1 1 0', minWidth: 0 }}>
                <Text
                  as="div"
                  fontWeight="fontWeightMedium"
                  fontSize="fontSizeS"
                  fontColor="gray500"
                  style={{
                    marginBottom: tokens.spacingS,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {column.label}
                </Text>
                <Flex flexDirection="column">
                  {column.fieldIds.length === 0 ? (
                    <Box
                      padding="spacingM"
                      style={{
                        textAlign: 'center',
                        color: tokens.gray500,
                        border: `2px dashed ${tokens.gray300}`,
                        borderRadius: tokens.borderRadiusMedium,
                      }}
                    >
                      No fields
                    </Box>
                  ) : (
                    column.fieldIds.map((fieldId) => {
                      if (!validFieldIds.has(fieldId)) return null;
                      return (
                        <FieldRenderer
                          key={fieldId}
                          fieldId={fieldId}
                          sdk={sdk}
                          locales={activeLocales}
                          defaultLocale={sdk.locales.default}
                          displayMode={displayMode}
                        />
                      );
                    })
                  )}
                </Flex>
              </Box>
            ))}
          </Flex>
        )}
      </Box>
    </Box>
  );
}

export default EntryEditor;
