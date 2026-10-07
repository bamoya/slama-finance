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
