import { cn } from '@/lib/utils'

function Label({ className, ...props }) {
  return (
    <label
      className={cn('block text-sm font-medium mb-1', className)}
      {...props}
    />
  )
}

export { Label }
