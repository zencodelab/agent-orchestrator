import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        idle: "border-slate-600/50 bg-slate-700/30 text-slate-300",
        running: "border-blue-500/40 bg-blue-500/15 text-blue-300",
        completed: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        error: "border-red-500/40 bg-red-500/15 text-red-300",
      },
    },
    defaultVariants: { variant: "idle" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
