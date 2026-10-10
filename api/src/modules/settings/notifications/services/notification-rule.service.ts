import { randomUUID } from 'node:crypto'

import {
  type NotificationRule,
  type NotificationRulePreviewInput,
  NotificationRuleSchema,
  type NotificationRuleUpdate,
  NotificationRuleUpdateSchema,
} from '../../../../contracts/generated/settings/notifications.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { resolveLocale } from '../../../../lib/language.js'
import { assertVersion } from '../../../../lib/validation.js'
import type { NotificationPublicApi } from '../../../../support/notifications/index.js'
import type {
  createNotificationRuleRepository,
  RuleRow,
} from '../repositories/notification-rule.repository.js'
import { emailDocument, emailPlainText, escapeEmailText, sanitizeEmailHtml } from './email-html.js'
import { emailSample } from './email-sample.js'

export const eventVariables: Record<string, string[]> = {
  invoice_sent: ['clientName', 'documentNumber', 'issueDate', 'total', 'currency'],
  estimate_sent: ['clientName', 'documentNumber', 'issueDate', 'validUntil', 'total', 'currency'],
  payment_received: ['clientName', 'documentNumber', 'paymentNumber', 'amount', 'currency'],
  invoice_due_reminder: ['clientName', 'documentNumber', 'dueDate', 'outstanding', 'currency'],
  estimate_expiry_reminder: ['clientName', 'documentNumber', 'validUntil', 'total', 'currency'],
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function validateRuleTemplates(event: string, subject: string, body: string) {
  if (/[\r\n]/.test(subject))
    throw new AppError(400, 'INVALID_TEMPLATE', 'Email subjects cannot contain line breaks.')
  for (const template of [subject, body]) {
    const without = template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_full, key: string) => {
      if (!eventVariables[event]?.includes(key))
        throw new AppError(
          400,
          'INVALID_TEMPLATE_VARIABLE',
          `Variable ${key} is unavailable for this event.`,
        )
      return ''
    })
    if (/[{}]/.test(without))
      throw new AppError(400, 'INVALID_TEMPLATE', 'Use only supported double-brace variables.')
  }
}
export function composeNotification(
  rule: Pick<NotificationRule, 'eventKey' | 'subjectTemplate' | 'bodyTemplate'> & {
    bodyFormat?: 'text' | 'html'
    locale?: string
  },
  values: Record<string, string>,
) {
  validateRuleTemplates(rule.eventKey, rule.subjectTemplate, rule.bodyTemplate)
  const interpolate = (template: string) =>
    template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_full, key: string) => values[key] ?? '')
  const subject = interpolate(rule.subjectTemplate)
    .replace(/[\r\n]/g, ' ')
    .slice(0, 200)
  if (rule.bodyFormat === 'html') {
    const safe = sanitizeEmailHtml(rule.bodyTemplate)
    const html = sanitizeEmailHtml(
      safe.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_full, key: string) =>
        escapeEmailText(values[key] ?? ''),
      ),
    )
    return { subject, html: emailDocument(html, rule.locale), text: emailPlainText(html) }
  }
  const text = interpolate(rule.bodyTemplate)
  return {
    subject,
    text,
    html: emailDocument(`<div>${escape(text).replace(/\n/g, '<br>')}</div>`, rule.locale),
  }
}
const output = (row: RuleRow) =>
  NotificationRuleSchema.parse({
    id: row.id,
    eventKey: row.eventKey,
    enabled: row.enabled,
    offsetDays: row.offsetDays,
    repeatEveryDays: row.repeatEveryDays,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    locale: row.locale,
    englishSubjectTemplate: row.englishSubjectTemplate,
    englishBodyTemplate: row.englishBodyTemplate,
    subjectTemplate: row.subjectTemplate,
    bodyTemplate: row.bodyTemplate,
    bodyFormat: row.bodyFormat,
    version: row.version,
    variables: eventVariables[row.eventKey] ?? [],
    timingSupported: row.eventKey.endsWith('_reminder'),
  })

export function createNotificationRuleService(
  repo: ReturnType<typeof createNotificationRuleRepository>,
  notifications: NotificationPublicApi,
  options: {
    allowedFrom: string[]
    onPolicyChange?: (tx: Transaction, event: string) => Promise<void>
  },
) {
  async function resolved(row: RuleRow, tx?: Transaction) {
    const locale = resolveLocale(row.locale, (await repo.company(tx)).locale)
    if (locale === 'en-GB' && (!row.englishSubjectTemplate || !row.englishBodyTemplate))
      throw new AppError(
        409,
        'TRANSLATION_REQUIRED',
        'Add English subject and body before sending in English.',
      )
    return {
      ...output(row),
      locale,
      subjectTemplate: locale === 'en-GB' ? row.englishSubjectTemplate! : row.subjectTemplate,
      bodyTemplate: locale === 'en-GB' ? row.englishBodyTemplate! : row.bodyTemplate,
      bodyFormat: locale === 'en-GB' ? ('html' as const) : (row.bodyFormat as 'text' | 'html'),
    }
  }
  return {
    publicApi: {
      rule: async (event: string, tx?: Transaction) => resolved(await repo.event(event, tx), tx),
      rules: async (tx?: Transaction) =>
        Promise.all((await repo.list(tx)).map((row) => resolved(row, tx))),
      compose: composeNotification,
    },
    async list() {
      return { items: (await repo.list()).map(output), permittedSenderEmails: options.allowedFrom }
    },
    preview(id: string, input: NotificationRulePreviewInput, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'notification_rules.update')
        const rule = output(await repo.rule(id, tx))
        const locale = resolveLocale(input.locale ?? rule.locale, (await repo.company(tx)).locale)
        const content = composeNotification({ ...rule, ...input, locale }, emailSample)
        const sanitizedBodyTemplate =
          input.bodyFormat === 'html' ? sanitizeEmailHtml(input.bodyTemplate) : input.bodyTemplate
        return {
          ...content,
          sanitizedBodyTemplate,
          modified: sanitizedBodyTemplate !== input.bodyTemplate,
        }
      })
    },
    update(id: string, input: NotificationRuleUpdate, actor: string) {
      const data = NotificationRuleUpdateSchema.parse(input)
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'notification_rules.update')
        const before = await repo.rule(id, tx, true)
        assertVersion(before.version, data.expectedVersion)
        if (!options.allowedFrom.includes(data.senderEmail))
          throw new AppError(400, 'SENDER_NOT_PERMITTED', 'Select a configured sender identity.')
        if (
          !before.eventKey.endsWith('_reminder') &&
          (data.offsetDays !== 0 || data.repeatEveryDays !== null)
        )
          throw new AppError(400, 'INVALID_TIMING', 'Timing applies only to reminder rules.')
        validateRuleTemplates(before.eventKey, data.subjectTemplate, data.bodyTemplate)
        if (data.englishSubjectTemplate && data.englishBodyTemplate)
          validateRuleTemplates(
            before.eventKey,
            data.englishSubjectTemplate,
            data.englishBodyTemplate,
          )
        if (!!data.englishSubjectTemplate !== !!data.englishBodyTemplate)
          throw new AppError(400, 'TRANSLATION_REQUIRED', 'Provide both English subject and body.')
        const { expectedVersion: _version, ...changes } = data
        if (changes.bodyFormat === 'html')
          changes.bodyTemplate = sanitizeEmailHtml(changes.bodyTemplate)
        if (changes.englishBodyTemplate)
          changes.englishBodyTemplate = sanitizeEmailHtml(changes.englishBodyTemplate)
        if (data.englishBodyTemplate && !changes.englishBodyTemplate?.trim())
          throw new AppError(
            400,
            'INVALID_TEMPLATE',
            'The English email body must contain safe content.',
          )
        if (!changes.bodyTemplate.trim())
          throw new AppError(400, 'INVALID_TEMPLATE', 'The email body must contain safe content.')
        const row = await repo.update(id, changes, actor, tx)
        // Cancellation is part of the policy transaction, never a detached callback.
        await options.onPolicyChange?.(tx, row.eventKey)
        await repo.audit(
          tx,
          actor,
          'update',
          id,
          { version: before.version, enabled: before.enabled },
          { version: row.version, enabled: row.enabled },
        )
        return output(row)
      })
    },
    test(id: string, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'notification_rules.update')
        const row = await resolved(await repo.rule(id, tx), tx)
        if (!options.allowedFrom.includes(row.senderEmail))
          throw new AppError(
            400,
            'SENDER_NOT_PERMITTED',
            'Configure a permitted sender before testing.',
          )
        const operator = await repo.operator(actor, tx)
        const content = composeNotification(row, emailSample)
        const message = await notifications.enqueue(
          {
            idempotencyKey: `rule-test:${randomUUID()}`,
            actor,
            from: { email: row.senderEmail, name: row.senderName },
            to: operator.email,
            cc: [],
            ...content,
            attachments: [],
          },
          tx,
        )
        await repo.audit(tx, actor, 'test', id, null, { messageId: message.id })
        return { messageId: message.id, status: message.status }
      })
    },
  }
}
