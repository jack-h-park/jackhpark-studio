import * as React from "react";

export type InteractionContextValue = {
  disabled: boolean;
  loading: boolean;
  readOnly: boolean;
};

const InteractionContext = React.createContext<InteractionContextValue>({
  disabled: false,
  loading: false,
  readOnly: false,
});

export function useInteraction() {
  return React.useContext(InteractionContext);
}

export type InteractionScopeProps = {
  disabled?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  children: React.ReactNode;
};

export function InteractionScope({
  disabled = false,
  loading = false,
  readOnly = false,
  children,
}: InteractionScopeProps) {
  const parent = useInteraction();

  // If the parent is disabled, this scope is strictly disabled.
  // If the parent is loading, this scope is effectively disabled for interaction.
  const effectiveDisabled =
    parent.disabled || disabled || parent.loading || loading;

  // loading and readOnly status is also cumulative
  const effectiveLoading = parent.loading || loading;
  const effectiveReadOnly = parent.readOnly || readOnly;

  const value = React.useMemo(
    () => ({
      disabled: effectiveDisabled,
      loading: effectiveLoading,
      readOnly: effectiveReadOnly,
    }),
    [effectiveDisabled, effectiveLoading, effectiveReadOnly],
  );

  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
}
