import type { Editor } from '@tiptap/react'
import { ImagePlus, Link, RectangleHorizontal, Unlink } from 'lucide-react'
import { useState } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Field, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'
import { Tooltip } from '../ui/tooltip'

export function InsertEmailElement({ editor }: { editor: Editor }) {
  useUiLanguage()
  const [kind, setKind] = useState<'link' | 'button' | 'image' | null>(null)
  const [url, setUrl] = useState(''),
    [label, setLabel] = useState('')
  const valid = /^https:\/\/[^\s]+$/i.test(url) && label.trim().length > 0
  return (
    <>
      {(
        [
          { key: 'link', label: 'Insert link', icon: Link },
          { key: 'button', label: 'Insert button', icon: RectangleHorizontal },
          { key: 'image', label: 'Insert image', icon: ImagePlus },
        ] as const
      ).map((a) => (
        <Tooltip key={a.key} label={translate(a.label)}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={translate(a.label)}
            onClick={() => {
              setKind(a.key)
              setUrl('')
              setLabel('')
            }}
          >
            <a.icon />
          </Button>
        </Tooltip>
      ))}
      <Tooltip label={translate('Remove link')}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={translate('Remove link')}
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink />
        </Button>
      </Tooltip>
      <Dialog
        open={kind !== null}
        onOpenChange={(open) => {
          if (!open) setKind(null)
        }}
      >
        <DialogContent>
          <DialogTitle>
            {translate(
              kind === 'image'
                ? 'Insert image'
                : kind === 'button'
                  ? 'Insert button'
                  : 'Insert link',
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'Use a public HTTPS URL. Images load remotely in the recipient’s email client.',
            )}
          </DialogDescription>
          <Field>
            <FieldLabel htmlFor="email-element-url">{translate('HTTPS URL')}</FieldLabel>
            <Input id="email-element-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-element-label">
              {translate(kind === 'image' ? 'Alternative text' : 'Link text')}
            </FieldLabel>
            <Input
              id="email-element-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setKind(null)}>
              {translate('Cancel')}
            </Button>
            <Button
              type="button"
              disabled={!valid}
              onClick={() => {
                if (kind === 'image')
                  editor.chain().focus().setImage({ src: url, alt: label }).run()
                else
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: 'text',
                      text: label,
                      marks: [
                        {
                          type: 'link',
                          attrs: {
                            href: url,
                            ...(kind === 'button'
                              ? {
                                  style:
                                    'display:inline-block;padding:12px 20px;background-color:#a77718;color:#ffffff;border-radius:6px;text-decoration:none',
                                }
                              : {}),
                          },
                        },
                      ],
                    })
                    .run()
                setKind(null)
              }}
            >
              {translate('Insert')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
