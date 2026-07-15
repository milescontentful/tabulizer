import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EditorAppSDK } from '@contentful/app-sdk';
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Menu,
  ModalConfirm,
  Spinner,
  Text,
  Tooltip,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { ChevronDownIcon, CopyIcon, DeleteIcon, StarIcon } from '@contentful/f36-icons';
import { FieldRenderer } from './FieldRenderer';

/** Field types that hold translatable text - these drive the progress bar */
const TRANSLATABLE_TYPES = ['Symbol', 'Text', 'RichText'];

/** Does a Rich Text document contain any actual text or embedded content? */
function richTextHasContent(doc: unknown): boolean {
  const node = doc as { nodeType?: string; value?: string; content?: unknown[] };
  if (!node || typeof node !== 'object') return false;
  if (node.nodeType === 'text') return Boolean(node.value && node.value.trim());
  if (node.nodeType?.startsWith('embedded-')) return true;
  return Array.isArray(node.content) && node.content.some(richTextHasContent);
}

/** Is this field's value "filled in" for translation purposes? */
function hasContent(value: unknown, fieldType: string): boolean {
  if (value == null) return false;
  if (fieldType === 'RichText') return richTextHasContent(value);
  return String(value).trim().length > 0;
}

/**
 * Tracks translation completion per locale.
 * Counts translatable text fields (Symbol, Text, Rich Text) and updates
 * live via field value subscriptions - no polling.
 */
function useTranslationProgress(
  sdk: EditorAppSDK,
  locales: string[],
  defaultLocale: string,
  translatableFields: { id: string; type: string }[]
) {
  const [progress, setProgress] = useState<Record<string, number>>({});

  const compute = useCallback(() => {
    const next: Record<string, number> = {};
    for (const locale of locales) {
      if (locale === defaultLocale) {
        next[locale] = 100;
        continue;
      }
      let filled = 0;
      for (const field of translatableFields) {
        try {
          const value = sdk.entry.fields[field.id]?.getForLocale(locale)?.getValue();
          if (hasContent(value, field.type)) filled++;
        } catch {
          // Field not available for this locale
        }
      }
      next[locale] =
        translatableFields.length > 0
          ? Math.round((filled / translatableFields.length) * 100)
          : 100;
    }
    setProgress(next);
  }, [sdk, locales, defaultLocale, translatableFields]);

  useEffect(() => {
    compute();
    // Recompute whenever any translatable field changes in any target locale
    const unsubscribes: Array<() => void> = [];
    for (const field of translatableFields) {
      for (const locale of locales) {
        if (locale === defaultLocale) continue;
        try {
          const unsubscribe = sdk.entry.fields[field.id]
            ?.getForLocale(locale)
            ?.onValueChanged(() => compute());
          if (unsubscribe) unsubscribes.push(unsubscribe);
        } catch {
          // Field not available for this locale
        }
      }
    }
    return () => unsubscribes.forEach((u) => u());
  }, [compute, sdk, locales, defaultLocale, translatableFields]);

  return progress;
}

/**
 * Translation View - shows all localized fields in Content Model order
 * with locale columns for side-by-side translation workflow.
 * Includes AI translation prep, bulk actions, per-field copy, and live progress tracking.
 */
export function TranslationView({
  locales,
  defaultLocale,
  sdk,
}: {
  locales: string[];
  defaultLocale: string;
  sdk: EditorAppSDK;
}) {
  // Which locale a bulk action is currently running against (disables its menu)
  const [busyLocale, setBusyLocale] = useState<string | null>(null);
  // Pending destructive action awaiting confirmation
  const [confirmAction, setConfirmAction] = useState<
    { type: 'copy' | 'clear'; locale: string } | null
  >(null);

  const getLocaleName = (locale: string): string => sdk.locales.names?.[locale] || locale;

  // ALL localized fields from the Content Model in their natural order
  const localizedFields = useMemo(
    () => sdk.contentType.fields.filter((f) => f.localized),
    [sdk.contentType.fields]
  );
  const nonLocalizedFields = useMemo(
    () => sdk.contentType.fields.filter((f) => !f.localized),
    [sdk.contentType.fields]
  );
  const translatableFields = useMemo(
    () => localizedFields.filter((f) => TRANSLATABLE_TYPES.includes(f.type)),
    [localizedFields]
  );

  const progress = useTranslationProgress(sdk, locales, defaultLocale, translatableFields);

  // Copy translatable text (incl. Rich Text) from source to target, then hand off
  // to Contentful's native AI Actions for the actual translation.
  const handleBulkPrepareForAI = async (targetLocale: string) => {
    setBusyLocale(targetLocale);
    try {
      let copiedCount = 0;
      for (const fieldDef of translatableFields) {
        try {
          const sourceValue = sdk.entry.fields[fieldDef.id]
            ?.getForLocale(defaultLocale)
            ?.getValue();
          if (hasContent(sourceValue, fieldDef.type)) {
            await sdk.entry.fields[fieldDef.id]?.getForLocale(targetLocale)?.setValue(sourceValue);
            copiedCount++;
          }
        } catch {
          // Skip fields that fail
        }
      }
      sdk.notifier.success(
        `${copiedCount} field${copiedCount === 1 ? '' : 's'} prepared. Use the AI button (top-right) → Translate to translate them.`
      );
    } finally {
      setBusyLocale(null);
    }
  };

  // Copy ALL localized field values (every type) from source to target
  const handleCopyAll = async (targetLocale: string) => {
    setBusyLocale(targetLocale);
    try {
      let copiedCount = 0;
      for (const fieldDef of localizedFields) {
        try {
          const sourceValue = sdk.entry.fields[fieldDef.id]
            ?.getForLocale(defaultLocale)
            ?.getValue();
          if (sourceValue !== undefined) {
            await sdk.entry.fields[fieldDef.id]?.getForLocale(targetLocale)?.setValue(sourceValue);
            copiedCount++;
          }
        } catch {
          // Skip fields that fail
        }
      }
      sdk.notifier.success(
        `Copied ${copiedCount} field${copiedCount === 1 ? '' : 's'} from ${getLocaleName(defaultLocale)} to ${getLocaleName(targetLocale)}`
      );
    } finally {
      setBusyLocale(null);
    }
  };

  // Clear all localized field values for a locale
  const handleClearAll = async (targetLocale: string) => {
    setBusyLocale(targetLocale);
    try {
      let clearedCount = 0;
      for (const fieldDef of localizedFields) {
        try {
          const field = sdk.entry.fields[fieldDef.id]?.getForLocale(targetLocale);
          if (field) {
            // Use appropriate empty value based on field type
            let emptyValue: unknown = null;
            if (fieldDef.type === 'Symbol' || fieldDef.type === 'Text') {
              emptyValue = '';
            } else if (fieldDef.type === 'Array') {
              emptyValue = [];
            }
            await field.setValue(emptyValue);
            clearedCount++;
          }
        } catch {
          // Skip fields that fail
        }
      }
      sdk.notifier.success(
        `Cleared ${clearedCount} field${clearedCount === 1 ? '' : 's'} in ${getLocaleName(targetLocale)}`
      );
    } finally {
      setBusyLocale(null);
    }
  };

  // Copy a single field's value from the source locale into a target locale
  const handleCopyField = async (fieldId: string, targetLocale: string) => {
    try {
      const sourceValue = sdk.entry.fields[fieldId]?.getForLocale(defaultLocale)?.getValue();
      await sdk.entry.fields[fieldId]?.getForLocale(targetLocale)?.setValue(sourceValue);
    } catch {
      sdk.notifier.error('Failed to copy field from source locale');
    }
  };

  const runConfirmedAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;
    if (action.type === 'copy') handleCopyAll(action.locale);
    else handleClearAll(action.locale);
  };

  if (localizedFields.length === 0) {
    return (
      <Box
        padding="spacingXl"
        style={{
          textAlign: 'center',
          color: tokens.gray500,
          border: `2px dashed ${tokens.gray300}`,
          borderRadius: tokens.borderRadiusMedium,
        }}
      >
        <Text fontWeight="fontWeightDemiBold" marginBottom="spacingM">
          No localized fields to translate
        </Text>
        <Text marginBottom="spacingM">
          This content type has no fields with "Enable localization" checked in the Content Model.
        </Text>
        {nonLocalizedFields.length > 0 && (
          <Text fontSize="fontSizeS" fontColor="gray500">
            Non-localized fields: {nonLocalizedFields.map((f) => f.name).join(', ')}
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box style={{ overflowX: 'auto' }}>
      {/* Confirmation for destructive bulk actions (window.confirm is blocked in the iframe) */}
      <ModalConfirm
        isShown={confirmAction !== null}
        intent={confirmAction?.type === 'clear' ? 'negative' : 'primary'}
        title={confirmAction?.type === 'clear' ? 'Clear all fields?' : 'Copy all from source?'}
        confirmLabel={confirmAction?.type === 'clear' ? 'Clear all' : 'Copy all'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      >
        <Text>
          {confirmAction?.type === 'clear'
            ? `This clears every localized field in ${getLocaleName(confirmAction.locale)}. Existing translations will be removed.`
            : confirmAction
              ? `This copies every localized field from ${getLocaleName(defaultLocale)} into ${getLocaleName(confirmAction.locale)}, overwriting any existing translations.`
              : ''}
        </Text>
      </ModalConfirm>

      {/* Locale Column Headers with Actions */}
      <Flex
        gap="spacingL"
        style={{
          borderBottom: `2px solid ${tokens.blue600}`,
          paddingBottom: tokens.spacingM,
          marginBottom: tokens.spacingM,
          position: 'sticky',
          top: 0,
          background: tokens.colorWhite,
          zIndex: 10,
        }}
      >
        <Box style={{ width: '140px', flexShrink: 0 }}>
          <Text fontWeight="fontWeightDemiBold" fontColor="gray700" fontSize="fontSizeM">
            Field
          </Text>
        </Box>
        {locales.map((locale) => (
          <Box key={locale} style={{ flex: '1 1 0', minWidth: '300px' }}>
            <Flex alignItems="center" justifyContent="space-between" marginBottom="spacingXs">
              <Flex alignItems="center" gap="spacingXs">
                <Text fontWeight="fontWeightDemiBold" fontColor="gray700" fontSize="fontSizeM">
                  {getLocaleName(locale)}
                </Text>
                {locale === defaultLocale && <Badge variant="primary">Source</Badge>}
              </Flex>

              {/* Bulk Actions for non-source locales */}
              {locale !== defaultLocale && (
                <Menu>
                  <Menu.Trigger>
                    <Button
                      size="small"
                      variant="secondary"
                      endIcon={<ChevronDownIcon />}
                      isDisabled={busyLocale !== null}
                    >
                      {busyLocale === locale ? (
                        <Flex alignItems="center" gap="spacingXs">
                          <Spinner size="small" /> Working…
                        </Flex>
                      ) : (
                        'Actions'
                      )}
                    </Button>
                  </Menu.Trigger>
                  <Menu.List>
                    <Menu.Item onClick={() => handleBulkPrepareForAI(locale)}>
                      <Flex alignItems="center" gap="spacingXs">
                        <StarIcon size="tiny" /> Prepare All for AI Translation
                      </Flex>
                    </Menu.Item>
                    <Menu.Item onClick={() => setConfirmAction({ type: 'copy', locale })}>
                      <Flex alignItems="center" gap="spacingXs">
                        <CopyIcon size="tiny" /> Copy All from Source
                      </Flex>
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item onClick={() => setConfirmAction({ type: 'clear', locale })}>
                      <Flex alignItems="center" gap="spacingXs">
                        <DeleteIcon size="tiny" /> Clear All
                      </Flex>
                    </Menu.Item>
                  </Menu.List>
                </Menu>
              )}
            </Flex>

            {/* Translation Progress Bar - counts Symbol, Text, and Rich Text fields */}
            {locale !== defaultLocale && (
              <Tooltip
                content={`${translatableFields.length} translatable text field${translatableFields.length === 1 ? '' : 's'} tracked`}
                placement="bottom"
              >
                <Flex alignItems="center" gap="spacingXs" style={{ marginTop: tokens.spacingXs }}>
                  <Box
                    style={{
                      flex: 1,
                      height: '6px',
                      background: tokens.gray200,
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      style={{
                        width: `${progress[locale] || 0}%`,
                        height: '100%',
                        background: progress[locale] === 100 ? tokens.green600 : tokens.blue600,
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </Box>
                  <Text fontSize="fontSizeS" fontColor="gray500" style={{ minWidth: '40px' }}>
                    {progress[locale] || 0}%
                  </Text>
                </Flex>
              </Tooltip>
            )}
          </Box>
        ))}
      </Flex>

      {/* Field Rows - uses FieldRenderer for full editing capabilities */}
      {localizedFields.map((fieldDef) => (
        <Flex
          key={fieldDef.id}
          gap="spacingL"
          style={{
            borderBottom: `1px solid ${tokens.gray200}`,
            paddingBottom: tokens.spacingM,
            marginBottom: tokens.spacingM,
            alignItems: 'flex-start',
          }}
        >
          {/* Field Name Column */}
          <Box style={{ width: '140px', flexShrink: 0, paddingTop: '6px' }}>
            <Text fontWeight="fontWeightMedium" fontSize="fontSizeS" fontColor="gray700">
              {fieldDef.name}
            </Text>
            {fieldDef.required && (
              <Text as="div" fontSize="fontSizeS" fontColor="red600" style={{ marginTop: '2px' }}>
                Required
              </Text>
            )}
            <Text as="div" fontSize="fontSizeS" fontColor="gray400" style={{ marginTop: '4px' }}>
              {fieldDef.type}
            </Text>
            {(fieldDef.type === 'Link' ||
              (fieldDef.type === 'Array' &&
                (fieldDef as { items?: { type?: string } }).items?.type === 'Link')) && (
              <Box style={{ marginTop: '6px' }}>
                <Badge variant="warning" size="small">
                  Reference
                </Badge>
              </Box>
            )}
          </Box>

          {/* Locale Columns - Full FieldRenderer per locale, plus per-field copy on targets */}
          {locales.map((locale) => (
            <Flex key={locale} gap="spacingXs" style={{ flex: '1 1 0', minWidth: '300px', alignItems: 'flex-start' }}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <FieldRenderer
                  fieldId={fieldDef.id}
                  sdk={sdk}
                  locales={[locale]}
                  defaultLocale={defaultLocale}
                  displayMode="compact"
                  hideLabel
                />
              </Box>
              {locale !== defaultLocale && (
                <Tooltip content={`Copy from ${getLocaleName(defaultLocale)}`} placement="top">
                  <IconButton
                    variant="transparent"
                    size="small"
                    aria-label={`Copy ${fieldDef.name} from source locale`}
                    icon={<CopyIcon />}
                    onClick={() => handleCopyField(fieldDef.id, locale)}
                  />
                </Tooltip>
              )}
            </Flex>
          ))}
        </Flex>
      ))}

      {/* Info about non-localized fields */}
      {nonLocalizedFields.length > 0 && (
        <Box
          marginTop="spacingXl"
          padding="spacingM"
          style={{
            background: tokens.gray100,
            borderRadius: tokens.borderRadiusMedium,
            border: `1px solid ${tokens.gray200}`,
          }}
        >
          <Text
            as="div"
            fontSize="fontSizeS"
            fontColor="gray600"
            fontWeight="fontWeightMedium"
            marginBottom="spacingXs"
          >
            Non-localized fields (not available for translation):
          </Text>
          <Text as="div" fontSize="fontSizeS" fontColor="gray500">
            {nonLocalizedFields.map((f) => f.name).join(' • ')}
          </Text>
          <Text as="div" fontSize="fontSizeS" fontColor="gray400" marginTop="spacingXs">
            To translate these fields, enable "Localization" in the Content Model settings.
          </Text>
        </Box>
      )}
    </Box>
  );
}
