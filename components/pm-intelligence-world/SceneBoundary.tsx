import dynamic from "next/dynamic";
import { Component, type ReactNode, useState } from "react";

import type { SectionId } from "@/content/pm-intelligence-world/types";
import type { SceneSelection } from "@/lib/pm-intelligence-world/scene-layout";

import styles from "./experience.module.css";

const failureMessage =
  "The 3D view is unavailable. The complete introduction remains below.";
const Scene = dynamic(() => import("./WorldScene").then((m) => m.WorldScene), {
  ssr: false,
  loading: () => (
    <p className={styles.sceneStatus} role="status">
      Opening the spatial view… The introduction is ready below.
    </p>
  ),
});
class RenderBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status" className={styles.sceneStatus}>
        {failureMessage}
      </p>
    ) : (
      this.props.children
    );
  }
}
export function SceneBoundary({
  selection,
  onFocus,
}: {
  selection: SceneSelection;
  onFocus: (section: SectionId) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <RenderBoundary>
      {failed ? (
        <p className={styles.sceneStatus} role="status">
          {failureMessage}
        </p>
      ) : (
        <>
          <WorldCaption />
          <Scene
            selection={selection}
            onFocus={onFocus}
            onFailure={() => setFailed(true)}
          />
        </>
      )}
    </RenderBoundary>
  );
}
function WorldCaption() {
  return (
    <p className={styles.sceneStatus}>
      Illustrative spatial view · select a platform or use the section
      navigation. No live agents or workflows.
    </p>
  );
}
