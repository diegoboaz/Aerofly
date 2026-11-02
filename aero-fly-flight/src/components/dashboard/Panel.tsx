import type { ReactNode } from "react";

export function Panel({
  title,
  icon,
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      <header className="panel-header justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-cyan-300">
              {icon}
            </span>
          )}
          <h2 className="panel-title truncate">{title}</h2>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </header>
      <div className={`flex min-h-0 flex-1 flex-col p-4 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
