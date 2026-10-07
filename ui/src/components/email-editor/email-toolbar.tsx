import type { Editor } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo,
  Underline,
  Undo,
} from 'lucide-react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectGroup, SelectOption } from '../ui/select'
import { Tooltip } from '../ui/tooltip'
import { InsertEmailElement } from './insert-email-element'

export function EmailToolbar({ editor, variables }: { editor: Editor; variables: string[] }) {
  useUiLanguage()
  const actions = [
    {
      label: 'Bold',
      icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      icon: Underline,
      active: editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Bullet list',
      icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    ...(
      [
        { label: 'Align left', value: 'left', icon: AlignLeft },
        { label: 'Align center', value: 'center', icon: AlignCenter },
        { label: 'Align right', value: 'right', icon: AlignRight },
      ] as const
    ).map((a) => ({
      label: a.label,
      icon: a.icon,
      active: editor.isActive({ textAlign: a.value }),
      run: () => editor.chain().focus().setTextAlign(a.value).run(),
    })),
    { label: 'Undo', icon: Undo, active: false, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', icon: Redo, active: false, run: () => editor.chain().focus().redo().run() },
  ]
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2"
      role="toolbar"
      aria-label={translate('Email formatting')}
    >
      <Select
        aria-label={translate('Text style')}
        className="w-32"
        value={
          editor.isActive('heading', { level: 1 })
            ? '1'
            : editor.isActive('heading', { level: 2 })
              ? '2'
              : 'p'
        }
        onValueChange={(v) =>
          v === 'p'
            ? editor.chain().focus().setParagraph().run()
            : editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(v) as 1 | 2 })
                .run()
        }
      >
        <SelectGroup>
          <SelectOption value="p">{translate('Paragraph')}</SelectOption>
          <SelectOption value="1">{translate('Heading 1')}</SelectOption>
          <SelectOption value="2">{translate('Heading 2')}</SelectOption>
        </SelectGroup>
      </Select>
      {actions.map(({ label, icon: Icon, active, run }) => (
        <Tooltip key={label} label={translate(label)}>
          <Button
            type="button"
            size="icon"
            variant={active ? 'default' : 'ghost'}
            aria-label={translate(label)}
            aria-pressed={active}
            onClick={run}
          >
            <Icon />
          </Button>
        </Tooltip>
      ))}
      <Tooltip label={translate('Text color')}>
        <Input
          type="color"
          aria-label={translate('Text color')}
          className="!size-8 !p-1"
          value={editor.getAttributes('textStyle').color || '#222222'}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </Tooltip>
      <InsertEmailElement editor={editor} />
      <Select
        aria-label={translate('Insert variable')}
        className="w-40"
        value=""
        onValueChange={(v) => {
          if (v) editor.chain().focus().insertContent(`{{${v}}}`).run()
        }}
      >
        <SelectGroup>
          <SelectOption value="">{translate('Insert variable')}</SelectOption>
          {variables.map((v) => (
            <SelectOption key={v} value={v}>{`{{${v}}}`}</SelectOption>
          ))}
        </SelectGroup>
      </Select>
      <Select
        aria-label={translate('Table actions')}
        className="w-40"
        value=""
        onValueChange={(v) => {
          const chain = editor.chain().focus()
          if (v === 'insert') chain.insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()
          if (v === 'row') chain.addRowAfter().run()
          if (v === 'column') chain.addColumnAfter().run()
          if (v === 'removeRow') chain.deleteRow().run()
          if (v === 'removeColumn') chain.deleteColumn().run()
          if (v === 'delete') chain.deleteTable().run()
        }}
      >
        <SelectGroup>
          {[
            ['', 'Table actions'],
            ['insert', 'Insert table'],
            ['row', 'Add row'],
            ['column', 'Add column'],
            ['removeRow', 'Delete row'],
            ['removeColumn', 'Delete column'],
            ['delete', 'Delete table'],
          ].map(([v, label]) => (
            <SelectOption
              key={v}
              value={v}
              disabled={!!v && v !== 'insert' && !editor.isActive('table')}
            >
              {translate(label!)}
            </SelectOption>
          ))}
        </SelectGroup>
      </Select>
    </div>
  )
}
