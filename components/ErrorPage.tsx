import { PageHead } from "./PageHead";
import styles from "./styles.module.css";

export function ErrorPage({ statusCode }: { statusCode: number }) {
  const title = "Error";

  return (
    <>
      <PageHead title={title} />

      <div className={styles.container}>
        <main className={styles.main}>
          <h1>Error Loading Page</h1>

          {statusCode && <p>Error code: {statusCode}</p>}

          <img
            src="/assets/avatar-favicon/error.png"
            alt="Illustration of an astronaut drifting in space"
            className={styles.errorImage}
          />
        </main>
      </div>
    </>
  );
}
