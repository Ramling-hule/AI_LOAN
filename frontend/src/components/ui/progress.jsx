import React from 'react';
import { cn } from '@/lib/utils.js';

const Progress = React.forwardRef(({ className, value = 0, indicatorClassName, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
      className
    )}
    {...props}
  >
    <div
      className={cn(
        'h-full w-full flex-1 bg-primary transition-all duration-500 ease-out',
        indicatorClassName
      )}
      style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value)) || 0}%)` }}
    />
  </div>
));
Progress.displayName = 'Progress';

export { Progress };
