import * as React from "react";

export type InteractionContextValue = {
  disabled: boolean;
};

const InteractionContext = React.createContext<InteractionContextValue>({
  disabled: false,
});

export function useInteraction() {
  return React.useContext(InteractionContext);
}

export type InteractionScopeProps = {
  disabled?: boolean;
  children: React.ReactNode;
};

export function InteractionScope({
  disabled = false,
  children,
}: InteractionScopeProps) {
  const parent = useInteraction();

  // If the parent is disabled, this scope is strictly disabled.
  // If the parent is enabled, this scope can be disabled by the prop.
  // Effectively: disabled = parent.disabled || props.disabled
  const effectiveDisabled = parent.disabled || disabled;

  const value = React.useMemo(
    () => ({ disabled: effectiveDisabled }),
    [effectiveDisabled],
  );

  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
}
