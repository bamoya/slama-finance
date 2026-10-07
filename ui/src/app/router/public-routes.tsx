import { Route } from 'wouter'

import { LoginPage } from '../../features/identity'
import { ChangePasswordPage } from '../../features/identity'
import { ForgotPasswordPage } from '../../features/identity'
import { ResetPasswordPage } from '../../features/identity'

export const publicRoutes = (
  <>
    <Route path="/login" component={LoginPage} />
    <Route path="/forgot-password" component={ForgotPasswordPage} />
    <Route path="/reset-password" component={ResetPasswordPage} />
    <Route path="/set-password">
      <ChangePasswordPage />
    </Route>
  </>
)
