import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { EditorContent, Extension, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Textarea } from '../ui/textarea'
import { textToEmailHtml } from './email-html'
import { EmailToolbar } from './email-toolbar'

const EmailLinkStyle = Extension.create({
  name: 'emailLinkStyle',
  addGlobalAttributes: () => [
    {
      types: ['link'],
      attributes: {
        style: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('style'),
          renderHTML: (attributes: Record<string, string>) =>
            attributes.style ? { style: attributes.style } : {},
        },
      },
    },
  ],
})

/** HTML source is never round-tripped through the visual editor without explicit consent. */
export function EmailEditor({
  value,
  format,
  variables,
  onChange,
  disabled = false,
}: {
  value: string
  format: 'text' | 'html'
  variables: string[]
  onChange: (html: string) => void
  disabled?: boolean
}) {
  useUiLanguage()
  const [source, setSource] = useState(format === 'html')
  const [confirm, setConfirm] = useState(false)
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [1, 2, 3] } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ allowBase64: false }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: { style: 'width:100%;border-collapse:collapse' },
        },
      }),
      EmailLinkStyle,
    ],
    content: format === 'text' ? textToEmailHtml(value) : '',
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    editorProps: {
      attributes: {
        class: 'email-visual-editor',
        'aria-label': translate('Email body'),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
  })
  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={!source ? 'default' : 'outline'}
          size="sm"
          aria-pressed={!source}
          onClick={() => {
            if (source) setConfirm(true)
          }}
        >
          {translate('Visual editor')}
        </Button>
        <Button
          type="button"
          variant={source ? 'default' : 'outline'}
          size="sm"
          aria-pressed={source}
          onClick={() => setSource(true)}
        >
          {translate('HTML source')}
        </Button>
      </div>
      {source ? (
        <>
          <p className="text-xs text-muted-foreground">
            {translate(
              'Safe inline HTML is supported. Scripts, forms and unsafe styles are removed. Variables are text only, not URLs.',
            )}
          </p>
          <Textarea
            aria-label={translate('HTML source')}
            className="min-h-80 font-mono text-xs"
            value={format === 'text' ? textToEmailHtml(value) : value}
            onChange={(e) => onChange(e.target.value)}
          />
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          {editor && <EmailToolbar editor={editor} variables={variables} />}
          <EditorContent editor={editor} />
        </div>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>{translate('Convert to visual editing?')}</DialogTitle>
          <DialogDescription>
            {translate(
              'The visual editor may simplify custom HTML layouts and styles. Keep HTML mode to preserve your source. Conversion affects this unsaved draft only.',
            )}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              {translate('Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                editor?.commands.setContent(format === 'text' ? textToEmailHtml(value) : value, {
                  emitUpdate: false,
                })
                if (editor) onChange(editor.getHTML())
                setSource(false)
                setConfirm(false)
              }}
            >
              {translate('Convert')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
