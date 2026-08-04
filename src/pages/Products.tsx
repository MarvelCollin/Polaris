import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useSort } from "@/hooks/useSort";
import { getProducts, createProduct, updateProduct, deleteProduct, generateProductCode, updateStock } from "@/db/products";
import { getCategories } from "@/db/categories";
import { ProductWithCategory } from "@/types/index";
import { formatRupiah } from "@/types/index";
import { pickAndSaveImage, getImageUrl } from "@/lib/images";
import ProductThumb from "@/components/ProductThumb";
import SortableHead from "@/components/SortableHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Pencil, Trash2, ImagePlus, X, PackagePlus } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";

const emptyForm = {
  kode: "", nama: "", kategori_id: 0, satuan: "pcs",
  harga_beli: 0, harga_jual: 0, stok: 0, stok_minimum: 0,
  gambar: null as string | null,
};

export default function Products() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState(0);
  const debouncedSearch = useDebounce(search);

  const { data: products, refetch } = useQuery(
    useCallback(() => getProducts(debouncedSearch || undefined, catFilter || undefined), [debouncedSearch, catFilter])
  );
  const { data: categories } = useQuery(useCallback(() => getCategories(), []));
  const { sorted, sortKey, sortDir, toggleSort } = useSort<ProductWithCategory>(products);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductWithCategory | null>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stockTarget, setStockTarget] = useState<ProductWithCategory | null>(null);
  const [stockValue, setStockValue] = useState(0);

  function set(key: string, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function openAdd() {
    setEditing(null);
    const kode = await generateProductCode();
    setForm({ ...emptyForm, kode, kategori_id: categories?.[0]?.id ?? 0 });
    setError("");
    setPreviewUrl(null);
    setModalOpen(true);
  }

  function openEdit(p: ProductWithCategory) {
    setEditing(p);
    setForm({
      kode: p.kode, nama: p.nama, kategori_id: p.kategori_id, satuan: p.satuan,
      harga_beli: p.harga_beli, harga_jual: p.harga_jual, stok: p.stok, stok_minimum: p.stok_minimum,
      gambar: p.gambar,
    });
    setError("");
    if (p.gambar) {
      getImageUrl(p.gambar).then(setPreviewUrl);
    } else {
      setPreviewUrl(null);
    }
    setModalOpen(true);
  }

  async function handlePickImage() {
    try {
      const path = await pickAndSaveImage();
      if (path) {
        setForm((f) => ({ ...f, gambar: path }));
        const url = await getImageUrl(path);
        setPreviewUrl(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function removeImage() {
    setForm((f) => ({ ...f, gambar: null }));
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function handleSave() {
    if (!form.nama.trim() || !form.kategori_id) {
      setError("Nama dan kategori wajib diisi");
      return;
    }
    try {
      if (editing) {
        await updateProduct(editing.id, form);
      } else {
        await createProduct(form);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openStock(p: ProductWithCategory) {
    setStockTarget(p);
    setStockValue(p.stok);
  }

  async function handleStockSave() {
    if (!stockTarget) return;
    try {
      await updateStock(stockTarget.id, stockValue);
      setStockTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProduct(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
    }
  }

  const sh = (label: string, key: string, className?: string) => (
    <SortableHead label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} className={className} />
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produk</h1>
        <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari kode atau nama..." />
        <div className="w-48">
          <SearchableSelect
            options={categories?.map((c) => ({ value: c.id, label: c.nama })) ?? []}
            value={catFilter}
            onChange={setCatFilter}
            placeholder="Cari kategori..."
            emptyLabel="Semua Kategori"
          />
        </div>
      </div>

      {sorted && sorted.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Foto</TableHead>
              {sh("Kode", "kode")}
              {sh("Nama", "nama")}
              {sh("Kategori", "kategori_nama")}
              {sh("Satuan", "satuan")}
              {sh("Harga Beli", "harga_beli")}
              {sh("Harga Jual", "harga_jual")}
              {sh("Stok", "stok")}
              <TableHead className="w-20">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <ProductThumb path={p.gambar} size="h-10 w-10" />
                </TableCell>
                <TableCell className="font-mono text-xs">{p.kode}</TableCell>
                <TableCell>{p.nama}</TableCell>
                <TableCell>{p.kategori_nama}</TableCell>
                <TableCell>{p.satuan}</TableCell>
                <TableCell>{formatRupiah(p.harga_beli)}</TableCell>
                <TableCell>{formatRupiah(p.harga_jual)}</TableCell>
                <TableCell>
                  {p.stok <= p.stok_minimum ? (
                    <Badge variant="destructive">{p.stok}</Badge>
                  ) : (
                    <Badge variant="secondary">{p.stok}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => openStock(p)} title="Update Stok">
                      <PackagePlus className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(p)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada produk</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Produk" : "Tambah Produk"}>
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1">
              {previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} className="h-24 w-24 rounded-lg object-cover" />
                  <button
                    onClick={removeImage}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePickImage}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <ImagePlus className="size-6" />
                  <span className="mt-1 text-[10px]">Pilih Foto</span>
                </button>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kode (otomatis)</Label>
                  <Input value={form.kode} onChange={(e) => set("kode", e.target.value)} placeholder="Auto" />
                </div>
                <div>
                  <Label>Nama</Label>
                  <Input value={form.nama} onChange={(e) => set("nama", e.target.value)} placeholder="Semen Tiga Roda" />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kategori</Label>
              <SearchableSelect
                options={categories?.map((c) => ({ value: c.id, label: c.nama })) ?? []}
                value={form.kategori_id}
                onChange={(v) => set("kategori_id", v)}
                placeholder="Cari kategori..."
                emptyLabel="Pilih..."
              />
            </div>
            <div>
              <Label>Satuan</Label>
              <Input value={form.satuan} onChange={(e) => set("satuan", e.target.value)} placeholder="pcs, kg, sak" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Harga Beli</Label>
              <Input type="number" value={form.harga_beli || ""} onChange={(e) => set("harga_beli", Number(e.target.value))} />
            </div>
            <div>
              <Label>Harga Jual</Label>
              <Input type="number" value={form.harga_jual || ""} onChange={(e) => set("harga_jual", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stok</Label>
              <Input type="number" value={form.stok || ""} onChange={(e) => set("stok", Number(e.target.value))} />
            </div>
            <div>
              <Label>Stok Minimum</Label>
              <Input type="number" value={form.stok_minimum || ""} onChange={(e) => set("stok_minimum", Number(e.target.value))} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!stockTarget} onClose={() => setStockTarget(null)} title={`Update Stok - ${stockTarget?.nama ?? ""}`}>
        {stockTarget && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produk</span>
                <span className="font-medium">{stockTarget.nama}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Stok Saat Ini</span>
                <span className="font-medium">{stockTarget.stok} {stockTarget.satuan}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Stok Minimum</span>
                <span className="font-medium">{stockTarget.stok_minimum} {stockTarget.satuan}</span>
              </div>
            </div>
            <div>
              <Label>Stok Baru</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-xs" onClick={() => setStockValue((v) => Math.max(0, v - 1))}>
                  <Minus className="size-3" />
                </Button>
                <Input
                  type="number"
                  value={stockValue}
                  onChange={(e) => setStockValue(Number(e.target.value))}
                  className="w-28 text-center"
                />
                <Button variant="outline" size="icon-xs" onClick={() => setStockValue((v) => v + 1)}>
                  <Plus className="size-3" />
                </Button>
                <span className="text-sm text-muted-foreground">{stockTarget.satuan}</span>
              </div>
              {stockValue !== stockTarget.stok && (
                <p className={`mt-1 text-xs ${stockValue > stockTarget.stok ? "text-[#1b508a] dark:text-[#5ba0d0]" : "text-destructive"}`}>
                  {stockValue > stockTarget.stok ? "+" : ""}{stockValue - stockTarget.stok} {stockTarget.satuan}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStockTarget(null)}>Batal</Button>
              <Button onClick={handleStockSave}>Simpan</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Produk"
        message={`Yakin ingin menghapus "${deleteTarget?.nama}"?`}
      />
    </div>
  );
}
