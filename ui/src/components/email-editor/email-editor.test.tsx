import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmailEditor } from './email-editor'
import { textToEmailHtml } from './email-html'

describe('email editing modes', () => {
  it('escapes legacy text instead of interpreting HTML', () => {
    expect(textToEmailHtml('<script>test</script>\n{{clientName}}')).toBe(
      '<p>&lt;script&gt;test&lt;/script&gt;<br>{{clientName}}</p>',
    )
  })
  it('preserves advanced HTML unchanged until conversion is explicitly confirmed', () => {
    const onChange = vi.fn()
    const value =
      '<table cellpadding="24"><tr><td style="background-color:#eeeeee">Custom layout</td></tr></table>'
    render(
      <EmailEditor value={value} format="html" variables={['clientName']} onChange={onChange} />,
    )
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toHaveValue(value)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Visual editor' }))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toHaveValue(value)
    fireEvent.click(screen.getByRole('button', { name: 'Visual editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Email body' })).toBeVisible()
  })
  it('does not convert legacy rules merely by opening the editor', () => {
    const onChange = vi.fn()
    render(
      <EmailEditor
        value={'Bonjour {{clientName}}'}
        format="text"
        variables={['clientName']}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Email body' })).toHaveTextContent(
      'Bonjour {{clientName}}',
    )
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'HTML source' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toHaveValue(
      '<p>Bonjour {{clientName}}</p>',
    )
  })
  it('does not emit content updates when saving disables or re-enables source editing', () => {
    const onChange = vi.fn()
    const props = {
      value: '<p>Keep my source</p>',
      format: 'html' as const,
      variables: [],
      onChange,
    }
    const view = render(<EmailEditor {...props} disabled={false} />)
    view.rerender(<EmailEditor {...props} disabled />)
    view.rerender(<EmailEditor {...props} disabled={false} />)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toHaveValue(props.value)
  })
})
