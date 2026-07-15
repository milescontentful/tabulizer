/**
 * App Function: translateFields
 *
 * Translates an entry's localizable text fields from a source locale to a
 * target locale by proxying a Contentful AI Action server-side.
 *
 * Unlike a page-location app, Tabulizer runs INSIDE the entry editor, so this
 * function does NOT write the results back via the CMA (that would conflict
 * with the open editor session). It returns the translations and the frontend
 * applies them through the App SDK field API, which keeps the UI, progress
 * bar, and autosave in sync.
 *
 * Accepts:
 *   {
 *     entryId:      string,
 *     sourceLocale: string,   // e.g. "en-US"
 *     targetLocale: string,   // e.g. "de-DE"
 *     aiActionId:   string,   // Contentful AI Action ID to proxy
 *   }
 *
 * Returns:
 *   { translations: { [fieldId]: string }, skippedCount: number, error?: string }
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { proxyAiAction } from './_aiActionProxy';

interface TranslateFieldsParams {
  entryId: string;
  sourceLocale?: string;
  targetLocale: string;
  aiActionId: string;
}

interface TranslateFieldsResponse {
  translations: Record<string, string>;
  skippedCount: number;
  error?: string;
}

const TRANSLATABLE_FIELD_TYPES = new Set(['Symbol', 'Text']);

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
): Promise<TranslateFieldsResponse> => {
  try {
    const params = event.body as unknown as TranslateFieldsParams;
    const { entryId, sourceLocale = 'en-US', targetLocale, aiActionId } = params;

    if (!targetLocale || !aiActionId) {
      return { translations: {}, skippedCount: 0, error: 'targetLocale and aiActionId are required.' };
    }

    const cma = context.cma;
    const spaceId: string = context.spaceId;
    const environmentId: string = context.environmentId;

    const entry = await cma.entry.get({ entryId, spaceId, environmentId });
    const contentTypeId: string = entry.sys.contentType.sys.id;
    const ct = await cma.contentType.get({ contentTypeId, spaceId, environmentId });

    // Only translate fields that have localization enabled AND are plain text
    const localizableFields: Array<{ id: string; type: string }> = (ct.fields as any[]).filter(
      (f) => f.localized && TRANSLATABLE_FIELD_TYPES.has(f.type),
    );

    if (localizableFields.length === 0) {
      return {
        translations: {},
        skippedCount: 0,
        error: `Content type "${contentTypeId}" has no localizable text fields.`,
      };
    }

    const translations: Record<string, string> = {};
    let skippedCount = 0;

    // Translate all fields in parallel - each is an independent AI Action invocation
    await Promise.all(
      localizableFields.map(async (field) => {
        const sourceText = (entry.fields[field.id] as any)?.[sourceLocale];
        if (!sourceText || typeof sourceText !== 'string' || !sourceText.trim()) {
          skippedCount++;
          return;
        }
        try {
          const translated = await proxyAiAction(context, aiActionId, {
            text: sourceText,
            sourceLocale,
            targetLocale,
          });
          if (translated.trim()) {
            translations[field.id] = translated.trim();
          } else {
            skippedCount++;
          }
        } catch {
          skippedCount++;
        }
      }),
    );

    return { translations, skippedCount };
  } catch (err: any) {
    return { translations: {}, skippedCount: 0, error: `Function error: ${err?.message ?? String(err)}` };
  }
};
