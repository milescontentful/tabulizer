import { useState, useEffect, useCallback, useMemo, Component, ReactNode } from 'react';
import type { EditorAppSDK } from '@contentful/app-sdk';
import { documentToReactComponents } from '@contentful/rich-text-react-renderer';
import type { Document } from '@contentful/rich-text-types';
import {
  Box,
  Button,
  Flex,
  FormControl,
  IconButton,
  Spinner,
  Text,
  TextInput,
  Textarea,
  Switch,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { CloseIcon, DragIcon, ExternalLinkIcon, PlusIcon } from '@contentful/f36-icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RichTextEditor } from '@contentful/field-editor-rich-text';
import { createFieldSDK } from '../utils/createFieldSDK';
import type { DisplayMode } from '../types';

interface FieldRendererProps {
  /** The field ID to render */
  fieldId: string;
  /** The EditorAppSDK instance */
  sdk: EditorAppSDK;
  /** Active locales to display (stacked for localized fields) */
  locales: string[];
  /** Default locale */
  defaultLocale: string;
  /** Display mode - compact or verbose */
  displayMode?: DisplayMode;
  /** Hide the field label (useful for translation view where label is in a separate column) */
  hideLabel?: boolean;
}

interface SingleLocaleFieldProps {
  /** The field ID to render */
  fieldId: string;
  /** The EditorAppSDK instance */
  sdk: EditorAppSDK;
  /** The locale to render */
  locale: string;
  /** Default locale */
  defaultLocale: string;
  /** Display mode */
  displayMode: DisplayMode;
  /** Whether to show the locale label */
  showLocaleLabel: boolean;
  /** Whether this is the first locale (for field label) */
  isFirst: boolean;
  /** Hide the field label entirely */
  hideLabel?: boolean;
}

// Type for a Contentful link
interface ContentfulLink {
  sys: {
    type: 'Link';
    linkType: 'Asset' | 'Entry';
    id: string;
  };
}

// Type for fetched asset data
interface AssetData {
  id: string;
  title: string;
  url?: string;
  contentType?: string;
}

// Type for fetched entry data
interface EntryData {
  id: string;
  title: string;
  contentType: string;
}

/**
 * Catches render crashes inside the embedded Rich Text editor (it runs on a
 * pseudo-FieldAppSDK, so it's the most fragile part of the app) and shows a
 * read-only fallback instead of white-screening the whole entry editor.
 */
class RichTextErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** Read-only Rich Text preview used when the full editor can't render. */
function RichTextPreview({ value }: { value: unknown }) {
  let rendered: ReactNode = null;
  try {
    if (value) rendered = documentToReactComponents(value as Document);
  } catch {
    rendered = null;
  }
  return (
    <Box
      padding="spacingS"
      style={{
        border: `1px solid ${tokens.gray300}`,
        borderRadius: '4px',
        background: tokens.gray100,
      }}
    >
      {rendered}
      <Text as="div" fontSize="fontSizeS" fontColor="gray500" marginTop="spacingXs">
        Read-only preview — edit this rich text in the Editor tab
      </Text>
    </Box>
  );
}

/**
 * Sortable Tag Component - individual draggable tag
 */
function SortableTag({
  id,
  tag,
  onRemove,
  isDisabled,
}: {
  id: string;
  tag: string;
  onRemove: () => void;
  isDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Flex
      ref={setNodeRef}
      style={style}
      alignItems="center"
      gap="spacingXs"
      padding="spacingXs"
      className="sortable-tag"
      {...attributes}
    >
      {!isDisabled && (
        <Box
          {...listeners}
          style={{
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            color: tokens.gray500,
          }}
        >
          <DragIcon style={{ width: '12px', height: '12px' }} />
        </Box>
      )}
      <Text fontSize="fontSizeS">{tag}</Text>
      {!isDisabled && (
        <Box
          onClick={onRemove}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: tokens.gray500,
          }}
        >
          <CloseIcon style={{ width: '12px', height: '12px' }} />
        </Box>
      )}
    </Flex>
  );
}

/**
 * Asset Card Component - displays asset with thumbnail and actions
 */
function AssetCard({
  assetId,
  sdk,
  locale,
  onRemove,
  onReplace,
  isDisabled,
}: {
  assetId: string;
  sdk: EditorAppSDK;
  locale: string;
  onRemove: () => void;
  onReplace: () => void;
  isDisabled: boolean;
}) {
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    sdk.cma.asset
      .get({ assetId })
      .then((data) => {
        if (cancelled) return;
        const title = data.fields.title?.[locale] || data.fields.title?.['en-US'] || 'Untitled';
        const file = data.fields.file?.[locale] || data.fields.file?.['en-US'];
        setAsset({
          id: assetId,
          title,
          url: file?.url ? `https:${file.url}` : undefined,
          contentType: file?.contentType,
        });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAsset({ id: assetId, title: 'Failed to load' });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, sdk.cma.asset, locale]);

  const handleOpen = () => {
    sdk.navigator.openAsset(assetId, { slideIn: true });
  };

  if (loading) {
    return (
      <Box
        padding="spacingS"
        style={{
          border: `1px solid ${tokens.gray300}`,
          borderRadius: '4px',
          background: tokens.colorWhite,
        }}
      >
        <Flex alignItems="center" gap="spacingS">
          <Spinner size="small" />
          <Text fontSize="fontSizeS">Loading asset...</Text>
        </Flex>
      </Box>
    );
  }

  const isImage = asset?.contentType?.startsWith('image/');

  return (
    <Box
      style={{
        border: `1px solid ${tokens.gray300}`,
        borderRadius: '4px',
        background: tokens.colorWhite,
        overflow: 'hidden',
      }}
    >
      <Flex alignItems="center" gap="spacingS">
        {/* Thumbnail */}
        {isImage && asset?.url ? (
          <Box
            style={{
              width: '48px',
              height: '48px',
              flexShrink: 0,
              background: tokens.gray100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={`${asset.url}?w=96&h=96&fit=thumb`}
              alt={asset.title}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
            />
          </Box>
        ) : (
          <Box
            style={{
              width: '48px',
              height: '48px',
              flexShrink: 0,
              background: tokens.gray100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
            }}
          >
            📄
          </Box>
        )}

        {/* Title and actions */}
        <Flex flex="1" alignItems="center" justifyContent="space-between" padding="spacingXs">
          <Text
            fontWeight="fontWeightMedium"
            fontSize="fontSizeS"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '200px',
            }}
          >
            {asset?.title}
          </Text>

          <Flex gap="spacingXs">
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Open asset"
              icon={<ExternalLinkIcon />}
              onClick={handleOpen}
            />
            {!isDisabled && (
              <>
                <Button size="small" variant="secondary" onClick={onReplace}>
                  Replace
                </Button>
                <IconButton
                  variant="transparent"
                  size="small"
                  aria-label="Remove"
                  icon={<CloseIcon />}
                  onClick={onRemove}
                />
              </>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
}

/**
 * Entry Card Component - displays entry with title and actions
 */
function EntryCard({
  entryId,
  sdk,
  locale,
  onRemove,
  isDisabled,
}: {
  entryId: string;
  sdk: EditorAppSDK;
  locale: string;
  onRemove: () => void;
  isDisabled: boolean;
}) {
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    sdk.cma.entry
      .get({ entryId })
      .then((data) => {
        if (cancelled) return;
        // Try to get a display title from common field names
        const fields = data.fields;
        const titleField =
          fields.title?.[locale] ||
          fields.title?.['en-US'] ||
          fields.name?.[locale] ||
          fields.name?.['en-US'] ||
          fields.internalName?.[locale] ||
          fields.internalName?.['en-US'] ||
          'Untitled';

        setEntry({
          id: entryId,
          title: String(titleField),
          contentType: data.sys.contentType.sys.id,
        });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntry({ id: entryId, title: 'Failed to load', contentType: 'unknown' });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entryId, sdk.cma.entry, locale]);

  const handleOpen = () => {
    sdk.navigator.openEntry(entryId, { slideIn: true });
  };

  if (loading) {
    return (
      <Box
        padding="spacingS"
        style={{
          border: `1px solid ${tokens.gray300}`,
          borderRadius: '4px',
          background: tokens.colorWhite,
        }}
      >
        <Flex alignItems="center" gap="spacingS">
          <Spinner size="small" />
          <Text fontSize="fontSizeS">Loading entry...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      padding="spacingS"
      style={{
        border: `1px solid ${tokens.gray300}`,
        borderRadius: '4px',
        background: tokens.colorWhite,
      }}
    >
      <Flex alignItems="center" justifyContent="space-between">
        <Flex alignItems="center" gap="spacingS">
          <Text fontSize="fontSizeL">📄</Text>
          <Box>
            <Text
              fontWeight="fontWeightMedium"
              fontSize="fontSizeS"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
              }}
            >
              {entry?.title}
            </Text>
            <Text fontSize="fontSizeS" fontColor="gray500">
              {entry?.contentType}
            </Text>
          </Box>
        </Flex>

        <Flex gap="spacingXs">
          <IconButton
            variant="transparent"
            size="small"
            aria-label="Open entry"
            icon={<ExternalLinkIcon />}
            onClick={handleOpen}
          />
          {!isDisabled && (
            <IconButton
              variant="transparent"
              size="small"
              aria-label="Remove"
              icon={<CloseIcon />}
              onClick={onRemove}
            />
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

/**
 * Renders a field for a single locale.
 */
function SingleLocaleField({ 
  fieldId, 
  sdk, 
  locale, 
  defaultLocale,
  displayMode, 
  showLocaleLabel,
  isFirst,
  hideLabel = false,
}: SingleLocaleFieldProps) {
  const field = sdk.entry.fields[fieldId];
  const fieldDef = sdk.contentType.fields.find((f) => f.id === fieldId);
  const isVerbose = displayMode === 'verbose';
  
  if (!fieldDef) return null;

  const [value, setValue] = useState<unknown>(() => {
    try {
      return field?.getForLocale(locale)?.getValue();
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    if (!field) return;

    try {
      const localizedField = field.getForLocale(locale);
      setValue(localizedField.getValue());

      const unsubscribe = localizedField.onValueChanged((newValue) => {
        setValue(newValue);
      });

      return () => unsubscribe();
    } catch {
      setValue(undefined);
      return () => {};
    }
  }, [field, locale]);

  if (!field) {
    return null;
  }

  // Get the localized field
  let localizedField;
  try {
    localizedField = field.getForLocale(locale);
  } catch {
    return null;
  }
  const isDisabled = localizedField.getIsDisabled();

  const handleChange = useCallback(
    (newValue: unknown) => {
      try {
        localizedField.setValue(newValue);
      } catch {
        sdk.notifier.error(`Failed to update field "${fieldId}"`);
      }
    },
    [localizedField, fieldId, sdk.notifier]
  );

  // Asset selection handler
  const handleSelectAsset = useCallback(async () => {
    const selected = await sdk.dialogs.selectSingleAsset() as { sys: { id: string } } | null;
    if (selected) {
      handleChange({
        sys: { type: 'Link', linkType: 'Asset', id: selected.sys.id },
      });
    }
  }, [sdk.dialogs, handleChange]);

  // Entry selection handler
  const handleSelectEntry = useCallback(
    async (contentTypes?: string[]) => {
      const selected = await sdk.dialogs.selectSingleEntry({
        contentTypes,
      }) as { sys: { id: string } } | null;
      if (selected) {
        handleChange({
          sys: { type: 'Link', linkType: 'Entry', id: selected.sys.id },
        });
      }
    },
    [sdk.dialogs, handleChange]
  );

  // Add entry to array handler
  const handleAddEntry = useCallback(
    async (currentValue: ContentfulLink[], contentTypes?: string[]) => {
      const selected = await sdk.dialogs.selectSingleEntry({
        contentTypes,
      }) as { sys: { id: string } } | null;
      if (selected) {
        handleChange([
          ...currentValue,
          { sys: { type: 'Link', linkType: 'Entry', id: selected.sys.id } },
        ]);
      }
    },
    [sdk.dialogs, handleChange]
  );

  // Add asset to array handler
  const handleAddAsset = useCallback(
    async (currentValue: ContentfulLink[]) => {
      const selected = await sdk.dialogs.selectSingleAsset() as { sys: { id: string } } | null;
      if (selected) {
        handleChange([
          ...currentValue,
          { sys: { type: 'Link', linkType: 'Asset', id: selected.sys.id } },
        ]);
      }
    },
    [sdk.dialogs, handleChange]
  );

  // Create field SDK for RichText fields (needed for RichTextEditor component)
  const richTextFieldSDK = useMemo(() => {
    if (fieldDef.type === 'RichText') {
      try {
        return createFieldSDK(sdk, fieldId, locale);
      } catch {
        return null;
      }
    }
    return null;
  }, [sdk, fieldId, locale, fieldDef.type]);

  const renderEditor = () => {
    const fieldType = fieldDef.type;

    switch (fieldType) {
      case 'Symbol':
        return (
          <TextInput
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            isDisabled={isDisabled}
            size="small"
          />
        );

      case 'Text':
        return (
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            isDisabled={isDisabled}
            rows={3}
          />
        );

      case 'Integer':
      case 'Number':
        return (
          <TextInput
            type="number"
            value={value != null ? String(value) : ''}
            onChange={(e) => {
              const val =
                fieldType === 'Integer'
                  ? parseInt(e.target.value, 10)
                  : parseFloat(e.target.value);
              handleChange(isNaN(val) ? null : val);
            }}
            isDisabled={isDisabled}
            size="small"
          />
        );

      case 'Boolean':
        return (
          <Switch
            isChecked={Boolean(value)}
            onChange={() => handleChange(!value)}
            isDisabled={isDisabled}
          >
            {value ? 'Yes' : 'No'}
          </Switch>
        );

      case 'Date':
        return (
          <TextInput
            type="datetime-local"
            value={value ? String(value).substring(0, 16) : ''}
            onChange={(e) =>
              handleChange(e.target.value ? new Date(e.target.value).toISOString() : null)
            }
            isDisabled={isDisabled}
            size="small"
          />
        );

      case 'Object':
        return (
          <Textarea
            value={value ? JSON.stringify(value, null, 2) : ''}
            onChange={(e) => {
              try {
                handleChange(JSON.parse(e.target.value));
              } catch {
                // Invalid JSON
              }
            }}
            isDisabled={isDisabled}
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          />
        );

      case 'RichText': {
        // Use the field SDK created at component level
        // The RichTextEditor expects a FieldAppSDK and will automatically
        // read/write the JSON value through sdk.field.getValue() and sdk.field.setValue()
        if (!richTextFieldSDK) {
          return <RichTextPreview value={value} />;
        }

        return (
          <RichTextErrorBoundary fallback={<RichTextPreview value={value} />}>
            <Box
              style={{
                border: `1px solid ${tokens.gray300}`,
                borderRadius: '4px',
                background: tokens.colorWhite,
              }}
            >
              <RichTextEditor sdk={richTextFieldSDK} isInitiallyDisabled={isDisabled} />
            </Box>
          </RichTextErrorBoundary>
        );
      }

      case 'Link': {
        const linkType = 'linkType' in fieldDef ? fieldDef.linkType : 'Entry';
        const linkValue = value as ContentfulLink | null;

        if (linkType === 'Asset') {
          if (linkValue?.sys?.id) {
            return (
              <AssetCard
                assetId={linkValue.sys.id}
                sdk={sdk}
                locale={locale}
                onRemove={() => handleChange(null)}
                onReplace={handleSelectAsset}
                isDisabled={isDisabled}
              />
            );
          }
          return (
            <Button
              size="small"
              variant="secondary"
              startIcon={<PlusIcon />}
              onClick={handleSelectAsset}
              isDisabled={isDisabled}
            >
              Add asset
            </Button>
          );
        }

        // Entry link
        if (linkValue?.sys?.id) {
          return (
            <EntryCard
              entryId={linkValue.sys.id}
              sdk={sdk}
              locale={locale}
              onRemove={() => handleChange(null)}
              isDisabled={isDisabled}
            />
          );
        }
        return (
          <Button
            size="small"
            variant="secondary"
            startIcon={<PlusIcon />}
            onClick={() => handleSelectEntry()}
            isDisabled={isDisabled}
          >
            Add entry
          </Button>
        );
      }

      case 'Array': {
        const items = 'items' in fieldDef ? fieldDef.items : null;
        const itemsType = items?.type;
        const itemsLinkType = items && 'linkType' in items ? items.linkType : null;

        if (itemsType === 'Symbol') {
          const tags = (value as string[]) || [];
          // Create unique IDs for each tag (using index as fallback for duplicates)
          const tagIds = tags.map((tag, i) => `${tag}-${i}`);

          const handleDragEnd = (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
              const oldIndex = tagIds.indexOf(active.id as string);
              const newIndex = tagIds.indexOf(over.id as string);
              handleChange(arrayMove(tags, oldIndex, newIndex));
            }
          };

          return (
            <Box>
              <TextInput
                placeholder="Type the value and hit enter"
                size="small"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement;
                    const newTag = input.value.trim();
                    if (newTag) {
                      handleChange([...tags, newTag]);
                      input.value = '';
                    }
                    e.preventDefault();
                  }
                }}
                isDisabled={isDisabled}
              />
              {tags.length > 0 && (
                <DndContext
                  sensors={useSensors(
                    useSensor(PointerSensor),
                    useSensor(KeyboardSensor, {
                      coordinateGetter: sortableKeyboardCoordinates,
                    })
                  )}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={tagIds} strategy={horizontalListSortingStrategy}>
                    <Flex flexWrap="wrap" gap="spacingXs" marginTop="spacingS">
                      {tags.map((tag, i) => (
                        <SortableTag
                          key={tagIds[i]}
                          id={tagIds[i]}
                          tag={tag}
                          onRemove={() => handleChange(tags.filter((_, idx) => idx !== i))}
                          isDisabled={isDisabled}
                        />
                      ))}
                    </Flex>
                  </SortableContext>
                </DndContext>
              )}
            </Box>
          );
        }

        // Array of links (entries or assets)
        const links = (value as ContentfulLink[]) || [];

        if (itemsLinkType === 'Asset') {
          return (
            <Flex flexDirection="column" gap="spacingXs">
              {links.map((link, i) => (
                <AssetCard
                  key={link.sys.id}
                  assetId={link.sys.id}
                  sdk={sdk}
                  locale={locale}
                  onRemove={() => handleChange(links.filter((_, idx) => idx !== i))}
                  onReplace={async () => {
                    const selected = await sdk.dialogs.selectSingleAsset() as { sys: { id: string } } | null;
                    if (selected) {
                      const newLinks = [...links];
                      newLinks[i] = { sys: { type: 'Link', linkType: 'Asset', id: selected.sys.id } };
                      handleChange(newLinks);
                    }
                  }}
                  isDisabled={isDisabled}
                />
              ))}
              {!isDisabled && (
                <Button
                  size="small"
                  variant="secondary"
                  startIcon={<PlusIcon />}
                  onClick={() => handleAddAsset(links)}
                >
                  Add asset
                </Button>
              )}
            </Flex>
          );
        }

        // Array of entries
        return (
          <Flex flexDirection="column" gap="spacingXs">
            {links.map((link, i) => (
              <EntryCard
                key={link.sys.id}
                entryId={link.sys.id}
                sdk={sdk}
                locale={locale}
                onRemove={() => handleChange(links.filter((_, idx) => idx !== i))}
                isDisabled={isDisabled}
              />
            ))}
            {!isDisabled && (
              <Button
                size="small"
                variant="secondary"
                startIcon={<PlusIcon />}
                onClick={() => handleAddEntry(links)}
              >
                Add entry
              </Button>
            )}
          </Flex>
        );
      }

      case 'Location':
        return (
          <Box
            padding="spacingS"
            style={{
              border: `1px solid ${tokens.gray300}`,
              borderRadius: '4px',
              background: tokens.gray100,
            }}
          >
            <Text fontColor="gray500" fontSize="fontSizeS">
              📍 Location
              {value
                ? ` - ${JSON.stringify(value)}`
                : ' - Use the "Editor" tab to set location'}
            </Text>
          </Box>
        );

      default:
        return (
          <Text fontColor="gray500" fontSize="fontSizeS">
            Unsupported field type: {fieldType}
          </Text>
        );
    }
  };

  // Get validation errors if any
  const validationErrors = localizedField.getSchemaErrors?.() || [];
  const hasErrors = validationErrors.length > 0;

  // Get locale display name from the SDK (falls back to the locale code)
  const localeName = sdk.locales.names?.[locale] || locale;

  return (
    <Box style={{ marginBottom: hideLabel ? '0' : (showLocaleLabel ? '16px' : '8px') }}>
      <FormControl isRequired={!hideLabel && isFirst && fieldDef.required} marginBottom="none" isInvalid={hasErrors}>
        {/* Field label with locale - hidden in translation mode */}
        {!hideLabel && (
          <Flex alignItems="center" gap="spacingXs" style={{ marginBottom: '4px' }}>
            <FormControl.Label style={{ marginBottom: 0, fontSize: '13px', fontWeight: 500 }}>
              {fieldDef.name}
            </FormControl.Label>
            {fieldDef.required && isFirst && (
              <Text fontSize="fontSizeS" fontColor="gray500">(required)</Text>
            )}
            {showLocaleLabel && (
              <>
                <Text fontSize="fontSizeS" fontColor="gray400">|</Text>
                <Text fontSize="fontSizeS" fontColor="gray500">
                  {localeName}
                </Text>
                {locale === defaultLocale && (
                  <Text fontSize="fontSizeS" fontColor="gray400">Default</Text>
                )}
              </>
            )}
          </Flex>
        )}

        {renderEditor()}

        {/* Validation errors */}
        {hasErrors && (
          <Box marginTop="spacingXs">
            {validationErrors.map((error, i) => (
              <Text key={i} fontSize="fontSizeS" fontColor="red600">
                {String(error.message || error.name || 'Validation error')}
              </Text>
            ))}
          </Box>
        )}

        {/* Field description and type in verbose mode */}
        {isVerbose && !hideLabel && (
          <Flex gap="spacingS" marginTop="spacingXs">
            {(fieldDef as { description?: string }).description && (
              <Text fontSize="fontSizeS" fontColor="gray500">
                {(fieldDef as { description?: string }).description}
              </Text>
            )}
            <Text fontSize="fontSizeS" fontColor="gray400">
              {fieldDef.type}
            </Text>
          </Flex>
        )}
      </FormControl>
    </Box>
  );
}

/**
 * Main FieldRenderer that handles multiple locales.
 * For non-localized fields: renders once
 * For localized fields: renders stacked for each active locale
 */
export function FieldRenderer({ fieldId, sdk, locales, defaultLocale, displayMode = 'compact', hideLabel = false }: FieldRendererProps) {
  const field = sdk.entry.fields[fieldId];
  const fieldDef = sdk.contentType.fields.find((f) => f.id === fieldId);

  if (!field || !fieldDef) {
    return (
      <Box padding="spacingS">
        <Text fontColor="gray500" fontSize="fontSizeS">
          Field not found: {fieldId}
        </Text>
      </Box>
    );
  }

  // For non-localized fields, only render once with default locale
  if (!fieldDef.localized) {
    return (
      <Box style={{ marginBottom: hideLabel ? '0' : '12px' }}>
        <SingleLocaleField
          fieldId={fieldId}
          sdk={sdk}
          locale={defaultLocale}
          defaultLocale={defaultLocale}
          displayMode={displayMode}
          showLocaleLabel={false}
          isFirst={true}
          hideLabel={hideLabel}
        />
      </Box>
    );
  }

  // For localized fields, render for each active locale (stacked)
  const showLocaleLabels = locales.length > 1 && !hideLabel;

  return (
    <Box 
      style={{ 
        marginBottom: hideLabel ? '0' : '12px',
        paddingLeft: showLocaleLabels ? '8px' : '0',
        borderLeft: showLocaleLabels ? `3px solid ${tokens.blue600}` : 'none',
      }}
    >
      {locales.map((locale, index) => (
        <SingleLocaleField
          key={locale}
          fieldId={fieldId}
          sdk={sdk}
          locale={locale}
          defaultLocale={defaultLocale}
          displayMode={displayMode}
          showLocaleLabel={showLocaleLabels}
          isFirst={index === 0}
          hideLabel={hideLabel}
        />
      ))}
    </Box>
  );
}

export default FieldRenderer;
