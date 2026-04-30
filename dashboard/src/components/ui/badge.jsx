import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:     'bg-primary/10 text-primary',
        secondary:   'bg-secondary text-secondary-foreground',
        destructive: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        outline:     'border border-border text-foreground',
        success:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        warning:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        info:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        purple:      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
