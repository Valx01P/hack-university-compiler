// The error boundary of the routes. A loader or middleware that throws a response (a 404 for a
// project that doesn't exist, a 403 for a page you may not open) shows a page for that status;
// anything else, an exception or a failed request, shows "Something went wrong" with Try again.
import { isRouteErrorResponse, Link, useRevalidator, useRouteError } from "react-router";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";
import { NotFound } from "./not-found";
import styles from "./route-error.module.css";

export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound title={typeof error.data === "string" ? error.data : "Page not found"} />;
  }
  if (isRouteErrorResponse(error) && error.status === 403) {
    return (
      <section className={styles.page} aria-labelledby="error-heading">
        <title>No access · Taskboard</title>
        <h1 id="error-heading">You don't have access to this page</h1>
        <p>Ask an admin if you think you should.</p>
        <Link to="/projects">Back to projects</Link>
      </section>
    );
  }

  const detail = error instanceof ApiError ? `The server answered ${error.status} ${error.title}.` : "The page hit an error it couldn't recover from.";
  return (
    <section className={styles.page} aria-labelledby="error-heading" role="alert">
      <title>Error · Taskboard</title>
      <h1 id="error-heading">Something went wrong</h1>
      <p>{detail}</p>
      <Button onClick={() => revalidator.revalidate()} disabled={revalidator.state === "loading"}>
        Try again
      </Button>
    </section>
  );
}
