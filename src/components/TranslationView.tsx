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
  Select,
  Spinner,
  Text,
  Tooltip,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { ChevronDownIcon, CopyIcon, DeleteIcon, StarIcon } from '@contentful/f36-icons';
import { FieldRenderer } from './FieldRenderer';
import { listAiActions, translateFieldsViaAiAction, AiActionInfo } from '../utils/appActions';

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
  // AI Actions available in this space, loaded server-side via an App Function
  // (null = still loading; [] = none available or the App Action isn't reachable)
  const [aiActions, setAiActions] = useState<AiActionInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAiActions(sdk)
      .then((actions) => {
        if (!cancelled) setAiActions(actions);
      })
      .catch(() => {
        // App Action not available (e.g. bundle without functions) - hide AI menu items
        if (!cancelled) setAiActions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sdk]);

  const getLocaleName = (locale: string): string => sdk.locales.names?.[locale] || locale;

  // Target locale selection - by default show ONE target next to the source
  // (side-by-side pair, no horizontal overflow). '__all__' shows every active
  // locale from the sidebar at once for multi-locale comparison.
  const availableTargets = useMemo(
    () => sdk.locales.available.filter((l) => l !== defaultLocale),
    [sdk.locales.available, defaultLocale]
  );
  const [targetLocale, setTargetLocale] = useState<string>(
    () => locales.find((l) => l !== defaultLocale) ?? availableTargets[0] ?? ''
  );
  const showAll = targetLocale === '__all__';
  const displayedLocales = useMemo(() => {
    if (showAll) {
      // All active sidebar locales, source first (already sorted by EntryEditor)
      return locales.length > 1 ? locales : [defaultLocale, ...availableTargets];
    }
    return targetLocale ? [defaultLocale, targetLocale] : [defaultLocale];
  }, [showAll, locales, defaultLocale, targetLocale, availableTargets]);

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

  const progress = useTranslationProgress(sdk, displayedLocales, defaultLocale, translatableFields);

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

  // Translate all text fields into the target locale via a Contentful AI Action,
  // proxied through an App Function (the iframe can't invoke AI Actions directly).
  // Translations are applied through the SDK field API so the UI updates live.
  const handleAiTranslate = async (targetLocale: string, aiAction: AiActionInfo) => {
    setBusyLocale(targetLocale);
    try {
      const { translations, skippedCount } = await translateFieldsViaAiAction(
        sdk,
        aiAction.id,
        defaultLocale,
        targetLocale
      );
      let appliedCount = 0;
      for (const [fieldId, text] of Object.entries(translations)) {
        try {
          await sdk.entry.fields[fieldId]?.getForLocale(targetLocale)?.setValue(text);
          appliedCount++;
        } catch {
          // Skip fields that fail
        }
      }
      if (appliedCount > 0) {
        sdk.notifier.success(
          `Translated ${appliedCount} field${appliedCount === 1 ? '' : 's'} to ${getLocaleName(targetLocale)} with "${aiAction.name}"${skippedCount ? ` (${skippedCount} skipped)` : ''}`
        );
      } else {
        sdk.notifier.warning('No fields were translated. Check the AI Action configuration.');
      }
    } catch (err) {
      sdk.notifier.error(`AI translation failed: ${err instanceof Error ? err.message : String(err)}`);
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

      {/* Sticky header: target picker + locale column headers */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          background: tokens.colorWhite,
          zIndex: 10,
        }}
      >
        {/* Target locale picker - one pair at a time keeps the layout clean */}
        <Flex alignItems="center" gap="spacingS" style={{ paddingBottom: tokens.spacingS }}>
          <Text fontSize="fontSizeS" fontColor="gray600" fontWeight="fontWeightMedium">
            Translate into
          </Text>
          <Select
            id="target-locale"
            name="target-locale"
            size="small"
            value={targetLocale}
            onChange={(e) => setTargetLocale(e.target.value)}
            style={{ maxWidth: '280px' }}
          >
            {availableTargets.map((locale) => (
              <Select.Option key={locale} value={locale}>
                {getLocaleName(locale)}
              </Select.Option>
            ))}
            <Select.Option value="__all__">All active locales (side-by-side)</Select.Option>
          </Select>
          {showAll && (
            <Text fontSize="fontSizeS" fontColor="gray500">
              Showing the locales enabled in the sidebar — scroll horizontally if needed
            </Text>
          )}
        </Flex>

        <Flex
          gap="spacingL"
          style={{
            borderBottom: `2px solid ${tokens.blue600}`,
            paddingBottom: tokens.spacingM,
          }}
        >
        <Box style={{ width: '140px', flexShrink: 0 }}>
          <Text fontWeight="fontWeightDemiBold" fontColor="gray700" fontSize="fontSizeM">
            Field
          </Text>
        </Box>
        {displayedLocales.map((locale) => (
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
                    {/* One-click AI translation via App Function + the space's AI Actions */}
                    {aiActions && aiActions.length > 0 && (
                      <>
                        <Menu.SectionTitle>Translate with AI</Menu.SectionTitle>
                        {aiActions.map((action) => (
                          <Menu.Item key={action.id} onClick={() => handleAiTranslate(locale, action)}>
                            <Flex alignItems="center" gap="spacingXs">
                              <StarIcon size="tiny" /> {action.name}
                            </Flex>
                          </Menu.Item>
                        ))}
                        <Menu.Divider />
                      </>
                    )}
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
      </Box>

      {/* Field Rows - uses FieldRenderer for full editing capabilities */}
      {localizedFields.map((fieldDef) => (
        <Flex
          key={fieldDef.id}
          gap="spacingL"
          style={{
            borderBottom: `1px solid ${tokens.gray200}`,
            paddingTop: tokens.spacingM,
            paddingBottom: tokens.spacingM,
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
          {displayedLocales.map((locale) => (
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

      {/* Info about non-localized fields - compact single line */}
      {nonLocalizedFields.length > 0 && (
        <Box marginTop="spacingL">
          <Tooltip
            content='These fields are not localized. To translate them, enable "Localization" in the Content Model settings.'
            placement="top"
          >
            <Text as="div" fontSize="fontSizeS" fontColor="gray500">
              Not localized: {nonLocalizedFields.map((f) => f.name).join(' • ')}
            </Text>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
