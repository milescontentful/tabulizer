/**
 * App Function: translateFields
 *
 * Translates ONE field of an entry from a source locale to a target locale by
 * proxying a Contentful AI Action server-side. The frontend calls this once
 * per field (in parallel) so translations stream into the UI as they finish.
 *
 * Symbol/Text fields translate directly. RichText fields are handled by
 * collecting the document's text node values, translating them in a single
 * delimited batch, and re-injecting them into the document structure - so
 * formatting, links, and embeds are preserved.
 *
 * Accepts:
 *   {
 *     entryId:      string,
 *     fieldId:      string,
 *     sourceLocale: string,   // e.g. "en-US"
 *     targetLocale: string,   // e.g. "de-DE"
 *     aiActionId:   string,   // Contentful AI Action ID to proxy
 *   }
 *
 * Returns:
 *   { value?: string | object, skipped?: boolean, error?: string }
 *   - value: the translated string (Symbol/Text) or document (RichText);
 *     the frontend applies it via the App SDK field API.
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';
import { proxyAiAction } from './_aiActionProxy';

interface TranslateFieldParams {
  entryId: string;
  fieldId: string;
  sourceLocale?: string;
  targetLocale: string;
  aiActionId: string;
}

interface TranslateFieldResponse {
  value?: string | object;
  skipped?: boolean;
  error?: string;
}

// ponytail: delimiter-based batch translation of rich text segments. If the
// model mangles the delimiter the segment count mismatches and we skip the
// field (frontend leaves it untouched). Upgrade path: one invocation per text
// node, or an AI Action that accepts structured JSON.
const DELIMITER = '\n|||---|||\n';

/** Depth-first collect of text node values from a Rich Text document. */
function collectTextValues(node: any, out: string[]): void {
  if (node?.nodeType === 'text') {
    out.push(typeof node.value === 'string' ? node.value : '');
    return;
  }
  for (const child of node?.content ?? []) collectTextValues(child, out);
}

/** Rebuild the document with translated text values in original positions. */
function injectTextValues(node: any, values: string[], cursor: { i: number }): any {
  if (node?.nodeType === 'text') {
    return { ...node, value: values[cursor.i++] };
  }
  if (Array.isArray(node?.content)) {
    return { ...node, content: node.content.map((c: any) => injectTextValues(c, values, cursor)) };
  }
  return node;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event,
  context: FunctionEventContext,
): Promise<TranslateFieldResponse> => {
  try {
    const params = event.body as unknown as TranslateFieldParams;
    const { entryId, fieldId, sourceLocale = 'en-US', targetLocale, aiActionId } = params;

    if (!entryId || !fieldId || !targetLocale || !aiActionId) {
      return { error: 'entryId, fieldId, targetLocale, and aiActionId are required.' };
    }

    const cma = context.cma;
    const spaceId: string = context.spaceId;
    const environmentId: string = context.environmentId;

    const entry = await cma.entry.get({ entryId, spaceId, environmentId });
    const sourceValue = (entry.fields[fieldId] as any)?.[sourceLocale];

    // Plain text fields: translate the string directly
    if (typeof sourceValue === 'string') {
      if (!sourceValue.trim()) return { skipped: true };
      const translated = await proxyAiAction(context, aiActionId, {
        text: sourceValue,
        sourceLocale,
        targetLocale,
      });
      return translated.trim() ? { value: translated.trim() } : { skipped: true };
    }

    // Rich Text: batch-translate the text nodes, preserve the document structure
    if (sourceValue && typeof sourceValue === 'object' && sourceValue.nodeType === 'document') {
      const texts: string[] = [];
      collectTextValues(sourceValue, texts);

      const nonEmptyIndexes = texts
        .map((t, i) => (t.trim() ? i : -1))
        .filter((i) => i >= 0);
      if (nonEmptyIndexes.length === 0) return { skipped: true };

      const joined = nonEmptyIndexes.map((i) => texts[i]).join(DELIMITER);
      const translatedJoined = await proxyAiAction(context, aiActionId, {
        text: joined,
        sourceLocale,
        targetLocale,
      });

      const segments = translatedJoined.split(DELIMITER.trim()).map((s) => s.trim());
      if (segments.length !== nonEmptyIndexes.length) {
        return { skipped: true, error: 'Rich text segment count mismatch - field skipped.' };
      }

      const translatedTexts = [...texts];
      nonEmptyIndexes.forEach((originalIndex, segIndex) => {
        translatedTexts[originalIndex] = segments[segIndex];
      });

      const translatedDoc = injectTextValues(sourceValue, translatedTexts, { i: 0 });
      return { value: translatedDoc };
    }

    return { skipped: true };
  } catch (err: any) {
    return { error: `Function error: ${err?.message ?? String(err)}` };
  }
};
