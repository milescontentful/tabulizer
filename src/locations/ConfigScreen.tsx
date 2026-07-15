import { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import {
  Box,
  Flex,
  Heading,
  Paragraph,
  Note,
  Spinner,
  Select,
} from '@contentful/f36-components';
import type { ContentTypeProps } from 'contentful-management';
import { ContentTypeConfig } from '../components/ContentTypeConfig';
import type {
  TabulizerConfig,
  ContentTypeTabSettings,
  FieldWithMeta,
  AppInstallationParameters,
} from '../types';
import { createEmptyTabSettings } from '../types';

function ConfigScreen() {
  const sdk = useSDK<ConfigAppSDK>();
  const [config, setConfig] = useState<TabulizerConfig>({});
  const [contentTypes, setContentTypes] = useState<ContentTypeProps[]>([]);
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        // Get current parameters
        const params = await sdk.app.getParameters<AppInstallationParameters>();
        setConfig(params?.tabConfig ?? {});

        // Get all content types and sort alphabetically
        const response = await sdk.cma.contentType.getMany({
          spaceId: sdk.ids.space,
          environmentId: sdk.ids.environment,
        });
        const sortedContentTypes = [...response.items].sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        setContentTypes(sortedContentTypes);

        if (sortedContentTypes.length > 0) {
          setSelectedContentTypeId(sortedContentTypes[0].sys.id);
        }
      } catch {
        sdk.notifier.error('Failed to load content types. Try reloading the page.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [sdk]);

  // Register the onConfigure handler
  useEffect(() => {
    sdk.app.onConfigure(() => {
      return {
        parameters: {
          tabConfig: config,
        } as AppInstallationParameters,
        targetState: {
          EditorInterface: generateEditorInterfaceTargetState(),
        },
      };
    });
  }, [sdk.app, config, contentTypes]);

  // Generate editor interface target state to enable entry-editor for configured content types
  const generateEditorInterfaceTargetState = useCallback(() => {
    const editorInterface: Record<string, { editors?: { position: number } }> = {};

    for (const ct of contentTypes) {
      const settings = config[ct.sys.id];
      if (settings?.enabled) {
        editorInterface[ct.sys.id] = {
          // Position 1 = second tab, after the default Editor. Live Preview only
          // works from the native editor, so it stays primary: Editor - Tabulizer - ...
          // Users can reorder per content type under Content model - Entry editors.
          editors: { position: 1 },
        };
      }
    }

    return editorInterface;
  }, [config, contentTypes]);

  // Mark app as ready
  useEffect(() => {
    sdk.app.setReady();
  }, [sdk.app]);

  const handleSettingsChange = useCallback(
    (contentTypeId: string, settings: ContentTypeTabSettings) => {
      setConfig((prev) => ({
        ...prev,
        [contentTypeId]: settings,
      }));
    },
    []
  );

  const selectedContentType = contentTypes.find(
    (ct) => ct.sys.id === selectedContentTypeId
  );

  const getFieldsForContentType = useCallback(
    (contentType: ContentTypeProps): FieldWithMeta[] => {
      return contentType.fields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        required: field.required ?? false,
        localized: field.localized ?? false,
        disabled: field.disabled ?? false,
      }));
    },
    []
  );

  if (isLoading) {
    return (
      <Flex
        justifyContent="center"
        alignItems="center"
        style={{ height: '100vh' }}
      >
        <Spinner size="large" />
      </Flex>
    );
  }

  return (
    <Box padding="spacingL" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Flex flexDirection="column" gap="spacingL">
        <Box>
          <Heading as="h1" marginBottom="spacingS">
            Tabulizer Configuration
          </Heading>
          <Paragraph>
            Configure custom tabs for your content types. When enabled, the entry
            editor will display fields organized into the tabs you define.
          </Paragraph>
        </Box>

        <Note variant="primary">
          Select a content type below to configure its tabs. You can enable
          Tabulizer for specific content types and define which fields appear
          in each tab.
        </Note>

        {contentTypes.length === 0 ? (
          <Note variant="warning">
            No content types found in this environment.
          </Note>
        ) : (
          <>
            <Box>
              <Select
                id="content-type-select"
                name="content-type-select"
                value={selectedContentTypeId}
                onChange={(e) => setSelectedContentTypeId(e.target.value)}
              >
                {contentTypes.map((ct) => (
                  <Select.Option key={ct.sys.id} value={ct.sys.id}>
                    {ct.name} {config[ct.sys.id]?.enabled ? '✓' : ''}
                  </Select.Option>
                ))}
              </Select>
            </Box>

            {selectedContentType && (
              <ContentTypeConfig
                contentTypeName={selectedContentType.name}
                contentTypeId={selectedContentType.sys.id}
                fields={getFieldsForContentType(selectedContentType)}
                settings={
                  config[selectedContentType.sys.id] ?? createEmptyTabSettings()
                }
                onSettingsChange={(settings) =>
                  handleSettingsChange(selectedContentType.sys.id, settings)
                }
              />
            )}
          </>
        )}

        <Note variant="neutral">
          After configuring tabs, click <strong>Install</strong> or{' '}
          <strong>Save</strong> in the top-right corner to apply your changes.
          Tabulizer is added as the <strong>second</strong> editor tab (Editor
          · Tabulizer · …) so Live Preview keeps working from the default
          Editor. To reorder, edit the content type under{' '}
          <strong>Content model → Entry editors</strong>.
        </Note>
      </Flex>
    </Box>
  );
}

export default ConfigScreen;
