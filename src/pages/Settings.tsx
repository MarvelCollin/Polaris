import { useState, useEffect, FormEvent } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useFontSize, FONT_SIZE_LABELS, type FontSize } from "@/hooks/useFontSize";
import { useUpdate } from "@/hooks/useUpdate";
import { changePassword } from "@/db/auth";
import { getPrinterSettings, savePrinterSettings, DEFAULT_PRINTER_SETTINGS, PAPER_SIZES, PITCHES, PITCH_LABELS, columnsForPaper, dialectForPaper, printableForPaper, isContinuousForm, maxColumns, PrinterSettings } from "@/db/settings";
import { listPrinters, printTest, printRuler, printerStatus, PrinterState } from "@/lib/printer";
import PagePreview from "@/components/PagePreview";
import SearchableSelect from "@/components/SearchableSelect";
import { resetTransactionData } from "@/database";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Moon, Sun, ArrowDownToLine, Trash2, Printer, RefreshCw } from "lucide-react";

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
          <Label>Lebar kertas</Label>
          <div className="flex gap-2">
            {PAPER_SIZES.map((paper) => (
              <Button
                key={paper}
                variant={settings.paper === paper ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  update({
                    paper,
                    printable: printableForPaper(paper),
                    width: columnsForPaper(paper),
                    dialect: dialectForPaper(paper),
                  })
                }
              >
                {paper} mm
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Lebar kertas yang benar benar dipasang di printer
            {isContinuousForm(settings.paper) ? ", continuous form dengan lubang traktor" : ""}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-printable">Area cetak</Label>
          <Input
            id="printer-printable"
            type="number"
            min={20}
            max={settings.paper}
            step={0.1}
            value={settings.printable}
            onChange={(e) => update({ printable: Number(e.target.value) || 0 })}
            onBlur={() => update({ printable: Math.min(settings.paper, Math.max(20, settings.printable || 48)) })}
          />
          <p className="text-sm text-muted-foreground">
            Lebar milimeter yang bisa dijangkau kepala cetak. Pada continuous form ini lebih sempit dari kertas karena jalur lubang traktor tidak tercetak.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Jenis printer</Label>
          <div className="flex gap-2">
            <Button
              variant={settings.dialect === "escpos" ? "default" : "outline"}
              size="sm"
              onClick={() => update({ dialect: "escpos" })}
            >
              Struk gulungan
            </Button>
            <Button
              variant={settings.dialect === "escp" ? "default" : "outline"}
              size="sm"
              onClick={() => update({ dialect: "escp" })}
            >
              Continuous form
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {settings.dialect === "escp"
              ? "Perintah ESC/P, 10 CPI, panjang halaman 11 inci"
              : "Perintah ESC/POS, judul besar, potong kertas"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-tear-feed">Maju ke posisi sobek</Label>
          <Input
            id="printer-tear-feed"
            type="number"
            min={0}
            max={40}
            value={settings.tearFeed}
            onChange={(e) => update({ tearFeed: Number(e.target.value) || 0 })}
            onBlur={() => update({ tearFeed: Math.min(40, Math.max(0, settings.tearFeed || 0)) })}
          />
          <p className="text-sm text-muted-foreground">
            Baris tambahan setelah struk supaya perforasi lewat gerigi sobek. Pakai 0 kalau fitur Tear Off printer sudah aktif.
          </p>
        </div>

        {settings.dialect === "escp" && (
          <div className="space-y-2">
            <Label>Kerapatan huruf</Label>
            <div className="flex flex-wrap gap-2">
              {PITCHES.map((cpi) => (
                <Button
                  key={cpi}
                  variant={settings.cpi === cpi ? "default" : "outline"}
                  size="sm"
                  onClick={() => update({ cpi })}
                >
                  {PITCH_LABELS[cpi]}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Dikirim ke printer setiap kali cetak, jadi hasilnya tidak lagi ikut setelan panel printer
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="printer-columns">Jumlah kolom</Label>
          <Input
            id="printer-columns"
            type="number"
            min={16}
            max={maxColumns(settings)}
            value={settings.width}
            onChange={(e) => update({ width: Number(e.target.value) || 0 })}
            onBlur={() => update({ width: Math.min(maxColumns(settings), Math.max(16, settings.width || 40)) })}
          />
          <p className="text-sm text-muted-foreground">
            Area cetak {settings.printable.toFixed(0)} mm pada kerapatan ini muat {maxColumns(settings)} kolom
          </p>
        </div>

        {isContinuousForm(settings.paper) && (
          <div className="space-y-2">
            <Label htmlFor="printer-page-lines">Baris per lembar</Label>
            <Input
              id="printer-page-lines"
              type="number"
              min={0}
              max={120}
              value={settings.pageLines}
              onChange={(e) => update({ pageLines: Number(e.target.value) || 0 })}
              onBlur={() => update({ pageLines: Math.min(120, Math.max(0, settings.pageLines || 0)) })}
            />
            <p className="text-sm text-muted-foreground">
              Isi 0 supaya form feed jadi data terakhir dan fitur Tear Off printer bekerja. Isi 66 hanya kalau printer tidak punya Tear Off dan kertas perlu didorong penuh.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Ukuran huruf</Label>
          <div className="flex gap-2">
            {[1, 2].map((scale) => (
              <Button
                key={scale}
                variant={settings.scale === scale ? "default" : "outline"}
                size="sm"
                onClick={() => update({ scale })}
              >
                {scale}x
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            2x menggandakan lebar huruf, jadi kolom efektif tinggal separuh
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-header">Judul struk</Label>
          <Input
            id="printer-header"
            value={settings.header}
            onChange={(e) => update({ header: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="printer-footer">Catatan bawah</Label>
          <Input
            id="printer-footer"
            value={settings.footer}
            onChange={(e) => update({ footer: e.target.value })}
          />
        </div>

        {!isContinuousForm(settings.paper) && (
          <div className="flex gap-2">
            <Button
              variant={settings.cut ? "default" : "outline"}
              size="sm"
              onClick={() => update({ cut: !settings.cut })}
            >
              Potong kertas
            </Button>
          </div>
        )}

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
    </div>
  );
}
