import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  gdriveAuth,
  gdriveIsConnected,
  gdriveDisconnect,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getAutoBackupStatus,
  DriveFile,
} from "@/db/backup";
import Spinner from "@/components/Spinner";
import { Upload, Download, Trash2, RefreshCw, Link, Unlink } from "lucide-react";

export default function Backup() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [backups, setBackups] = useState<DriveFile[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<DriveFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DriveFile | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastAutoBackup, setLastAutoBackup] = useState<number | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    try {
      const isConn = await gdriveIsConnected();
      setConnected(isConn);
      if (isConn) {
        const [status, files] = await Promise.all([
          getAutoBackupStatus(),
          listBackups(),
        ]);
        setLastAutoBackup(status.last_backup_ts ?? null);
        setBackups(files);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  async function loadBackups() {
    try {
      const files = await listBackups();
      setBackups(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleConnect() {
    setActionLoading("connect");
    setError("");
    setSuccess("");
    try {
      await gdriveAuth();
      setConnected(true);
      setSuccess("Google Drive berhasil terhubung!");
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  async function handleDisconnect() {
    setConfirmDisconnect(false);
    setActionLoading("disconnect");
    setError("");
    try {
      await gdriveDisconnect();
      setConnected(false);
      setBackups([]);
      setSuccess("Google Drive terputus.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  async function handleBackup() {
    setActionLoading("backup");
    setError("");
    setSuccess("");
    try {
      const file = await createBackup();
      setSuccess(`Backup berhasil: ${file.name}`);
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  async function handleRestore() {
    if (!confirmRestore) return;
    setConfirmRestore(null);
    setActionLoading("restore");
    setError("");
    setSuccess("");
    try {
      await restoreBackup(confirmRestore.id);
      setSuccess("Backup berhasil didownload. Restart aplikasi untuk menerapkan restore.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const file = confirmDelete;
    setConfirmDelete(null);
    setActionLoading("delete");
    setError("");
    try {
      await deleteBackup(file.id);
      setSuccess("Backup berhasil dihapus");
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  function formatSize(bytes?: string) {
    if (!bytes) return "-";
    const b = parseInt(bytes);
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function formatDate(iso?: string) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("id-ID");
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="animate-fade-in">
        <h1 className="mb-4 text-2xl font-bold">Backup & Restore</h1>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-sm text-muted-foreground">
            Hubungkan Google Drive untuk backup otomatis setiap 6 jam.
          </p>
          <Button onClick={handleConnect} disabled={!!actionLoading}>
            <Link className="mr-1 size-4" />
            {actionLoading === "connect" ? "Menghubungkan..." : "Hubungkan Google Drive"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Backup & Restore</h1>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-[#1b508a]/30 bg-[#1b508a]/10 p-3 text-sm text-[#1b508a] dark:text-[#5ba0d0]">
          {success}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <Button onClick={handleBackup} disabled={!!actionLoading}>
          <Upload className="mr-1 size-4" />
          {actionLoading === "backup" ? "Membackup..." : "Backup Sekarang"}
        </Button>
        <Button variant="outline" onClick={loadBackups} disabled={!!actionLoading}>
          <RefreshCw className="mr-1 size-4" /> Refresh
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {lastAutoBackup && (
            <span className="text-xs text-muted-foreground">
              Auto backup terakhir: {new Date(lastAutoBackup * 1000).toLocaleString("id-ID")}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDisconnect(true)}
            disabled={!!actionLoading}
          >
            <Unlink className="mr-1 size-3.5" />
            Putuskan
          </Button>
        </div>
      </div>

      {backups.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama File</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Ukuran</TableHead>
              <TableHead className="w-32">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-mono text-xs">{file.name}</TableCell>
                <TableCell>{formatDate(file.createdTime)}</TableCell>
                <TableCell>{formatSize(file.size)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmRestore(file)}
                      disabled={!!actionLoading}
                    >
                      <Download className="mr-1 size-3" /> Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setConfirmDelete(file)}
                      disabled={!!actionLoading}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Belum ada backup. Klik &quot;Backup Sekarang&quot; untuk membuat backup pertama.
        </p>
      )}

      <ConfirmDialog
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        onConfirm={handleRestore}
        title="Restore Backup"
        message={`Restore dari "${confirmRestore?.name}"? Database saat ini akan diganti. Aplikasi perlu di-restart setelah restore.`}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Hapus Backup"
        message={`Yakin ingin menghapus backup "${confirmDelete?.name}"? Aksi ini tidak dapat dibatalkan.`}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={handleDisconnect}
        title="Putuskan Google Drive"
        message="Auto backup akan berhenti. Backup yang sudah ada di Google Drive tidak akan dihapus."
      />
    </div>
  );
}
