import { useMemo } from 'react';
import type { EditorAppSDK } from '@contentful/app-sdk';
import type {
  ContentTypeTabSettings,
  TabConfig,
  ColumnConfig,
  AppInstallationParameters,
  LayoutType,
} from '../types';
import { createEmptyTabSettings, OTHER_TAB_ID } from '../types';

/**
 * Hook for reading tab configuration in the Entry Editor
 */
export function useTabConfigReader(sdk: EditorAppSDK) {
  const contentTypeId = sdk.contentType.sys.id;
  const parameters = sdk.parameters.installation as AppInstallationParameters;
  const tabConfig = parameters?.tabConfig;

  const settings = useMemo<ContentTypeTabSettings>(() => {
    if (!tabConfig || !tabConfig[contentTypeId]) {
      return createEmptyTabSettings();
    }
    return tabConfig[contentTypeId];
  }, [tabConfig, contentTypeId]);

  const isEnabled = settings.enabled;
  const layoutType: LayoutType = settings.layoutType ?? 'tabs';

  const tabs = useMemo<TabConfig[]>(() => {
    if (!isEnabled || settings.tabs.length === 0) {
      // Return a default tab with all fields
      const allFieldIds = sdk.contentType.fields.map((f) => f.id);
      return [
        {
          id: 'content',
          name: 'Content',
          fieldIds: allFieldIds,
          order: 0,
        },
      ];
    }
    return [...settings.tabs].sort((a, b) => a.order - b.order);
  }, [isEnabled, settings.tabs, sdk.contentType.fields]);

  // Get fields that aren't assigned to any tab
  const unassignedFieldIds = useMemo(() => {
    if (!isEnabled) return [];
    const assignedIds = new Set(settings.tabs.flatMap((t) => t.fieldIds));
    return sdk.contentType.fields
      .map((f) => f.id)
      .filter((id) => !assignedIds.has(id));
  }, [isEnabled, settings.tabs, sdk.contentType.fields]);

  // Include an "Other" tab if there are unassigned fields
  const allTabs = useMemo<TabConfig[]>(() => {
    if (unassignedFieldIds.length === 0) {
      return tabs;
    }
    return [
      ...tabs,
      {
        id: OTHER_TAB_ID,
        name: 'Other',
        fieldIds: unassignedFieldIds,
        order: 999,
      },
    ];
  }, [tabs, unassignedFieldIds]);

  // Get columns with fallback
  const columns = useMemo<ColumnConfig[]>(() => {
    if (!isEnabled || layoutType !== 'columns') {
      return [];
    }
    const configuredColumns = settings.columns ?? [];
    if (configuredColumns.length === 0) {
      // Return a default 2-column layout with all fields split
      const allFieldIds = sdk.contentType.fields.map((f) => f.id);
      const midpoint = Math.ceil(allFieldIds.length / 2);
      return [
        {
          id: 'col1',
          label: 'Column 1',
          fieldIds: allFieldIds.slice(0, midpoint),
        },
        {
          id: 'col2',
          label: 'Column 2',
          fieldIds: allFieldIds.slice(midpoint),
        },
      ];
    }
    return configuredColumns;
  }, [isEnabled, layoutType, settings.columns, sdk.contentType.fields]);

  // Get fields that aren't assigned to any column
  const unassignedColumnFieldIds = useMemo(() => {
    if (!isEnabled || layoutType !== 'columns') return [];
    const assignedIds = new Set(columns.flatMap((c) => c.fieldIds));
    return sdk.contentType.fields
      .map((f) => f.id)
      .filter((id) => !assignedIds.has(id));
  }, [isEnabled, layoutType, columns, sdk.contentType.fields]);

  // Add unassigned fields to the last column if any
  const allColumns = useMemo<ColumnConfig[]>(() => {
    if (unassignedColumnFieldIds.length === 0 || columns.length === 0) {
      return columns;
    }
    // Add unassigned to the last column
    const lastIdx = columns.length - 1;
    return columns.map((col, idx) =>
      idx === lastIdx
        ? { ...col, fieldIds: [...col.fieldIds, ...unassignedColumnFieldIds] }
        : col
    );
  }, [columns, unassignedColumnFieldIds]);

  return {
    isEnabled,
    layoutType,
    tabs: allTabs,
    columns: allColumns,
    settings,
    contentTypeId,
  };
}
