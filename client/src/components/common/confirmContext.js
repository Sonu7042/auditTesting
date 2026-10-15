import { createContext, useContext } from "react";

export const ConfirmContext = createContext(null);

// const { confirm, ask } = useConfirm();
// confirm({ title, message, points, confirmLabel, tone }) -> Promise<boolean>
// ask({ ...same, input: { label, required, placeholder } })  -> Promise<string | null>  (null when cancelled)
export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
};
