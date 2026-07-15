import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Box,
  Card,
  Flex,
  Heading,
  Text,
  TextInput,
  Button,
  IconButton,
  Switch,
  Accordion,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { PlusIcon, DeleteIcon, EditIcon, DoneIcon } from '@contentful/f36-icons';
import { DraggableFieldItem } from './FieldList';
import type {
  ContentTypeTabSettings,
  TabConfig,
  ColumnConfig,
  FieldWithMeta,
  LayoutType,
} from '../types';
import { generateTabId, generateColumnId, createDefaultColumns } from '../types';

interface ContentTypeConfigProps {
  contentTypeName: string;
  contentTypeId: string;
  fields: FieldWithMeta[];
  settings: ContentTypeTabSettings;
  onSettingsChange: (settings: ContentTypeTabSettings) => void;
}

export function ContentTypeConfig({
  contentTypeName,
  contentTypeId,
  fields,
  settings,
  onSettingsChange,
}: ContentTypeConfigProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState('');

  const layoutType = settings.layoutType ?? 'tabs';
  const columns = settings.columns ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleToggleEnabled = useCallback(() => {
    onSettingsChange({
      ...settings,
      enabled: !settings.enabled,
    });
  }, [settings, onSettingsChange]);

  const handleLayoutTypeChange = useCallback(
    (newLayoutType: LayoutType) => {
      const updates: Partial<ContentTypeTabSettings> = {
        ...settings,
        layoutType: newLayoutType,
      };
      // Initialize columns if switching to columns and none exist
      if (newLayoutType === 'columns' && (!settings.columns || settings.columns.length === 0)) {
        updates.columns = createDefaultColumns(2);
      }
      onSettingsChange(updates as ContentTypeTabSettings);
    },
    [settings, onSettingsChange]
  );

  const handleAddTab = useCallback(() => {
    const newTab: TabConfig = {
      id: generateTabId(),
      name: `Tab ${settings.tabs.length + 1}`,
      fieldIds: [],
      order: settings.tabs.length,
    };
    onSettingsChange({
      ...settings,
      tabs: [...settings.tabs, newTab],
    });
  }, [settings, onSettingsChange]);

  // Column management functions
  const handleAddColumn = useCallback(() => {
    const newColumn: ColumnConfig = {
      id: generateColumnId(),
      label: `Column ${columns.length + 1}`,
      fieldIds: [],
    };
    onSettingsChange({
      ...settings,
      columns: [...columns, newColumn],
    });
  }, [settings, columns, onSettingsChange]);

  const handleRemoveColumn = useCallback(
    (columnId: string) => {
      onSettingsChange({
        ...settings,
        columns: columns.filter((c) => c.id !== columnId),
      });
    },
    [settings, columns, onSettingsChange]
  );

  const handleStartEditColumnLabel = useCallback((column: ColumnConfig) => {
    setEditingColumnId(column.id);
    setEditingColumnLabel(column.label);
  }, []);

  const handleSaveColumnLabel = useCallback(() => {
    if (editingColumnId && editingColumnLabel.trim()) {
      onSettingsChange({
        ...settings,
        columns: columns.map((c) =>
          c.id === editingColumnId ? { ...c, label: editingColumnLabel.trim() } : c
        ),
      });
    }
    setEditingColumnId(null);
    setEditingColumnLabel('');
  }, [editingColumnId, editingColumnLabel, settings, columns, onSettingsChange]);

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent, columnId: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const column = columns.find((c) => c.id === columnId);
      if (!column) return;

      const oldIndex = column.fieldIds.indexOf(active.id as string);
      const newIndex = column.fieldIds.indexOf(over.id as string);

      const newFieldIds = arrayMove(column.fieldIds, oldIndex, newIndex);

      onSettingsChange({
        ...settings,
        columns: columns.map((c) =>
          c.id === columnId ? { ...c, fieldIds: newFieldIds } : c
        ),
      });
    },
    [settings, columns, onSettingsChange]
  );

  const handleAddFieldToColumn = useCallback(
    (columnId: string, fieldId: string) => {
      // Remove from any existing column first
      const updatedColumns = columns.map((col) => ({
        ...col,
        fieldIds: col.fieldIds.filter((id) => id !== fieldId),
      }));

      // Add to target column
      onSettingsChange({
        ...settings,
        columns: updatedColumns.map((c) =>
          c.id === columnId ? { ...c, fieldIds: [...c.fieldIds, fieldId] } : c
        ),
      });
    },
    [settings, columns, onSettingsChange]
  );

  const handleRemoveFieldFromColumn = useCallback(
    (columnId: string, fieldId: string) => {
      onSettingsChange({
        ...settings,
        columns: columns.map((c) =>
          c.id === columnId
            ? { ...c, fieldIds: c.fieldIds.filter((id) => id !== fieldId) }
            : c
        ),
      });
    },
    [settings, columns, onSettingsChange]
  );

  const handleRemoveTab = useCallback(
    (tabId: string) => {
      onSettingsChange({
        ...settings,
        tabs: settings.tabs.filter((t) => t.id !== tabId),
      });
    },
    [settings, onSettingsChange]
  );

  const handleStartEditTabName = useCallback((tab: TabConfig) => {
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  }, []);

  const handleSaveTabName = useCallback(() => {
    if (editingTabId && editingTabName.trim()) {
      onSettingsChange({
        ...settings,
        tabs: settings.tabs.map((t) =>
          t.id === editingTabId ? { ...t, name: editingTabName.trim() } : t
        ),
      });
    }
    setEditingTabId(null);
    setEditingTabName('');
  }, [editingTabId, editingTabName, settings, onSettingsChange]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent, tabId: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const tab = settings.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const oldIndex = tab.fieldIds.indexOf(active.id as string);
      const newIndex = tab.fieldIds.indexOf(over.id as string);

      const newFieldIds = arrayMove(tab.fieldIds, oldIndex, newIndex);

      onSettingsChange({
        ...settings,
        tabs: settings.tabs.map((t) =>
          t.id === tabId ? { ...t, fieldIds: newFieldIds } : t
        ),
      });
    },
    [settings, onSettingsChange]
  );

  const handleAddFieldToTab = useCallback(
    (tabId: string, fieldId: string) => {
      // Remove from any existing tab first
      const updatedTabs = settings.tabs.map((tab) => ({
        ...tab,
        fieldIds: tab.fieldIds.filter((id) => id !== fieldId),
      }));

      // Add to target tab
      onSettingsChange({
        ...settings,
        tabs: updatedTabs.map((t) =>
          t.id === tabId ? { ...t, fieldIds: [...t.fieldIds, fieldId] } : t
        ),
      });
    },
    [settings, onSettingsChange]
  );

  const handleRemoveFieldFromTab = useCallback(
    (tabId: string, fieldId: string) => {
      onSettingsChange({
        ...settings,
        tabs: settings.tabs.map((t) =>
          t.id === tabId
            ? { ...t, fieldIds: t.fieldIds.filter((id) => id !== fieldId) }
            : t
        ),
      });
    },
    [settings, onSettingsChange]
  );

  // Get unassigned fields based on layout type
  const assignedFieldIds = new Set(
    layoutType === 'tabs'
      ? settings.tabs.flatMap((t) => t.fieldIds)
      : columns.flatMap((c) => c.fieldIds)
  );
  const unassignedFields = fields.filter((f) => !assignedFieldIds.has(f.id));

  const getFieldById = (fieldId: string): FieldWithMeta | undefined =>
    fields.find((f) => f.id === fieldId);

  return (
    <Card padding="large">
      <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingM">
        <Flex flexDirection="column" gap="spacing2Xs">
          <Heading as="h3" marginBottom="none">
            {contentTypeName}
          </Heading>
          <Text fontColor="gray500" fontSize="fontSizeS">
            {contentTypeId}
          </Text>
        </Flex>
        <Switch
          isChecked={settings.enabled}
          onChange={handleToggleEnabled}
          helpText={settings.enabled ? 'Tabulizer enabled' : 'Using default editor'}
        >
          Enable
        </Switch>
      </Flex>

      {settings.enabled && (
        <Box marginTop="spacingM">
          {/* Layout Type Selector */}
          <Box marginBottom="spacingL">
            <Text fontWeight="fontWeightMedium" marginBottom="spacingXs">
              Layout Type
            </Text>
            <Flex gap="spacingS">
              <Button
                size="small"
                variant={layoutType === 'tabs' ? 'primary' : 'secondary'}
                onClick={() => handleLayoutTypeChange('tabs')}
              >
                Tabs
              </Button>
              <Button
                size="small"
                variant={layoutType === 'columns' ? 'primary' : 'secondary'}
                onClick={() => handleLayoutTypeChange('columns')}
              >
                Columns
              </Button>
            </Flex>
            <Text fontSize="fontSizeS" fontColor="gray500" marginTop="spacingXs">
              {layoutType === 'tabs'
                ? 'Fields organized into navigable tabs'
                : 'Fields displayed side-by-side in columns'}
            </Text>
          </Box>

          {/* Tabs Configuration */}
          {layoutType === 'tabs' && (
            <>
              <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
                <Text fontWeight="fontWeightMedium">Tabs</Text>
                <Button
                  size="small"
                  variant="secondary"
                  startIcon={<PlusIcon />}
                  onClick={handleAddTab}
                >
                  Add Tab
                </Button>
              </Flex>

          {settings.tabs.length === 0 ? (
            <Card padding="large">
              <Text
                fontColor="gray500"
                style={{ textAlign: 'center', display: 'block' }}
              >
                No tabs configured. Add a tab to get started.
              </Text>
            </Card>
          ) : (
            <Accordion>
              {settings.tabs
                .sort((a, b) => a.order - b.order)
                .map((tab) => (
                  <Accordion.Item key={tab.id} title={tab.name}>
                    <Box padding="spacingM">
                      <Flex
                        justifyContent="space-between"
                        alignItems="center"
                        marginBottom="spacingM"
                      >
                        {editingTabId === tab.id ? (
                          <Flex gap="spacingXs" alignItems="center">
                            <TextInput
                              value={editingTabName}
                              onChange={(e) => setEditingTabName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTabName();
                                if (e.key === 'Escape') setEditingTabId(null);
                              }}
                              size="small"
                              style={{ width: '200px' }}
                            />
                            <IconButton
                              variant="primary"
                              size="small"
                              aria-label="Save name"
                              icon={<DoneIcon />}
                              onClick={handleSaveTabName}
                            />
                          </Flex>
                        ) : (
                          <Flex gap="spacingXs" alignItems="center">
                            <Text fontWeight="fontWeightMedium">{tab.name}</Text>
                            <IconButton
                              variant="transparent"
                              size="small"
                              aria-label="Edit name"
                              icon={<EditIcon />}
                              onClick={() => handleStartEditTabName(tab)}
                            />
                          </Flex>
                        )}
                        <IconButton
                          variant="negative"
                          size="small"
                          aria-label="Delete tab"
                          icon={<DeleteIcon />}
                          onClick={() => handleRemoveTab(tab.id)}
                        />
                      </Flex>

                      <Text fontWeight="fontWeightMedium" marginBottom="spacingXs">
                        Fields in this tab
                      </Text>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleDragEnd(e, tab.id)}
                      >
                        <SortableContext
                          items={tab.fieldIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <Flex flexDirection="column" gap="spacingXs" marginBottom="spacingM">
                            {tab.fieldIds.length === 0 ? (
                              <Card padding="large">
                                <Text
                                  fontColor="gray500"
                                  style={{ textAlign: 'center', fontStyle: 'italic', display: 'block' }}
                                >
                                  Drag fields here or select from unassigned below
                                </Text>
                              </Card>
                            ) : (
                              tab.fieldIds.map((fieldId) => {
                                const field = getFieldById(fieldId);
                                if (!field) return null;
                                return (
                                  <DraggableFieldItem
                                    key={fieldId}
                                    field={field}
                                    showRemove
                                    onRemove={() =>
                                      handleRemoveFieldFromTab(tab.id, fieldId)
                                    }
                                  />
                                );
                              })
                            )}
                          </Flex>
                        </SortableContext>
                      </DndContext>

                      {unassignedFields.length > 0 && (
                        <>
                          <Text
                            fontWeight="fontWeightMedium"
                            marginBottom="spacingXs"
                            marginTop="spacingM"
                          >
                            Add fields
                          </Text>
                          <Flex flexWrap="wrap" gap="spacingXs">
                            {unassignedFields.map((field) => (
                              <Button
                                key={field.id}
                                size="small"
                                variant="secondary"
                                onClick={() => handleAddFieldToTab(tab.id, field.id)}
                              >
                                + {field.name}
                              </Button>
                            ))}
                          </Flex>
                        </>
                      )}
                    </Box>
                  </Accordion.Item>
                ))}
            </Accordion>
          )}
            </>
          )}

          {/* Columns Configuration */}
          {layoutType === 'columns' && (
            <>
              <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
                <Text fontWeight="fontWeightMedium">Columns</Text>
                <Button
                  size="small"
                  variant="secondary"
                  startIcon={<PlusIcon />}
                  onClick={handleAddColumn}
                >
                  Add Column
                </Button>
              </Flex>

              {columns.length === 0 ? (
                <Card padding="large">
                  <Text
                    fontColor="gray500"
                    style={{ textAlign: 'center', display: 'block' }}
                  >
                    No columns configured. Add a column to get started.
                  </Text>
                </Card>
              ) : (
                <Flex gap="spacingM" style={{ overflowX: 'auto' }}>
                  {columns.map((column) => (
                    <Box
                      key={column.id}
                      style={{
                        flex: '1 1 0',
                        minWidth: '200px',
                        background: tokens.gray100,
                        borderRadius: '8px',
                        padding: '12px',
                      }}
                    >
                      <Flex
                        justifyContent="space-between"
                        alignItems="center"
                        marginBottom="spacingS"
                      >
                        {editingColumnId === column.id ? (
                          <Flex gap="spacingXs" alignItems="center">
                            <TextInput
                              value={editingColumnLabel}
                              onChange={(e) => setEditingColumnLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveColumnLabel();
                                if (e.key === 'Escape') setEditingColumnId(null);
                              }}
                              size="small"
                              style={{ width: '120px' }}
                            />
                            <IconButton
                              variant="primary"
                              size="small"
                              aria-label="Save label"
                              icon={<DoneIcon />}
                              onClick={handleSaveColumnLabel}
                            />
                          </Flex>
                        ) : (
                          <Flex gap="spacingXs" alignItems="center">
                            <Text fontWeight="fontWeightMedium" fontSize="fontSizeS">
                              {column.label}
                            </Text>
                            <IconButton
                              variant="transparent"
                              size="small"
                              aria-label="Edit label"
                              icon={<EditIcon />}
                              onClick={() => handleStartEditColumnLabel(column)}
                            />
                          </Flex>
                        )}
                        <IconButton
                          variant="negative"
                          size="small"
                          aria-label="Delete column"
                          icon={<DeleteIcon />}
                          onClick={() => handleRemoveColumn(column.id)}
                        />
                      </Flex>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleColumnDragEnd(e, column.id)}
                      >
                        <SortableContext
                          items={column.fieldIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <Flex flexDirection="column" gap="spacingXs" marginBottom="spacingS">
                            {column.fieldIds.length === 0 ? (
                              <Box
                                padding="spacingM"
                                style={{
                                  border: `2px dashed ${tokens.gray300}`,
                                  borderRadius: '4px',
                                  textAlign: 'center',
                                }}
                              >
                                <Text fontColor="gray500" fontSize="fontSizeS">
                                  Drop fields here
                                </Text>
                              </Box>
                            ) : (
                              column.fieldIds.map((fieldId) => {
                                const field = getFieldById(fieldId);
                                if (!field) return null;
                                return (
                                  <DraggableFieldItem
                                    key={fieldId}
                                    field={field}
                                    showRemove
                                    onRemove={() =>
                                      handleRemoveFieldFromColumn(column.id, fieldId)
                                    }
                                  />
                                );
                              })
                            )}
                          </Flex>
                        </SortableContext>
                      </DndContext>

                      {unassignedFields.length > 0 && (
                        <Box marginTop="spacingS">
                          <Text fontSize="fontSizeS" fontColor="gray500" marginBottom="spacingXs">
                            Add fields:
                          </Text>
                          <Flex flexDirection="column" gap="spacingXs">
                            {unassignedFields.slice(0, 5).map((field) => (
                              <Button
                                key={field.id}
                                size="small"
                                variant="secondary"
                                onClick={() => handleAddFieldToColumn(column.id, field.id)}
                                style={{ fontSize: '12px' }}
                              >
                                + {field.name}
                              </Button>
                            ))}
                            {unassignedFields.length > 5 && (
                              <Text fontSize="fontSizeS" fontColor="gray400">
                                +{unassignedFields.length - 5} more...
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Flex>
              )}
            </>
          )}
        </Box>
      )}
    </Card>
  );
}

export default ContentTypeConfig;
