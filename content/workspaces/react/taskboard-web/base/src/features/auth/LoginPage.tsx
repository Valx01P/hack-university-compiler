// The login form. It posts with a React 19 form action through useActionState, which tracks the
// pending state and keeps the error and the typed email between attempts. On success the user goes
// to ?next= (when it's safe) and the cookie the API set rides along on every later request.
import { useQueryClient } from "@tanstack/react-query";
import { useActionState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { ApiError } from "@/lib/api-client";
import { login, meQuery } from "./api";
import styles from "./LoginPage.module.css";
import { safeNext } from "./safe-next";

interface LoginState {
  email: string;
  error: string | null;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [state, formAction, isPending] = useActionState(
    async (_previous: LoginState, formData: FormData): Promise<LoginState> => {
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      try {
        const { user } = await login({ email, password });
        queryClient.setQueryData(meQuery().queryKey, user);
        await navigate(next, { replace: true });
        return { email, error: null };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return { email, error: "Wrong email or password." };
        if (error instanceof ApiError && error.status === 422) return { email, error: "Enter your email and your password." };
        return { email, error: "Couldn't reach the server. Try again in a moment." };
      }
    },
    { email: "", error: null },
  );

  return (
    <main className={styles.page}>
      <title>Log in · Taskboard</title>
      <form action={formAction} className={styles.card} aria-labelledby="login-heading">
        <h1 id="login-heading" className={styles.heading}>
          Log in to {import.meta.env.VITE_APP_NAME}
        </h1>
        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="username" defaultValue={state.email} required autoFocus />
        </Field>
        <Field label="Password">
          <TextInput name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Logging in..." : "Log in"}
        </Button>
        <p className={styles.demo}>
          Demo accounts: ada@example.com, grace@example.com, linus@example.com, and margaret@example.com, all with the password
          “correct horse battery staple”.
        </p>
      </form>
    </main>
  );
}
