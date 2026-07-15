/**
 * Configuration for a single tab within a content type
 */
export interface TabConfig {
  /** Unique identifier for the tab */
  id: string;
  /** Display name of the tab */
  name: string;
  /** Array of field IDs to display in this tab */
  fieldIds: string[];
  /** Sort order of the tab (lower = first) */
  order: number;
}

/**
 * Configuration for a single column in column layout
 */
export interface ColumnConfig {
  /** Unique identifier for the column */
  id: string;
  /** Display label for the column (e.g., "Column 1") */
  label: string;
  /** Array of field IDs to display in this column */
  fieldIds: string[];
}

/**
 * Layout type for the entry editor
 */
export type LayoutType = 'tabs' | 'columns';

/**
 * Display mode for the entry editor.
 * Compact/Verbose affect field density; Translation shows side-by-side locales.
 */
export type DisplayMode = 'compact' | 'verbose' | 'translation';

/**
 * Tab configuration for a specific content type
 */
export interface ContentTypeTabSettings {
  /** Whether Tabulizer is enabled for this content type */
  enabled: boolean;
  /** Layout type - tabs or columns */
  layoutType?: LayoutType;
  /** Array of tab configurations (used when layoutType is 'tabs') */
  tabs: TabConfig[];
  /** Array of column configurations (used when layoutType is 'columns') */
  columns?: ColumnConfig[];
}

/**
 * Root configuration structure stored in installation parameters
 * Maps content type IDs to their tab configurations
 */
export interface TabulizerConfig {
  [contentTypeId: string]: ContentTypeTabSettings;
}

/**
 * Installation parameters for the Tabulizer app
 */
export interface AppInstallationParameters {
  /** Tab configurations per content type */
  tabConfig?: TabulizerConfig;
}

/**
 * Represents a field with additional metadata for the UI
 */
export interface FieldWithMeta {
  /** Field ID */
  id: string;
  /** Field name (display name) */
  name: string;
  /** Field type (Symbol, Text, RichText, etc.) */
  type: string;
  /** Whether this field is required */
  required: boolean;
  /** Whether this field is localized */
  localized: boolean;
  /** Whether this field is disabled */
  disabled: boolean;
}

/**
 * Props for the TabBar component
 */
export interface TabBarProps {
  /** Array of tabs to display */
  tabs: TabConfig[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** Callback when a tab is selected */
  onTabSelect: (tabId: string) => void;
}

/**
 * Props for the TabPanel component
 */
export interface TabPanelProps {
  /** The tab configuration */
  tab: TabConfig;
  /** Whether this panel is currently visible */
  isActive: boolean;
  /** Child content to render */
  children: React.ReactNode;
}

/**
 * Default tab ID for unassigned fields
 */
export const OTHER_TAB_ID = '__other__';

/**
 * Creates an empty tab configuration for a content type
 */
export function createEmptyTabSettings(): ContentTypeTabSettings {
  return {
    enabled: false,
    tabs: [],
  };
}

/**
 * Generates a unique ID for a new tab
 */
export function generateTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generates a unique ID for a new column
 */
export function generateColumnId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates default columns for a content type
 */
export function createDefaultColumns(numColumns: number = 2): ColumnConfig[] {
  return Array.from({ length: numColumns }, (_, i) => ({
    id: generateColumnId(),
    label: `Column ${i + 1}`,
    fieldIds: [],
  }));
}
