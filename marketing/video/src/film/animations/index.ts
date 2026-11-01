import type { ComponentType } from 'react'
import { InvoiceSent } from './InvoiceSent'
import { Reminder } from './Reminder'
import { ScheduledReports } from './ScheduledReports'
import { StaffAccess } from './StaffAccess'
import { TemplateCustomization } from './TemplateCustomization'

export const ANIMATIONS = {
  invoice: InvoiceSent,
  reminder: Reminder,
  reports: ScheduledReports,
  template: TemplateCustomization,
  staff: StaffAccess,
} satisfies Record<string, ComponentType>

export type AnimationId = keyof typeof ANIMATIONS
