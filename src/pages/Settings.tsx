import { useState, FormEvent } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useFontSize, FONT_SIZE_LABELS, type FontSize } from "@/hooks/useFontSize";
import { useUpdate } from "@/hooks/useUpdate";
import { changePassword } from "@/db/auth";
import { resetTransactionData } from "@/database";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Moon, Sun, ArrowDownToLine, Trash2 } from "lucide-react";

const fontSizes: FontSize[] = ["small", "medium", "large"];

function ThemeSection() {
  const { theme, toggle } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tampilan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Tema</p>
            <p className="text-sm text-muted-foreground">
              {theme === "light" ? "Mode Terang" : "Mode Gelap"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggle}>
            {theme === "light" ? <Moon className="mr-2 size-4" /> : <Sun className="mr-2 size-4" />}
            {theme === "light" ? "Mode Gelap" : "Mode Terang"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FontSizeSection() {
  const { fontSize, setFontSize } = useFontSize();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ukuran Font</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {fontSizes.map((size) => (
            <Button
              key={size}
              variant={fontSize === size ? "default" : "outline"}
              size="sm"
              onClick={() => setFontSize(size)}
            >
              {FONT_SIZE_LABELS[size]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!current || !newPw || !confirm) {
      setError("Semua field harus diisi");
      return;
    }
    if (newPw !== confirm) {
      setError("Password baru tidak cocok");
      return;
    }
    if (newPw.length < 4) {
      setError("Password minimal 4 karakter");
      return;
    }

    setLoading(true);
    const ok = await changePassword(current, newPw);
    setLoading(false);

    if (ok) {
      setCurrent("");
      setNewPw("");
      setConfirm("");
      setSuccess(true);
    } else {
      setError("Password lama salah");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ubah Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label>Password Lama</Label>
            <Input type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setSuccess(false); }} />
          </div>
          <div className="space-y-2">
            <Label>Password Baru</Label>
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Konfirmasi Password Baru</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400">Password berhasil diubah</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UpdateSection() {
  const { status, version, install, reopen, dismissed } = useUpdate();

  if (status !== "available") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pembaruan Aplikasi</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Versi {version} tersedia</p>
            <p className="text-sm text-muted-foreground">Update untuk mendapatkan fitur terbaru</p>
          </div>
          <Button size="sm" onClick={dismissed ? reopen : install}>
            <ArrowDownToLine className="mr-2 size-4" />
            {dismissed ? "Lihat Update" : "Update Sekarang"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResetSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleReset() {
    setShowConfirm(false);
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await resetTransactionData();
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset Data Transaksi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Menghapus semua riwayat penjualan, pembelian, retur, dan utang/piutang.
          Data produk, kategori, dan pelanggan tetap tersimpan.
        </p>
        <Button variant="destructive" onClick={() => setShowConfirm(true)} disabled={loading}>
          <Trash2 className="mr-2 size-4" />
          {loading ? "Menghapus..." : "Reset Riwayat Transaksi"}
        </Button>
        {success && <p className="text-sm text-green-600 dark:text-green-400">Semua data transaksi berhasil dihapus</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <ConfirmDialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleReset}
          title="Reset Data Transaksi"
          message="Yakin ingin menghapus SEMUA riwayat penjualan, pembelian, retur, dan utang/piutang? Aksi ini tidak dapat dibatalkan."
        />
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pengaturan</h1>
      <UpdateSection />
      <ThemeSection />
      <FontSizeSection />
      <PasswordSection />
      <ResetSection />
    </div>
  );
}
