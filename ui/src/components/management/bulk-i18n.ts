import { registerTranslations } from '../../lib/i18n'

registerTranslations('bulk', {
  selectPage: 'Select current page',
  selectRow: 'Select {{name}}',
  selected: '{{count}} selected on this page',
  clear: 'Clear selection',
  prepareZip: 'Prepare PDF ZIP',
  downloadZip: 'Download ZIP',
  zipDescription:
    'Download current PDFs from this page (50 MB maximum). Drafts and unissued receipts are skipped. Missing document PDFs must be regenerated from their details page. Previously issued receipts may be rebuilt using their saved design.',
  zipIneligible: 'Draft document or receipt not yet issued.',
  zipMissing: 'No current PDF available. Regenerate it from the details page first.',
  zipLimit: 'The 50 MB archive limit would be exceeded. Download a smaller selection.',
  zipInvalid: 'The downloaded file is not a PDF.',
  zipFailed: 'Could not download this PDF. Check access and retry.',
  archive: 'Archive',
  cancelRecords: 'Cancel records',
  reason: 'Cancellation reason (applied to all selected records)',
  reasonHint: 'Enter a reason, up to 1,000 characters.',
  deliver: 'Mark delivered',
  disable: 'Disable',
  enable: 'Enable',
  staffWarning:
    'Changing access takes effect immediately. Your own account and protected administrators are excluded or rejected by the server.',
  roleDeleteWarning:
    'Deletion is permanent and removes these roles from all staff. Staff keep only access granted by their remaining roles. System roles are protected.',
  restore: 'Restore',
  delete: 'Delete',
  category: 'Change category',
  confirm: 'Confirm',
  cancel: 'Cancel',
  working: 'Processing {{done}} of {{total}}…',
  confirmation:
    'Confirm “{{action}}” for {{count}} selected records? Each record is checked separately. Some may fail if they changed or are in use.',
  deleteWarning: 'Deletion is permanent. Referenced records cannot be deleted.',
  results: '{{success}} succeeded · {{skipped}} skipped · {{failed}} failed',
  skipped: 'Not eligible for this action in its current state.',
  failed: 'Could not complete this action. Refresh the record before retrying.',
  refreshFailed:
    'Actions finished, but the list could not be refreshed. Reload the page before continuing.',
  categoryPlaceholder: 'Choose a category',
  uncategorized: 'Uncategorized',
  dismiss: 'Dismiss results',
  changed: 'This product changed. Refresh before trying again.',
})
