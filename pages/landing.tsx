import type { GetServerSideProps } from "next";

// The landing page was promoted to `/`. Keep this route as a permanent
// redirect so any shared `/landing` links continue to resolve.
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/",
    permanent: true,
  },
});

export default function LandingRedirect() {
  return null;
}
