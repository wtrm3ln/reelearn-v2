import type { ReactNode } from 'react';

/** Full-screen on phones, a rounded 9:16 phone-sized frame on larger screens. */
export function Frame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center sm:py-4">
      <div
        className={`relative h-full w-full overflow-hidden bg-black sm:aspect-[9/16] sm:w-auto sm:rounded-3xl sm:border sm:border-line ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
