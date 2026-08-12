import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    check().then((u) => {
      if (u?.available) setUpdate(u);
    }).catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setProgress("Downloading...");
    await update.downloadAndInstall((e) => {
      if (e.event === "Started" && e.data.contentLength) {
        setProgress(`Downloading... 0/${Math.round(e.data.contentLength / 1024)}KB`);
      } else if (e.event === "Progress") {
        setProgress(`Downloading...`);
      } else if (e.event === "Finished") {
        setProgress("Installing...");
      }
    });
    await relaunch();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && setDismissed(true)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Available</DialogTitle>
          <DialogDescription>
            Version {update.version} is ready to install.
          </DialogDescription>
        </DialogHeader>
        {installing && (
          <p className="text-sm text-muted-foreground">{progress}</p>
        )}
        <DialogFooter>
          {!installing && (
            <>
              <Button variant="outline" onClick={() => setDismissed(true)}>
                Later
              </Button>
              <Button onClick={handleInstall}>Update Now</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
