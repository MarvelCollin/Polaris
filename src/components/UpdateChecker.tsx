import { useUpdate } from "@/hooks/useUpdate";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function UpdateChecker() {
  const { status, version, progress, dismissed, dismiss, install } = useUpdate();

  if (status !== "available" && status !== "downloading" && status !== "installing") return null;
  if (dismissed && status === "available") return null;

  const busy = status === "downloading" || status === "installing";

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Tersedia</DialogTitle>
          <DialogDescription>
            Versi {version} siap dipasang.
          </DialogDescription>
        </DialogHeader>
        {busy && <p className="text-sm text-muted-foreground">{progress}</p>}
        <DialogFooter>
          {!busy && (
            <>
              <Button variant="outline" onClick={dismiss}>Nanti</Button>
              <Button onClick={install}>Update Sekarang</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
