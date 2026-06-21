import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A lightweight, shadcn-styled native <select>. We use the native control here
 * (instead of pulling in @radix-ui/react-select) because the only selector in
 * the app is a 2-option model picker — native semantics keep deps minimal.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
