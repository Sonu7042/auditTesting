export const AUDIT_NAVIGATION_EVENT = "audit-navigation-request";

const requestAuditAction = (eventName, proceed) => {
  const event = new CustomEvent(eventName, {
    cancelable: true,
    detail: { proceed },
  });

  window.dispatchEvent(event);

  if (!event.defaultPrevented) {
    proceed();
  }
};

export const requestAuditNavigation = (
  navigate,
  destination,
  options,
  beforeNavigate,
) => {
  const proceed = () => {
    beforeNavigate?.();
    navigate(destination, options);
  };
  requestAuditAction(AUDIT_NAVIGATION_EVENT, proceed);
};
