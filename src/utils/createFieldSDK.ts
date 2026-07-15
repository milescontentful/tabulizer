import type { EditorAppSDK, FieldAppSDK, FieldAPI } from '@contentful/app-sdk';

/**
 * Creates a pseudo-FieldAppSDK from an EditorAppSDK for a specific field and locale.
 *
 * This is needed because the @contentful/default-field-editors package expects
 * a FieldAppSDK (which you get in the Field location), but we're in the Entry Editor
 * location and have an EditorAppSDK.
 *
 * The key insight is that `sdk.entry.fields[fieldId].getForLocale(locale)` returns
 * a proper FieldAPI with all the required methods (getValue, setValue, etc.).
 */
export function createFieldSDK(
  editorSdk: EditorAppSDK,
  fieldId: string,
  locale: string
): FieldAppSDK {
  // Get the field API for this specific field and locale
  const entryField = editorSdk.entry.fields[fieldId];
  if (!entryField) {
    throw new Error(`Field "${fieldId}" not found in entry`);
  }

  // Get the field definition from the content type
  const fieldDef = editorSdk.contentType.fields.find((f) => f.id === fieldId);

  // getForLocale returns a FieldAPI with all the methods the Field component needs
  const baseFieldApi: FieldAPI = entryField.getForLocale(locale);

  // Wrap getValue to ensure it always returns a valid Rich Text document structure
  // RichTextEditor's toSlateDoc expects a document with content array, and text nodes need value property
  const originalGetValue = baseFieldApi.getValue.bind(baseFieldApi);
  const wrappedGetValue = () => {
    const value = originalGetValue();
    // If value is null/undefined or doesn't have proper structure, return empty document
    if (!value || typeof value !== 'object' || !('nodeType' in value) || value.nodeType !== 'document') {
      return {
        nodeType: 'document',
        data: {},
        content: [{
          nodeType: 'paragraph',
          data: {},
          content: [{
            nodeType: 'text',
            value: '',
            marks: [],
            data: {}
          }]
        }]
      };
    }
    // Ensure all text nodes have a value property (even if empty string)
    const ensureTextNodes = (node: any): any => {
      if (node.nodeType === 'text') {
        return {
          ...node,
          value: node.value ?? ''
        };
      }
      if (node.content && Array.isArray(node.content)) {
        return {
          ...node,
          content: node.content.map(ensureTextNodes)
        };
      }
      return node;
    };
    return ensureTextNodes(value);
  };

  // Create a wrapped field API with the safe getValue
  const fieldApi = Object.create(baseFieldApi) as FieldAPI & {
    validations: unknown[];
    type: string;
    required: boolean;
  };
  Object.defineProperty(fieldApi, 'getValue', {
    value: wrappedGetValue,
    writable: false,
    enumerable: true,
    configurable: false
  });

  // Get validations - ensure it's an array and has proper structure for RichText
  // RichTextEditor expects validations[0] to exist and have enabledNodeTypes/enabledMarks
  let validations = fieldDef?.validations || [];

  // If validations is empty or doesn't have the expected structure, provide defaults for RichText
  if (fieldDef?.type === 'RichText' && (!Array.isArray(validations) || validations.length === 0 || !validations[0]?.enabledNodeTypes)) {
    validations = [{
      enabledNodeTypes: ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6', 'ordered-list', 'unordered-list', 'hr', 'blockquote', 'embedded-entry-block', 'embedded-entry-inline', 'hyperlink', 'entry-hyperlink', 'asset-hyperlink', 'embedded-asset-block', 'paragraph'],
      enabledMarks: ['bold', 'italic', 'code', 'underline', 'superscript', 'subscript'],
    }];
  }

  // Add properties that RichTextEditor expects (these might not exist on base FieldAPI)
  Object.defineProperties(fieldApi, {
    validations: {
      value: validations,
      writable: true,
      enumerable: true,
    },
    type: {
      value: fieldDef?.type || 'RichText',
      writable: true,
      enumerable: true,
    },
    required: {
      value: fieldDef?.required || false,
      writable: true,
      enumerable: true,
    },
    locale: {
      value: locale,
      writable: true,
      enumerable: true,
    },
  });

  // Construct a pseudo-FieldAppSDK by explicitly setting each property
  // We can't use spread because the SDK object has circular references
  // We use 'as unknown as FieldAppSDK' because EditorAppSDK is missing some
  // FieldAppSDK-specific properties that we're adding manually
  const fieldSdk = {
    // Field-specific properties
    field: fieldApi,

    // IDs with field info added - include all possible ID fields
    ids: {
      space: editorSdk.ids.space,
      environment: editorSdk.ids.environment,
      entry: editorSdk.ids.entry,
      contentType: editorSdk.ids.contentType,
      user: editorSdk.ids.user,
      field: fieldId,
      extension: editorSdk.ids.extension || '',
      app: editorSdk.ids.app || '',
      organization: editorSdk.ids.organization || '',
      environmentAlias: editorSdk.ids.environmentAlias || '',
    },

    // Window API - simplified for entry editor context
    window: {
      updateHeight: () => {},
      startAutoResizer: () => {},
      stopAutoResizer: () => {},
    },

    // Shared editor properties (from SharedEditorSDK)
    editor: editorSdk.editor,
    entry: editorSdk.entry,
    contentType: editorSdk.contentType,

    // Base app SDK properties
    // Ensure locales.direction exists and has a value for this locale
    // RichTextEditor accesses sdk.locales.direction[sdk.field.locale] and calls .slice() on it
    // So it must be a string, not undefined
    locales: {
      ...editorSdk.locales,
      direction: {
        ...(editorSdk.locales.direction || {}),
        [locale]: editorSdk.locales.direction?.[locale] || 'ltr',
      },
    },
    space: editorSdk.space,
    dialogs: editorSdk.dialogs,
    navigator: editorSdk.navigator,
    notifier: editorSdk.notifier,
    // Ensure parameters has all expected fields
    parameters: {
      installation: editorSdk.parameters?.installation || {},
      instance: editorSdk.parameters?.instance || {},
      invocation: editorSdk.parameters?.invocation || {},
    },
    user: editorSdk.user,
    location: {
      is: (loc: string) => loc === 'entry-field',
    },
    access: editorSdk.access,
    cma: editorSdk.cma,
    cmaAdapter: (editorSdk as unknown as { cmaAdapter: unknown }).cmaAdapter,
    hostnames: editorSdk.hostnames,
  } as unknown as FieldAppSDK;

  return fieldSdk;
}
