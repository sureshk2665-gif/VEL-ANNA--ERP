/**
 * A button that respects the user's per-action rights for the current module (see
 * moduleRights() in src/bridge/engine.js): when `need` ('add' | 'edit' | 'del' | 'print' …)
 * is not allowed it is disabled with the same tooltip the engine shows. `need={null}` means
 * no specific right is required.
 */
export default function RightsButton({ rights, need, className = 'btn', children, ...props }) {
  const denied = need ? rights.deny(need) : null;
  return (
    <button className={className} disabled={!!denied} title={denied || undefined} {...props}>
      {children}
    </button>
  );
}
