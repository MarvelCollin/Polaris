import { useState, useEffect, FormEvent } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useFontSize, FONT_SIZE_LABELS, type FontSize } from "@/hooks/useFontSize";
import { useUpdate } from "@/hooks/useUpdate";
import { changePassword } from "@/db/auth";
import { getPrinterSettings, savePrinterSettings, DEFAULT_PRINTER_SETTINGS, PrinterSettings } from "@/db/settings";
import { listPrinters, printTest, printRuler, printPositionTest, printerStatus, PrinterState } from "@/lib/printer";
import PagePreview from "@/components/PagePreview";
import SearchableSelect from "@/components/SearchableSelect";
import { resetTransactionData } from "@/database";
import { closeApp } from "@/lib/app";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Moon, Sun, ArrowDownToLine, Trash2, Printer, RefreshCw, Power } from "lucide-react";

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
  const { status, version, current, error, install, refresh, dismissed, reopen, checkedAt } = useUpdate();
  const busy = status === "checking" || status === "downloading" || status === "installing";

  const detail = () => {
    if (status === "checking") return "Memeriksa pembaruan...";
    if (status === "downloading" || status === "installing") return "Sedang memasang pembaruan...";
    if (status === "available") return `Versi ${version} tersedia`;
    if (status === "error") return `Gagal memeriksa: ${error ?? "tidak diketahui"}`;
    if (checkedAt) {
      const time = `${String(checkedAt.getHours()).padStart(2, "0")}:${String(checkedAt.getMinutes()).padStart(2, "0")}`;
      return `Sudah versi terbaru, dicek ${time}`;
    }
    return "Belum diperiksa";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pembaruan Aplikasi</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Versi terpasang {current ?? "-"}</p>
            <p className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {detail()}
            </p>
          </div>
          {status === "available" ? (
            <Button size="sm" onClick={dismissed ? reopen : install} disabled={busy}>
              <ArrowDownToLine className="mr-2 size-4" />
              {dismissed ? "Lihat Update" : "Update Sekarang"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={`mr-2 size-4 ${status === "checking" ? "animate-spin" : ""}`} />
              Cek Pembaruan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PrinterSection() {
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [saved, setSaved] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [printers, setPrinters] = useState<string[]>([]);
  const [state, setState] = useState<PrinterState | null>(null);
  const [stateError, setStateError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPrinterSettings()
      .then((stored) => {
        setSettings(stored);
        setSaved(stored);
        refreshState(stored.name);
      })
      .catch(() => {});
    refreshPrinters();
  }, []);

  async function refreshState(name: string) {
    if (!name) {
      setState(null);
      setStateError("");
      return;
    }
    try {
      setState(await printerStatus(name));
      setStateError("");
    } catch (e) {
      setState(null);
      setStateError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshPrinters() {
    try {
      setPrinters(await listPrinters());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const printerNames = printers.includes(settings.name) || !settings.name ? printers : [...printers, settings.name];
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  function update(patch: Partial<PrinterSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
    setStatus("");
  }

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await savePrinterSettings(settings);
      setSaved(settings);
      setStatus("Pengaturan printer disimpan");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function handleRuler() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await printRuler(settings);
      setStatus("Lembar diagnosa terkirim, lihat baris mana yang paling lebar");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function handlePosition() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await printPositionTest(settings);
      setStatus("Lembar uji posisi terkirim, foto ketiga lembarnya");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function handleTest() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await printTest(settings);
      setStatus("Struk tes terkirim ke printer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printer Struk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Cetak otomatis</p>
            <p className="text-sm text-muted-foreground">Struk dicetak setelah transaksi tersimpan</p>
          </div>
          <Button
            variant={settings.enabled ? "default" : "outline"}
            size="sm"
            onClick={() => update({ enabled: !settings.enabled })}
          >
            {settings.enabled ? "Aktif" : "Nonaktif"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Printer</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchableSelect
                options={printerNames.map((name, index) => ({ value: index, label: name }))}
                value={printerNames.indexOf(settings.name)}
                emptyLabel="Pilih printer"
                placeholder="Cari printer..."
                onChange={(index) => {
                  const name = printerNames[index] ?? "";
                  update({ name, enabled: name ? true : settings.enabled });
                  refreshState(name);
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshPrinters();
                refreshState(settings.name);
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          {settings.name && (
            <p className={`text-sm ${state?.ready ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {stateError
                ? `Tidak terhubung: ${stateError}`
                : state
                  ? `Status: ${state.message}${state.jobs > 0 ? ` (${state.jobs} antrian)` : ""}`
                  : "Memeriksa status..."}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-header">Nama toko</Label>
          <Input
            id="printer-header"
            value={settings.header}
            onChange={(e) => update({ header: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-address">Alamat toko</Label>
          <Input
            id="printer-address"
            value={settings.address}
            onChange={(e) => update({ address: e.target.value })}
            placeholder="Kosongkan kalau tidak perlu dicetak"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-phone">Nomor telepon</Label>
          <Input
            id="printer-phone"
            value={settings.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="Kosongkan kalau tidak perlu dicetak"
          />
        </div>

        <div className="space-y-2">
          <Label>Pratinjau hasil cetak</Label>
          <div className="overflow-auto">
            <PagePreview settings={settings} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={busy || !dirty}>Simpan</Button>
          <Button variant="outline" onClick={handleTest} disabled={busy || !settings.name}>
            <Printer className="mr-2 size-4" />
            Tes Cetak
          </Button>
          <Button variant="outline" onClick={handleRuler} disabled={busy || !settings.name}>
            Cetak Diagnosa
          </Button>
          <Button variant="outline" onClick={handlePosition} disabled={busy || !settings.name}>
            Cetak Uji Posisi
          </Button>

          {dirty && <span className="text-sm text-amber-600 dark:text-amber-400">Belum disimpan</span>}
        </div>

        {status && <p className="text-sm text-green-600 dark:text-green-400">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
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

function ExitSection() {
  const [confirm, setConfirm] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tutup Aplikasi</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Menutup Polaris sepenuhnya. Pastikan transaksi yang sedang berjalan sudah tersimpan.
          </p>
          <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
            <Power className="mr-2 size-4" />
            Tutup
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => closeApp()}
        title="Tutup Aplikasi"
        message="Polaris akan ditutup. Perubahan yang belum disimpan akan hilang."
        confirmLabel="Tutup"
      />
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
      <PrinterSection />
      <ResetSection />
      <ExitSection />
    </div>
  );
}
