import { useState } from 'react';
import * as DS from '@aurorasolar/ds';
import { x } from '@xstyled/styled-components';
import { Formik } from 'formik';
import * as yup from 'yup';

type Mode = 'signup' | 'login';

const schema = yup.object({
  email: yup.string().email('Enter a valid email').required('Email is required'),
  password: yup.string().min(6, 'Use at least 6 characters').required('Password is required'),
});

export function AccountModal({
  open,
  onClose,
  onSignUp,
  onLogIn,
}: {
  open: boolean;
  onClose: () => void;
  onSignUp: (email: string, password: string) => { ok: boolean; error?: string };
  onLogIn: (email: string, password: string) => { ok: boolean; error?: string };
}) {
  const [mode, setMode] = useState<Mode>('signup');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <DS.Modal open={open} size="sm" handleClose={close}>
      <DS.ModalHeader>
        <x.span text="h2">{mode === 'signup' ? 'Create an account' : 'Welcome back'}</x.span>
      </DS.ModalHeader>
      <Formik
        initialValues={{ email: '', password: '' }}
        validationSchema={schema}
        onSubmit={(values, { setSubmitting }) => {
          const fn = mode === 'signup' ? onSignUp : onLogIn;
          const result = fn(values.email, values.password);
          setSubmitting(false);
          if (result.ok) close();
          else setError(result.error ?? 'Something went wrong.');
        }}
      >
        <DS.Form>
          <DS.ModalBody>
            <x.div display="flex" flexDirection="column" gap={4}>
              <x.p m={0} color="uiBodyCopy" text="body14">
                Save your best runs to this device so your high scores stick around.
              </x.p>
              {error && <DS.Banner variant="error">{error}</DS.Banner>}
              <DS.Field component={DS.TextInput} name="email" label="Email" placeholder="you@example.com" />
              <DS.Field component={DS.PasswordInput} name="password" label="Password" placeholder="At least 6 characters" />
              <x.div display="flex" alignItems="center" gap={1}>
                <x.span color="uiHelperCopy" text="body12">
                  {mode === 'signup' ? 'Already have an account?' : 'New here?'}
                </x.span>
                <DS.Button
                  variant="text"
                  action={() => {
                    setError(null);
                    setMode((m) => (m === 'signup' ? 'login' : 'signup'));
                  }}
                >
                  {mode === 'signup' ? 'Sign in' : 'Create one'}
                </DS.Button>
              </x.div>
            </x.div>
          </DS.ModalBody>
          <DS.ModalFooter>
            <x.div display="flex" gap={2} w="100%">
              <DS.Button type="submit" variant="cta">
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </DS.Button>
              <DS.Button variant="secondary" action={close}>
                Cancel
              </DS.Button>
            </x.div>
          </DS.ModalFooter>
        </DS.Form>
      </Formik>
    </DS.Modal>
  );
}
