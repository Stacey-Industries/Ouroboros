/**
 * LexicalImagePastePlugin.tsx — Intercepts clipboard paste events and routes
 * image files to the attachment handler, letting text paste fall through to
 * Lexical's default handling.
 *
 * Registered at COMMAND_PRIORITY_HIGH so it runs before Lexical's built-in
 * paste-to-text handler (which is registered at a lower priority).
 *
 * When onImagePaste is called, the plugin returns true (event consumed) so
 * Lexical does not insert the raw clipboard data as text.  For text-only
 * clipboard content (no image items), the plugin returns false so Lexical's
 * default handler inserts the text normally.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { useEffect } from 'react';

export type LexicalImagePastePluginProps = {
  onImagePaste: (files: File[]) => void;
};

function extractImageFiles(clipboardData: DataTransfer): File[] {
  return Array.from(clipboardData.items)
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

export function LexicalImagePastePlugin({ onImagePaste }: LexicalImagePastePluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | DragEvent | InputEvent) => {
        // Duck-type check rather than instanceof ClipboardEvent — jsdom does
        // not expose ClipboardEvent globally, and Lexical's PASTE_COMMAND can
        // also fire with InputEvent / DragEvent shapes.
        const clipboardData = (event as ClipboardEvent).clipboardData;
        if (!clipboardData || typeof clipboardData.items === 'undefined') return false;
        const imageFiles = extractImageFiles(clipboardData);
        if (!imageFiles.length) return false;
        event.preventDefault();
        onImagePaste(imageFiles);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onImagePaste]);

  return null;
}
