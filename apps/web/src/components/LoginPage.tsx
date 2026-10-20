import { LoginForm } from './LoginForm';

/** صفحة الدخول — تُقدَّم على / و /login (200 دائمًا؛ verify.sh يفحص الجذر) */
export function LoginPage() {
  return (
    <section
      className="grid min-h-screen place-items-center px-4 py-6"
      style={{ background: 'linear-gradient(160deg, var(--side) 0 55%, var(--bg) 55%)' }}
    >
      <LoginForm />
    </section>
  );
}
