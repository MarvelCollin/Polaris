import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useIncrementalRender } from "@/hooks/useIncrementalRender";
import { getProducts, createProduct, updateProduct, deleteProduct, generateProductCode, updateStock, getDistinctSatuan } from "@/db/products";
import { getCategories } from "@/db/categories";
import { ProductWithCategory } from "@/types/index";
import { formatRupiah } from "@/types/index";
import { pickAndSaveImage, getImageUrl } from "@/lib/images";
import ProductThumb from "@/components/ProductThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const ProductTile = memo(function ProductTile({
  p, onEdit, onDelete, onStock,
}: {
  p: ProductWithCategory;
  onEdit: (p: ProductWithCategory) => void;
  onDelete: (p: ProductWithCategory) => void;
  onStock: (p: ProductWithCategory) => void;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-lg border p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-sm">
      <ProductThumb path={p.gambar} size="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium leading-tight">{p.nama}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{p.kode}</span>
        <Badge variant="secondary" className="mt-1 text-[10px]">{p.kategori_nama}</Badge>
        <div className="mt-1">
          <span className="text-xs text-muted-foreground">Beli: {formatRupiah(p.harga_beli)}</span>
          <span className="ml-2 text-sm font-semibold text-primary">Jual: {formatRupiah(p.harga_jual)}</span>
          <span className={`block text-[10px] ${p.stok <= p.stok_minimum ? "text-destructive" : "text-muted-foreground"}`}>
            {p.stok} {p.satuan}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="icon-xs" onClick={() => onStock(p)} title="Update Stok">
          <PackagePlus className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => onEdit(p)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => onDelete(p)}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
});

export default function Products() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState(0);
  const debouncedSearch = useDebounce(search);

  const { data: allProducts, refetch } = useQuery(
    useCallback(() => getProducts(), [])
  );
  const { data: categories } = useQuery(useCallback(() => getCategories(), []));
  const { data: existingSatuan } = useQuery(useCallback(() => getDistinctSatuan(), []));

  const filteredProducts = useMemo(() => {
    if (!allProducts) return [];
    let list = allProducts;
    if (catFilter) {
      list = list.filter((p) => p.kategori_id === catFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
    }
    return list;
  }, [allProducts, catFilter, debouncedSearch]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductWithCategory | null>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stockTarget, setStockTarget] = useState<ProductWithCategory | null>(null);
  const [stockValue, setStockValue] = useState(0);
  const [satuanOpen, setSatuanOpen] = useState(false);
  const satuanRef = useRef<HTMLDivElement>(null);

  const filteredSatuan = (existingSatuan ?? []).filter(
    (s) => form.satuan.length > 0 && s.toLowerCase().includes(form.satuan.toLowerCase()) && s.toLowerCase() !== form.satuan.toLowerCase()
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (satuanRef.current && !satuanRef.current.contains(e.target as Node)) {
        setSatuanOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
      getImageUrl(p.gambar).then(setPreviewUrl).catch(() => {});
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
      const trimmedSatuan = form.satuan.trim();
      const matchedSatuan = (existingSatuan ?? []).find(
        (s) => s.toLowerCase() === trimmedSatuan.toLowerCase()
      );
      const normalizedForm = { ...form, satuan: matchedSatuan ?? trimmedSatuan };
      if (editing) {
        await updateProduct(editing.id, normalizedForm);
      } else {
        await createProduct(normalizedForm);
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

  const { visible: visibleProducts, Sentinel } = useIncrementalRender(filteredProducts, 48);

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produk</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{filteredProducts.length} produk</span>
          <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
        </div>
      </div>

      <div className="mb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari kode atau nama..." />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCatFilter(0)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            catFilter === 0
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent"
          }`}
        >
          Semua
        </button>
        {categories?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              catFilter === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {c.nama}
          </button>
        ))}
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-y-auto rounded-md p-1">
        {visibleProducts.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {visibleProducts.map((p) => (
              <ProductTile
                key={p.id}
                p={p}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onStock={openStock}
              />
            ))}
            <Sentinel />
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Produk tidak ditemukan</p>
        ) : null}
      </div>

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
            <div ref={satuanRef}>
              <Label>Satuan</Label>
              <div className="relative">
                <Input
                  value={form.satuan}
                  onChange={(e) => { set("satuan", e.target.value); setSatuanOpen(true); }}
                  onFocus={() => setSatuanOpen(true)}
                  placeholder="pcs, kg, sak"
                  autoComplete="off"
                />
                {satuanOpen && filteredSatuan.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {filteredSatuan.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => { set("satuan", s); setSatuanOpen(false); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
