'use client';
import { Dialog, DialogContent, DialogTitle } from '@/components/shadcn/dialog';
import { cn } from '@/lib/utils';
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        aria-labelledby={labelledBy}
        aria-describedby={undefined}
        showCloseButton={false}
        className={cn(
          'flex max-h-[85dvh] flex-col gap-0 overflow-y-auto p-0',
          className,
        )}
      >
        <DialogTitle className="sr-only">Edit saved knowledge</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
