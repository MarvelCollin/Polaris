import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  authenticate,
  getStoredRefreshToken,
  clearTokens,
  getValidAccessToken,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  DriveFile,
} from "@/db/backup";
import {
  Cloud,
  CloudOff,
  Upload,
  Download,
  Trash2,
  LogOut,
  RefreshCw,
} from "lucide-react";

export default function Backup() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [backups, setBackups] = useState<DriveFile[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<DriveFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DriveFile | null>(null);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    setLoading(true);
    try {
      const refresh = await getStoredRefreshToken();
      if (refresh) {
        setConnected(true);
        await loadBackups();
      }
    } catch {
      // not connected
    }
    setLoading(false);
  }

  async function handleConnect() {
    setActionLoading("connect");
    setError("");
    try {
      await authenticate();
      setConnected(true);
      setSuccess("Berhasil terhubung ke Google Drive!");
      await loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setActionLoading(null);
  }

  async function handleDisconnect() {
    await clearTokens();
    setConnected(false);
    setBackups([]);
    setSuccess("");
  }

  async function loadBackups() {
    try {
      const token = await getValidAccessToken();
      const files = await listBackups(token);
      setBackups(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBackup() {
    setActionLoading("backup");
    setError("");
    setSuccess("");
    try {
      const token = await getValidAccessToken();
      const file = await createBackup(token);
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
      const token = await getValidAccessToken();
      await restoreBackup(token, confirmRestore.id);
      setSuccess(
        "Backup berhasil didownload. Restart aplikasi untuk menerapkan restore."
      );
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
      const token = await getValidAccessToken();
      await deleteBackup(token, file.id);
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
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Memuat...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Backup & Restore</h1>
        {connected && (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="gap-1">
              <Cloud className="size-3" /> Terhubung
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              <LogOut className="mr-1 size-3.5" /> Disconnect
            </Button>
          </div>
        )}
      </div>

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

      {!connected ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <CloudOff className="size-16 text-muted-foreground/30" />
          <p className="text-muted-foreground">
            Hubungkan ke Google Drive untuk backup data
          </p>
          <Button
            onClick={handleConnect}
            disabled={actionLoading === "connect"}
            size="lg"
          >
            <Cloud className="mr-2 size-4" />
            {actionLoading === "connect"
              ? "Menghubungkan..."
              : "Hubungkan Google Drive"}
          </Button>
          <p className="max-w-md text-center text-xs text-muted-foreground">
            Data backup disimpan di folder &quot;Sahabat Sentarum Backup&quot; di
            Google Drive Anda. Kredensial OAuth diproses secara aman melalui
            backend aplikasi.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <Button onClick={handleBackup} disabled={!!actionLoading}>
              <Upload className="mr-1 size-4" />
              {actionLoading === "backup" ? "Membackup..." : "Backup Sekarang"}
            </Button>
            <Button
              variant="outline"
              onClick={loadBackups}
              disabled={!!actionLoading}
            >
              <RefreshCw className="mr-1 size-4" /> Refresh
            </Button>
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
                    <TableCell className="font-mono text-xs">
                      {file.name}
                    </TableCell>
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
              Belum ada backup. Klik &quot;Backup Sekarang&quot; untuk membuat
              backup pertama.
            </p>
          )}
        </>
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
    </div>
  );
}
