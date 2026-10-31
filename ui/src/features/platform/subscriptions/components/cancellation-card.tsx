import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { OwnerSubscription } from '../../../../api/generated/models'
import {
  getGetOwnerSubscriptionQueryKey,
  useSetOwnerSubscriptionCancellation,
} from '../../../../api/generated/subscriptions/subscriptions'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'

export function CancellationCard({ s }: { s: OwnerSubscription }) {
  const cache = useQueryClient(),
    mutation = useSetOwnerSubscriptionCancellation(),
    [open, setOpen] = useState(false)
  // The API only accepts cancellation while active; a pending cancellation can still be undone.
  const resumable = s.cancelAtPeriodEnd && s.status !== 'expired'
  if (s.planCode === 'trial' || !s.paidThroughAt || (s.status !== 'active' && !resumable))
    return null
  const resuming = s.cancelAtPeriodEnd,
    end = displayDateTime(s.paidThroughAt, 'Africa/Casablanca')
  const title = translate(resuming ? 'Resume subscription' : 'Cancel at period end')
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Cancellation')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {resuming
            ? translate('Your subscription will stop at the end of the covered period.')
            : translate('Cancelling keeps your access until the end of the covered period.')}{' '}
          {end}
        </p>
        <Button variant={resuming ? 'default' : 'outline'} onClick={() => setOpen(true)}>
          {title}
        </Button>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) mutation.reset()
          }}
        >
          <DialogContent>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <DialogDescription className="my-4 text-sm text-muted-foreground">
              {resuming
                ? translate('Your plan will remain active and can be renewed after payment.')
                : translate(
                    'No refund is made. Access continues until the end of the covered period, then stops.',
                  )}{' '}
              {end}
            </DialogDescription>
            <FormError error={mutation.error} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {translate('Back')}
              </Button>
              <Button
                variant={resuming ? 'default' : 'destructive'}
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate(
                    { data: { cancelAtPeriodEnd: !resuming } },
                    {
                      onSuccess: () => {
                        setOpen(false)
                        void cache.invalidateQueries({
                          queryKey: getGetOwnerSubscriptionQueryKey(),
                        })
                      },
                    },
                  )
                }
              >
                {translate(resuming ? 'Confirm resume' : 'Confirm cancellation')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
