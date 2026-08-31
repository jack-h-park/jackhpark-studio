import { PageHead } from "./PageHead";
import styles from "./styles.module.css";

export function ErrorPage({ statusCode }: { statusCode?: number }) {
  const isNotFound = statusCode === 404;
  const title = isNotFound ? "Page not found" : "Something went wrong";

  return (
    <>
      <PageHead title={title} />

      <div className={styles.container}>
        <main className={styles.main}>
          <p className={styles.eyebrow}>JACK H. PARK</p>
          <h1>{title}</h1>

          <p className={styles.message}>
            {isNotFound
              ? "The page you requested could not be found."
              : "The page could not be loaded. Please try again or return home."}
          </p>

          <img
            src="/assets/avatar-favicon/error.png"
            alt="Illustration of an astronaut drifting in space"
            className={styles.errorImage}
          />

          <div className={styles.actions}>
            <a href="" className={styles.primaryAction}>
              Try again
            </a>
            <a href="/" className={styles.secondaryAction}>
              Go home
            </a>
          </div>

          {statusCode && (
            <p className={styles.errorCode}>Error code: {statusCode}</p>
          )}
        </main>
      </div>
    </>
  );
}
