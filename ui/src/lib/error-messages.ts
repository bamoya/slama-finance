import { ApiError } from './api-error'
import i18n, { translate } from './i18n'
import { french } from './locales/fr'

/** Localize presentation only: server codes and generated schemas stay unchanged. */
export function validationMessage(message: string): string {
  if (i18n.language !== 'fr') return message
  if (french[message]) return translate(message)
  if (/email/i.test(message)) return 'Saisissez une adresse e-mail valide.'
  if (/required|undefined|must not be empty/i.test(message)) return 'Ce champ est obligatoire.'
  const minimum = /at least (\d+) character/.exec(message)
  if (minimum) return `Saisissez au moins ${minimum[1]} caractères.`
  const maximum = /at most (\d+) character/.exec(message)
  if (maximum) return `Saisissez au maximum ${maximum[1]} caractères.`
  if (/number|integer|greater|less|decimal|positive/i.test(message))
    return 'Saisissez un nombre valide dans les limites indiquées.'
  if (/date/i.test(message)) return 'Saisissez une date valide.'
  return 'Vérifiez la valeur de ce champ.'
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return translate('Unable to save. Please try again.')
  if (i18n.language !== 'fr') return error.message
  if (french[error.message]) return translate(error.message)
  if (error instanceof ApiError) {
    const invitationErrors: Record<string, string> = {
      INVALID_INVITATION_TOKEN: 'Ce lien d’invitation n’est pas valide.',
      INVITATION_EXPIRED:
        'Cette invitation a expiré. Demandez un nouveau lien à votre administrateur.',
      INVITATION_REVOKED: 'Cette invitation a été révoquée. Contactez votre administrateur.',
      INVITATION_ALREADY_USED:
        'Cette invitation a déjà été acceptée. Connectez-vous à votre organisation.',
      INVITATION_CONFLICT: 'Cette invitation ne peut plus être modifiée.',
      STAFF_LIMIT: 'La limite de membres est atteinte. Contactez votre administrateur.',
      PAYMENT_PENDING: 'Un paiement est déjà en attente de vérification pour votre abonnement.',
      INVALID_PAYMENT_METHOD:
        'Ce moyen de paiement n’est pas accepté. Choisissez-en un dans la liste.',
      RENEWAL_EXISTS: 'Un renouvellement est déjà confirmé pour la période suivante.',
      NOT_CANCELLABLE: 'Cet abonnement ne peut pas être résilié dans son état actuel.',
      UPGRADE_STALE: 'Le prix du changement d’offre a évolué. Actualisez le devis puis réessayez.',
      INVALID_CREDENTIALS: 'E-mail ou mot de passe incorrect.',
      INVALID_CODE: 'Code de vérification incorrect ou expiré. Vérifiez votre application.',
      ADMIN_UNAVAILABLE:
        'L’administration est temporairement indisponible : la configuration du serveur est incomplète.',
      PAYMENT_REJECTED: 'Ce paiement a déjà été rejeté et ne peut plus être modifié.',
      PAYMENT_CONFIRMED: 'Ce paiement a déjà été confirmé et ne peut plus être modifié.',
      REJECTION_REASON_REQUIRED: 'Indiquez le motif du rejet.',
      NOT_FOUND: 'Cet élément est introuvable ou n’est plus disponible.',
      UNAUTHENTICATED: 'Session administrateur expirée. Reconnectez-vous.',
      EMAIL_UNAVAILABLE: 'L’envoi des invitations est temporairement indisponible.',
      TWO_FACTOR_INVALID:
        'Code d’authentification incorrect ou déjà utilisé. Saisissez le code actuel de votre application.',
      ALREADY_BLOCKED: 'Ce client est déjà bloqué.',
      NOT_BLOCKED: 'Ce client n’est pas bloqué.',
      DELETION_SCHEDULED: 'La suppression de ce client est déjà programmée.',
      DELETION_NOT_SCHEDULED: 'Aucune suppression n’est programmée pour ce client.',
      DELETION_DUE:
        'La date de suppression est atteinte : la suppression ne peut plus être annulée.',
      SUBSCRIPTION_NOT_STARTED: 'L’abonnement de ce client n’a pas encore démarré.',
      SUBSCRIPTION_SUSPENDED: 'L’abonnement est suspendu. Reprenez-le avant cette action.',
      SUBSCRIPTION_NOT_SUSPENDED: 'L’abonnement de ce client n’est pas suspendu.',
      NO_PAID_PERIOD:
        'Ce client n’a aucune période payée en cours : changement d’offre impossible.',
      SAME_PLAN: 'Le client est déjà sur cette offre.',
      ORGANIZATION_SUSPENDED: 'Cette organisation est suspendue.',
      ORGANIZATION_NOT_SUSPENDED: 'Cette organisation n’est pas suspendue.',
      INVITATION_NOT_PENDING:
        'Ce client a déjà défini son mot de passe : aucune invitation en attente.',
      SLUG_TAKEN: 'Cette adresse est déjà utilisée.',
      SLUG_RESERVED: 'Cette adresse est réservée. Choisissez-en une autre.',
      SLUG_INVALID:
        'Adresse invalide : de 3 à 40 lettres, chiffres ou tirets, sans tiret au début ni à la fin.',
      SLUG_UNCHANGED: 'Cette adresse est déjà celle de l’organisation.',
      EMAIL_TAKEN: 'Un compte existe déjà avec cette adresse e-mail.',
      INVALID_SUBSCRIPTION: 'L’abonnement indiqué est incomplet ou incohérent.',
      INVALID_COVERAGE:
        'Dates de couverture invalides : le début ne doit pas être dans le futur et la fin doit être dans le futur.',
      INVALID_PLAN: 'Cette offre n’est pas disponible.',
      INVITATION_DELIVERY_FAILED:
        'Le client a été créé mais l’e-mail d’invitation n’a pas pu être envoyé. Renvoyez l’invitation.',
    }
    if (invitationErrors[error.code]) return invitationErrors[error.code]!

    if (error.status === 401)
      return 'Connexion refusée ou session expirée. Vérifiez vos identifiants et reconnectez-vous.'
    if (error.status === 403) return 'Vous n’avez pas la permission d’effectuer cette action.'
    if (error.status === 404) return 'Cet élément est introuvable ou n’est plus disponible.'
    if (error.status === 409)
      return 'Cette action est incompatible avec l’état actuel. Actualisez les données et vérifiez les éléments associés.'
    if (error.status === 429) return 'Trop de tentatives. Patientez avant de réessayer.'
    if (error.status === 400 || error.status === 422)
      return 'Vérifiez les informations saisies et les champs signalés.'
  }
  return 'Une erreur est survenue. Réessayez ou contactez votre administrateur avec la référence affichée.'
}
